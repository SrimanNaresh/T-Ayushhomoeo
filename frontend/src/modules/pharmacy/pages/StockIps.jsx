// Pharmacy → Stock In → Three in One (IPS): Item, Purchase Order and Stock In in one entry.
// Pick the vendor, type the bill's lines (an item not in the Item List is added as a new item), check them,
// and one Save:
//   1. adds the new items to the Item List (Pack size, Category, HSN, Manufacturer, MRP, GST as typed),
//   2. saves the Purchase Order (Rate = P.Rate less Disc %; shared/purchase.js),
//   3. saves the Stock In for all of it (Batch, Mf / Exp month, S.Disc %), which adds the stock and sets
//      each item's selling price (Sel.Amount = MRP less S.Disc %; shared/stockin.js).
// Each step goes through its own screen's server checks; the rows are checked the same way first. If the
// Stock In can't be saved after the order was, the order is kept and Save tries only the Stock In again.
// Wide screens: a grid with the columns grouped Item / Purchase / Stock In. Phones: one card per line.
import { useState } from 'react';
import { Layers, Save, X, Plus, Trash2, Sparkles } from 'lucide-react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/i18n.jsx';
import { money, todayLocal } from '../../../lib/format.js';
import { arrowMove, focusNewRow } from '../../../lib/tableKeys.js';
import { typeMMYY, mmyyToMonth } from '../../../lib/months.js';
import { CardHeader, Note, GRID_INPUT, GRID_BAD, FORM_ACTIONS, RowAction, useAsync, useToast } from '../../../components/ui.jsx';
import { CardField, ItemCard, CardValue, cardBox, cardBad } from '../../../components/MobileCard.jsx';
import ItemPicker from '../../../components/ItemPicker.jsx';
import VendorPicker from '../../../components/VendorPicker.jsx';
import { calcLine, splitGst } from '../../../../../shared/purchase.js';
import { selAmount } from '../../../../../shared/stockin.js';

const MAX_GST = 28;
const num = (v) => Number(v || 0);
const thisMonth = () => todayLocal().slice(0, 7);
const newRow = () => ({
  key: Math.random().toString(36).slice(2), item_id: null, name: '',
  category: '', unit: '', hsn: '', manufacturer: '',
  mrp: '', p_rate: '', disc: '', gst: '', qty: '', free: '',
  batch: '', mfg: '', exp: '', s_disc: '',
});
const EMPTY_HEAD = () => ({ supplier_id: '', date: todayLocal(), bill_no: '' });

const cell = 'border border-ink-200 px-0.5 py-0.5 align-top';
const hd = 'border border-ink-200 px-0.5 py-1.5 text-center align-middle text-10 xl:text-11';
const grp = 'border border-ink-200 px-1 py-1 text-center text-11 font-bold uppercase tracking-wide';
const ro = 'px-1 text-right tabular-nums text-ink-600';

/** What is wrong with a row (i18n key), or null; empty rows are skipped by the caller */
function rowProblem(r) {
  if (!r.name.trim()) return 'ips.lineName';
  if (!(num(r.qty) > 0)) return 'ips.lineQty';
  if (!(num(r.mrp) > 0)) return 'ips.lineMrp';
  if (num(r.p_rate) > num(r.mrp)) return 'ips.lineOverMrp';
  if (num(r.disc) > 100 || num(r.s_disc) > 100) return 'ips.lineDisc';
  if (num(r.gst) > MAX_GST) return 'ips.lineGst';
  const mfg = mmyyToMonth(r.mfg);
  const exp = mmyyToMonth(r.exp);
  if (mfg === null || exp === null) return 'ips.lineMonth';
  if (exp && exp < thisMonth()) return 'ips.lineExpPast';
  if (mfg && mfg > thisMonth()) return 'ips.lineMfgFuture';
  if (mfg && exp && exp <= mfg) return 'ips.lineExpAfter';
  return null;
}
const isBlank = (r) => !r.name.trim() && !num(r.qty) && !num(r.mrp);
const lineCalc = (r) => calcLine({ p_rate: r.p_rate, disc_percent: r.disc, qty: r.qty, ...splitGst(r.gst) });

export default function StockIps() {
  const { t } = useT();
  const toast = useToast();
  const [head, setHead] = useState(EMPTY_HEAD);
  const [rows, setRows] = useState([newRow()]);
  const [saving, setSaving] = useState('');            // the step being saved ('' = idle)
  const [savedOrder, setSavedOrder] = useState(null);  // an order saved whose Stock In failed
  const vendors = useAsync(() => api('/pharmacy/vendors', { query: { status: 'active' } }), []);

  const setRow = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeRow = (key) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : [newRow()]));
  const locked = !!savedOrder;   // the order is saved: only the Stock In columns can still change

  // an existing item fills its details from the Item List; typing a new name makes it a new item
  const pickItem = (r) => (p) => {
    if (!p.item_id) { setRow(r.key, { item_id: null, name: p.medicine_name }); return; }
    const i = p.item || {};
    setRow(r.key, {
      item_id: p.item_id, name: i.name || p.medicine_name,
      category: i.category || '', unit: i.unit || '', hsn: i.hsn_code || '', manufacturer: i.manufacturer || '',
      mrp: num(i.mrp) ? String(num(i.mrp)) : r.mrp, p_rate: num(i.purchase_rate) ? String(num(i.purchase_rate)) : r.p_rate,
      gst: num(i.gst_percent) ? String(num(i.gst_percent)) : r.gst,
    });
  };

  const filled = rows.filter((r) => !isBlank(r));
  const problems = new Map(filled.map((r) => [r.key, rowProblem(r)]));
  const sum = Math.round(filled.reduce((s, r) => s + lineCalc(r).total, 0) * 100) / 100;

  function validate() {
    if (!head.supplier_id) return t('purchase.chooseVendor');
    if (!head.bill_no.trim()) return t('ips.billNoRequired');
    if (!filled.length) return t('ips.empty');
    for (const [n, r] of rows.entries()) {
      const p = problems.get(r.key);
      if (p) return t(p, { n: n + 1 });
    }
    return null;
  }

  const reset = () => { setHead(EMPTY_HEAD()); setRows([newRow()]); setSavedOrder(null); };

  async function submit(e) {
    e.preventDefault();
    const problem = validate();
    if (problem) return toast(problem, 'error');
    let order = savedOrder;
    try {
      if (!order) {
        // 1. new items
        setSaving('ips.stepItems');
        const ids = new Map();
        for (const r of filled.filter((x) => !x.item_id)) {
          const gst = splitGst(r.gst);
          const item = await api('/pharmacy/item-master', {
            method: 'POST',
            body: {
              name: r.name.trim(), category: r.category, unit: r.unit.trim() || 'nos', hsn_code: r.hsn.trim().toUpperCase(),
              manufacturer: r.manufacturer, mrp: r.mrp, purchase_rate: lineCalc(r).rate, ...gst,
              price: selAmount({ mrp: r.mrp, disc_percent: r.s_disc }), supplier_id: head.supplier_id, status: 'active',
            },
          });
          ids.set(r.key, item.id);
          setRow(r.key, { item_id: item.id });   // kept if a later step fails, so Save does not add it twice
        }
        // 2. the purchase order
        setSaving('ips.stepOrder');
        order = await api('/pharmacy/purchase-orders', {
          method: 'POST',
          body: {
            supplier_id: head.supplier_id, po_date: head.date,
            details: [t('menu.threeInOne'), head.bill_no.trim() && `${t('ips.billNo')}: ${head.bill_no.trim()}`].filter(Boolean).join(' · '),
            lines: filled.map((r) => ({
              item_id: r.item_id || ids.get(r.key), mrp: r.mrp, p_rate: r.p_rate, disc_percent: r.disc,
              qty: r.qty, free_qty: r.free, ...splitGst(r.gst),
            })),
          },
        });
        setSavedOrder(order);
      }
      // 3. the Stock In (order lines are saved in the order of the rows)
      setSaving('ips.stepStock');
      const si = await api('/pharmacy/stock-ins', {
        method: 'POST',
        body: {
          supplier_id: head.supplier_id, po_id: order.id, si_date: head.date, bill_no: head.bill_no.trim().toUpperCase(),
          lines: filled.map((r, n) => ({
            po_item_id: order.lines[n].id, qty: r.qty, free_qty: r.free || 0, batch_no: r.batch.trim(),
            mfg_date: mmyyToMonth(r.mfg), exp_date: mmyyToMonth(r.exp), disc_percent: r.s_disc,
          })),
        },
      });
      toast(t('ips.saved', { po: order.po_no, si: si.si_no }));
      reset();
    } catch (err) {
      const msg = err.message || t('common.saveFailed');
      toast(order ? t('ips.orderKept', { po: order.po_no, err: msg }) : msg, 'error');
    } finally {
      setSaving('');
    }
    return undefined;
  }

  const box = (r, field, props = {}) => (
    <input className={`${GRID_INPUT} ${props.className || ''}`} value={r[field]} disabled={props.disabled}
      aria-label={props.label} placeholder={props.placeholder} inputMode={props.inputMode}
      type={props.type || 'text'} min={props.type === 'number' ? '0' : undefined} step={props.type === 'number' ? '0.01' : undefined}
      onChange={(e) => setRow(r.key, { [field]: props.mmyy ? typeMMYY(e.target.value) : e.target.value })} />
  );
  const numBox = (r, field, label, extra = {}) => box(r, field, { type: 'number', inputMode: 'decimal', className: 'text-right', label, ...extra });
  const monthBox = (r, field, label) => box(r, field, { mmyy: true, inputMode: 'numeric', placeholder: 'MM/YY', label, className: 'text-center' });

  return (
    <div className="card max-md:!px-3">
      <form onSubmit={submit} noValidate>
        <CardHeader icon={Layers} title={t('menu.threeInOne')} subtitle={<span className="hidden md:inline">{t('ips.hint')}</span>} />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(14rem,3fr)_minmax(9rem,1fr)_minmax(10rem,1fr)]">
          <VendorPicker label={t('purchase.vendor')} required vendors={vendors.data?.rows || []} value={head.supplier_id}
            onPick={(v) => !locked && setHead((h) => ({ ...h, supplier_id: String(v.id) }))} />
          <div>
            <label className="label">{t('purchase.date')} *</label>
            <input className="input" type="date" max={todayLocal()} disabled={locked} value={head.date} onChange={(e) => setHead((h) => ({ ...h, date: e.target.value }))} />
          </div>
          <div>
            <label className="label">{t('ips.billNo')} *</label>
            <input className="input uppercase" maxLength={50} disabled={locked} value={head.bill_no} placeholder={t('ips.billNoPh')}
              onChange={(e) => setHead((h) => ({ ...h, bill_no: e.target.value }))} />
          </div>
        </div>
        {savedOrder && <Note tone="warning" className="mt-3">{t('ips.orderSaved', { po: savedOrder.po_no })}</Note>}
        {saving && <Note className="mt-3">{t(saving)}</Note>}

        {/* Phones: one card per line */}
        <div className="mt-3 space-y-2.5 md:hidden">
          {rows.map((r, n) => {
            const c = lineCalc(r);
            const bad = !!problems.get(r.key);
            const field = (f, label, extra = {}) => (
              <CardField label={label}>
                <input className={`${cardBox} no-spin ${extra.bad ? cardBad : ''}`} value={r[f]} disabled={extra.disabled}
                  type={extra.mmyy || extra.text ? 'text' : 'number'} inputMode={extra.mmyy ? 'numeric' : extra.text ? undefined : 'decimal'}
                  placeholder={extra.mmyy ? 'MM/YY' : extra.placeholder}
                  onChange={(e) => setRow(r.key, { [f]: extra.mmyy ? typeMMYY(e.target.value) : e.target.value })} />
              </CardField>
            );
            return (
              <ItemCard key={r.key} no={n + 1} bad={bad}
                title={locked ? r.name : <ItemPicker value={r.name} ariaLabel={t('items.name')} placeholder={t('purchase.itemHint')} onPick={pickItem(r)} />}
                sub={!r.item_id && r.name.trim() ? t('ips.newItem') : ''}
                tag={c.total ? money(c.total) : undefined}>
                {!r.item_id && (
                  <div className="grid grid-cols-2 gap-1.5">
                    {field('unit', t('ips.packSize'), { text: true, placeholder: t('ips.packSizePh'), disabled: locked })}
                    {field('category', t('items.category'), { text: true, disabled: locked })}
                    {field('hsn', t('items.hsn'), { text: true, disabled: locked })}
                    {field('manufacturer', t('items.manufacturer'), { text: true, disabled: locked })}
                  </div>
                )}
                <div className="grid grid-cols-3 gap-1.5">
                  {field('mrp', t('items.mrp'), { disabled: locked })}
                  {field('p_rate', t('purchase.pRate'), { disabled: locked, bad: num(r.p_rate) > num(r.mrp) && num(r.mrp) > 0 })}
                  {field('disc', t('purchase.disc'), { disabled: locked })}
                  {field('gst', t('purchase.gst'), { disabled: locked })}
                  {field('qty', t('sale.qty'), { disabled: locked })}
                  {field('free', t('purchase.free'), { disabled: locked })}
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {field('batch', t('stockin.batch'), { text: true })}
                  {field('mfg', t('stockin.mfg'), { mmyy: true })}
                  {field('exp', t('stockin.exp'), { mmyy: true })}
                  {field('s_disc', t('stockin.sDisc'))}
                </div>
                <div className="flex items-center justify-between">
                  <CardField label={t('stockin.sel')}><CardValue>{selAmount({ mrp: r.mrp, disc_percent: r.s_disc }).toFixed(2)}</CardValue></CardField>
                  {!locked && <RowAction icon={Trash2} tone="danger" title={t('common.remove')} onClick={() => removeRow(r.key)} />}
                </div>
              </ItemCard>
            );
          })}
          {!locked && <button type="button" className="btn-secondary w-full" onClick={() => setRows((rs) => [...rs, newRow()])}><Plus size={16} /> {t('ips.addRow')}</button>}
          <div className="flex items-center justify-between rounded-xl bg-brand-600 px-3 py-1.5 text-white shadow-sm">
            <span className="text-13 font-semibold">{t('purchase.sumTotal')}</span>
            <span className="text-15 font-bold tabular-nums">{money(sum)}</span>
          </div>
        </div>

        {/* Wide screens: the grid, columns grouped as on the Item, Purchase / Order and Stock In screens */}
        <div className="mt-3 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1280px] border-collapse text-left text-13">
            <thead>
              <tr>
                <th className={`${grp} bg-ink-50 text-ink-500`} />
                <th colSpan={5} className={`${grp} bg-violet-50 text-violet-700`}>{t('ips.groupItem')}</th>
                <th colSpan={7} className={`${grp} bg-sky-50 text-sky-700`}>{t('ips.groupPurchase')}</th>
                <th colSpan={5} className={`${grp} bg-emerald-50 text-emerald-700`}>{t('ips.groupStock')}</th>
                <th className={`${grp} bg-ink-50`} />
              </tr>
              <tr className="bg-brand-50 font-bold text-brand-700">
                <th className={`${hd} w-7`}>#</th>
                <th className={`${hd} min-w-[200px] !text-left`}>{t('items.name')}</th>
                <th className={`${hd} w-16`}>{t('ips.packSize')}</th>
                <th className={`${hd} w-24`}>{t('items.category')}</th>
                <th className={`${hd} w-20`}>{t('items.hsn')}</th>
                <th className={`${hd} w-28`}>{t('items.manufacturer')}</th>
                <th className={`${hd} w-[4.5rem]`}>{t('items.mrp')}</th>
                <th className={`${hd} w-[4.5rem]`}>{t('purchase.pRate')}</th>
                <th className={`${hd} w-14`}>{t('purchase.disc')}</th>
                <th className={`${hd} w-14`}>{t('purchase.gst')}</th>
                <th className={`${hd} w-16`}>{t('sale.qty')}</th>
                <th className={`${hd} w-14`}>{t('purchase.free')}</th>
                <th className={`${hd} w-20`}>{t('purchase.total')}</th>
                <th className={`${hd} w-24`}>{t('stockin.batch')}</th>
                <th className={`${hd} w-[4.5rem]`}>{t('stockin.mfg')}</th>
                <th className={`${hd} w-[4.5rem]`}>{t('stockin.exp')}</th>
                <th className={`${hd} w-14`}>{t('stockin.sDisc')}</th>
                <th className={`${hd} w-[4.5rem]`}>{t('stockin.sel')}</th>
                <th className={`${hd} w-9`} />
              </tr>
            </thead>
            <tbody onKeyDown={arrowMove}>
              {rows.map((r, n) => {
                const c = lineCalc(r);
                const p = problems.get(r.key);
                const detail = !!r.item_id || locked;   // an existing item's details come from the Item List
                return (
                  <tr key={r.key} className={p ? 'bg-red-50/40' : 'hover:bg-brand-50/30'} title={p ? t(p, { n: n + 1 }) : undefined}>
                    <td className={`${cell} text-center text-ink-400`}>{n + 1}</td>
                    <td className={cell}>
                      {locked ? <span className="block px-1.5 py-1">{r.name}</span> : (
                        <ItemPicker inputClass={GRID_INPUT} value={r.name} ariaLabel={t('items.name')} placeholder={t('purchase.itemHint')} onPick={pickItem(r)} />
                      )}
                      {!r.item_id && r.name.trim() && <span className="flex items-center gap-1 px-1.5 text-10 font-semibold text-violet-600"><Sparkles size={11} /> {t('ips.newItem')}</span>}
                    </td>
                    <td className={cell}>{box(r, 'unit', { disabled: detail, label: t('ips.packSize'), placeholder: t('ips.packSizePh'), className: 'text-center' })}</td>
                    <td className={cell}>{box(r, 'category', { disabled: detail, label: t('items.category') })}</td>
                    <td className={cell}>{box(r, 'hsn', { disabled: detail, label: t('items.hsn'), className: 'uppercase' })}</td>
                    <td className={cell}>{box(r, 'manufacturer', { disabled: detail, label: t('items.manufacturer') })}</td>
                    <td className={cell}>{numBox(r, 'mrp', t('items.mrp'), { disabled: locked, className: `text-right ${p === 'ips.lineMrp' ? GRID_BAD : ''}` })}</td>
                    <td className={cell}>{numBox(r, 'p_rate', t('purchase.pRate'), { disabled: locked, className: `text-right ${p === 'ips.lineOverMrp' ? GRID_BAD : ''}` })}</td>
                    <td className={cell}>{numBox(r, 'disc', t('purchase.disc'), { disabled: locked })}</td>
                    <td className={cell}>{numBox(r, 'gst', t('purchase.gst'), { disabled: locked, className: `text-right ${p === 'ips.lineGst' ? GRID_BAD : ''}` })}</td>
                    <td className={cell}>{numBox(r, 'qty', t('sale.qty'), { disabled: locked, className: `text-right ${p === 'ips.lineQty' ? GRID_BAD : ''}` })}</td>
                    <td className={cell}>{numBox(r, 'free', t('purchase.free'), { disabled: locked })}</td>
                    <td className={`${cell} ${ro} font-semibold text-ink-800`}>{c.total ? c.total.toFixed(2) : ''}</td>
                    <td className={cell}>{box(r, 'batch', { label: t('stockin.batch'), className: 'uppercase' })}</td>
                    <td className={cell}>{monthBox(r, 'mfg', t('stockin.mfg'))}</td>
                    <td className={cell}>{monthBox(r, 'exp', t('stockin.exp'))}</td>
                    <td className={cell}>{numBox(r, 's_disc', t('stockin.sDisc'))}</td>
                    <td className={`${cell} ${ro}`}>{num(r.mrp) ? selAmount({ mrp: r.mrp, disc_percent: r.s_disc }).toFixed(2) : ''}</td>
                    <td className={`${cell} text-center`}>
                      {!locked && <RowAction icon={Trash2} tone="danger" title={t('common.remove')} onClick={() => removeRow(r.key)} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-ink-50 font-semibold">
                <td colSpan={6} className={`${cell} px-2`}>
                  {!locked && (
                    <button type="button" className="btn-ghost !px-2 !py-1 text-13" onClick={(e) => { setRows((rs) => [...rs, newRow()]); focusNewRow(e.currentTarget); }}>
                      <Plus size={15} /> {t('ips.addRow')}
                    </button>
                  )}
                </td>
                <td colSpan={6} className={`${cell} px-2 text-right`}>{t('purchase.sumTotal')}</td>
                <td className={`${cell} ${ro} bg-brand-600 font-bold !text-white`}>{money(sum)}</td>
                <td colSpan={6} className={cell} />
              </tr>
            </tfoot>
          </table>
        </div>

        <div className={FORM_ACTIONS}>
          <button type="button" className="btn-secondary px-2 sm:px-4" onClick={reset} disabled={!!saving}><X size={16} /> {t('common.cancel')}</button>
          <button type="button" className="btn-danger px-2 sm:px-4" disabled title={t('common.deleteHint')}><Trash2 size={16} /> {t('common.delete')}</button>
          <button type="submit" className="btn-primary px-2 sm:px-4" disabled={!!saving}><Save size={16} /> {saving ? t('common.saving') : t('common.save')}</button>
        </div>
      </form>
    </div>
  );
}
