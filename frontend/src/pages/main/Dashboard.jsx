// Admin → Dashboard: totals for the day (and month), then one card per clinic with its queue,
// plus Quick Actions on the right. Built from the shared DashboardKit pieces.
import { useState } from 'react';
import {
  LayoutDashboard, RefreshCw, Building2, Users, ListOrdered, Wallet, CalendarRange, Hourglass, Stethoscope, CheckCircle2,
  UserPlus, Search, Receipt, PackagePlus, Ticket, ReceiptText, Plus,
} from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useT } from '../../lib/i18n.jsx';
import { navigate } from '../../lib/router.jsx';
import { money, num, todayLocal } from '../../lib/format.js';
import { menuFor, menuLinks, pageAllowed } from '../../menu.js';
import { Badge, CardHeader, DateFilter, EmptyState, ErrorBox, Spinner, StatusBadge, useAsync } from '../../components/ui.jsx';
import { QueueSteps, QuickActionsPanel, StatCards } from '../../components/DashboardKit.jsx';

const STEPS = [
  { key: 'queue_waiting', label: 'status.waiting', icon: Hourglass, color: 'bg-amber-50 text-amber-800' },
  { key: 'queue_with_doctor', label: 'status.with_doctor', icon: Stethoscope, color: 'bg-teal-50 text-teal-800' },
  { key: 'queue_done', label: 'status.done', icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-800' },
];

/** Waiting / With doctor / Done as one bar. */
function QueueBar({ c }) {
  const total = c.queue_total || 0;
  const pct = (n) => (total ? `${(n / total) * 100}%` : '0%');
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-ink-100" title={`${c.queue_waiting} / ${c.queue_with_doctor} / ${c.queue_done}`}>
      <span className="bg-emerald-500" style={{ width: pct(c.queue_done) }} />
      <span className="bg-teal-500" style={{ width: pct(c.queue_with_doctor) }} />
      <span className="bg-amber-400" style={{ width: pct(c.queue_waiting) }} />
    </div>
  );
}

export default function Dashboard() {
  const { t } = useT();
  const auth = useAuth();
  const [date, setDate] = useState(todayLocal());
  const { data, error, loading, reload } = useAsync(() => api('/dashboard/summary', { query: { date }, clinic: null }), [date]);

  const openClinic = (c, path) => {
    auth.setActiveClinic(c.id);
    navigate(path);
  };

  // Quick Actions: the everyday pages this login may open
  const links = [
    { to: '/patients/new', perm: 'patient.create', icon: UserPlus, label: t('menu.patientRegistration'), desc: t('patients.newPatient'), color: 'from-teal-500 to-teal-700' },
    { to: '/queue/confirm', perm: 'queue.confirm', icon: Search, label: t('menu.confirmSearch'), desc: t('queue.searchSubtitle'), color: 'from-sky-500 to-sky-700' },
    { to: '/doctor/examine', perm: 'visit.examine', icon: Stethoscope, label: t('menu.examine'), desc: t('examine.todayQueue'), color: 'from-indigo-500 to-indigo-700' },
    { to: '/pharmacy/sales-billing', key: 'pharmacy.sales-billing', icon: Receipt, label: t('sale.masterTitle'), desc: t('menu.sales'), color: 'from-emerald-500 to-emerald-700' },
    { to: '/pharmacy/stock-in', key: 'pharmacy.stock-inward', icon: PackagePlus, label: t('stockin.masterTitle'), desc: t('menu.pharmacy'), color: 'from-emerald-500 to-emerald-700' },
    { to: '/billing', perm: 'bill.create', icon: ReceiptText, label: t('menu.patientBill'), desc: t('billing.subtitle'), color: 'from-rose-500 to-rose-700' },
  ].filter((l) => auth.activeClinic && (l.key ? auth.access(l.key) === 'full' : auth.can(l.perm)));
  // a page linked from two sub-menus (Vendor Payments) is listed once
  const seen = new Set();
  const pages = menuFor(auth).flatMap((g) => menuLinks(g.items).filter((i) => pageAllowed(auth, i) && !seen.has(i.path) && seen.add(i.path)).map((i) => ({ to: i.path, label: t(i.label), group: t(g.label) })));

  const tot = data?.totals;
  const cards = tot ? [
    ...(!auth.singleClinic ? [{ label: t('dashboard.clinics'), value: `${tot.clinics_active}/${tot.clinics_total}`, sub: t('dashboard.activeTotal'), icon: Building2, bar: 'bg-slate-500', ring: 'bg-slate-100 text-slate-600' }] : []),
    { label: t('dashboard.patients'), value: num(tot.patients_total), sub: t('dashboard.newToday', { n: tot.patients_new_today }), icon: Users, bar: 'bg-teal-500', ring: 'bg-teal-50 text-teal-600' },
    { label: t('dashboard.todayQueue'), value: num(tot.queue_total), sub: `${t('status.waiting')} ${tot.queue_waiting} · ${t('status.done')} ${tot.queue_done}`, icon: ListOrdered, bar: 'bg-sky-500', ring: 'bg-sky-50 text-sky-600' },
    { label: t('dashboard.billingToday'), value: money(tot.billing_today), sub: t('dashboard.billsCount', { n: tot.bills_today }), icon: Wallet, bar: 'bg-emerald-500', ring: 'bg-emerald-50 text-emerald-600' },
    { label: t('dashboard.billingMonth'), value: money(tot.billing_month), icon: CalendarRange, bar: 'bg-brand-500', ring: 'bg-brand-50 text-brand-600' },
  ] : [];
  const small = 'btn-secondary !px-2.5 !py-1 !text-13';

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
      <div className="card min-w-0 flex-1">
        <CardHeader icon={LayoutDashboard} title={t('menu.dashboard')}
          subtitle={t(auth.singleClinic ? 'dashboard.subtitleSingle' : 'dashboard.subtitle')}
          actions={(
            <>
              <DateFilter label={t('field.date')} value={date} max={todayLocal()} onChange={(v) => setDate(v || todayLocal())} />
              <button type="button" className="btn-secondary" onClick={reload}><RefreshCw size={16} /> {t('common.refresh')}</button>
            </>
          )} />
        {loading && !data && <Spinner />}
        <ErrorBox error={error} onRetry={reload} />
        {data && (
          <>
            <StatCards cards={cards} className={cards.length > 4 ? 'sm:grid-cols-3 xl:grid-cols-5' : 'sm:grid-cols-2 xl:grid-cols-4'} />

            <p className="section-title mb-2 mt-5">{auth.singleClinic ? t('dashboard.thisClinic') : t('dashboard.perBranch')}</p>
            {!data.clinics.length && (
              <EmptyState message={(
                <>
                  <span>{t('dashboard.noClinics')}</span>
                  <button type="button" className="btn-primary !px-2.5 !py-1 !text-13" onClick={() => navigate('/clinics')}><Plus size={15} /> {t('clinics.add')}</button>
                </>
              )} />
            )}
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {data.clinics.map((c) => (
                <article key={c.id} className={`rounded-xl border border-ink-100 bg-white p-3 shadow-card ${c.status !== 'active' ? 'opacity-60' : ''}`}>
                  <header className="mb-2.5 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold text-ink-800">{c.name}</h3>
                      <span className="text-12 text-ink-400">{c.code}{c.city ? ` · ${c.city}` : ''}</span>
                    </div>
                    <StatusBadge status={c.status} />
                  </header>
                  <QueueSteps className="grid-cols-3" steps={STEPS.map((s) => ({ ...s, label: t(s.label) }))} counts={c} />
                  <div className="mt-2.5"><QueueBar c={c} /></div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-13 sm:grid-cols-4">
                    <div><dt className="text-11 text-ink-400">{t('dashboard.patients')}</dt><dd className="font-semibold text-ink-800">{num(c.patients_total)} <small className="font-normal text-emerald-600">+{c.patients_new_today}</small></dd></div>
                    <div><dt className="text-11 text-ink-400">{t('dashboard.todayQueue')}</dt><dd className="font-semibold text-ink-800">{c.queue_total}</dd></div>
                    <div><dt className="text-11 text-ink-400">{t('dashboard.billingToday')}</dt><dd className="font-semibold text-ink-800">{money(c.billing_today)}</dd></div>
                    <div><dt className="text-11 text-ink-400">{t('dashboard.billingMonth')}</dt><dd className="font-semibold text-ink-800">{money(c.billing_month)}</dd></div>
                  </dl>
                  <footer className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-2">
                    <span className="text-12 text-ink-400">{t('dashboard.staff', { n: c.employees })} · {t('dashboard.unitsShort', { p: c.pharmacies, l: c.labs })}</span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {c.low_stock_items > 0 && <Badge tone="danger">{t('dashboard.lowStock', { n: c.low_stock_items })}</Badge>}
                      {c.status === 'active' && (
                        <>
                          <button type="button" className={small} onClick={() => openClinic(c, '/queue')}><Ticket size={15} /> {t('menu.confirmList')}</button>
                          <button type="button" className={small} onClick={() => openClinic(c, '/bills')}><ReceiptText size={15} /> {t('menu.billList')}</button>
                        </>
                      )}
                    </span>
                  </footer>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
      {links.length > 0 && <QuickActionsPanel links={links} pages={pages} />}
    </div>
  );
}
