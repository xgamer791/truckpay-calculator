import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import { expect, it } from 'vitest';
import schema from '../convex/schema';
const modules = import.meta.glob('../convex/**/*.ts');
const apply = makeFunctionReference<'mutation'>('ticketReader:apply');
const applyMine = makeFunctionReference<'mutation'>('ticketReader:applyMine');
const save = makeFunctionReference<'mutation'>('sync:saveSnapshot');
const result = { version: 1, status: 'matched', template: 'martin-marietta-v1', plant: 'martin-marietta', ticketNumber: '23696214', confidence: .99 };
async function fixture() {
  const t = convexTest(schema, modules);
  const data = await t.run(async ctx => {
    const userId = await ctx.db.insert('users', { email: 'reader@example.test' });
    const otherUserId = await ctx.db.insert('users', { email: 'other@example.test' });
    await ctx.db.insert('driverProfiles', { userId, email: 'reader@example.test', fullName: 'Test', phone: '555', company: 'JLP Trucking', truckNumber: 'None', avgTons: 25, commissionRate: 30, role: 'driver', createdAt: 1, updatedAt: 1 });
    const settlementId = await ctx.db.insert('settlements', { userId, clientId: 's', payoutDate: '2026-09-12', createdAt: 1, updatedAt: 1 });
    const loadId = await ctx.db.insert('loads', { userId, settlementId, clientId: 'l', day: 'Monday', miles: 20, tons: 25, pricingMode: 'auto', calculatedPay: 10, createdAt: 1, updatedAt: 1 });
    const storageId = await ctx.storage.store(new Blob(['photo'], { type: 'image/jpeg' }));
    const id = await ctx.db.insert('tickets', { userId, loadId, clientId: 't', type: 'ticket', storageId, createdAt: 1, updatedAt: 1 });
    return { id, userId, otherUserId, storageId };
  });
  return { t, ...data };
}
it('backfills once, survives stale snapshots, and resets when a photo is replaced', async () => {
  const { t, id, userId, storageId } = await fixture();
  expect(await t.mutation(apply, { id, storageId, updatedAt: 1, result })).toEqual({ applied: true });
  const client = t.withIdentity({ subject: `${userId}|test`, issuer: 'https://convex.test' });
  const snapshot = { settings: { avgTons: 25, truckNumber: 'None' }, settlements: [{ clientId: 's', payoutDate: '2026-09-12', loads: [{ clientId: 'l', day: 'Monday', miles: 20, tons: 25, pricingMode: 'auto' }] }], tickets: [{ clientId: 't', loadClientId: 'l', type: 'ticket', storageId }] };
  await client.mutation(save, snapshot);
  expect(await t.run(ctx => ctx.db.get(id))).toMatchObject({ ticketRead: result, ocr: { ticketNumber: '23696214' }, storageId });
  const replacement = await t.run(ctx => ctx.storage.store(new Blob(['new'])));
  snapshot.tickets[0].storageId = replacement;
  await client.mutation(save, snapshot);
  const changed = await t.run(ctx => ctx.db.get(id));
  expect(changed?.ticketRead).toBeUndefined();
  expect(changed?.ocr).toBeUndefined();
});
it('does not apply an old result to a changed ticket or another driver', async () => {
  const { t, id, otherUserId, storageId } = await fixture();
  const other = t.withIdentity({ subject: `${otherUserId}|test`, issuer: 'https://convex.test' });
  expect(await other.mutation(applyMine, { clientId: 't', storageId, result })).toEqual({ applied: false });
  await t.run(ctx => ctx.db.patch(id, { updatedAt: 2 }));
  expect(await t.mutation(apply, { id, storageId, updatedAt: 1, result })).toEqual({ applied: false });
  expect((await t.run(ctx => ctx.db.get(id)))?.ticketRead).toBeUndefined();
});
