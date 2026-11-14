// Pharmacy → Return → Master: goods sent back to the vendor. Pick the vendor, then one of its Stock Ins –
// its items and batches are listed with what was received and already returned; enter the quantity to
// send back. Saving takes those quantities out of stock.
// Wide screens: a grid. Phones: one card per batch (as Ayush ALL IN ONE's Return).
import { useEffect, useState } from 'react';
import { Undo2, Save, Trash2, X } from 'lucide-react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/i18n.jsx';
import { navigate } from '../../../lib/router.jsx';
import { fmtDate, money, todayLocal } from '../../../lib/format.js';
import { arrowMove } from '../../../lib/tableKeys.js';
import { CardHeader, ErrorBox, Spinner, GRID_INPUT, GRID_BAD, FORM_ACTIONS, useAsync, useToast } from '../../../components/ui.jsx';
import { CardField, CardValue, ItemCard, cardBox, cardBad } from '../../../components/MobileCard.jsx';
import VendorPicker from '../../../components/VendorPicker.jsx';

const qtyText = (n) => String(Number(n || 0));
const r2 = (n) => Math.round(n * 100) / 100;
const month = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '-');

const cell = 'border border-ink-200 px-1 py-0.5';
const hd = 'border border-ink-200 px-1 py-1.5 text-center align-middle text-11';
const ro = 'px-1.5 text-right tabular-nums text-ink-600';

export default function ReturnForm({ params }) {
  const { t } = useT();
  const toast = useToast();
  const id = params.id;
  const emptyHead = () => ({ supplier_id: '', stock_in_id: '', return_date: todayLocal() });
  const [head, setHead] = useState(emptyHead);
  const [rows, setRows] = useState([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const existing = useAsync(() => (id ? api(`/pharmacy/stock-returns/${id}`) : Promise.resolve(null)), [id]);
  const vendors = useAsync(() => api('/pharmacy/vendors', { query: { status: 'active' } }), []);
  const stockIns = useAsync(
    () => (head.supplier_id ? api('/pharmacy/stock-ins', { query: { supplier_id: head.supplier_id, limit: 100 } }) : Promise.resolve({ rows: [] })),
    [head.supplier_id],
  );

  // the chosen Stock In's items and batches (editing: with this Return's quantities)
  async function loadRows(siId, saved = []) {
    if (!siId) { setRows([]); return; }
    setRowsLoading(true);
    try {
      const r = await api(`/pharmacy/stock-returns/stock-in/${siId}`, { query: id ? { except: id } : {} });
      const bySaved = new Map(saved.map((s) => [s.stock_in_item_id, s]));
      setRows(r.rows.map((l) => ({ ...l, rate: Number(l.rate), qty: bySaved.has(l.stock_in_item_id) ? qtyText(bySaved.get(l.stock_in_item_id).qty) : '' })));
    } catch (err) {
      toast(err.message || t('common.loadFailed'), 'error');
    } finally {
      setRowsLoading(false);
    }
  }

  useEffect(() => {
    const ret = existing.data;
    if (!ret) return;
    setHead({ supplier_id: String(ret.supplier_id), stock_in_id: String(ret.stock_in_id), return_date: String(ret.return_date).slice(0, 10) });
    loadRows(ret.stock_in_id, ret.lines);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing.data]);

  const setRow = (key, patch) => setRows((rs) => rs.map((r) => (r.stock_in_item_id === key ? { ...r, ...patch } : r)));
  const leftOf = (r) => r2(Number(r.received) - Number(r.returned));
  const total = r2(rows.reduce((s, r) => s + r2(Number(r.qty || 0) * r.rate), 0));
  const totalQty = rows.reduce((s, r) => s + Number(r.qty || 0), 0);
  const overRow = rows.find((r) => Number(r.qty) > leftOf(r));

  function validate() {
    if (!head.supplier_id) return t('purchase.chooseVendor');
    if (!head.stock_in_id) return t('return.chooseStockIn');
    if (overRow) return `${overRow.item_name}: ${t('return.leftHint', { n: leftOf(overRow) })}`;
    if (!totalQty) return t('common.isRequired', { field: t('return.qty') });
    return null;
  }

  const reset = () => { setHead(emptyHead()); setRows([]); };

  async function submit(e) {
    e.preventDefault();
    const problem = validate();
    if (problem) return toast(problem, 'error');
    setSaving(true);
    const body = { ...head, lines: rows.filter((r) => Number(r.qty) > 0).map(({ stock_in_item_id, qty }) => ({ stock_in_item_id, qty })) };
    try {
      const ret = id ? await api(`/pharmacy/stock-returns/${id}`, { method: 'PUT', body }) : await api('/pharmacy/stock-returns', { method: 'POST', body });
      toast(t('return.saved', { no: ret.return_no }));
      if (id) navigate('/pharmacy/return-list');
      else reset();
    } catch (err) {
      toast(err.message || t('common.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
    return undefined;
  }

  if (id && existing.loading) return <div className="card"><Spinner /></div>;
  if (existing.error) return <div className="card"><ErrorBox error={existing.error} onRetry={existing.reload} /></div>;
  const stockInOptions = (stockIns.data?.rows || []).map((s) => ({
    value: String(s.id), label: `${s.si_no} · ${fmtDate(s.si_date)} · ${s.po_no}`,
  }));

  return (
    <div className="card max-md:!px-3">
      <form onSubmit={submit} noValidate>
        <CardHeader icon={Undo2}
          title={id ? `${t('return.editTitle')} · ${existing.data?.return_no}` : t('return.masterTitle')}
          subtitle={<span className="hidden md:inline">{t('return.hint')}</span>} />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(14rem,2fr)_minmax(14rem,2fr)_minmax(9rem,1fr)]">
          <VendorPicker label={t('purchase.vendor')} required vendors={vendors.data?.rows || []} value={head.supplier_id}
            onPick={(v) => { setHead((h) => ({ ...h, supplier_id: String(v.id), stock_in_id: '' })); setRows([]); }} />
          <div>
            <label className="label">{t('stockin.no')} *</label>
            <select className="input" disabled={!head.supplier_id} value={head.stock_in_id}
              onChange={(e) => { setHead((h) => ({ ...h, stock_in_id: e.target.value })); loadRows(e.target.value); }}>
              <option value="">{head.supplier_id ? '-' : t('stockin.vendorFirst')}</option>
              {stockInOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('purchase.date')} *</label>
            <input className="input" type="date" value={head.return_date} onChange={(e) => setHead((h) => ({ ...h, return_date: e.target.value }))} />
          </div>
        </div>
        {head.supplier_id && !stockIns.loading && !stockInOptions.length && <p className="mt-2 text-13 text-ink-400">{t('return.noStockIns')}</p>}

        {rowsLoading && <Spinner />}
        {!rowsLoading && rows.length > 0 && (
          <>
            {/* Phones: one card per batch */}
            <div className="mt-3 space-y-2.5 md:hidden">
              {rows.map((r, n) => {
                const left = leftOf(r);
                const none = left <= 0 && !Number(r.qty);
                const over = Number(r.qty) > left;
                const returning = Number(r.qty) > 0;
                return (
                  <ItemCard key={r.stock_in_item_id} no={n + 1} title={r.item_name} bad={over} dim={none}
                    sub={`${t('stockin.batch')} ${r.batch_no || '-'} · ${t('return.leftHint', { n: left })}`}
                    tag={returning ? `${t('return.qty')} ${qtyText(r.qty)}` : undefined} tagClass="bg-amber-100 text-amber-800">
                    <div className="grid grid-cols-4 gap-1.5">
                      <CardField label={t('stockin.mfg')}><CardValue>{month(r.mfg_date)}</CardValue></CardField>
                      <CardField label={t('stockin.exp')}><CardValue>{month(r.exp_date)}</CardValue></CardField>
                      <CardField label={t('stockin.received')}><CardValue>{qtyText(r.received)}</CardValue></CardField>
                      <CardField label={t('return.returned')}><CardValue>{qtyText(r.returned)}</CardValue></CardField>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <CardField label={t('purchase.rate')}><CardValue>{r.rate.toFixed(2)}</CardValue></CardField>
                      <CardField label={t('return.qty')} note={none ? '' : `≤ ${left}`}>
                        <input type="number" inputMode="decimal" min="0" max={left} step="0.01" disabled={left <= 0}
                          className={`${cardBox} no-spin font-semibold ${over ? cardBad : ''}`} value={r.qty} placeholder={none ? '' : '0'}
                          onChange={(e) => setRow(r.stock_in_item_id, { qty: e.target.value })} />
                      </CardField>
                      <CardField label={t('purchase.amount')}><CardValue className="!bg-brand-50 font-bold text-brand-800">{r2(Number(r.qty || 0) * r.rate).toFixed(2)}</CardValue></CardField>
                    </div>
                  </ItemCard>
                );
              })}
              <div className="flex items-center justify-between rounded-xl bg-brand-600 px-3 py-1.5 text-white shadow-sm">
                <span className="text-13 font-semibold">{t('purchase.sumTotal')} <span className="text-xs font-normal text-white/80">· {qtyText(totalQty)}</span></span>
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
                    <th className={hd}>{t('stockin.mfg')}</th>
                    <th className={hd}>{t('stockin.exp')}</th>
                    <th className={`${hd} w-20`}>{t('purchase.rate')}</th>
                    <th className={`${hd} w-20`}>{t('stockin.received')}</th>
                    <th className={`${hd} w-20`}>{t('return.returned')}</th>
                    <th className={`${hd} w-24`}>{t('return.qty')}</th>
                    <th className={`${hd} w-24`}>{t('purchase.amount')}</th>
                  </tr>
                </thead>
                <tbody onKeyDown={arrowMove}>
                  {rows.map((r, n) => {
                    const left = leftOf(r);
                    const over = Number(r.qty) > left;
                    return (
                      <tr key={r.stock_in_item_id} className={left <= 0 && !Number(r.qty) ? 'text-ink-400' : 'hover:bg-brand-50/30'}>
                        <td className={`${cell} text-center text-ink-400`}>{n + 1}</td>
                        <td className={`${cell} px-1.5 font-medium`}>{r.item_name}</td>
                        <td className={`${cell} px-1.5`}>{r.batch_no || '-'}</td>
                        <td className={`${cell} px-1.5`}>{month(r.mfg_date)}</td>
                        <td className={`${cell} px-1.5`}>{month(r.exp_date)}</td>
                        <td className={`${cell} ${ro}`}>{r.rate.toFixed(2)}</td>
                        <td className={`${cell} ${ro}`}>{qtyText(r.received)}</td>
                        <td className={`${cell} ${ro}`}>{qtyText(r.returned)}</td>
                        <td className={cell} title={t('return.leftHint', { n: left })}>
                          <input type="number" min="0" max={left} step="0.01" inputMode="decimal" aria-label={t('return.qty')}
                            className={`${GRID_INPUT} text-right ${over ? GRID_BAD : ''}`} placeholder={left > 0 ? `≤ ${left}` : ''}
                            disabled={left <= 0} value={r.qty} onChange={(e) => setRow(r.stock_in_item_id, { qty: e.target.value })} />
                        </td>
                        <td className={`${cell} ${ro} font-semibold text-ink-800`}>{Number(r.qty) > 0 ? r2(Number(r.qty) * r.rate).toFixed(2) : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-ink-50 font-semibold">
                    <td colSpan={8} className={`${cell} px-2 text-right`}>{t('purchase.sumTotal')}</td>
                    <td className={`${cell} ${ro} text-ink-800`}>{qtyText(totalQty)}</td>
                    <td className={`${cell} ${ro} bg-brand-600 font-bold !text-white`}>{money(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}

        <div className={FORM_ACTIONS}>
          <button type="button" className="btn-secondary px-2 sm:px-4" onClick={() => (id ? navigate('/pharmacy/return-list') : reset())}><X size={16} /> {t('common.cancel')}</button>
          <button type="button" className="btn-danger px-2 sm:px-4" disabled title={id ? t('return.noDelete') : t('common.deleteHint')}><Trash2 size={16} /> {t('common.delete')}</button>
          <button type="submit" className="btn-primary px-2 sm:px-4" disabled={saving || !rows.length}><Save size={16} /> {saving ? t('common.saving') : t('common.save')}</button>
        </div>
      </form>
    </div>
  );
}
