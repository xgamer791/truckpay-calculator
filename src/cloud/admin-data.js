import { isConfirmedRead } from '../ticket-reader/metadata.js';
import { dateForLoad, WORK_DAYS } from './pay-periods.js';

export const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
export const number = value => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value) || 0);
export function ticketStatus(load) {
  if (!load.documents?.length) return 'missing';
  return load.documents.every(d => isConfirmedRead(d.ticketRead)) ? 'verified' : 'unverified';
}
export function confirmedTicket(ticket) { return isConfirmedRead(ticket.ticketRead) ? ticket.ticketRead.ticketNumber : ''; }
export function filterLoads(loads, query = '', status = 'all') {
  const term = query.trim().toLowerCase();
  return loads.filter(l => (status === 'all' || ticketStatus(l) === status) && (!term ||
    [l.day, l.miles, l.note, ...(l.documents || []).map(confirmedTicket)].join(' ').toLowerCase().includes(term)));
}
export function groupLoads(loads) {
  return [...WORK_DAYS, 'Unknown day'].map(day => ({ day, loads: loads.filter(l => WORK_DAYS.includes(l.day) ? l.day === day : day === 'Unknown day') })).filter(g => g.loads.length);
}
// Quoting alone does not prevent spreadsheet formula injection.
export function csvCell(value) {
  const text = String(value ?? '');
  return `"${(/^[\s]*[=+@-]|^[\t\r\n]/.test(text) ? "'" + text : text).replaceAll('"', '""')}"`;
}
export function csvText(rows) { return rows.map(row => row.map(csvCell).join(',')).join('\r\n'); }
export function loadExportRows(driver, payoutDate, loads) {
  return [['Driver', 'Truck', 'Payout date', 'Work date (from period)', 'Day', 'Miles', 'Tons', 'Driver pay', 'Ticket status', 'Verified ticket numbers', 'Note'],
    ...loads.map(l => [driver.fullName, driver.truckNumber, payoutDate, dateForLoad(payoutDate, l.day) || '', l.day, l.miles, l.tons, Number(l.calculatedPay).toFixed(2), ticketStatus(l), (l.documents || []).map(confirmedTicket).filter(Boolean).join('; '), l.note || ''])];
}
export function downloadCsv(rows, filename) {
  const url = URL.createObjectURL(new Blob(['\uFEFF', csvText(rows)], { type: 'text/csv;charset=utf-8;' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
