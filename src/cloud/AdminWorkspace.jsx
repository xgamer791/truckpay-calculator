import React, { useEffect, useState } from 'react';
import { useQuery } from 'convex/react';
import { ArrowLeft, ChevronLeft, ChevronRight, Search, Download, Printer, FileText, ChevronDown, Users, CalendarDays, AlertCircle } from 'lucide-react';
import { cloudApi } from './api';
import { localDateKey, payoutForDate, workPeriod, periodLabel, shiftDate, formatDay, periodLoads, dateForLoad } from './pay-periods.js';
import { money, number, ticketStatus, confirmedTicket, filterLoads, groupLoads, downloadCsv, loadExportRows } from './admin-data.js';

const truck = value => value === 'None' || !value ? 'No truck assigned' : `Truck ${value}`;
const statusText = { verified: 'Verified', missing: 'Missing ticket', unverified: 'Check ticket' };

class AdminErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div className="fleet-empty" role="alert"><AlertCircle /><h2>Records could not load</h2><p>Check your connection and try again. No records have been changed.</p><button className="fleet-button" onClick={() => this.setState({ failed: false })}>Try again</button></div> : this.props.children;
  }
}

function TicketPhoto({ ticket }) {
  const id = confirmedTicket(ticket);
  const source = ticket.processed;
  const safe = typeof source === 'string' && /^(https:\/\/|data:image\/(jpeg|png|webp);base64,)/i.test(source);
  return <div className="fleet-ticket-photo">
    {safe ? <a href={source} target="_blank" rel="noopener noreferrer"><img src={source} loading="lazy" alt={id ? `Ticket ${id}` : 'Ticket photo — number unverified'} /><span>{id ? `#${id}` : 'Unverified number'} · Open full size</span></a> : <span>Image unavailable — ask the driver to resync.</span>}
  </div>;
}

function LoadRow({ load }) {
  const status = ticketStatus(load);
  return <article className="fleet-load">
    <div className="fleet-load-main"><div><strong>{number(load.miles)} <span>miles</span></strong><div className="fleet-load-meta">{number(load.tons)} tons{load.pricingMode !== 'auto' && load.pricingMode ? ' · Custom pricing' : ''}</div></div><strong className="fleet-load-pay">{money(load.calculatedPay)}</strong></div>
    <div className="fleet-load-foot"><span className={`fleet-status ${status}`}><FileText size={14} />{statusText[status]}</span>{(load.documents || []).map(confirmedTicket).filter(Boolean).map((id, i) => <span className="fleet-ticket-number" key={`${id}-${i}`}>#{id}</span>)}</div>
    {load.note && <p className="fleet-load-note">{load.note}</p>}
    {!!load.documents?.length && <details className="fleet-ticket-disclosure"><summary>View {load.documents.length === 1 ? 'ticket' : `${load.documents.length} tickets`}<ChevronDown size={16} /></summary><div className="fleet-ticket-photos">{load.documents.map(t => <TicketPhoto key={t.id} ticket={t} />)}</div></details>}
  </article>;
}

export function DriverLedger({ driver, payoutDate, history, onBack }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const loads = periodLoads(history, payoutDate);
  const visible = filterLoads(loads, query, status);
  const days = groupLoads(visible);
  const total = loads.reduce((sum, l) => sum + (Number(l.calculatedPay) || 0), 0);
  return <section className="fleet-ledger" aria-label={`${driver.fullName} period ledger`}>
    <header className="fleet-ledger-head"><button className="fleet-back fleet-button" onClick={onBack}><ArrowLeft size={18} />All drivers</button><div className="fleet-ledger-title"><div><span className="fleet-eyebrow">DRIVER LEDGER</span><h2>{driver.fullName}</h2><p>{truck(driver.truckNumber)} · {driver.company}</p></div><div className="fleet-ledger-total"><span>Period pay</span><strong>{money(total)}</strong><small>{loads.length} loads</small></div></div>
      <div className="fleet-contact"><span>{driver.email}</span>{driver.phone && <span>{driver.phone}</span>}</div>
      <p className="fleet-ledger-period">Work: {periodLabel(payoutDate)} · Payout: {payoutDate}</p>
      <div className="fleet-ledger-actions"><button className="fleet-button" disabled={!visible.length} onClick={() => downloadCsv(loadExportRows(driver, payoutDate, visible), `driver-loads-${payoutDate}.csv`)}><Download size={16} />Export {query || status !== 'all' ? 'filtered loads' : 'loads'}</button><button className="fleet-button" disabled={!loads.length} onClick={() => window.print()}><Printer size={16} />Print period</button></div>
    </header>
    <div className="fleet-ledger-filters"><label className="fleet-search"><Search size={18} /><input aria-label="Find a load or ticket" placeholder="Ticket #, day, miles, or note" value={query} onChange={e => setQuery(e.target.value)} /></label><label className="fleet-field"><span>Ticket status</span><select value={status} onChange={e => setStatus(e.target.value)}><option value="all">All tickets</option><option value="missing">Missing ticket</option><option value="unverified">Check ticket</option><option value="verified">Verified</option></select></label></div>
    <div className="fleet-visible-count" role="status">{visible.length} of {loads.length} loads · {money(visible.reduce((sum, l) => sum + (Number(l.calculatedPay) || 0), 0))} shown</div>
    <div className="fleet-day-list">{days.map(group => <section className="fleet-day" key={group.day}><h3><span>{group.day}<small>{dateForLoad(payoutDate, group.day) ? formatDay(dateForLoad(payoutDate, group.day)) : 'Review date'}</small></span><span>{group.loads.length} loads <strong>{money(group.loads.reduce((sum, l) => sum + (Number(l.calculatedPay) || 0), 0))}</strong></span></h3>{group.loads.map(load => <LoadRow key={`${load.settlementId}-${load.id}`} load={load} />)}</section>)}</div>
    {!visible.length && <div className="fleet-empty"><FileText /><h3>{loads.length ? 'No matching loads' : 'No loads this period'}</h3><p>{loads.length ? 'Try another ticket number or clear the filters.' : 'Choose another period to review this driver’s history.'}</p>{!!loads.length && <button className="fleet-button" onClick={() => { setQuery(''); setStatus('all'); }}>Clear filters</button>}</div>}
    <footer className="fleet-ledger-note">Work dates follow the saved settlement and weekday, not the ticket upload date. Records are read-only here.</footer>
    <div className="fleet-print-only"><h3>Full period ledger</h3>{groupLoads(loads).map(group => <section key={group.day}><h4>{group.day} · {dateForLoad(payoutDate, group.day)}</h4>{group.loads.map(l => <p key={`${l.settlementId}-${l.id}`}>{l.miles} mi · {l.tons} tons · {money(l.calculatedPay)} · {statusText[ticketStatus(l)]} {(l.documents || []).map(confirmedTicket).filter(Boolean).join(', ')}{l.note ? ` · ${l.note}` : ''}</p>)}</section>)}</div>
  </section>;
}

function DriverRecords({ driver, payoutDate, onBack }) {
  const state = useQuery(cloudApi.admin.getDriverState, { userId: driver.userId, payoutDate });
  if (state === undefined) return <div className="fleet-empty" role="status">Loading period records…</div>;
  return <DriverLedger key={`${driver.userId}-${payoutDate}`} driver={driver} payoutDate={payoutDate} history={state.history} onBack={onBack} />;
}

export function FleetWorkspace() {
  const [today, setToday] = useState(() => localDateKey());
  const current = payoutForDate(today);
  const [chosen, setChosen] = useState(null);
  const payoutDate = chosen || current;
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [truckFilter, setTruckFilter] = useState('all');
  const [activity, setActivity] = useState('all');
  const [sort, setSort] = useState('name');
  const drivers = useQuery(cloudApi.admin.listDrivers, { payoutDate });
  useEffect(() => {
    const update = () => setToday(localDateKey());
    const timer = setInterval(update, 30000);
    window.addEventListener('focus', update); document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); };
  }, []);
  const periods = [...new Set([current, payoutDate, ...(drivers || []).flatMap(d => d.payoutDates || [])])].sort().reverse();
  const shown = (drivers || []).filter(d => (!search.trim() || [d.fullName, d.email, d.truckNumber].join(' ').toLowerCase().includes(search.trim().toLowerCase())) && (truckFilter === 'all' || d.truckNumber === truckFilter) && (activity === 'all' || (activity === 'active' ? d.loadCount > 0 : d.missingTickets + d.unverifiedLoads > 0)))
    .sort((a, b) => sort === 'pay' ? b.totalPay - a.totalPay || a.fullName.localeCompare(b.fullName) : sort === 'loads' ? b.loadCount - a.loadCount || a.fullName.localeCompare(b.fullName) : a.fullName.localeCompare(b.fullName));
  const selectedDriver = shown.find(d => d.userId === selected);
  const totals = (drivers || []).reduce((sum, d) => ({ pay: sum.pay + d.totalPay, loads: sum.loads + d.loadCount, tickets: sum.tickets + d.ticketCount, missing: sum.missing + d.missingTickets, unverified: sum.unverified + d.unverifiedLoads }), { pay: 0, loads: 0, tickets: 0, missing: 0, unverified: 0 });
  let period; try { period = workPeriod(payoutDate); } catch { period = null; }
  const changePeriod = date => { setChosen(date === current ? null : date); };
  const exportSummary = () => downloadCsv([['Work period', 'Payout date', 'Driver', 'Truck', 'Loads', 'Tickets', 'Missing tickets', 'Loads to check', 'Miles', 'Tons', 'Driver pay'], ...shown.map(d => [periodLabel(payoutDate), payoutDate, d.fullName, d.truckNumber, d.loadCount, d.ticketCount, d.missingTickets, d.unverifiedLoads, d.totalMiles, d.totalTons, d.totalPay.toFixed(2)])], `fleet-pay-${payoutDate}.csv`);
  return <div className={`fleet-workspace${selectedDriver ? ' has-driver' : ''}`}>
    <div className="fleet-heading"><div><span className="fleet-eyebrow">FLEET OPERATIONS</span><h1>Pay periods</h1></div><span className="fleet-live">{drivers === undefined ? 'Syncing records…' : 'Live cloud records'}</span></div>
    <section className="fleet-period" aria-label="Pay period selection"><div className="fleet-period-caption"><CalendarDays size={22} /><div><strong>Friday – Thursday</strong><span>Work week · pays the following Saturday</span></div></div><div className="fleet-period-controls"><button className="fleet-icon-button" aria-label="Previous pay period" disabled={!period} onClick={() => changePeriod(shiftDate(payoutDate, -7))}><ChevronLeft /></button><label><span className="fleet-sr-only">Pay period</span><select value={payoutDate} onChange={e => changePeriod(e.target.value)}>{periods.map(p => <option key={p} value={p}>{periodLabel(p)}{p === current ? ' · Current' : ''}</option>)}</select></label><button className="fleet-icon-button" aria-label="Next pay period" disabled={!period} onClick={() => changePeriod(shiftDate(payoutDate, 7))}><ChevronRight /></button></div><div className="fleet-payout"><span>Payout Saturday</span><strong>{period ? formatDay(payoutDate, { year: 'numeric' }) : payoutDate}</strong></div><button className="fleet-button" disabled={payoutDate === current} onClick={() => changePeriod(current)}>Current period</button></section>
    {!period && <p className="fleet-warning" role="alert">This saved settlement has a nonstandard payout date. Review it with the driver; its records have not been moved.</p>}
    <div className="fleet-metrics" aria-label="Selected period fleet totals"><div className="fleet-pay-metric"><span>Period driver pay</span><strong>{drivers ? money(totals.pay) : '—'}</strong><small>All drivers · selected work week only</small></div><div><span>Loads</span><strong>{drivers ? number(totals.loads) : '—'}</strong><small>{drivers?.filter(d => d.loadCount > 0).length || 0} active drivers</small></div><div><span>Tickets attached</span><strong>{drivers ? number(totals.tickets) : '—'}</strong><small>Across this pay period</small></div><div><span>Needs attention</span><strong>{drivers ? number(totals.missing + totals.unverified) : '—'}</strong><small>{totals.missing} missing · {totals.unverified} to check</small></div></div>
    <div className="fleet-content"><section className="fleet-directory" aria-label="Drivers"><div className="fleet-directory-head"><h2>Drivers <span>{shown.length}</span></h2><button className="fleet-button" disabled={!shown.length || !drivers} onClick={exportSummary}><Download size={16} />Export summary</button></div><label className="fleet-search"><Search size={18} /><input aria-label="Search drivers" placeholder="Search name, truck, or email" value={search} onChange={e => setSearch(e.target.value)} /></label><div className="fleet-directory-filters"><label className="fleet-field"><span>Truck</span><select value={truckFilter} onChange={e => setTruckFilter(e.target.value)}><option value="all">All trucks</option>{[...new Set((drivers || []).map(d => d.truckNumber))].sort().map(t => <option key={t} value={t}>{truck(t)}</option>)}</select></label><label className="fleet-field"><span>Show</span><select value={activity} onChange={e => setActivity(e.target.value)}><option value="all">All drivers</option><option value="active">With loads</option><option value="attention">Needs attention</option></select></label><label className="fleet-field"><span>Sort</span><select value={sort} onChange={e => setSort(e.target.value)}><option value="name">Name</option><option value="pay">Highest pay</option><option value="loads">Most loads</option></select></label></div>
      <div className="fleet-driver-list">{drivers === undefined && <p className="fleet-empty" role="status">Loading drivers…</p>}{shown.map(d => <button key={d.userId} className={`fleet-driver${selected === d.userId ? ' selected' : ''}`} onClick={() => setSelected(d.userId)} aria-pressed={selected === d.userId}><span className="fleet-driver-top"><span className="fleet-avatar" aria-hidden="true">{d.fullName.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('')}</span><span className="fleet-driver-name"><strong>{d.fullName}</strong><small>{truck(d.truckNumber)}</small></span><ChevronRight size={18} /></span><span className="fleet-driver-bottom"><span>{d.loadCount} loads · {d.ticketCount} tickets</span><strong>{money(d.totalPay)}</strong></span>{d.missingTickets + d.unverifiedLoads > 0 && <span className="fleet-driver-attention"><AlertCircle size={14} />{d.missingTickets + d.unverifiedLoads} loads need attention</span>}</button>)}</div>{drivers && !shown.length && <div className="fleet-empty"><Users /><h3>{drivers.length ? 'No matching drivers' : 'No driver accounts yet'}</h3><p>{drivers.length ? 'Change your search or filters.' : 'Driver accounts appear after profile setup.'}</p>{!!drivers.length && <button className="fleet-button" onClick={() => { setSearch(''); setTruckFilter('all'); setActivity('all'); }}>Clear filters</button>}</div>}
      <p className="fleet-directory-note">{shown.length} of {drivers?.length || 0} drivers shown. Summary export follows these filters.</p>
    </section><div className="fleet-records">{selectedDriver ? <AdminErrorBoundary key={`${selectedDriver.userId}-${payoutDate}`}><DriverRecords driver={selectedDriver} payoutDate={payoutDate} onBack={() => setSelected(null)} /></AdminErrorBoundary> : <div className="fleet-start"><div className="fleet-start-icon"><Users size={30} /></div><h2>Select a driver</h2><p>Review daily loads, pay, and tickets for<br />{periodLabel(payoutDate)}.</p><div><CalendarDays size={18} /><span>Every total stays within this work week.</span></div></div>}</div></div>
  </div>;
}
export default function AdminWorkspace() { return <AdminErrorBoundary><FleetWorkspace /></AdminErrorBoundary>; }
