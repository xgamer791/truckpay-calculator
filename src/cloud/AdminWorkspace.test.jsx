// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import AdminWorkspace from './AdminWorkspace.jsx';
const query = vi.hoisted(() => vi.fn());
vi.mock('convex/react', () => ({ useQuery: query }));
const driver = { userId: 'test-driver', fullName: 'Example Driver', email: 'driver@example.test', company: 'Test Fleet', truckNumber: 'None', totalMiles: 50, totalTons: 25, payoutDates: ['2026-09-12', '2026-09-19'], unverifiedLoads: 0 };
const histories = [
  { id: 'old', payoutDate: '2026-09-12', loads: [{ id: 'old-load', day: 'Friday', miles: 10, tons: 25, calculatedPay: 100, note: 'Previous work period', documents: [] }] },
  { id: 'new', payoutDate: '2026-09-19', loads: [{ id: 'new-load', day: 'Friday', miles: 50, tons: 25, calculatedPay: 200, note: 'Current work period', documents: [] }] },
];
let root, node;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 8, 11, 12));
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
  query.mockImplementation((_ref, args) => args.userId ? { history: histories } : [{ ...driver, payoutDate: args.payoutDate, totalPay: args.payoutDate === '2026-09-19' ? 200 : 100, loadCount: 1, ticketCount: 0, missingTickets: 1 }]);
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });
const render = async () => act(async () => root.render(<AdminWorkspace />));
const click = async text => act(async () => [...node.querySelectorAll('button')].find(b => b.textContent.includes(text)).click());
it('opens the current Friday period and never shows another period in the ledger', async () => {
  await render();
  expect(node.querySelector('select').value).toBe('2026-09-19');
  await click('Example Driver');
  expect(node.textContent).toContain('Current work period');
  expect(node.textContent).not.toContain('Previous work period');
  await act(async () => { const s = node.querySelector('select'); s.value = '2026-09-12'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(node.textContent).toContain('Previous work period');
  expect(node.textContent).not.toContain('Current work period');
  expect(query).toHaveBeenCalledWith(expect.anything(), { userId: 'test-driver', payoutDate: '2026-09-12' });
});
it('supports driver filters, a mobile back action, export controls, and loading states', async () => {
  await render(); await click('Example Driver');
  expect(node.querySelector('.fleet-workspace').classList.contains('has-driver')).toBe(true);
  expect([...node.querySelectorAll('button')].some(b => b.textContent === 'Print period')).toBe(true);
  await click('All drivers');
  expect(node.querySelector('.fleet-workspace').classList.contains('has-driver')).toBe(false);
  await act(async () => { const selects = node.querySelectorAll('.fleet-directory-filters select'); selects[1].value = 'attention'; selects[1].dispatchEvent(new Event('change', { bubbles: true })); });
  expect(node.querySelectorAll('.fleet-driver')).toHaveLength(1);
  query.mockReturnValue(undefined); await render();
  expect(node.textContent).toContain('Loading drivers');
  expect([...node.querySelectorAll('button')].find(b => b.textContent.includes('Export summary')).disabled).toBe(true);
});
it('rolls the current period at Friday midnight, while a chosen historical period stays selected', async () => {
  vi.setSystemTime(new Date(2026, 8, 10, 23, 59)); await render();
  expect(node.querySelector('select').value).toBe('2026-09-12');
  vi.setSystemTime(new Date(2026, 8, 11, 0, 0));
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(node.querySelector('select').value).toBe('2026-09-19');
  await act(async () => { const s = node.querySelector('select'); s.value = '2026-09-12'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  vi.setSystemTime(new Date(2026, 8, 18, 0, 0));
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(node.querySelector('select').value).toBe('2026-09-12');
});
