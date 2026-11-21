// Pharmacy → Sales → Master: a counter sale. First row: Date, Customer Name, Mobile No. Then the items: pick an
// item, then its batch (with stock, earliest expiry first) and Sell by (Pack or Unit) – Rack, Box, Stock, MRP,
// Purchase Price and Sale Price fill in, per pack or per unit; Amount = Quantity × Sale Price less Disc %.
// TOTAL = Sub Total less Bill Discount %. Nothing may go above MRP or below the purchase cost (shared/sale.js,
// checked again by the server). Saving takes the packs out of stock; Save & Print also prints the receipt.
// Quick billing (wide screens): Item (type + Enter) → Batch → Sell by → Quantity → Disc% → next row, each with
// Enter; on Batch and Sell by ↑ / ↓ change the choice. Phones: one card per item line.
import { useEffect, useRef, useState } from 'react';
import { Receipt, Save, Printer, X, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/i18n.jsx';
import { navigate } from '../../../lib/router.jsx';
import { money, todayLocal } from '../../../lib/format.js';
import { arrowMove, focusNewRow } from '../../../lib/tableKeys.js';
import { monthToMMYY } from '../../../lib/months.js';
import { CardHeader, ErrorBox, Spinner, Note, GRID_INPUT, GRID_BAD, useAsync, useToast } from '../../../components/ui.jsx';
import { CardField, CardValue, ItemCard, cardBox, cardBad } from '../../../components/MobileCard.jsx';
import ItemPicker from '../../../components/ItemPicker.jsx';
import { useReceiptPrinter } from '../../../components/SaleReceipt.jsx';
import { lineAmount, lineCost, packsOf, perSaleUnit, saleTotals, unitsPerPack } from '../../../../../shared/sale.js';

const r4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;
const num4 = (n) => String(r4(n));
const two = (n) => Number(n || 0).toFixed(2);
const newLine = () => ({
  key: Math.random().toString(36).slice(2), item_id: null, item_name: '', info: null,
  stock_in_item_id: '', sale_unit: 'pack', price: '', qty: '', disc_percent: '',
});
// round_off: round the Total to the nearest rupee (on for a new sale; an edit keeps how it was saved)
const EMPTY_HEAD = () => ({ sale_date: todayLocal(), customer_name: '', mobile: '', disc_percent: '', round_off: true });

/** The line's batch (or null: older stock with no batch) and its prices per pack */
function packPrices(l) {
  const info = l.info;
  const batch = info?.rows.find((b) => String(b.stock_in_item_id) === String(l.stock_in_item_id)) || null;
  return {
    batch,
    stock: batch ? Number(batch.available) : info?.stock_qty ?? null,
    mrp: Number(batch ? batch.mrp : info?.mrp || 0),
    cost: Number(batch ? batch.cost : info?.cost || 0),
    sel: Number(batch ? batch.sel_amount : info?.price || 0),
  };
}

// Grid cells (as Ayush ALL IN ONE's Sales Billing)
const cell = 'border border-ink-200 px-1 py-0.5 align-top';
const hd = 'border border-ink-200 px-0.5 py-1.5 text-center align-middle text-10 xl:text-11';
const ro = 'px-1.5 text-right tabular-nums text-ink-600';
const LOC = 'inline-block rounded bg-sky-50 px-1.5 text-11 font-semibold text-sky-700';
const msg = 'mt-0.5 block whitespace-normal text-center text-10 font-semibold leading-tight text-red-600';

export default function SaleForm({ params }) {
  const { t } = useT();
  const toast = useToast();
  const id = params.id;
  const [head, setHead] = useState(EMPTY_HEAD);
  const [lines, setLines] = useState([newLine()]);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);   // after a plain Save: the bar offers Print
  const printAfter = useRef(false);                     // Save & Print was pressed
  const batchCache = useRef(new Map());                 // each item's batch list, fetched once per bill
  const printer = useReceiptPrinter();
  const existing = useAsync(() => (id ? api(`/pharmacy/sales-billings/${id}`) : Promise.resolve(null)), [id]);

  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLineAfter = (key) => setLines((ls) => ls.flatMap((l) => (l.key === key ? [l, newLine()] : [l])));
  const removeLine = (key) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : [newLine()]));
  const focusIn = (key, selector) => setTimeout(() => document.querySelector(`tr[data-line="${key}"] ${selector}`)?.focus(), 0);

  /** The item's batches, stock and prices (cached for this bill) */
  async function batchInfo(itemId) {
    if (!batchCache.current.has(itemId)) {
      batchCache.current.set(itemId, api(`/pharmacy/sales-billings/batches/${itemId}`, { query: id ? { except: id } : {} })
        .catch((err) => { batchCache.current.delete(itemId); throw err; }));
    }
    return batchCache.current.get(itemId);
  }

  /** Loads the item's batches into the line; the first (earliest expiry) is chosen unless `keep` (editing) */
  async function loadBatches(key, itemId, keep = false) {
    try {
      const info = await batchInfo(itemId);
      setLines((ls) => ls.map((l) => {
        if (l.key !== key) return l;
        if (keep) return { ...l, info };
        const pick = info.rows[0];
        const next = { ...l, info, stock_in_item_id: pick ? String(pick.stock_in_item_id) : '', sale_unit: 'pack' };
        return { ...next, price: two(packPrices(next).sel) };
      }));
    } catch (err) {
      toast(err.message || t('common.loadFailed'), 'error');
    }
  }

  useEffect(() => {
    const s = existing.data;
    if (!s) return;
    setHead({ sale_date: String(s.sale_date).slice(0, 10), customer_name: s.customer_name, mobile: s.mobile || '', disc_percent: Number(s.disc_percent) ? String(Number(s.disc_percent)) : '', round_off: Number(s.round_off) !== 0 });
    const ls = s.lines.map((l) => ({
      ...newLine(), key: String(l.id), item_id: l.item_id, item_name: l.item_name,
      stock_in_item_id: l.stock_in_item_id ? String(l.stock_in_item_id) : '', sale_unit: l.sale_unit || 'pack',
      price: String(Number(l.price)), qty: String(Number(l.unit_qty ?? l.qty)), disc_percent: Number(l.disc_percent) ? String(Number(l.disc_percent)) : '',
    }));
    setLines(ls.length ? ls : [newLine()]);
    ls.forEach((l) => loadBatches(l.key, l.item_id, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing.data]);

  // ---- per line: what is shown (per pack or per unit) and what is wrong ----
  const view = (l) => {
    const p = packPrices(l);
    const size = l.info?.pack_size || 1;
    const f = unitsPerPack(l.sale_unit, size);
    return {
      ...p, size, f,
      stockShown: p.stock == null ? null : r4(p.stock * f),
      mrpShown: perSaleUnit(p.mrp, l.sale_unit, size),
      costShown: perSaleUnit(p.cost, l.sale_unit, size),
      calc: { qty: l.qty, price: l.price, disc_percent: l.disc_percent, sale_unit: l.sale_unit, pack_size: size, cost: p.cost },
    };
  };
  const filled = lines.filter((l) => l.item_id);
  const views = new Map(filled.map((l) => [l.key, view(l)]));
  // packs used from each batch (or item, with no batch) over every line
  const usedPacks = new Map();
  for (const l of filled) {
    const k = l.stock_in_item_id ? `b${l.stock_in_item_id}` : `i${l.item_id}`;
    usedPacks.set(k, r4((usedPacks.get(k) || 0) + packsOf({ qty: l.qty, sale_unit: l.sale_unit, pack_size: views.get(l.key).size })));
  }
  const problemsOf = (l) => {
    const v = views.get(l.key);
    if (!v || !l.info) return {};
    const out = {};
    const used = usedPacks.get(l.stock_in_item_id ? `b${l.stock_in_item_id}` : `i${l.item_id}`) || 0;
    if (v.stock != null && used > v.stock + 0.00005) out.qty = t('sale.overStock', { n: v.stockShown });
    if (v.mrp > 0 && Number(l.price) > v.mrpShown) out.price = t('sale.overMrp', { n: two(v.mrpShown) });
    if (Number(l.disc_percent) > 100) out.disc = t('sale.discRange');
    else if (Number(l.qty) > 0 && lineAmount(v.calc) < lineCost(v.calc)) out.amount = t('sale.belowCost', { n: two(lineCost(v.calc)) });
    return out;
  };
  const problems = new Map(filled.map((l) => [l.key, problemsOf(l)]));
  const sums = saleTotals(filled.map((l) => views.get(l.key).calc), head.disc_percent, { roundOff: head.round_off });
  const roundText = sums.round_off > 0 ? `+ ${money(sums.round_off)}` : sums.round_off < 0 ? `− ${money(-sums.round_off)}` : money(0);
  const roundBox = (
    <label className="inline-flex items-center gap-1.5">
      <input type="checkbox" checked={head.round_off} onChange={(e) => setHead((h) => ({ ...h, round_off: e.target.checked }))} /> {t('sale.roundOff')}
    </label>
  );
  const billDiscBad = Number(head.disc_percent) > 100 || Number(head.disc_percent) < 0;
  const totalBelowCost = filled.length > 0 && sums.before_round < sums.cost;   // checked before the Round Off
  const hasProblem = billDiscBad || totalBelowCost || [...problems.values()].some((p) => Object.keys(p).length);

  /** Batch / Sell by changed: prices follow, Sale Price goes back to the batch's Sel.Amount */
  function choose(l, patch) {
    const next = { ...l, ...patch };
    const v = view(next);
    setLine(l.key, { ...patch, price: two(perSaleUnit(v.sel, next.sale_unit, v.size)) });
  }
  const pickItem = (l, focus) => ({ item, medicine_name: typed }) => {
    if (!item) { setLine(l.key, { ...newLine(), key: l.key, item_name: typed }); return; }
    setLine(l.key, { item_id: item.id, item_name: item.name, info: null, stock_in_item_id: '', sale_unit: 'pack', price: '', qty: l.qty || '1' });
    loadBatches(l.key, item.id);
    if (focus) focusIn(l.key, '[data-step="batch"]');
  };

  // Enter moves along: Item → Batch → Sell by → Quantity → Disc% → next row's Item (added if needed)
  function onEnter(e) {
    if (e.key !== 'Enter' || e.altKey || e.ctrlKey || e.shiftKey) return;
    const el = e.target;
    if (el.tagName === 'BUTTON') return;
    e.preventDefault();                 // never submit the bill from a table box
    const key = el.closest('tr')?.dataset.line;
    const step = el.dataset.step;
    if (!key || !step) return;
    if (step === 'batch') focusIn(key, '[data-step="unit"]:not(:disabled), [data-step="qty"]');
    else if (step === 'unit') focusIn(key, '[data-step="qty"]');
    else if (step === 'qty') focusIn(key, '[data-step="disc"]');
    else if (step === 'disc') {
      const at = lines.findIndex((x) => x.key === key);
      if (at === lines.length - 1) {
        const added = newLine();
        setLines((ls) => [...ls, added]);
        focusIn(added.key, '[data-cell="item"] input');
      } else focusIn(lines[at + 1].key, '[data-cell="item"] input');
    }
  }

  function validate() {
    if (!head.sale_date) return t('common.isRequired', { field: t('purchase.date') });
    if (!head.customer_name.trim()) return t('common.isRequired', { field: t('sale.customer') });
    if (head.mobile && !/^[\d\s+-]+$/.test(head.mobile)) return t('common.digitsOnly', { field: t('suppliers.mobile') });
    if (!filled.length) return t('common.isRequired', { field: t('items.name') });
    if (hasProblem) return t('sale.fixRed');
    return null;
  }

  async function submit(e) {
    e.preventDefault();
    const print = printAfter.current;
    printAfter.current = false;
    const problem = validate();
    if (problem) return toast(problem, 'error');
    setSaving(true);
    const body = {
      ...head,
      lines: filled.map(({ item_id, stock_in_item_id, sale_unit, qty, price, disc_percent }) =>
        ({ item_id, stock_in_item_id: stock_in_item_id || null, sale_unit, qty, price, disc_percent })),
    };
    try {
      const s = id ? await api(`/pharmacy/sales-billings/${id}`, { method: 'PUT', body }) : await api('/pharmacy/sales-billings', { method: 'POST', body });
      toast(t('sale.saved', { no: s.sale_no, amount: money(s.total_amount) }));
      batchCache.current.clear();
      if (id) {
        if (print) printer.print(s, () => navigate('/pharmacy/sales-billing-list'));
        else navigate('/pharmacy/sales-billing-list');
      } else {
        reset();
        setLastSaved(print ? null : s);
        if (print) printer.print(s);
      }
    } catch (err) {
      toast(err.message || t('common.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
    return undefined;
  }

  const reset = () => { setHead(EMPTY_HEAD()); setLines([newLine()]); };

  if (id && existing.loading) return <div className="card"><Spinner /></div>;
  if (existing.error) return <div className="card"><ErrorBox error={existing.error} onRetry={existing.reload} /></div>;
  const num = { type: 'number', min: '0', step: '0.01', inputMode: 'decimal' };
  const box = `${GRID_INPUT} text-right`;
  const sel = 'h-[28px] w-full min-w-0 rounded-md border border-ink-200 bg-white px-1 text-12 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-ink-50 disabled:text-ink-400';
  const batchOptions = (l) => (
    <>
      {(!l.info || !l.info.rows.length) && <option value="">{l.info ? t('sale.noBatch') : '-'}</option>}
      {(l.info?.rows || []).map((b) => (
        <option key={b.stock_in_item_id} value={b.stock_in_item_id}>
          {b.batch_no || t('sale.noBatchNo')}{b.exp_date ? ` · ${t('sale.exp')} ${monthToMMYY(b.exp_date)}` : ''} · {num4(b.available)}
        </option>
      ))}
    </>
  );
  const unitOptions = (l) => {
    const unitOk = (l.info?.pack_size || 1) > 1;
    return (
      <>
        <option value="pack">{unitOk ? t('sale.packN', { n: l.info.pack_size }) : t('sale.pack')}</option>
        {unitOk && <option value="unit">{t('sale.unit')}</option>}
      </>
    );
  };

  return (
    <div className="card max-md:!px-3">
      {printer.node}
      <form onSubmit={submit} noValidate>
        <CardHeader icon={Receipt}
          title={id ? `${t('sale.editTitle')} · ${existing.data?.sale_no}` : t('sale.masterTitle')}
          subtitle={<span className="hidden md:inline">{t('sale.hint')}</span>} />

        {lastSaved && (
          <div className="mb-2 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-13 text-emerald-800">
            <CheckCircle2 size={16} className="shrink-0" />
            <span className="flex-1">{t('sale.savedBar', { no: lastSaved.sale_no, amount: money(lastSaved.total_amount) })}</span>
            <button type="button" className="btn-secondary !px-2.5 !py-1 !text-13" onClick={() => printer.print(lastSaved)}><Printer size={16} /> {t('sale.print')}</button>
            <button type="button" className="btn-ghost !p-1" aria-label={t('common.close')} onClick={() => setLastSaved(null)}><X size={15} /></button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-[minmax(9rem,1fr)_minmax(14rem,2fr)_minmax(10rem,1fr)]">
          <div>
            <label className="label">{t('purchase.date')} *</label>
            <input className="input" type="date" value={head.sale_date} onChange={(e) => setHead((h) => ({ ...h, sale_date: e.target.value }))} />
          </div>
          <div className="col-span-2 row-start-1 md:col-span-1 md:row-start-auto">
            <label className="label">{t('sale.customer')} *</label>
            <input className="input" maxLength={150} autoFocus={!id} placeholder="e.g. Ravi K" value={head.customer_name}
              onChange={(e) => setHead((h) => ({ ...h, customer_name: e.target.value }))} />
          </div>
          <div>
            <label className="label">{t('suppliers.mobile')}</label>
            <input className="input" type="tel" inputMode="numeric" maxLength={20} placeholder="e.g. 98765 43210" value={head.mobile}
              onChange={(e) => setHead((h) => ({ ...h, mobile: e.target.value }))} />
          </div>
        </div>

        {/* Phones: one card per line */}
        <div className="mt-3 space-y-2.5 md:hidden">
          {lines.map((l, n) => {
            const v = views.get(l.key);
            const p = problems.get(l.key) || {};
            const msgs = Object.values(p).filter(Boolean);
            return (
              <ItemCard key={l.key} no={n + 1} bad={msgs.length > 0}
                title={<ItemPicker browse value={l.item_name} ariaLabel={t('items.name')} placeholder={t('purchase.itemHint')} onPick={pickItem(l, false)} />}
                sub={l.info ? [l.info.rack && `${t('items.rack')} ${l.info.rack}`, l.info.box && `${t('items.box')} ${l.info.box}`].filter(Boolean).join(' · ') : ''}
                tag={v?.stockShown != null ? `${t('sale.stock')} ${num4(v.stockShown)}` : undefined}>
                {l.item_id && (
                  <>
                    <div className="grid grid-cols-[1.6fr_1fr] gap-1.5">
                      <CardField label={t('sale.batch')}>
                        <select className={`${cardBox} !text-left`} value={l.stock_in_item_id} onChange={(e) => choose(l, { stock_in_item_id: e.target.value })}>{batchOptions(l)}</select>
                      </CardField>
                      <CardField label={t('sale.sellBy')}>
                        <select className={`${cardBox} !text-left`} value={l.sale_unit} onChange={(e) => choose(l, { sale_unit: e.target.value })}>{unitOptions(l)}</select>
                      </CardField>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      <CardField label={t('items.mrp')}><CardValue>{v && l.info ? two(v.mrpShown) : '-'}</CardValue></CardField>
                      <CardField label={t('sale.price')}>
                        <input {...num} className={`${cardBox} no-spin ${p.price ? cardBad : ''}`} value={l.price} onChange={(e) => setLine(l.key, { price: e.target.value })} />
                      </CardField>
                      <CardField label={t('items.quantity')}>
                        <input {...num} className={`${cardBox} no-spin font-semibold ${p.qty ? cardBad : ''}`} value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} />
                      </CardField>
                      <CardField label={t('purchase.disc')}>
                        <input {...num} max="100" className={`${cardBox} no-spin ${p.disc ? cardBad : ''}`} value={l.disc_percent} onChange={(e) => setLine(l.key, { disc_percent: e.target.value })} />
                      </CardField>
                    </div>
                    <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-1.5">
                      <CardField label={t('sale.purchasePrice')}><CardValue className="text-ink-400">{v && l.info ? two(v.costShown) : '-'}</CardValue></CardField>
                      <CardField label={t('purchase.amount')}><CardValue className={`!bg-brand-50 font-bold text-brand-800 ${p.amount ? cardBad : ''}`}>{v ? two(lineAmount(v.calc)) : '0.00'}</CardValue></CardField>
                      <button type="button" className="btn-secondary mb-3.5 !h-[30px] !px-2 hover:!text-red-600" title={t('common.remove')} onClick={() => removeLine(l.key)}><Trash2 size={14} /></button>
                    </div>
                    {msgs.length > 0 && <p className="rounded-md bg-red-50 px-2 py-1 text-11 text-red-600">{msgs.join(' · ')}</p>}
                  </>
                )}
              </ItemCard>
            );
          })}
          <button type="button" className="btn-secondary w-full border-dashed" onClick={() => setLines((ls) => [...ls, newLine()])}><Plus size={16} /> {t('purchase.addLine')}</button>
          <div className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 text-13 text-ink-600">
              <span>{t('sale.subTotal')} <b className="tabular-nums text-ink-900">{money(sums.sub_total)}</b></span>
              <label className="inline-flex items-center gap-1.5">
                {t('sale.billDisc')}
                <input {...num} max="100" className={`${cardBox} no-spin !w-14 ${billDiscBad ? cardBad : ''}`} value={head.disc_percent}
                  onChange={(e) => setHead((h) => ({ ...h, disc_percent: e.target.value }))} />
              </label>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-ink-100 px-3 py-1.5 text-13 text-ink-600">
              {roundBox}
              <b className={`tabular-nums ${sums.round_off < 0 ? 'text-red-600' : 'text-ink-900'}`}>{roundText}</b>
            </div>
            <div className={`flex items-center justify-between px-3 py-1.5 text-white ${totalBelowCost ? 'bg-red-600' : 'bg-brand-600'}`}>
              <span className="text-13 font-semibold">{t('sale.total')}</span>
              <span className="text-15 font-bold tabular-nums">{money(sums.total_amount)}</span>
            </div>
          </div>
        </div>

        {/* Wide screens: the editable grid */}
        <div className="mt-3 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1050px] table-fixed border-collapse text-left text-13">
            <colgroup>
              {[2.5, 17, 11, 7, 4.5, 4.5, 5, 6, 6.5, 6.5, 5.5, 5, 7, 5].map((w, i) => <col key={i} style={{ width: `${w * (100 / 93)}%` }} />)}
            </colgroup>
            <thead>
              <tr className="bg-brand-50 font-bold leading-tight text-brand-700">
                <th className={hd}>#</th>
                <th className={`${hd} !text-left px-1.5`}>{t('items.name')}</th>
                <th className={hd}>{t('sale.batch')}</th>
                <th className={hd}>{t('sale.sellBy')}</th>
                <th className={hd}>{t('items.rack')}</th>
                <th className={hd}>{t('items.box')}</th>
                <th className={hd}>{t('sale.stock')}</th>
                <th className={hd}>{t('items.mrp')}</th>
                <th className={hd}>{t('sale.purchasePrice')}</th>
                <th className={hd}>{t('sale.price')}</th>
                <th className={hd}>{t('items.quantity')}</th>
                <th className={hd}>{t('purchase.disc')}</th>
                <th className={hd}>{t('purchase.amount')}</th>
                <th className={hd} aria-label={t('common.delete')} />
              </tr>
            </thead>
            <tbody onKeyDown={(e) => (e.key === 'Enter' ? onEnter(e) : arrowMove(e))}>
              {lines.map((l, n) => {
                const v = views.get(l.key);
                const p = problems.get(l.key) || {};
                return (
                  <tr key={l.key} data-line={l.key} className="hover:bg-brand-50/30">
                    <td className={`${cell} text-center text-ink-400`}>{n + 1}</td>
                    <td className={cell} data-cell="item">
                      <ItemPicker browse inputClass={GRID_INPUT} value={l.item_name} ariaLabel={t('items.name')} placeholder={t('purchase.itemHint')} onPick={pickItem(l, true)} />
                    </td>
                    <td className={cell}>
                      <select className={sel} data-step="batch" data-keep-updown aria-label={t('sale.batch')} disabled={!l.item_id} value={l.stock_in_item_id}
                        onChange={(e) => choose(l, { stock_in_item_id: e.target.value })}>{batchOptions(l)}</select>
                    </td>
                    <td className={cell}>
                      <select className={sel} data-step="unit" data-keep-updown aria-label={t('sale.sellBy')} disabled={!l.item_id} value={l.sale_unit}
                        onChange={(e) => choose(l, { sale_unit: e.target.value })}>{unitOptions(l)}</select>
                    </td>
                    <td className={`${cell} text-center`}>{l.info?.rack ? <span className={LOC}>{l.info.rack}</span> : '-'}</td>
                    <td className={`${cell} text-center`}>{l.info?.box ? <span className={LOC}>{l.info.box}</span> : '-'}</td>
                    <td className={`${cell} ${ro} font-semibold text-ink-800`}>{v?.stockShown == null ? '-' : num4(v.stockShown)}</td>
                    <td className={`${cell} ${ro}`}>{v && l.info ? two(v.mrpShown) : '-'}</td>
                    <td className={`${cell} ${ro} text-ink-400`}>{v && l.info ? two(v.costShown) : '-'}</td>
                    <td className={cell} title={p.price}>
                      <input {...num} className={`${box} ${p.price ? GRID_BAD : ''}`} aria-label={t('sale.price')} value={l.price} onChange={(e) => setLine(l.key, { price: e.target.value })} />
                    </td>
                    <td className={cell} title={p.qty}>
                      <input {...num} className={`${box} ${p.qty ? GRID_BAD : ''}`} data-step="qty" aria-label={t('items.quantity')} aria-invalid={!!p.qty || undefined}
                        value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} />
                      {p.qty && <small className={msg}>{p.qty}</small>}
                    </td>
                    <td className={cell} title={p.disc}>
                      <input {...num} max="100" className={`${box} ${p.disc ? GRID_BAD : ''}`} data-step="disc" aria-label={t('purchase.disc')} value={l.disc_percent}
                        onChange={(e) => setLine(l.key, { disc_percent: e.target.value })} />
                    </td>
                    <td className={`${cell} ${ro} font-semibold text-ink-800 ${p.amount ? 'bg-red-50 !text-red-700' : ''}`} title={p.amount || undefined}>
                      {v ? two(lineAmount(v.calc)) : '0.00'}
                      {p.amount && <small className={msg}>{p.amount}</small>}
                    </td>
                    <td className={`${cell} text-center`}>
                      <span className="inline-flex">
                        <button type="button" className="btn-ghost !p-1 text-brand-600" title={t('purchase.addLine')} aria-label={t('purchase.addLine')} onClick={(e) => { addLineAfter(l.key); focusNewRow(e.currentTarget); }}>
                          <Plus size={15} />
                        </button>
                        <button type="button" className="btn-ghost !p-1 hover:!bg-red-50 hover:!text-red-600" title={t('common.delete')} aria-label={t('common.delete')} onClick={() => removeLine(l.key)}>
                          <Trash2 size={14} />
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-ink-50 font-semibold">
              <tr>
                <td colSpan={12} className={`${cell} px-2 text-right`}>{t('sale.subTotal')}</td>
                <td className={`${cell} ${ro} text-ink-800`}>{money(sums.sub_total)}</td>
                <td className={cell} />
              </tr>
              <tr>
                <td colSpan={11} className={`${cell} px-2 text-right`}>{t('sale.billDisc')}</td>
                <td className={cell}>
                  <input {...num} max="100" className={`${box} ${billDiscBad ? GRID_BAD : ''}`} aria-label={t('sale.billDisc')} value={head.disc_percent}
                    onChange={(e) => setHead((h) => ({ ...h, disc_percent: e.target.value }))} />
                </td>
                <td className={`${cell} ${ro}`}>{sums.discount_amount ? `− ${money(sums.discount_amount)}` : '-'}</td>
                <td className={cell} />
              </tr>
              <tr>
                <td colSpan={12} className={`${cell} px-2 text-right font-normal text-ink-600`}>{roundBox}</td>
                <td className={`${cell} ${ro} ${sums.round_off < 0 ? 'text-red-600' : 'text-ink-800'}`}>{roundText}</td>
                <td className={cell} />
              </tr>
              <tr className="text-14">
                <td colSpan={12} className={`${cell} bg-brand-600 px-2 text-right font-bold text-white`}>{t('sale.total')}</td>
                <td className={`${cell} px-1.5 text-right font-bold tabular-nums text-white ${totalBelowCost ? 'bg-red-600' : 'bg-brand-600'}`}>{money(sums.total_amount)}</td>
                <td className={`${cell} bg-brand-600`} />
              </tr>
            </tfoot>
          </table>
          <p className="mt-1 text-12 text-ink-400">{t('sale.keysHint')}</p>
        </div>
        {totalBelowCost && <Note tone="error">{t('sale.totalBelowCost', { total: money(sums.before_round), cost: money(sums.cost) })}</Note>}

        <div className="no-print mt-3 grid grid-cols-3 gap-2 sm:flex sm:justify-end">
          <button type="button" className="btn-secondary px-2 sm:px-4" onClick={() => (id ? navigate('/pharmacy/sales-billing-list') : reset())}><X size={16} /> {t('common.cancel')}</button>
          <button type="submit" className="btn-secondary px-2 sm:px-4" disabled={saving}><Save size={16} /> {saving ? t('common.saving') : t('common.save')}</button>
          <button type="submit" className="btn-primary px-2 sm:px-4" disabled={saving} onClick={() => { printAfter.current = true; }}>
            <Printer size={16} /> <span className="truncate">{id ? t('sale.updatePrint') : t('sale.savePrint')}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
