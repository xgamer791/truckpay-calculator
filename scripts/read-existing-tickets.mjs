import { spawnSync } from 'node:child_process';
import { createTicketReader } from './ticket-reader-node.mjs';

if (!process.env.CONVEX_DEPLOY_KEY) throw new Error('Missing deployment credentials');
function convex(name, args = {}) {
  const result = spawnSync('npx', ['convex', 'run', `ticketReader:${name}`, JSON.stringify(args)], {
    encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, env: process.env,
  });
  // Function results contain private signed image URLs; do not log them.
  if (result.status !== 0) throw new Error(`Ticket reader migration ${name} failed`);
  return JSON.parse(result.stdout);
}
const reader = await createTicketReader();
let scanned = 0, marietta = 0, colorado = 0, ignored = 0, unreadable = 0, conflicts = 0, errors = 0;
try {
  for (let pass = 0; pass < 3; pass++) {
    let cursor = null, needsRetry = false;
    do {
      const page = convex('list', { cursor });
      for (const ticket of page.tickets) {
        try {
          if (!ticket.url) throw new Error('Saved image missing');
          const response = await fetch(ticket.url, { signal: AbortSignal.timeout(30000) });
          if (!response.ok) throw new Error('Saved image unavailable');
          const result = await reader.read(Buffer.from(await response.arrayBuffer()));
          const applied = convex('apply', { id: ticket.id, storageId: ticket.storageId, updatedAt: ticket.updatedAt, result });
          if (!applied.applied) { conflicts++; needsRetry = true; continue; }
          scanned++;
          if (result.status === 'matched' && result.plant === 'martin-marietta') marietta++;
          else if (result.status === 'matched' && result.plant === 'colorado-materials') colorado++;
          else if (result.status === 'ignored') ignored++;
          else unreadable++;
        } catch { errors++; needsRetry = true; }
      }
      if (page.done) break;
      cursor = page.cursor;
    } while (true);
    if (!needsRetry) break;
  }
  console.log(`Ticket reader backfill: checked ${scanned}; Marietta numbers saved ${marietta}; Colorado Materials numbers saved ${colorado}; other/unrecognized ${ignored}; recognized plant unreadable ${unreadable}; concurrent retries ${conflicts}; processing errors ${errors}.`);
  let remaining = 0, cursor = null;
  do {
    const page = convex('list', { cursor }); remaining += page.tickets.length;
    if (page.done) break;
    cursor = page.cursor;
  } while (true);
  if (remaining) throw new Error(`${remaining} tickets remain pending; the app will retry them`);
} finally { await reader.close(); }
