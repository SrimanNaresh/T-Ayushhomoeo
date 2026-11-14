// Pharmacy → Stock In → Adjustment: corrects stock (count differences, breakage, expired goods).
// Date and Reason, then the items: pick an item, then its batch (or "No batch" for older stock) – Cur.Stock
// and the purchase Rate fill in; enter either In Qty (adds) or Out Qty (takes out), in packs.
// Amount = Qty × Rate. No batch may go below zero (checked again by the server). Only an Admin may delete.
// Wide screens: a grid. Phones: one card per line.
import { useEffect, useRef, useState } from 'react';
import { SlidersHorizontal, Save, Trash2, X, Plus } from 'lucide-react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/i18n.jsx';
import { useAuth } from '../../../lib/auth.jsx';
import { navigate } from '../../../lib/router.jsx';
import { fmtDate, money, todayLocal } from '../../../lib/format.js';
import { arrowMove, focusNewRow } from '../../../lib/tableKeys.js';
import { CardHeader, ErrorBox, Spinner, GRID_INPUT, GRID_BAD, FORM_ACTIONS, RowAction, useAsync, useToast } from '../../../components/ui.jsx';
import { CardField, CardValue, ItemCard, cardBox, cardBad } from '../../../components/MobileCard.jsx';
import ItemPicker from '../../../components/ItemPicker.jsx';

const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const r4 = (n) => Math.round(Number(n || 0) * 10000) / 10000;
const newLine = () => ({ key: Math.random().toString(36).slice(2), item_id: null, item_name: '', info: null, stock_in_item_id: '', in_qty: '', out_qty: '', rate: '' });
const EMPTY_HEAD = () => ({ adj_date: todayLocal(), remarks: '' });

const cell = 'border border-ink-200 px-1 py-0.5 align-top';
const hd = 'border border-ink-200 px-1 py-1.5 text-center align-middle text-11';
const ro = 'px-1.5 text-right tabular-nums text-ink-600';
const sel = `${GRID_INPUT} !px-1`;

/** The line's batch (or null: stock with no batch), its stock and purchase price */
function lineView(l) {
  const info = l.info;
  const batch = info?.rows.find((b) => String(b.stock_in_item_id) === String(l.stock_in_item_id)) || null;
  // stock with no batch = item stock less what its batches hold
  const inBatches = (info?.rows || []).reduce((s, b) => s + Math.max(0, Number(b.available)), 0);
  const stock = !info ? null : batch ? r4(batch.available) : r4(Math.max(0, info.stock_qty - inBatches));
  const qty = Number(l.in_qty || 0) || Number(l.out_qty || 0);
  return {
    batch, stock, cost: Number(batch ? batch.cost : info?.cost || 0),
    both: Number(l.in_qty) > 0 && Number(l.out_qty) > 0,
    over: stock != null && Number(l.out_qty || 0) > stock + 0.00005,
    amount: r2(qty * Number(l.rate || 0)),
  };
}

export default function AdjustmentForm({ params }) {
  const { t } = useT();
  const toast = useToast();
  const { isGlobal: isAdmin } = useAuth();
  const id = params.id;
  const [head, setHead] = useState(EMPTY_HEAD);
  const [lines, setLines] = useState([newLine()]);
  const [saving, setSaving] = useState(false);
  const cache = useRef(new Map());
  const existing = useAsync(() => (id ? api(`/pharmacy/stock-adjustments/${id}`) : Promise.resolve(null)), [id]);

  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : [newLine()]));

  async function batchInfo(itemId) {
    if (!cache.current.has(itemId)) {
      cache.current.set(itemId, api(`/pharmacy/stock-adjustments/batches/${itemId}`, { query: id ? { except: id } : {} })
        .catch((err) => { cache.current.delete(itemId); throw err; }));
    }
    return cache.current.get(itemId);
  }

  /** Loads the item's batches into the line; the first batch with stock is chosen unless `keep` (editing) */
  async function loadBatches(key, itemId, keep = false) {
    try {
      const info = await batchInfo(itemId);
      setLines((ls) => ls.map((l) => {
        if (l.key !== key) return l;
        if (keep) return { ...l, info };
        const pick = info.rows.find((b) => Number(b.available) > 0) || info.rows[0];
        const next = { ...l, info, stock_in_item_id: pick ? String(pick.stock_in_item_id) : '' };
        return { ...next, rate: lineView(next).cost.toFixed(2) };
      }));
    } catch (err) {
      toast(err.message || t('common.loadFailed'), 'error');
    }
  }

  const pickItem = (l) => (p) => {
    if (!p.item_id) { setLine(l.key, { item_id: null, item_name: p.medicine_name, info: null, stock_in_item_id: '' }); return; }
    setLine(l.key, { item_id: p.item_id, item_name: p.item?.name || p.medicine_name });
    loadBatches(l.key, p.item_id);
  };

  const pickBatch = (l, value) => {
    const next = { ...l, stock_in_item_id: value };
    setLine(l.key, { stock_in_item_id: value, rate: lineView(next).cost.toFixed(2) });
  };

  useEffect(() => {
    const a = existing.data;
    if (!a) return;
    setHead({ adj_date: String(a.adj_date).slice(0, 10), remarks: a.remarks || '' });
    const ls = a.lines.map((l) => ({
      ...newLine(), key: String(l.id), item_id: l.item_id, item_name: l.item_name,
      stock_in_item_id: l.stock_in_item_id ? String(l.stock_in_item_id) : '',
      in_qty: Number(l.in_qty) ? String(r4(l.in_qty)) : '', out_qty: Number(l.out_qty) ? String(r4(l.out_qty)) : '', rate: Number(l.rate).toFixed(2),
    }));
    setLines(ls.length ? ls : [newLine()]);
    ls.forEach((l) => loadBatches(l.key, l.item_id, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing.data]);

  const filled = lines.filter((l) => l.item_id || l.item_name || Number(l.in_qty) || Number(l.out_qty));
  const views = new Map(lines.map((l) => [l.key, lineView(l)]));
  const inTotal = r2(lines.reduce((s, l) => s + (Number(l.in_qty) > 0 ? views.get(l.key).amount : 0), 0));
  const outTotal = r2(lines.reduce((s, l) => s + (Number(l.out_qty) > 0 ? views.get(l.key).amount : 0), 0));

  function validate() {
    if (!head.remarks.trim()) return t('common.isRequired', { field: t('adj.remarks') });
    if (!filled.length) return t('adj.lineQty');
    for (const l of filled) {
      const v = views.get(l.key);
      if (!l.item_id) return `${l.item_name || '-'}: ${t('adj.pickItem')}`;
      if (!(Number(l.in_qty) > 0) && !(Number(l.out_qty) > 0)) return `${l.item_name}: ${t('adj.lineQty')}`;
      if (v.both) return `${l.item_name}: ${t('adj.bothQty')}`;
      if (v.over) return `${l.item_name}: ${t('adj.overStock', { n: v.stock })}`;
    }
    return null;
  }

  const reset = () => { setHead(EMPTY_HEAD()); setLines([newLine()]); cache.current.clear(); };

  async function submit(e) {
    e.preventDefault();
    const problem = validate();
    if (problem) return toast(problem, 'error');
    setSaving(true);
    const body = {
      ...head,
      lines: filled.map((l) => ({ item_id: l.item_id, stock_in_item_id: l.stock_in_item_id || null, in_qty: l.in_qty || 0, out_qty: l.out_qty || 0, rate: l.rate })),
    };
    try {
      const a = id ? await api(`/pharmacy/stock-adjustments/${id}`, { method: 'PUT', body }) : await api('/pharmacy/stock-adjustments', { method: 'POST', body });
      toast(t('adj.saved', { no: a.adj_no }));
      if (id) navigate('/pharmacy/stock-adjustment-list');
      else reset();
    } catch (err) {
      toast(err.message || t('common.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
    return undefined;
  }

  async function remove() {
    if (!id || !window.confirm(t('adj.deleteConfirm', { no: existing.data.adj_no }))) return;
    setSaving(true);
    try {
      await api(`/pharmacy/stock-adjustments/${id}`, { method: 'DELETE' });
      toast(t('adj.deleted', { no: existing.data.adj_no }));
      navigate('/pharmacy/stock-adjustment-list');
    } catch (err) {
      toast(err.message || t('common.saveFailed'), 'error');
      setSaving(false);
    }
  }

  if (id && existing.loading) return <div className="card"><Spinner /></div>;
  if (existing.error) return <div className="card"><ErrorBox error={existing.error} onRetry={existing.reload} /></div>;

  const batchOptions = (l) => (
    <>
      <option value="">{t('adj.noBatch')}</option>
      {(l.info?.rows || []).map((b) => (
        <option key={b.stock_in_item_id} value={b.stock_in_item_id}>
          {`${b.batch_no || '-'}${b.exp_date ? ` · ${fmtDate(b.exp_date).slice(3)}` : ''} · ${r4(b.available)}`}
        </option>
      ))}
    </>
  );

  return (
    <div className="card max-md:!px-3">
      <form onSubmit={submit} noValidate>
        <CardHeader icon={SlidersHorizontal}
          title={id ? `${t('adj.editTitle')} · ${existing.data?.adj_no}` : t('adj.masterTitle')}
          subtitle={<span className="hidden md:inline">{t('adj.hint')}</span>} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(9rem,1fr)_minmax(16rem,3fr)]">
          <div>
            <label className="label">{t('purchase.date')} *</label>
            <input className="input" type="date" max={todayLocal()} value={head.adj_date} onChange={(e) => setHead((h) => ({ ...h, adj_date: e.target.value }))} />
          </div>
          <div>
            <label className="label">{t('adj.remarks')} *</label>
            <input className="input" maxLength={300} value={head.remarks} placeholder={t('adj.remarksPh')} onChange={(e) => setHead((h) => ({ ...h, remarks: e.target.value }))} />
          </div>
        </div>

        {/* Phones: one card per line */}
        <div className="mt-3 space-y-2.5 md:hidden">
          {lines.map((l, n) => {
            const v = views.get(l.key);
            return (
              <ItemCard key={l.key} no={n + 1} bad={v.both || v.over}
                title={<ItemPicker browse value={l.item_name} ariaLabel={t('items.name')} placeholder={t('purchase.itemHint')} onPick={pickItem(l)} />}
                tag={v.stock != null ? `${t('adj.curStock')} ${v.stock}` : undefined}>
                {l.item_id && (
                  <>
                    <CardField label={t('adj.batch')}>
                      <select className={`${cardBox} !text-left`} value={l.stock_in_item_id} onChange={(e) => pickBatch(l, e.target.value)}>{batchOptions(l)}</select>
                    </CardField>
                    <div className="grid grid-cols-4 gap-1.5">
                      <CardField label={t('adj.inQty')}>
                        <input type="number" inputMode="decimal" min="0" step="0.01" className={`${cardBox} no-spin ${v.both ? cardBad : ''}`}
                          value={l.in_qty} onChange={(e) => setLine(l.key, { in_qty: e.target.value })} />
                      </CardField>
                      <CardField label={t('adj.outQty')}>
                        <input type="number" inputMode="decimal" min="0" step="0.01" className={`${cardBox} no-spin ${v.both || v.over ? cardBad : ''}`}
                          value={l.out_qty} onChange={(e) => setLine(l.key, { out_qty: e.target.value })} />
                      </CardField>
                      <CardField label={t('adj.rate')}>
                        <input type="number" inputMode="decimal" min="0" step="0.01" className={`${cardBox} no-spin`}
                          value={l.rate} onChange={(e) => setLine(l.key, { rate: e.target.value })} />
                      </CardField>
                      <CardField label={t('purchase.amount')}><CardValue className="!bg-brand-50 font-bold text-brand-800">{v.amount.toFixed(2)}</CardValue></CardField>
                    </div>
                  </>
                )}
                <div className="flex justify-end">
                  <RowAction icon={Trash2} tone="danger" title={t('common.remove')} onClick={() => removeLine(l.key)} />
                </div>
              </ItemCard>
            );
          })}
          <button type="button" className="btn-secondary w-full" onClick={() => setLines((ls) => [...ls, newLine()])}><Plus size={16} /> {t('adj.addRow')}</button>
        </div>

        {/* Wide screens: the grid */}
        <div className="mt-3 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[900px] border-collapse text-left text-13">
            <thead>
              <tr className="bg-brand-50 font-bold text-brand-700">
                <th className={`${hd} w-8`}>#</th>
                <th className={`${hd} min-w-[200px] !text-left`}>{t('items.name')}</th>
                <th className={`${hd} min-w-[180px]`}>{t('adj.batch')}</th>
                <th className={`${hd} w-20`}>{t('adj.curStock')}</th>
                <th className={`${hd} w-24`}>{t('adj.inQty')}</th>
                <th className={`${hd} w-24`}>{t('adj.outQty')}</th>
                <th className={`${hd} w-24`}>{t('adj.rate')}</th>
                <th className={`${hd} w-24`}>{t('purchase.amount')}</th>
                <th className={`${hd} w-10`} />
              </tr>
            </thead>
            <tbody onKeyDown={arrowMove}>
              {lines.map((l, n) => {
                const v = views.get(l.key);
                return (
                  <tr key={l.key} data-line={l.key} className="hover:bg-brand-50/30">
                    <td className={`${cell} text-center text-ink-400`}>{n + 1}</td>
                    <td className={cell}>
                      <ItemPicker browse inputClass={GRID_INPUT} value={l.item_name} ariaLabel={t('items.name')} placeholder={t('purchase.itemHint')} onPick={pickItem(l)} />
                    </td>
                    <td className={cell}>
                      <select className={sel} aria-label={t('adj.batch')} disabled={!l.item_id} value={l.stock_in_item_id} onChange={(e) => pickBatch(l, e.target.value)}>
                        {batchOptions(l)}
                      </select>
                    </td>
                    <td className={`${cell} ${ro}`}>{v.stock ?? ''}</td>
                    <td className={cell}>
                      <input type="number" min="0" step="0.01" inputMode="decimal" aria-label={t('adj.inQty')} disabled={!l.item_id}
                        className={`${GRID_INPUT} text-right ${v.both ? GRID_BAD : ''}`} value={l.in_qty} onChange={(e) => setLine(l.key, { in_qty: e.target.value })} />
                    </td>
                    <td className={cell} title={v.over ? t('adj.overStock', { n: v.stock }) : undefined}>
                      <input type="number" min="0" step="0.01" inputMode="decimal" aria-label={t('adj.outQty')} disabled={!l.item_id}
                        className={`${GRID_INPUT} text-right ${v.both || v.over ? GRID_BAD : ''}`} value={l.out_qty} onChange={(e) => setLine(l.key, { out_qty: e.target.value })} />
                    </td>
                    <td className={cell}>
                      <input type="number" min="0" step="0.01" inputMode="decimal" aria-label={t('adj.rate')} disabled={!l.item_id}
                        className={`${GRID_INPUT} text-right`} value={l.rate} onChange={(e) => setLine(l.key, { rate: e.target.value })} />
                    </td>
                    <td className={`${cell} ${ro} font-semibold text-ink-800`}>{v.amount ? v.amount.toFixed(2) : ''}</td>
                    <td className={`${cell} text-center`}>
                      <RowAction icon={Trash2} tone="danger" title={t('common.remove')} onClick={() => removeLine(l.key)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-ink-50 font-semibold">
                <td colSpan={2} className={`${cell} px-2`}>
                  <button type="button" className="btn-ghost !px-2 !py-1 text-13" onClick={(e) => { setLines((ls) => [...ls, newLine()]); focusNewRow(e.currentTarget); }}>
                    <Plus size={15} /> {t('adj.addRow')}
                  </button>
                </td>
                <td colSpan={5} className={`${cell} px-2 text-right`}>{t('adj.inTotal')} {money(inTotal)} · {t('adj.outTotal')} {money(outTotal)}</td>
                <td className={`${cell} ${ro} bg-brand-600 font-bold !text-white`}>{money(r2(inTotal - outTotal))}</td>
                <td className={cell} />
              </tr>
            </tfoot>
          </table>
        </div>

        <div className={FORM_ACTIONS}>
          <button type="button" className="btn-secondary px-2 sm:px-4" onClick={() => (id ? navigate('/pharmacy/stock-adjustment-list') : reset())}><X size={16} /> {t('common.cancel')}</button>
          <button type="button" className="btn-danger px-2 sm:px-4" disabled={!id || !isAdmin || saving} onClick={remove}
            title={!id ? t('common.deleteHint') : !isAdmin ? t('adj.adminOnly') : t('common.delete')}><Trash2 size={16} /> {t('common.delete')}</button>
          <button type="submit" className="btn-primary px-2 sm:px-4" disabled={saving}><Save size={16} /> {saving ? t('common.saving') : t('common.save')}</button>
        </div>
      </form>
    </div>
  );
}
