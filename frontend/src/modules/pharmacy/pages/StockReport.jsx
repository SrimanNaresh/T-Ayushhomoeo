// Pharmacy → Report → Stock Report: item-wise stock, from each item's stock history –
// Opening + Stock In − Return − Sold + Adjustment = Current Stock, and its value at the selling price.
// Clicking an item opens its stock history (each change, newest first) under its row.
import { useState } from 'react';
import { BarChart3, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/i18n.jsx';
import { fmtDate, money } from '../../../lib/format.js';
import { Badge, CardHeader, EmptyState, ErrorBox, Spinner, Pagination, SearchBox, TH, TD, useAsync, useDebounced } from '../../../components/ui.jsx';

const SHOW = ['moved', 'instock', 'out', 'all'];
/** Which report column a stock change belongs to (same rules as the server's totals) */
const kindOf = (m) => {
  if (m.ref_type === 'stock_in' || (m.reason === 'purchase' && !m.ref_type)) return 'stock_in';
  if (m.ref_type === 'purchase_return' || (m.reason === 'return' && !m.ref_type)) return 'returned';
  if (m.reason === 'issue') return 'sold';
  return m.reason === 'opening' ? 'opening' : 'adjusted';
};
const KIND_LABEL = { opening: 'report.opening', stock_in: 'menu.stockIn', returned: 'menu.return', sold: 'report.sold', adjusted: 'report.adjusted' };
const KIND_TONE = { opening: 'brand', stock_in: 'success', returned: 'danger', sold: 'danger', adjusted: 'warning' };

/** A small table shown under an opened row (stock history, a vendor's documents). */
export const SUB_TABLE = 'w-full overflow-hidden rounded-lg border border-ink-200 bg-white text-12 [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:text-11 [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-ink-500 [&_thead]:bg-ink-50 [&_tr]:border-b [&_tr]:border-ink-100';

/** The item's stock history, shown under its row */
function History({ itemId }) {
  const { t } = useT();
  const h = useAsync(() => api(`/pharmacy/item-master/${itemId}/movements`), [itemId]);
  if (h.loading) return <Spinner />;
  if (h.error) return <ErrorBox error={h.error} onRetry={h.reload} />;
  if (!h.data.rows.length) return <p className="text-13 text-ink-400">{t('report.noHistory')}</p>;
  return (
    <table className={SUB_TABLE}>
      <thead>
        <tr>
          <th>{t('report.when')}</th>
          <th>{t('report.type')}</th>
          <th>{t('report.details')}</th>
          <th>{t('purchase.vendor')}</th>
          <th className="!text-right">{t('report.change')}</th>
          <th className="!text-right">{t('report.balance')}</th>
          <th>{t('report.by')}</th>
        </tr>
      </thead>
      <tbody>
        {h.data.rows.map((m) => {
          const kind = kindOf(m);
          const change = Number(m.qty_change);
          return (
            <tr key={m.id}>
              <td className="whitespace-nowrap">{fmtDate(m.created_at, true)}</td>
              <td><Badge tone={KIND_TONE[kind]}>{t(KIND_LABEL[kind])}</Badge></td>
              <td>{m.note || '-'}</td>
              <td>{m.supplier_name || '-'}</td>
              <td className={`text-right font-bold tabular-nums ${change > 0 ? 'text-emerald-700' : 'text-red-600'}`}>{change > 0 ? `+${change}` : change}</td>
              <td className="text-right tabular-nums">{Number(m.balance_after)}</td>
              <td>{m.created_by_name || '-'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const qty = (n) => {
  const v = Number(n || 0);
  return v ? String(v) : '-';
};

export default function StockReport() {
  const { t } = useT();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [show, setShow] = useState('moved');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);   // item whose stock history is shown
  const dq = useDebounced(q);
  const list = useAsync(() => api('/pharmacy/item-master/stock-report', { query: { q: dq, category, show, page, limit: 50 } }), [dq, category, show, page]);
  const cats = useAsync(() => api('/pharmacy/item-master/categories'), []);
  const tot = list.data?.totals;
  const reset = (fn) => (v) => { fn(v); setPage(1); };
  const n = `${TD} text-right tabular-nums`;
  const sum = `${TD} bg-brand-600 py-1.5 text-right font-bold tabular-nums text-white`;

  return (
    <div className="card">
      <CardHeader icon={BarChart3} title={t('menu.stockReport')} subtitle={list.data ? t('report.itemCount', { n: list.data.total }) : t('common.loading')}
        actions={(
          <>
            <select className="input w-full sm:w-40" value={category} onChange={(e) => reset(setCategory)(e.target.value)} aria-label={t('items.category')}>
              <option value="">{t('items.allCategories')}</option>
              {(cats.data?.rows || []).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="input w-full sm:w-40" value={show} onChange={(e) => reset(setShow)(e.target.value)} aria-label={t('report.show')}>
              {SHOW.map((s) => <option key={s} value={s}>{t(`report.show_${s}`)}</option>)}
            </select>
            <SearchBox value={q} onChange={reset(setQ)} placeholder={t('report.searchHint')} />
          </>
        )} />
      <p className="-mt-1 mb-2 text-12 text-ink-400">{t('report.formula')}</p>
      {list.loading && !list.data ? <Spinner /> : <ErrorBox error={list.error} onRetry={list.reload} />}
      {list.data && (
        list.data.rows.length ? (
          <>
            <div className="overflow-x-auto rounded-lg">
              <table className="list-pinned pin-first w-full min-w-[1000px] text-left text-13">
                <thead>
                  <tr className="table-head">
                    <th className={`${TH} rounded-l-lg`}>{t('items.name')}</th>
                    <th className={TH}>{t('items.code')}</th>
                    <th className={TH}>{t('items.category')}</th>
                    <th className={TH}>{t('items.pack')}</th>
                    <th className={`${TH} text-right`}>{t('report.opening')}</th>
                    <th className={`${TH} text-right !text-emerald-700`}>{t('menu.stockIn')}</th>
                    <th className={`${TH} text-right !text-red-600`}>{t('menu.return')}</th>
                    <th className={`${TH} text-right !text-red-600`}>{t('report.sold')}</th>
                    <th className={`${TH} text-right`}>{t('report.adjusted')}</th>
                    <th className={`${TH} text-right !bg-brand-50 !text-brand-700`}>{t('report.current')}</th>
                    <th className={`${TH} text-right`}>{t('report.price')}</th>
                    <th className={`${TH} rounded-r-lg text-right`}>{t('report.value')}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.rows.map((r) => {
                    const open = openId === r.id;
                    const toggle = () => setOpenId(open ? null : r.id);
                    const empty = Number(r.stock_qty) <= 0;
                    return [
                      <tr key={r.id} className={`cursor-pointer ${open ? '[&>td]:!bg-brand-50' : ''} ${empty ? 'text-ink-400' : 'text-ink-600'}`}
                        tabIndex={0} aria-expanded={open} title={t('report.historyHint')} onClick={toggle}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}>
                        <td className={`${TD} font-medium text-ink-700`}>
                          <span className="flex items-center gap-1">
                            {open ? <ChevronDown size={14} className="shrink-0 text-brand-600" /> : <ChevronRight size={14} className="shrink-0 text-brand-600" />}{r.name}
                          </span>
                        </td>
                        <td className={`${TD} text-12 text-ink-400`}>{r.item_code}</td>
                        <td className={TD}>{r.category || '-'}</td>
                        <td className={TD}>{r.pack || r.unit || '-'}</td>
                        <td className={n}>{qty(r.opening)}</td>
                        <td className={`${n} text-emerald-700`}>{qty(r.stock_in)}</td>
                        <td className={`${n} text-red-600`}>{qty(r.returned)}</td>
                        <td className={`${n} text-red-600`}>{qty(r.sold)}</td>
                        <td className={n}>{qty(r.adjusted)}</td>
                        <td className={`${n} bg-brand-50/60 font-bold text-ink-800`}>{Number(r.stock_qty || 0)}</td>
                        <td className={n}>{money(r.price)}</td>
                        <td className={`${n} font-semibold text-ink-800`}>{money(r.stock_value)}</td>
                      </tr>,
                      open && (
                        <tr key={`h-${r.id}`}>
                          <td colSpan={12} className="!bg-ink-50/60 px-3 pb-3 pt-1.5 sm:pl-8"><History itemId={r.id} /></td>
                        </tr>
                      ),
                    ];
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} className={`${sum} !bg-brand-600 rounded-l-lg !text-left`}>{t('stockin.sumTotal')}</td>
                    <td className={sum}>{qty(tot.opening)}</td>
                    <td className={sum}>{qty(tot.stock_in)}</td>
                    <td className={sum}>{qty(tot.returned)}</td>
                    <td className={sum}>{qty(tot.sold)}</td>
                    <td className={sum}>{qty(tot.adjusted)}</td>
                    <td className={sum}>{Number(tot.stock_qty || 0)}</td>
                    <td className={sum} />
                    <td className={`${sum} rounded-r-lg`}>{money(tot.stock_value)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <Pagination page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={setPage} />
          </>
        ) : <EmptyState />
      )}
    </div>
  );
}
