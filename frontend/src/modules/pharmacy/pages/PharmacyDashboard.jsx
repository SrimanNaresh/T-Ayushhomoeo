// Pharmacy → Pharmacy Dashboard: today's and this month's sales (less Sales Returns), this month's purchases,
// stock value, the last 7 days' sales, items running low, batches expiring soon and the latest sales,
// with the Quick Actions column (as the main Dashboard).
import { LayoutDashboard, RefreshCw, Wallet, CalendarRange, PackagePlus, Boxes, Receipt, RotateCcw, Layers, SlidersHorizontal } from 'lucide-react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/i18n.jsx';
import { useAuth } from '../../../lib/auth.jsx';
import { navigate } from '../../../lib/router.jsx';
import { fmtDate, money, num } from '../../../lib/format.js';
import { CardHeader, ErrorBox, Spinner, useAsync } from '../../../components/ui.jsx';
import { StatCards, QuickActionsPanel } from '../../../components/DashboardKit.jsx';

const qty = (n) => String(Math.round(Number(n || 0) * 100) / 100);
const day = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit' });

/** One titled box with a short list; `more` = how many are left out */
function Panel({ title, hint, more, children, empty }) {
  const { t } = useT();
  return (
    <section className="rounded-xl border border-ink-100 bg-white p-3 shadow-card">
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="section-title !mb-0">{title}</h3>
        {more > 0 && <span className="text-11 text-ink-400">{t('pdash.more', { n: more })}</span>}
      </header>
      {hint && <p className="-mt-1 mb-2 text-11 text-ink-400">{hint}</p>}
      {empty ? <p className="py-4 text-center text-12 text-ink-400">{t('pdash.none')}</p> : children}
    </section>
  );
}

export default function PharmacyDashboard() {
  const { t } = useT();
  const auth = useAuth();
  const { data, loading, error, reload } = useAsync(() => api('/pharmacy/dashboard'), []);

  const cards = data ? [
    { label: t('pdash.todaySales'), value: money(data.today_sales), sub: t('pdash.bills', { n: data.today_bills }), icon: Wallet, bar: 'bg-emerald-500', ring: 'bg-emerald-50 text-emerald-600' },
    {
      label: t('pdash.monthSales'), value: money(data.month_sales), icon: CalendarRange, bar: 'bg-brand-500', ring: 'bg-brand-50 text-brand-600',
      sub: data.month_refunds ? t('pdash.lessReturns', { amount: money(data.month_refunds) }) : t('pdash.bills', { n: data.month_bills }),
    },
    { label: t('pdash.monthPurchases'), value: money(data.month_purchases), sub: t('pdash.stockIns', { n: data.month_stock_ins }), icon: PackagePlus, bar: 'bg-sky-500', ring: 'bg-sky-50 text-sky-600' },
    { label: t('pdash.stockValue'), value: money(data.stock_value), sub: t('pdash.items', { n: num(data.item_count) }), icon: Boxes, bar: 'bg-violet-500', ring: 'bg-violet-50 text-violet-600' },
  ] : [];
  const peak = data ? Math.max(1, ...data.week.map((w) => w.amount)) : 1;

  const links = [
    { to: '/pharmacy/sales-billing', key: 'pharmacy.sales-billing', icon: Receipt, label: t('sale.new'), desc: t('menu.sales'), color: 'from-teal-500 to-teal-700' },
    { to: '/pharmacy/sales-return', key: 'pharmacy.sales-return', icon: RotateCcw, label: t('sret.new'), desc: t('menu.return'), color: 'from-rose-500 to-rose-700' },
    { to: '/pharmacy/stock-in', key: 'pharmacy.stock-inward', icon: PackagePlus, label: t('stockin.new'), desc: t('menu.stockIn'), color: 'from-emerald-500 to-emerald-700' },
    { to: '/pharmacy/stock-ips', key: 'pharmacy.stock-ips', icon: Layers, label: t('menu.threeInOne'), desc: t('menu.stockIn'), color: 'from-emerald-500 to-emerald-700' },
    { to: '/pharmacy/stock-adjustment', key: 'pharmacy.stock-adjustment', icon: SlidersHorizontal, label: t('adj.new'), desc: t('menu.stockIn'), color: 'from-amber-400 to-amber-600' },
  ].filter((l) => auth.access(l.key) === 'full');

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
      <div className="card min-w-0 flex-1">
        <CardHeader icon={LayoutDashboard} title={t('menu.pharmacyDashboard')} subtitle={t('pdash.subtitle')}
          actions={<button type="button" className="btn-secondary" onClick={reload}><RefreshCw size={16} /> {t('common.refresh')}</button>} />
        {loading && !data && <Spinner />}
        <ErrorBox error={error} onRetry={reload} />
        {data && (
          <>
            <StatCards cards={cards} className="sm:grid-cols-2 xl:grid-cols-4" />

            <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
              <Panel title={t('pdash.week')}>
                <ul className="space-y-1.5">
                  {data.week.map((w) => (
                    <li key={w.day} className="grid grid-cols-[4.5rem_1fr_6.5rem] items-center gap-2 text-12">
                      <span className="text-ink-500">{day(w.day)}</span>
                      <span className="h-2.5 overflow-hidden rounded-full bg-ink-100">
                        <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${(w.amount / peak) * 100}%` }} />
                      </span>
                      <span className="text-right tabular-nums text-ink-700">{money(w.amount)}</span>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel title={t('pdash.recent')} empty={!data.recent_sales.length}>
                <ul className="divide-y divide-ink-100">
                  {data.recent_sales.map((s) => (
                    <li key={s.id}>
                      <button type="button" className="flex w-full items-center justify-between gap-2 py-1.5 text-left text-13 hover:text-brand-700" onClick={() => navigate(`/pharmacy/sales-billing/${s.id}`)}>
                        <span className="min-w-0 truncate"><span className="font-medium text-ink-700">{s.sale_no}</span> <span className="text-ink-500">· {s.customer_name}</span></span>
                        <span className="shrink-0 tabular-nums text-ink-700">{money(s.total_amount)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel title={t('pdash.lowStock')} hint={t('pdash.lowHint', { n: data.low_stock_limit })}
                more={data.low_stock_count - data.low_stock.length} empty={!data.low_stock.length}>
                <ul className="divide-y divide-ink-100">
                  {data.low_stock.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-2 py-1.5 text-13">
                      <span className="min-w-0 truncate"><span className="font-medium text-ink-700">{i.name}</span> <span className="text-ink-400">· {i.item_code || '-'}</span></span>
                      <span className={`shrink-0 tabular-nums font-semibold ${Number(i.stock_qty) <= 0 ? 'text-red-600' : 'text-amber-600'}`}>{qty(i.stock_qty)}</span>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel title={t('pdash.expiring', { n: data.expiry_days })} more={data.expiring_count - data.expiring.length} empty={!data.expiring.length}>
                <ul className="divide-y divide-ink-100">
                  {data.expiring.map((b) => (
                    <li key={b.id} className="flex items-center justify-between gap-2 py-1.5 text-13">
                      <span className="min-w-0 truncate"><span className="font-medium text-ink-700">{b.name}</span> <span className="text-ink-400">· {b.batch_no || '-'}</span></span>
                      <span className="shrink-0 text-12 text-ink-500">{fmtDate(b.exp_date)} · <span className="font-semibold tabular-nums text-ink-700">{qty(b.available)}</span></span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          </>
        )}
      </div>
      {links.length > 0 && <QuickActionsPanel links={links} />}
    </div>
  );
}
