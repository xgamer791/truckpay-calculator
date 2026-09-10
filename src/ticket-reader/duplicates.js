import { isConfirmedRead } from './metadata.js';

export function confirmedNumber(document) {
  return isConfirmedRead(document?.ticketRead) ? document.ticketRead.ticketNumber : null;
}

// Exempt only photos actually being replaced, never every photo on that load.
export function replacementIds(history, target) {
  const load = history.find(s => String(s.id) === String(target.sId))?.loads?.find(l => String(l.id) === String(target.lId));
  const docs = load?.documents || [];
  if (target.mode === 'add') return [];
  if (target.mode === 'replace' || target.mode === 'edit') return target.docId ? [target.docId] : docs.map(d => d.id);
  return docs.length ? [docs.at(-1).id] : [];
}

export function duplicateInHistory(history, number, target, replacedIds) {
  for (const settlement of history) for (const load of settlement.loads || []) for (const document of load.documents || []) {
    const replacing = String(settlement.id) === String(target.sId) && String(load.id) === String(target.lId) && replacedIds.includes(document.id);
    if (!replacing && confirmedNumber(document) === number) return { settlement, load, document };
  }
  return null;
}

export function duplicateError(number, location = 'another saved ticket') {
  return Object.assign(new Error(`Duplicate ticket #${number}. This number is already attached to ${location}. Capture the correct ticket for this load.`), { code: 'DUPLICATE_TICKET' });
}
