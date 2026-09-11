import { expect, it } from 'vitest';
import { localDateKey, payoutForDate, workPeriod, dateForLoad, periodLoads, shiftDate } from './pay-periods.js';
import { filterLoads, groupLoads, csvText, loadExportRows } from './admin-data.js';

it('uses one Friday–Thursday work week and the following Saturday payout', () => {
  for (const date of ['2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10']) expect(payoutForDate(date)).toBe('2026-09-12');
  expect(payoutForDate('2026-09-11')).toBe('2026-09-19');
  expect(workPeriod('2026-09-19')).toEqual({ payoutDate: '2026-09-19', start: '2026-09-11', end: '2026-09-17' });
  expect(dateForLoad('2026-09-19', 'Friday')).toBe('2026-09-11');
});
it('keeps local Thursday evening in the old period and handles year/DST boundaries', () => {
  expect(payoutForDate(localDateKey(new Date(2026, 8, 10, 23, 59)))).toBe('2026-09-12');
  expect(payoutForDate(localDateKey(new Date(2026, 8, 11, 0, 0)))).toBe('2026-09-19');
  expect(workPeriod('2027-01-02').start).toBe('2026-12-25');
  expect(shiftDate('2026-03-06', 7)).toBe('2026-03-13');
  expect(payoutForDate('2026-11-01')).toBe('2026-11-07');
  expect(() => workPeriod('2026-09-11')).toThrow('Saturday');
  expect(() => payoutForDate('2026-02-30')).toThrow();
});
const confirmed = { id: 'ticket', ticketRead: { status: 'matched', plant: 'colorado-materials', ticketNumber: '1234567', confidence: .99 } };
const loads = [{ id: 'a', day: 'Thursday', miles: 50, tons: 25, calculatedPay: 100, documents: [confirmed] }, { id: 'b', day: 'Friday', miles: 60, tons: 25, calculatedPay: 110, documents: [] }];
it('isolates identical weekdays across periods and orders Friday first', () => {
  const history = [{ id: 'old', payoutDate: '2026-09-12', loads }, { id: 'new', payoutDate: '2026-09-19', loads: [{ ...loads[1], id: 'new-load' }] }];
  expect(periodLoads(history, '2026-09-19').map(l => l.id)).toEqual(['new-load']);
  expect(groupLoads(loads).map(g => g.day)).toEqual(['Friday', 'Thursday']);
  expect(periodLoads(history, '2026-09-26')).toEqual([]);
});
it('filters verified ticket numbers and exports only provided scoped loads safely', () => {
  expect(filterLoads(loads, '1234567').map(l => l.id)).toEqual(['a']);
  expect(filterLoads(loads, '', 'missing').map(l => l.id)).toEqual(['b']);
  const rows = loadExportRows({ fullName: '=1+1', truckNumber: '1200' }, '2026-09-19', [loads[1]]);
  expect(rows).toHaveLength(2);
  expect(rows[1][3]).toBe('2026-09-11');
  expect(csvText(rows)).toContain('"\'=1+1"');
  expect(csvText([['a,"b"\nc']])).toBe('"a,""b""\nc"');
});
