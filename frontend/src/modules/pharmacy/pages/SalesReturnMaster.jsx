// Pharmacy → Return → Sales Return: goods a customer brings back. Find the sale by its date or by the
// customer (sale no / name / mobile), pick it, then enter what came back on each of its lines – in the
// line's own Sell by unit, up to what was sold less earlier returns. Refund = Qty × Sale Price less the
// line's Disc % and the sale's Bill Discount %. Saving adds the stock back (to its batch too).
// Wide screens: a grid. Phones: one card per sale line (as Purchase Return).
import { useEffect, useState } from 'react';
import { RotateCcw, Save, Trash2, X } from 'lucide-react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/i18n.jsx';
import { navigate } from '../../../lib/router.jsx';
import { fmtDate, money, todayLocal } from '../../../lib/format.js';
import { arrowMove } from '../../../lib/tableKeys.js';
import { CardHeader, ErrorBox, Spinner, Note, GRID_INPUT, GRID_BAD, FORM_ACTIONS, useAsync, useDebounced, useToast } from '../../../components/ui.jsx';
import { CardField, CardValue, ItemCard, cardBox, cardBad } from '../../../components/MobileCard.jsx';

const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const qtyText = (n) => String(Number(n || 0));
const refundOf = (qty, l, billDisc) => r2(Number(qty || 0) * Number(l.price) * (1 - Number(l.disc_percent || 0) / 100) * (1 - Number(billDisc || 0) / 100));

const cell = 'border border-ink-200 px-1 py-0.5';
const hd = 'border border-ink-200 px-1 py-1.5 text-center align-middle text-11';
const ro = 'px-1.5 text-right tabular-nums text-ink-600';

export default function SalesReturnForm({ params }) {
  const { t } = useT();
  const toast = useToast();
  const id = params.id;
  const emptyHead = () => ({ sale_id: '', return_date: todayLocal(), reason: '' });
  const [head, setHead] = useState(emptyHead);
  const [find, setFind] = useState({ date: todayLocal(), q: '' });
  const [sale, setSale] = useState(null);
  const [rows, setRows] = useState([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const dq = useDebounced(find.q);
  const existing = useAsync(() => (id ? api(`/pharmacy/sales-returns/${id}`) : Promise.resolve(null)), [id]);
  // a typed search looks across all dates; otherwise that day's sales
  const sales = useAsync(
    () => (id ? Promise.resolve({ rows: [] }) : api('/pharmacy/sales-returns/sales', { query: dq.trim() ? { q: dq.trim() } : { date: find.date } })),
    [id, dq, find.date],
  );
  const unitLabel = (l) => (l.sale_unit === 'unit' ? t('sale.unit') : t('sale.pack'));

  async function loadSale(saleId, saved = []) {
    if (!saleId) { setSale(null); setRows([]); return; }
    setRowsLoading(true);
    try {
      const r = await api(`/pharmacy/sales-returns/sale/${saleId}`, { query: id ? { except: id } : {} });
      const bySaved = new Map(saved.map((s) => [s.sale_item_id, s]));
      setSale(r.sale);
      setRows(r.rows.map((l) => ({ ...l, qty: bySaved.has(l.sale_item_id) ? qtyText(bySaved.get(l.sale_item_id).unit_qty) : '' })));
    } catch (err) {
      toast(err.message || t('common.loadFailed'), 'error');
    } finally {
      setRowsLoading(false);
    }
  }

  useEffect(() => {
    const ret = existing.data;
    if (!ret) return;
    setHead({ sale_id: String(ret.sale_id), return_date: String(ret.return_date).slice(0, 10), reason: ret.reason || '' });
    loadSale(ret.sale_id, ret.lines);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing.data]);

  const setRow = (key, patch) => setRows((rs) => rs.map((r) => (r.sale_item_id === key ? { ...r, ...patch } : r)));
  const leftOf = (r) => r2(Number(r.sold) - Number(r.returned));
  const billDisc = Number(sale?.disc_percent || 0);
  const total = r2(rows.reduce((s, r) => s + refundOf(r.qty, r, billDisc), 0));
  const totalQty = rows.reduce((s, r) => s + Number(r.qty || 0), 0);
  const overRow = rows.find((r) => Number(r.qty) > leftOf(r));

  function validate() {
    if (!head.sale_id) return t('sret.chooseSale');
    if (overRow) return `${overRow.item_name}: ${t('sret.leftHint', { n: leftOf(overRow) })}`;
    if (!totalQty) return t('common.isRequired', { field: t('sret.qty') });
    return null;
  }

  const reset = () => { setHead(emptyHead()); setSale(null); setRows([]); };

  async function submit(e) {
    e.preventDefault();
    const problem = validate();
    if (problem) return toast(problem, 'error');
    setSaving(true);
    const body = { ...head, lines: rows.filter((r) => Number(r.qty) > 0).map(({ sale_item_id, qty }) => ({ sale_item_id, qty })) };
    try {
      const ret = id ? await api(`/pharmacy/sales-returns/${id}`, { method: 'PUT', body }) : await api('/pharmacy/sales-returns', { method: 'POST', body });
      toast(t('sret.saved', { no: ret.sr_no }));
      if (id) navigate('/pharmacy/sales-return-list');
      else { reset(); sales.reload(); }
    } catch (err) {
      toast(err.message || t('common.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
    return undefined;
  }

  if (id && existing.loading) return <div className="card"><Spinner /></div>;
  if (existing.error) return <div className="card"><ErrorBox error={existing.error} onRetry={existing.reload} /></div>;
  const saleOptions = id && existing.data
    ? [{ value: String(existing.data.sale_id), label: `${existing.data.sale_no} · ${fmtDate(existing.data.sale_date)} · ${existing.data.customer_name}` }]
    : (sales.data?.rows || []).map((s) => ({ value: String(s.id), label: `${s.sale_no} · ${fmtDate(s.sale_date)} · ${s.customer_name} · ${money(s.total_amount)}` }));

  return (
    <div className="card max-md:!px-3">
      <form onSubmit={submit} noValidate>
        <CardHeader icon={RotateCcw}
          title={id ? `${t('sret.editTitle')} · ${existing.data?.sr_no}` : t('sret.masterTitle')}
          subtitle={<span className="hidden md:inline">{t('sret.hint')}</span>} />

        {!id && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-[minmax(9rem,1fr)_minmax(14rem,2fr)]">
            <div>
              <label className="label">{t('sret.saleDate')}</label>
              <input className="input" type="date" value={find.date} disabled={!!find.q.trim()}
                onChange={(e) => setFind((f) => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className="label">{t('sret.searchSale')}</label>
              <input className="input" value={find.q} placeholder={t('sret.searchSalePh')}
                onChange={(e) => setFind((f) => ({ ...f, q: e.target.value }))} />
            </div>
          </div>
        )}
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[minmax(16rem,3fr)_minmax(9rem,1fr)_minmax(12rem,2fr)]">
          <div>
            <label className="label">{t('sret.sale')} *</label>
            <select className="input" disabled={!!id} value={head.sale_id}
              onChange={(e) => { setHead((h) => ({ ...h, sale_id: e.target.value })); loadSale(e.target.value); }}>
              <option value="">{sales.loading ? t('common.loading') : saleOptions.length ? '-' : t('sret.noSales')}</option>
              {saleOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('sret.returnDate')} *</label>
            <input className="input" type="date" value={head.return_date} onChange={(e) => setHead((h) => ({ ...h, return_date: e.target.value }))} />
          </div>
          <div>
            <label className="label">{t('sret.reason')}</label>
            <input className="input" maxLength={300} value={head.reason} placeholder={t('sret.reasonPh')} onChange={(e) => setHead((h) => ({ ...h, reason: e.target.value }))} />
          </div>
        </div>
        {sale && (
          <p className="mt-2 text-12 text-ink-500">
            {sale.customer_name}{sale.mobile ? ` · ${sale.mobile}` : ''} · {fmtDate(sale.sale_date)} · {money(sale.total_amount)}
          </p>
        )}
        {billDisc > 0 && <Note className="mt-2">{t('sret.billDisc', { n: billDisc })}</Note>}

        {rowsLoading && <Spinner />}
        {!rowsLoading && rows.length > 0 && (
          <>
            {/* Phones: one card per sale line */}
            <div className="mt-3 space-y-2.5 md:hidden">
              {rows.map((r, n) => {
                const left = leftOf(r);
                const none = left <= 0 && !Number(r.qty);
                const over = Number(r.qty) > left;
                return (
                  <ItemCard key={r.sale_item_id} no={n + 1} title={r.item_name} bad={over} dim={none}
                    sub={`${t('stockin.batch')} ${r.batch_no || '-'} · ${t('sret.leftHint', { n: left })}`}
                    tag={Number(r.qty) > 0 ? `${t('sret.qty')} ${qtyText(r.qty)}` : unitLabel(r)} tagClass={Number(r.qty) > 0 ? 'bg-amber-100 text-amber-800' : undefined}>
                    <div className="grid grid-cols-4 gap-1.5">
                      <CardField label={t('sale.price')}><CardValue>{Number(r.price).toFixed(2)}</CardValue></CardField>
                      <CardField label={t('purchase.disc')}><CardValue>{Number(r.disc_percent) || '-'}</CardValue></CardField>
                      <CardField label={t('sret.sold')}><CardValue>{qtyText(r.sold)}</CardValue></CardField>
                      <CardField label={t('sret.returned')}><CardValue>{qtyText(r.returned)}</CardValue></CardField>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <CardField label={`${t('sret.qty')} (${unitLabel(r)})`} note={none ? '' : `≤ ${left}`}>
                        <input type="number" inputMode="decimal" min="0" max={left} step="0.01" disabled={left <= 0}
                          className={`${cardBox} no-spin font-semibold ${over ? cardBad : ''}`} value={r.qty} placeholder={none ? '' : '0'}
                          onChange={(e) => setRow(r.sale_item_id, { qty: e.target.value })} />
                      </CardField>
                      <CardField label={t('sret.refund')}><CardValue className="!bg-brand-50 font-bold text-brand-800">{refundOf(r.qty, r, billDisc).toFixed(2)}</CardValue></CardField>
                    </div>
                  </ItemCard>
                );
              })}
              <div className="flex items-center justify-between rounded-xl bg-brand-600 px-3 py-1.5 text-white shadow-sm">
                <span className="text-13 font-semibold">{t('sret.refund')} <span className="text-xs font-normal text-white/80">· {qtyText(totalQty)}</span></span>
                <span className="text-15 font-bold tabular-nums">{money(total)}</span>
              </div>
            </div>

            {/* Wide screens: the grid */}
            <div className="mt-3 hidden overflow-x-auto md:block">
              <table className="w-full min-w-[860px] border-collapse text-left text-13">
                <thead>
                  <tr className="bg-brand-50 font-bold text-brand-700">
                    <th className={`${hd} w-8`}>#</th>
                    <th className={`${hd} min-w-[180px] !text-left`}>{t('items.name')}</th>
                    <th className={hd}>{t('stockin.batch')}</th>
                    <th className={hd}>{t('sale.sellBy')}</th>
                    <th className={`${hd} w-20`}>{t('sale.price')}</th>
                    <th className={`${hd} w-16`}>{t('purchase.disc')}</th>
                    <th className={`${hd} w-16`}>{t('sret.sold')}</th>
                    <th className={`${hd} w-20`}>{t('sret.returned')}</th>
                    <th className={`${hd} w-24`}>{t('sret.qty')}</th>
                    <th className={`${hd} w-24`}>{t('sret.refund')}</th>
                  </tr>
                </thead>
                <tbody onKeyDown={arrowMove}>
                  {rows.map((r, n) => {
                    const left = leftOf(r);
                    const over = Number(r.qty) > left;
                    return (
                      <tr key={r.sale_item_id} className={left <= 0 && !Number(r.qty) ? 'text-ink-400' : 'hover:bg-brand-50/30'}>
                        <td className={`${cell} text-center text-ink-400`}>{n + 1}</td>
                        <td className={`${cell} px-1.5 font-medium`}>{r.item_name}</td>
                        <td className={`${cell} px-1.5`}>{r.batch_no || '-'}</td>
                        <td className={`${cell} px-1.5 text-center`}>{unitLabel(r)}</td>
                        <td className={`${cell} ${ro}`}>{Number(r.price).toFixed(2)}</td>
                        <td className={`${cell} ${ro}`}>{Number(r.disc_percent) || '-'}</td>
                        <td className={`${cell} ${ro}`}>{qtyText(r.sold)}</td>
                        <td className={`${cell} ${ro}`}>{qtyText(r.returned)}</td>
                        <td className={cell} title={t('sret.leftHint', { n: left })}>
                          <input type="number" min="0" max={left} step="0.01" inputMode="decimal" aria-label={t('sret.qty')}
                            className={`${GRID_INPUT} text-right ${over ? GRID_BAD : ''}`} placeholder={left > 0 ? `≤ ${left}` : ''}
                            disabled={left <= 0} value={r.qty} onChange={(e) => setRow(r.sale_item_id, { qty: e.target.value })} />
                        </td>
                        <td className={`${cell} ${ro} font-semibold text-ink-800`}>{Number(r.qty) > 0 ? refundOf(r.qty, r, billDisc).toFixed(2) : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-ink-50 font-semibold">
                    <td colSpan={8} className={`${cell} px-2 text-right`}>{t('sret.refund')}</td>
                    <td className={`${cell} ${ro} text-ink-800`}>{qtyText(totalQty)}</td>
                    <td className={`${cell} ${ro} bg-brand-600 font-bold !text-white`}>{money(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}

        <div className={FORM_ACTIONS}>
          <button type="button" className="btn-secondary px-2 sm:px-4" onClick={() => (id ? navigate('/pharmacy/sales-return-list') : reset())}><X size={16} /> {t('common.cancel')}</button>
          <button type="button" className="btn-danger px-2 sm:px-4" disabled title={id ? t('sret.noDelete') : t('common.deleteHint')}><Trash2 size={16} /> {t('common.delete')}</button>
          <button type="submit" className="btn-primary px-2 sm:px-4" disabled={saving || !rows.length}><Save size={16} /> {saving ? t('common.saving') : t('common.save')}</button>
        </div>
      </form>
    </div>
  );
}
