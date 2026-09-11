// Work weeks are Friday–Thursday. The settlement key is the following Saturday.
// Calendar arithmetic stays in UTC; only 'today' is obtained in local time,
// matching the driver's displayed weekday. Never use a ticket upload timestamp.
export const WORK_DAYS = ['Friday', 'Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];
export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function calendarDate(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key || '')) throw new Error('Invalid calendar date');
  const date = new Date(`${key}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== key) throw new Error('Invalid calendar date');
  return date;
}
export function shiftDate(key, days) {
  const date = calendarDate(key);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function payoutForDate(key) {
  const day = calendarDate(key).getUTCDay();
  return shiftDate(key, 6 - day + (day >= 5 ? 7 : 0));
}
export function workPeriod(payoutDate) {
  if (calendarDate(payoutDate).getUTCDay() !== 6) throw new Error('Payout date must be a Saturday');
  return { payoutDate, start: shiftDate(payoutDate, -8), end: shiftDate(payoutDate, -2) };
}
export function formatDay(key, options = {}) {
  return calendarDate(key).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', ...options });
}
export function periodLabel(key) {
  try {
    const { start, end } = workPeriod(key);
    return `${formatDay(start)} – ${formatDay(end, { year: 'numeric' })}`;
  } catch { return `Review settlement: ${key}`; }
}
export function periodLoads(history, payoutDate) {
  return (history || []).filter(s => s.payoutDate === payoutDate)
    .flatMap(s => (s.loads || []).map(load => ({ ...load, settlementId: s.id })));
}
export function dateForLoad(payoutDate, day) {
  const index = WORK_DAYS.indexOf(day);
  if (index < 0) return null;
  try { return shiftDate(workPeriod(payoutDate).start, index); } catch { return null; }
}
