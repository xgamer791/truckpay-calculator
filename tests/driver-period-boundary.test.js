import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, it } from 'vitest';
import { localDateKey, payoutForDate } from '../src/cloud/pay-periods.js';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const quickAdd = html.slice(html.indexOf('        function calculateAndSave()'), html.indexOf('        function modifySettlement('));
it('quick-add and admin agree across Thursday night and Friday morning in the local timezone', () => {
  for (const [date, expected, weekday] of [[new Date(2026, 8, 10, 23, 59), '2026-09-12', 'Thursday'], [new Date(2026, 8, 11, 0, 0), '2026-09-19', 'Friday']]) {
    let recorded;
    class Clock extends Date { constructor(...args) { super(...(args.length ? args : [date.getTime()])); } }
    const ctx = { Date: Clock, window: { DriverPayPeriods: { localDateKey, payoutForDate } }, document: { getElementById: () => ({ value: '50' }) }, modifySettlement: (...args) => { recorded = args; }, renderHistory: () => {}, appAlert: message => { throw new Error(message); } };
    vm.runInNewContext(`${quickAdd}\ncalculateAndSave();`, ctx);
    expect(recorded[0]).toBe(expected); expect(recorded[2]).toBe(weekday);
  }
});
