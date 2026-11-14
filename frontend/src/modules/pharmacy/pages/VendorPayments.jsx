// Pharmacy → Report → Vendor Payments: per vendor, Stock In (+ GST) less Return (+ GST) = Net Payable, less Paid
// (Vendor → Payments) = Balance,
// for an optional date range. Clicking a vendor opens its Stock Ins and Returns under its row.
import { useState } from 'react';
import { Wallet, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/i18n.jsx';
import { navigate } from '../../../lib/router.jsx';
import { fmtDate, money } from '../../../lib/format.js';
import { Badge, CardHeader, DateFilter, EmptyState, ErrorBox, Spinner, TH, TD, useAsync } from '../../../components/ui.jsx';
import { SUB_TABLE } from './StockReport.jsx';

/** One vendor's Stock Ins and Returns, shown under its row */
function VendorDetails({ supplierId, range }) {
  const { t } = useT();
  const d = useAsync(() => api(`/pharmacy/pharmacy-reports/vendor-payments/${supplierId}`, { query: range }), [supplierId, range.from, range.to]);
  if (d.loading) return <Spinner />;
  if (d.error) return <ErrorBox error={d.error} onRetry={d.reload} />;
  return (
    <table className={SUB_TABLE}>
      <thead>
        <tr>
          <th>{t('purchase.date')}</th>
          <th>{t('report.type')}</th>
          <th>{t('vp.docNo')}</th>
          <th>{t('vp.refNo')}</th>
          <th>{t('items.name')}</th>
          <th className="!text-right">{t('purchase.items')}</th>
          <th className="!text-right">{t('items.quantity')}</th>
          <th className="!text-right">{t('vp.taxable')}</th>
          <th className="!text-right">GST</th>
          <th className="!text-right">{t('vp.total')}</th>
        </tr>
      </thead>
      <tbody>
        {d.data.rows.map((r) => {
          const isReturn = r.type === 'return';
          const isPayment = r.type === 'payment';
          const less = isReturn || isPayment;   // both reduce what is owed
          return (
            <tr key={`${r.type}-${r.id}`} className={isPayment ? '' : 'cursor-pointer hover:bg-brand-50/50'} title={isPayment ? undefined : t('vp.open')}
              onClick={() => { if (!isPayment) navigate(isReturn ? `/pharmacy/return/${r.id}` : `/pharmacy/stock-in/${r.id}`); }}>
              <td className="whitespace-nowrap">{fmtDate(r.doc_date)}</td>
              <td><Badge tone={isPayment ? 'info' : isReturn ? 'danger' : 'success'}>{t(isPayment ? 'vpay.payment' : isReturn ? 'menu.return' : 'menu.stockIn')}</Badge></td>
              <td className="font-semibold text-ink-800">{r.doc_no}</td>
              <td className="text-ink-400">{r.ref_no}</td>
              <td className="max-w-[16rem] font-medium">{r.item_names}</td>
              <td className="text-right tabular-nums">{r.items ?? ''}</td>
              <td className="text-right tabular-nums">{r.qty == null ? '' : Number(r.qty)}</td>
              <td className="text-right tabular-nums">{money(r.taxable)}</td>
              <td className="text-right tabular-nums">{money(r.gst)}</td>
              <td className={`text-right font-bold tabular-nums ${less ? 'text-red-600' : 'text-emerald-700'}`}>{less ? '− ' : ''}{money(r.total)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function VendorPayments() {
  const { t } = useT();
  const [range, setRange] = useState({ from: '', to: '' });
  const [openId, setOpenId] = useState(null);
  const list = useAsync(() => api('/pharmacy/pharmacy-reports/vendor-payments', { query: range }), [range.from, range.to]);
  const tot = list.data?.totals;
  const n = `${TD} text-right tabular-nums`;
  const sum = `${TD} bg-brand-600 py-1.5 text-right font-bold tabular-nums text-white`;

  return (
    <div className="card">
      <CardHeader icon={Wallet} title={t('menu.vendorPayments')} subtitle={t('vp.subtitle')}
        actions={(
          <>
            <DateFilter label={t('vp.from')} value={range.from} max={range.to || undefined} onChange={(v) => setRange((r) => ({ ...r, from: v }))} />
            <DateFilter label={t('vp.to')} value={range.to} min={range.from || undefined} onChange={(v) => setRange((r) => ({ ...r, to: v }))} />
          </>
        )} />
      <p className="-mt-1 mb-2 text-12 text-ink-400">{t('vp.formula')}</p>
      {list.loading && !list.data ? <Spinner /> : <ErrorBox error={list.error} onRetry={list.reload} />}
      {list.data && (list.data.rows.length ? (
        <div className="overflow-x-auto rounded-lg">
          <table className="list-pinned pin-first w-full min-w-[980px] text-left text-13">
            <thead>
              <tr className="table-head">
                <th className={`${TH} rounded-l-lg`}>{t('purchase.vendor')}</th>
                <th className={`${TH} text-right`}>{t('menu.stockIn')}</th>
                <th className={`${TH} text-right`}>{t('vp.taxable')}</th>
                <th className={`${TH} text-right`}>GST</th>
                <th className={`${TH} text-right !text-emerald-700`}>{t('vp.stockInTotal')}</th>
                <th className={`${TH} text-right`}>{t('menu.return')}</th>
                <th className={`${TH} text-right !text-red-600`}>{t('vp.returnTotal')}</th>
                <th className={`${TH} text-right !bg-brand-50 !text-brand-700`}>{t('vp.payable')}</th>
                <th className={`${TH} text-right`}>{t('vpay.paid')}</th>
                <th className={`${TH} rounded-r-lg text-right`}>{t('vpay.balance')}</th>
              </tr>
            </thead>
            <tbody>
              {list.data.rows.map((r) => {
                const open = openId === r.supplier_id;
                const toggle = () => setOpenId(open ? null : r.supplier_id);
                return [
                  <tr key={r.supplier_id} className={`cursor-pointer text-ink-600 ${open ? '[&>td]:!bg-brand-50' : ''}`} tabIndex={0} aria-expanded={open}
                    title={t('vp.detailsHint')} onClick={toggle}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}>
                    <td className={`${TD} font-medium text-ink-700`}>
                      <span className="flex items-center gap-1">
                        {open ? <ChevronDown size={14} className="shrink-0 text-brand-600" /> : <ChevronRight size={14} className="shrink-0 text-brand-600" />}
                        <span>{r.supplier_name}{r.mobile && <span className="text-12 font-normal text-ink-400"> · {r.mobile}</span>}</span>
                      </span>
                    </td>
                    <td className={n}>{r.stock_in_count}</td>
                    <td className={n}>{money(r.stock_in.taxable)}</td>
                    <td className={n}>{money(r.stock_in.gst)}</td>
                    <td className={`${n} font-semibold text-emerald-700`}>{money(r.stock_in.total)}</td>
                    <td className={n}>{r.return_count}</td>
                    <td className={`${n} font-semibold text-red-600`}>{money(r.returned.total)}</td>
                    <td className={`${n} bg-brand-50/60 font-bold text-ink-800`}>{money(r.payable)}</td>
                    <td className={n}>{money(r.paid)}</td>
                    <td className={`${n} font-bold ${r.balance > 0 ? 'text-amber-700' : 'text-ink-500'}`}>{money(r.balance)}</td>
                  </tr>,
                  open && (
                    <tr key={`d-${r.supplier_id}`}>
                      <td colSpan={10} className="!bg-ink-50/60 px-3 pb-3 pt-1.5 sm:pl-8"><VendorDetails supplierId={r.supplier_id} range={range} /></td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className={`${sum} !bg-brand-600 rounded-l-lg !text-left`}>{t('stockin.sumTotal')}</td>
                <td className={sum}>{tot.stock_in_count}</td>
                <td className={sum}>{money(tot.stock_in.taxable)}</td>
                <td className={sum}>{money(tot.stock_in.gst)}</td>
                <td className={sum}>{money(tot.stock_in.total)}</td>
                <td className={sum}>{tot.return_count}</td>
                <td className={sum}>{money(tot.returned.total)}</td>
                <td className={sum}>{money(tot.payable)}</td>
                <td className={sum}>{money(tot.paid)}</td>
                <td className={`${sum} rounded-r-lg`}>{money(tot.balance)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : <EmptyState message={t('vp.none')} />)}
    </div>
  );
}
