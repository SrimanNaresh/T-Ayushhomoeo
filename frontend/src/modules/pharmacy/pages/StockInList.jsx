// Pharmacy → Stock In → List, in two tabs: Item wise (a heading row per item with its totals, then each batch
// received) and Date wise (a heading row per Stock In date, then each item and batch received that day).
// Every row has its Buy, Sale, Discount and Net Sale amounts; the bar above totals everything the search matches.
// An Admin also gets Edit / Delete (per batch Item wise, per Stock In Date wise).
import { useState } from 'react';
import { PackagePlus, Plus, Pencil, Trash2, ChevronDown, ChevronRight, Package, CalendarDays } from 'lucide-react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/i18n.jsx';
import { useAuth } from '../../../lib/auth.jsx';
import { navigate } from '../../../lib/router.jsx';
import { fmtDate, money } from '../../../lib/format.js';
import { CardHeader, EmptyState, ErrorBox, Spinner, Pagination, RowAction, SearchBox, SummaryBar, TH, TD, colClass, useAsync, useDebounced, useToast } from '../../../components/ui.jsx';
import { DashTabs } from '../../../components/DashboardKit.jsx';

const month = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '-');
const qtyText = (n) => String(Number(n || 0));
const r2 = (n) => Math.round(n * 100) / 100;

/** Amounts for a single quantity: Buy = Rate, Sale = MRP, Net = Sel.Amount, Discount = Sale − Net */
const perUnit = (r) => ({ buy: Number(r.rate), sale: Number(r.mrp), net: Number(r.sel_amount), disc: r2(Number(r.mrp) - Number(r.sel_amount)) });
/** The line's total with the single-quantity amount under it */
const Amount = ({ total, unit, strong, label }) => (
  <span className="inline-flex flex-col items-end leading-tight">
    {strong ? <b className="text-ink-800">{money(total)}</b> : money(total)}
    <small className="text-11 text-ink-400" title={label}>{money(unit)} / 1</small>
  </span>
);

const dateKey = (d) => String(d ?? '').slice(0, 10);
const keyOf = (tab, r) => (tab === 'date' ? dateKey(r.si_date) : r.item_name);

/** [[group key, its rows], …] in the order the rows came (the server sorts them by item / by date) */
function groupRows(tab, rows) {
  const groups = new Map();
  for (const r of rows) {
    const k = keyOf(tab, r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  return [...groups];
}

/** Consecutive rows of the same Stock In, as blocks */
function groupByStockIn(rows) {
  const blocks = [];
  for (const r of rows) {
    const last = blocks[blocks.length - 1];
    if (last && last[0].stock_in_id === r.stock_in_id) last.push(r);
    else blocks.push([r]);
  }
  return blocks;
}

export default function StockInList() {
  const { t } = useT();
  const { isGlobal: isAdmin } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState('item');       // 'item' (Item wise) | 'date' (Date wise)
  const [openItems, setOpenItems] = useState(() => new Set());   // Item wise: items whose batches are shown
  const dq = useDebounced(q);
  const list = useAsync(() => api('/pharmacy/stock-ins/lines', { query: { q: dq, group: tab, page, limit: 50 } }), [dq, tab, page]);
  const tot = list.data?.totals;

  async function remove(r) {
    if (!window.confirm(t('stockin.deleteConfirm', { no: r.si_no }))) return;
    try {
      await api(`/pharmacy/stock-ins/${r.stock_in_id}`, { method: 'DELETE' });
      toast(t('stockin.deleted', { no: r.si_no }));
      list.reload();
    } catch (err) {
      toast(err.message || t('common.deleteFailed'), 'error');
    }
  }
  const actions = (r) => (
    <>
      <RowAction icon={Pencil} title={t('common.edit')} onClick={() => navigate(`/pharmacy/stock-in/${r.stock_in_id}`)} />
      <RowAction icon={Trash2} tone="danger" title={t('common.delete')} onClick={() => remove(r)} />
    </>
  );

  // Item wise: the item name is shown once, in its heading row. Date wise: the date is in the heading row, and
  // each Stock In's rows are kept together – its Stock In No (with the vendor) and Edit are one merged cell.
  const byDate = tab === 'date';
  const merged = 'bg-ink-50/60 text-center align-middle';
  const columns = [
    ...(byDate
      ? [
        {
          key: 'si_no', label: t('stockin.no'), merged: true, className: merged,
          render: (r) => <><b className="text-ink-800">{r.si_no}</b><small className="block text-11 text-ink-400">{r.supplier_name} · {r.po_no}{r.bill_no ? ` · ${t('stockin.billNo', { no: r.bill_no })}` : ''}</small></>,
        },
        { key: 'item_name', label: t('items.name'), render: (r) => <span className="font-medium text-ink-700">{r.item_name}</span> },
      ]
      : [{ key: 'item_name', label: t('items.name'), render: () => null }]),
    { key: 'batch_no', label: t('stockin.batch'), render: (r) => r.batch_no || '-' },
    { key: 'exp_date', label: t('stockin.exp'), render: (r) => month(r.exp_date) },
    ...(byDate ? [] : [
      {
        key: 'si_no', label: t('stockin.no'),
        render: (r) => <span title={fmtDate(r.si_date)}>{r.si_no}{r.bill_no && <small className="block text-11 text-ink-400">{t('stockin.billNo', { no: r.bill_no })}</small>}</span>,
      },
      { key: 'supplier_name', label: t('purchase.vendor') },
    ]),
    {
      key: 'qty', label: t('items.quantity'), className: 'num',
      render: (r) => (
        <span className="inline-flex flex-col items-end leading-tight">
          {qtyText(r.qty)}{Number(r.free_qty) > 0 && <small className="text-11 text-ink-400">{t('stockin.inclFree', { n: qtyText(r.free_qty) })}</small>}
        </span>
      ),
    },
    { key: 'buy_amount', label: t('stockin.buyAmount'), className: 'num', render: (r) => <Amount total={r.buy_amount} unit={perUnit(r).buy} label={t('stockin.perUnit')} /> },
    { key: 'sale_amount', label: t('stockin.saleAmount'), className: 'num', render: (r) => <Amount total={r.sale_amount} unit={perUnit(r).sale} label={t('stockin.perUnit')} /> },
    { key: 'disc_amount', label: t('stockin.discAmount'), className: 'num', render: (r) => <Amount total={r.disc_amount} unit={perUnit(r).disc} label={t('stockin.perUnit')} /> },
    { key: 'net_amount', label: t('stockin.netAmount'), className: 'num', render: (r) => <Amount strong total={r.net_amount} unit={perUnit(r).net} label={t('stockin.perUnit')} /> },
    // Admin only: Edit / Delete – Date wise one per Stock In, merged down its block; Item wise on each batch
    ...(isAdmin ? [{ key: '_a', label: t('common.edit'), className: `col-actions ${byDate ? merged : ''}`, merged: byDate, render: actions }] : []),
  ];
  const amountCols = isAdmin ? 6 : 5;   // Quantity, the four amounts (and Edit / Delete): the heading row's own cells
  const groupCell = 'border-t border-brand-100 bg-brand-50 py-1';
  const sumCell = 'bg-brand-600 py-1.5 font-bold text-white';

  return (
    <div className="card">
      <CardHeader icon={PackagePlus} title={t('stockin.listTitle')} subtitle={list.data ? t('stockin.lineCount', { n: list.data.total }) : t('common.loading')}
        actions={(
          <>
            <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder={t('stockin.lineSearch')} />
            <button type="button" className="btn-primary" onClick={() => navigate('/pharmacy/stock-in')}><Plus size={16} /> {t('stockin.new')}</button>
          </>
        )} />
      <DashTabs tab={tab} onChange={(k) => { setTab(k); setPage(1); }}
        tabs={[{ key: 'item', label: t('stockin.tab_item'), icon: Package }, { key: 'date', label: t('stockin.tab_date'), icon: CalendarDays }]} />
      {tot && list.data.total > 0 && (
        <SummaryBar items={[
          [t('items.quantity'), qtyText(tot.qty)], [t('stockin.buyAmount'), money(tot.buy_amount)], [t('stockin.saleAmount'), money(tot.sale_amount)],
          [t('stockin.discAmount'), money(tot.disc_amount)], [t('stockin.netAmount'), money(tot.net_amount), true],
        ]} />
      )}
      {list.loading && !list.data ? <Spinner /> : <ErrorBox error={list.error} onRetry={list.reload} />}
      {list.data && (
        <>
          {list.data.rows.length ? (
            <div className="overflow-x-auto rounded-lg">
              <table className="list-pinned pin-first w-full min-w-[900px] text-left text-13">
                <thead>
                  <tr className="table-head">
                    {columns.map((c, i) => (
                      <th key={c.key} className={`${TH} whitespace-nowrap ${i === 0 ? 'rounded-l-lg' : ''} ${i === columns.length - 1 ? 'rounded-r-lg' : ''} ${colClass(c.className)}`}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groupRows(tab, list.data.rows).map(([key, rows]) => {
                    const g = (list.data.groups || []).find((x) => (tab === 'date' ? dateKey(x.group_key) : x.group_key) === key) || {};
                    // Item wise: the batches show only after the item's heading is clicked
                    const open = byDate || openItems.has(key);
                    const toggle = () => setOpenItems((s) => {
                      const next = new Set(s);
                      if (next.has(key)) next.delete(key); else next.add(key);
                      return next;
                    });
                    return [
                      <tr key={`g-${key}`} className={byDate ? '' : 'cursor-pointer [&>td]:hover:!bg-brand-100/70'} aria-expanded={byDate ? undefined : open}
                        tabIndex={byDate ? undefined : 0} onClick={byDate ? undefined : toggle}
                        onKeyDown={byDate ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}>
                        <td colSpan={columns.length - amountCols} className={`${TD} ${groupCell} !bg-brand-50`}>
                          <span className="flex items-center gap-1.5">
                            {!byDate && (open ? <ChevronDown size={15} className="text-brand-600" /> : <ChevronRight size={15} className="text-brand-600" />)}
                            <b className="text-brand-700">{tab === 'date' ? fmtDate(key) : key}</b>
                            <span className="text-12 text-ink-400">
                              · {tab === 'date' ? `${t('stockin.entries', { n: g.entries ?? 1 })} · ` : ''}{t('stockin.batches', { n: g.batches ?? rows.length })}
                            </span>
                          </span>
                        </td>
                        <td className={`${TD} ${groupCell} text-right tabular-nums`}><b>{qtyText(g.qty)}</b></td>
                        <td className={`${TD} ${groupCell} text-right tabular-nums`}>{money(g.buy_amount)}</td>
                        <td className={`${TD} ${groupCell} text-right tabular-nums`}>{money(g.sale_amount)}</td>
                        <td className={`${TD} ${groupCell} text-right tabular-nums`}>{money(g.disc_amount)}</td>
                        <td className={`${TD} ${groupCell} text-right tabular-nums`}><b>{money(g.net_amount)}</b></td>
                        {isAdmin && <td className={groupCell} />}
                      </tr>,
                      // Date wise: one block per Stock In (rows come sorted by Stock In); merged cells on its first row
                      ...(!open ? [] : byDate ? groupByStockIn(rows) : [rows]).flatMap((block) => block.map((r, i) => (
                        <tr key={r.id}>
                          {columns.map((c, ci) => {
                            if (c.merged && i > 0) return null;
                            return (
                              <td key={c.key} rowSpan={c.merged ? block.length : undefined}
                                className={`${TD} whitespace-nowrap text-ink-500 ${!byDate && ci === 1 ? 'pl-6' : ''} ${colClass(c.className)}`}>
                                {c.render ? c.render(r) : (r[c.key] ?? '-')}
                              </td>
                            );
                          })}
                        </tr>
                      ))),
                    ];
                  })}
                </tbody>
                {/* Sum of every row the search matches (all pages) */}
                <tfoot>
                  <tr>
                    <td colSpan={columns.length - amountCols} className={`${TD} ${sumCell} !bg-brand-600 rounded-l-lg`}>{t('stockin.sumTotal')}</td>
                    <td className={`${TD} ${sumCell} text-right tabular-nums`}>{qtyText(tot.qty)}</td>
                    <td className={`${TD} ${sumCell} text-right tabular-nums`}>{money(tot.buy_amount)}</td>
                    <td className={`${TD} ${sumCell} text-right tabular-nums`}>{money(tot.sale_amount)}</td>
                    <td className={`${TD} ${sumCell} text-right tabular-nums`}>{money(tot.disc_amount)}</td>
                    <td className={`${TD} ${sumCell} text-right tabular-nums ${isAdmin ? '' : 'rounded-r-lg'}`}>{money(tot.net_amount)}</td>
                    {isAdmin && <td className={`${sumCell} rounded-r-lg`} />}
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : <EmptyState />}
          <Pagination page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}
