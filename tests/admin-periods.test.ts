import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import { expect, it } from 'vitest';
import schema from '../convex/schema';
import { ADMIN_EMAILS } from '../convex/lib/security';
const modules = import.meta.glob('../convex/**/*.ts');
const list = makeFunctionReference<'query'>('admin:listDrivers');
const details = makeFunctionReference<'query'>('admin:getDriverState');
const mine = makeFunctionReference<'query'>('sync:getMyState');
async function fixture() {
  const t = convexTest(schema, modules);
  const { admin, driver } = await t.run(async ctx => {
    // Existing configured admin identity; all driver records below are synthetic.
    const admin = await ctx.db.insert('users', { email: ADMIN_EMAILS[0] });
    const driver = await ctx.db.insert('users', { email: 'period-test@example.test' });
    await ctx.db.insert('driverProfiles', { userId: driver, email: 'period-test@example.test', fullName: 'Test Driver', phone: '', company: 'Test Fleet', truckNumber: 'None', avgTons: 25, commissionRate: 30, role: 'driver', createdAt: 1, updatedAt: 1 });
    for (const [index, payoutDate] of ['2026-09-12', '2026-09-19'].entries()) {
      const settlementId = await ctx.db.insert('settlements', { userId: driver, clientId: `s${index}`, payoutDate, createdAt: 1, updatedAt: 1 });
      const loadId = await ctx.db.insert('loads', { userId: driver, settlementId, clientId: `l${index}`, day: 'Friday', miles: 50, tons: 25, pricingMode: 'auto', calculatedPay: index ? 200 : 100, createdAt: 1, updatedAt: 1 });
      if (!index) {
        const storageId = await ctx.storage.store(new Blob(['synthetic ticket']));
        await ctx.db.insert('tickets', { userId: driver, loadId, clientId: 'ticket-old', type: 'ticket', storageId, ticketRead: { version: 3, status: 'matched', plant: 'colorado-materials', ticketNumber: '1234567', confidence: .99 }, createdAt: Date.parse('2026-09-11T18:00:00Z'), updatedAt: 1 });
      }
    }
    return { admin, driver };
  });
  const identity = (id: string) => t.withIdentity({ subject: `${id}|test`, issuer: 'https://convex.test' });
  return { t, admin: identity(admin), driver: identity(driver), driverId: driver };
}
it('scopes all admin totals by saved settlement, not weekday or recent ticket upload', async () => {
  const { admin, driverId, driver } = await fixture();
  const before = await driver.query(mine, {});
  expect((await admin.query(list, { payoutDate: '2026-09-12' }))[0]).toMatchObject({ totalPay: 100, loadCount: 1, ticketCount: 1, missingTickets: 0 });
  expect((await admin.query(list, { payoutDate: '2026-09-19' }))[0]).toMatchObject({ totalPay: 200, loadCount: 1, ticketCount: 0, missingTickets: 1, payoutDates: ['2026-09-19', '2026-09-12'] });
  const state = await admin.query(details, { userId: driverId, payoutDate: '2026-09-19' });
  expect(state.history).toHaveLength(1);
  expect(state.history[0].loads[0]).toMatchObject({ id: 'l1', documents: [] });
  expect((await admin.query(list, { payoutDate: '2026-09-26' }))[0]).toMatchObject({ totalPay: 0, loadCount: 0, ticketCount: 0 });
  expect((await admin.query(details, { userId: driverId, payoutDate: '2026-09-26' })).history).toEqual([]);
  expect((await admin.query(list, { payoutDate: '' }))[0].loadCount).toBe(0);
  expect((await admin.query(details, { userId: driverId, payoutDate: '' })).history).toEqual([]);
  const after = await driver.query(mine, {});
  expect(after.history.map((s: any) => [s.id, s.payoutDate, s.loads.map((l: any) => l.id)])).toEqual(before.history.map((s: any) => [s.id, s.payoutDate, s.loads.map((l: any) => l.id)]));
});
it('retains driver history and admin-only access with the optional period filter', async () => {
  const { t, driver, driverId, admin } = await fixture();
  expect((await driver.query(mine, {})).history).toHaveLength(2);
  expect((await admin.query(list, {}))[0].totalPay).toBe(300);
  await expect(driver.query(list, { payoutDate: '2026-09-19' })).rejects.toThrow('Administrator');
  await expect(driver.query(details, { userId: driverId, payoutDate: '2026-09-19' })).rejects.toThrow('Administrator');
  await expect(t.query(list, {})).rejects.toThrow();
});
