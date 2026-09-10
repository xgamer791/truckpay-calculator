import { expect, it } from 'vitest';
import { applyTicketRead, isMarietta, ticketCandidate } from './core.js';
const line = (text, x, y, confidence = .99, minimum = .98) => ({ text, confidence, minimum, box: { x, y, width: text.length * 9, height: 20 } });

it('uses independent plant identity anchors and rejects a generic Hunter reference', () => {
  expect(isMarietta([line('Martin Marietta', 0, 0)])).toBe(true);
  expect(isMarietta([line('Martin', 0, 0), line('54249 Hunter Stone', 0, 25), line('7305 FM 1102', 0, 50)])).toBe(true);
  expect(isMarietta([line('Hunter Stone', 0, 0), line('Ticket 23696214', 600, 60)])).toBe(false);
  expect(isMarietta([line('Another Materials', 0, 0), line('Ticket 23696214', 600, 60)])).toBe(false);
  expect(isMarietta([line('Martin Marietta', 800, 800)], { width: 1000, height: 1000 })).toBe(false);
});

it('reads only the number next to Ticket, never order, dispatch, or vehicle numbers', () => {
  const lines = [line('Order No', 10, 110), line('60519794', 110, 110), line('Ticket', 500, 40), line('48271635', 600, 40), line('Vehicle', 500, 70), line('1205', 600, 70)];
  expect(ticketCandidate(lines)?.number).toBe('48271635');
  expect(ticketCandidate(lines.filter(l => l.text !== 'Ticket'))).toBeNull();
  expect(ticketCandidate([line('Ticket 60519794', 500, 40)])?.number).toBe('60519794');
});

it('leaves conflicting and uncertain digits blank', () => {
  expect(ticketCandidate([line('Ticket', 0, 0), line('23696214', 90, 0, .90)])).toBeNull();
  expect(ticketCandidate([line('Ticket', 0, 0), line('23696214', 90, 0, .98, .50)])).toBeNull();
  expect(ticketCandidate([line('Ticket 23696214', 0, 0), line('Ticket 48271635', 0, 50)])).toBeNull();
});

it('ignores other plants without replacing stored OCR and merges just confirmed ticket fields', () => {
  const doc = { ocr: { plant: 'Another plant', miles: 27, ticketNumber: 'old' } };
  applyTicketRead(doc, { version: 1, status: 'ignored' });
  expect(doc.ocr).toEqual({ plant: 'Another plant', miles: 27, ticketNumber: 'old' });
  applyTicketRead(doc, { version: 1, status: 'matched', ticketNumber: '48271635' });
  expect(doc.ocr).toMatchObject({ miles: 27, ticketNumber: '48271635' });
});
