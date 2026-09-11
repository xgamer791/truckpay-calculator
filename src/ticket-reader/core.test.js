import { expect, it } from 'vitest';
import { applyTicketRead, classifyPlant, isColorado, isMarietta, isLaGrange, ticketCandidate } from './core.js';
import { needsTicketRead, preferredTicketRead } from './metadata.js';
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

it('distinguishes Colorado Materials from Marietta and rejects ambiguous headings', () => {
  const colorado = [line('Colorado Materials, Ltd.', 10, 10), line('TICKET #', 600, 10), line('3556031', 710, 10)];
  expect(isColorado(colorado)).toBe(true);
  expect(isMarietta(colorado)).toBe(false);
  expect(classifyPlant(colorado)?.supplier).toBe('colorado-materials');
  expect(ticketCandidate(colorado)?.number).toBe('3556031');
  expect(classifyPlant([...colorado, line('Martin Marietta', 10, 40)])).toBeNull();
  expect(isColorado([line('Colorado Quarry', 10, 10)])).toBe(false);
  expect(classifyPlant(colorado.slice(1))).toBeNull();
});

it('recognizes a clean Colorado ticket despite ordinary heading OCR errors', () => {
  expect(isColorado([line('Coiorado Materlals, Ltd.', 10, 10, .72)])).toBe(true);
  expect(isColorado([
    line('HUNTER STONE', 10, 10, .75),
    line('A Division of Colorado Materials, Ltd.', 10, 35, .75),
  ])).toBe(false);
  expect(isColorado([line('Colorado Quarry Materials', 10, 10, .75)])).toBe(false);
});

it('revisits previously ignored Colorado tickets while retaining confirmed Marietta reads', () => {
  const marietta = { version: 1, status: 'matched', plant: 'martin-marietta', ticketNumber: '23696214', confidence: .99 };
  const colorado = { version: 2, status: 'matched', plant: 'colorado-materials', ticketNumber: '3556031', confidence: .99 };
  const oldIgnored = { version: 1, status: 'ignored' };
  expect(needsTicketRead(oldIgnored)).toBe(true);
  expect(needsTicketRead(marietta)).toBe(false);
  expect(needsTicketRead(colorado)).toBe(false);
  expect(needsTicketRead({ version: 2, status: 'ignored' })).toBe(false);
  expect(needsTicketRead({ version: 3, status: 'ignored' })).toBe(false);
  expect(preferredTicketRead(colorado, oldIgnored)).toEqual(colorado);
  expect(preferredTicketRead(oldIgnored, colorado)).toEqual(colorado);
  expect(preferredTicketRead({ version: 2, status: 'ignored' }, oldIgnored)).toEqual({ version: 2, status: 'ignored' });
  const doc = applyTicketRead({}, colorado);
  expect(doc.ocr).toEqual({ plant: 'Colorado Materials', ticketNumber: '3556031' });
});

it('identifies La Grange by supplier and source, never by the Hunter customer destination',()=>{
  const lines=[line('WM CCP Solutions, LLC.',10,50),line('Ticket No:',10,130),line('172744',150,130),line('Source: Fayette',10,170),line('Source Address:6549 Power Plant Rd, LaGrange, TX 78945',10,200),line('Customer Destination: Hunter Plant',10,250)];
  expect(isLaGrange(lines)).toBe(true);
  expect(classifyPlant(lines)?.supplier).toBe('la-grange');
  expect(isMarietta(lines)).toBe(false);
  expect(ticketCandidate(lines)?.number).toBe('172744');
  expect(ticketCandidate([line('Ticket No: 172744',10,130)])?.number).toBe('172744');
  expect(ticketCandidate([line('Tlcket No:',10,130,.84),line('172744',150,130)])?.number).toBe('172744');
  expect(isLaGrange([line('WM CCP Solutions LLC',0,0),line('Source: Another site',0,20)])).toBe(false);
  expect(isLaGrange(lines.filter(l=>l.text.includes('Hunter Plant')))).toBe(false);
  expect(classifyPlant([...lines,line('Colorado Materials',10,10)])).toBeNull();
  expect(isLaGrange(lines.filter(l=>!l.text.includes('WM CCP')))).toBe(false);
});

it('ignores other plants without replacing stored OCR and merges just confirmed ticket fields', () => {
  const doc = { ocr: { plant: 'Another plant', miles: 27, ticketNumber: 'old' } };
  applyTicketRead(doc, { version: 1, status: 'ignored' });
  expect(doc.ocr).toEqual({ plant: 'Another plant', miles: 27, ticketNumber: 'old' });
  applyTicketRead(doc, { version: 1, status: 'matched', ticketNumber: '48271635' });
  expect(doc.ocr).toMatchObject({ miles: 27, ticketNumber: '48271635' });
});
