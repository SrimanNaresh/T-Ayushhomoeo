// Pharmacy → Stock In → Master: goods received against a purchase order. Pick the vendor, then one of its
// orders still not fully received – its items are listed to fill in what arrived: Received (split into R.Order,
// the paid units, then R.Free), Batch No, Mf.Date / Exp.Date (MM/YY) and S.Disc %. Saving adds R.Order + R.Free
// to stock and makes each Sel.Amount (MRP less S.Disc %) the item's selling price.
// Only an Admin may change a saved Stock In, and not once a Return or a Sale uses its batches (then read-only).
// Wide screens: an editable grid. Phones: one card per item of the order.
import { useEffect, useState } from 'react';
import { PackagePlus, Save, Trash2, X, Check, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/i18n.jsx';
import { useAuth } from '../../../lib/auth.jsx';
import { navigate } from '../../../lib/router.jsx';
import { fmtDate, money, todayLocal } from '../../../lib/format.js';
import { arrowMove } from '../../../lib/tableKeys.js';
import { mmyyToMonth, monthToMMYY, typeMMYY } from '../../../lib/months.js';
import { CardHeader, ErrorBox, Spinner, Note, GRID_INPUT, GRID_BAD, FORM_ACTIONS, useAsync, useToast } from '../../../components/ui.jsx';
import { CardField, CardValue, ItemCard, cardBox, cardBad } from '../../../components/MobileCard.jsx';
import VendorPicker from '../../../components/VendorPicker.jsx';
import { selAmount, unitPrice } from '../../../../../shared/stockin.js';

const two = (n) => Number(n || 0).toFixed(2);
const qtyText = (n) => String(Number(n || 0));
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** A row of the order, ready to fill in; `saved` (editing) brings back what was entered before. */
const toRow = (l, saved) => {
  const dueOrder = Math.max(0, r2(Number(l.ordered) - Number(l.received)));
  const dueFree = Math.max(0, r2(Number(l.ordered_free) - Number(l.received_free)));
  const rOrder = saved ? Number(saved.qty) : dueOrder;
  const rFree = saved ? Number(saved.free_qty) : dueFree;
  return {
    ...l, rate: Number(l.rate), mrp: Number(l.mrp), due_order: dueOrder, due_free: dueFree,
    po_disc: Number(l.disc_percent),   // the order's Disc %; disc_percent below is this Stock In's S.Disc %
    r_order: rOrder ? qtyText(rOrder) : '', r_free: rFree ? qtyText(rFree) : '', received_now: qtyText(r2(rOrder + rFree)),
    batch_no: saved?.batch_no || '', mfg: monthToMMYY(saved?.mfg_date), exp: monthToMMYY(saved?.exp_date),
    // editing: a month kept as it was is allowed even if it is now past (Exp) / future (Mf)
    saved_mfg: saved?.mfg_date ? String(saved.mfg_date).slice(0, 7) : '', saved_exp: saved?.exp_date ? String(saved.exp_date).slice(0, 7) : '',
    disc_percent: saved && Number(saved.disc_percent) ? qtyText(saved.disc_percent) : '',
  };
};

/** Typing Received fills R.Order first (up to what is due), the rest goes to R.Free */
function splitReceived(r, value) {
  const v = Number(value || 0);
  const order = Math.min(v, r.due_order);
  return { received_now: value, r_order: order ? qtyText(order) : '', r_free: v > order ? qtyText(r2(v - order)) : '' };
}

/** What is wrong with a row's months (Mf / Exp), as { mfg, exp } messages */
function monthErrors(r, thisMonth, t) {
  const mfg = mmyyToMonth(r.mfg);
  const exp = mmyyToMonth(r.exp);
  const out = {};
  if (mfg === null) out.mfg = t('stockin.mmyy');
  else if (mfg && mfg > thisMonth && mfg !== r.saved_mfg) out.mfg = t('stockin.mfgFuture');
  if (exp === null) out.exp = t('stockin.mmyy');
  else if (exp && exp < thisMonth && exp !== r.saved_exp) out.exp = t('stockin.expPast');
  else if (exp && mfg && exp <= mfg) out.exp = t('stockin.expAfterMfg');
  return out;
}

// Grid cells (as Ayush ALL IN ONE's Stock In)
const cell = 'border border-ink-200 px-1 py-0.5 break-words';
const hd = 'border border-ink-200 px-0.5 py-1.5 text-center align-middle text-10 xl:text-11';
const TINT = { sky: 'bg-sky-50 text-sky-900', amber: 'bg-amber-50 text-amber-900', emerald: 'bg-emerald-50 text-emerald-900' };

export default function StockInForm({ params }) {
  const { t } = useT();
  const toast = useToast();
  const { isGlobal: isAdmin } = useAuth();
  const id = params.id;
  const emptyHead = () => ({ supplier_id: '', po_id: '', si_date: todayLocal() });
  const [head, setHead] = useState(emptyHead);
  const [rows, setRows] = useState([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // bulk fill: tick rows, then give Batch No / Mf.Date / Exp.Date / Discount % to all of them at once
  const [ticked, setTicked] = useState(() => new Set());
  const [fill, setFill] = useState({ batch_no: '', mfg: '', exp: '', disc_percent: '' });
  // column groups shown with the arrows: P.Rate | Disc% (sky), GST% | CGST% | SGST% (amber), Unit Price (emerald)
  const [open, setOpen] = useState({ rate: false, gst: false, unit: false });
  const existing = useAsync(() => (id ? api(`/pharmacy/stock-ins/${id}`) : Promise.resolve(null)), [id]);
  const vendors = useAsync(() => api('/pharmacy/vendors', { query: { status: 'active' } }), []);
  const orders = useAsync(
    () => (head.supplier_id
      ? api('/pharmacy/purchase-orders', { query: { supplier_id: head.supplier_id, open: 1, include: existing.data?.po_id || '', limit: 100 } })
      : Promise.resolve({ rows: [] })),
    [head.supplier_id, existing.data?.po_id],
  );
  const readOnly = !!id && (!isAdmin || !!existing.data?.locked);

  // the chosen order's items (editing: with what this Stock In saved)
  async function loadRows(poId, saved = []) {
    setTicked(new Set());
    if (!poId) { setRows([]); return; }
    setRowsLoading(true);
    try {
      const r = await api(`/pharmacy/stock-ins/order/${poId}`, { query: id ? { except: id } : {} });
      const bySaved = new Map(saved.map((s) => [s.po_item_id, s]));
      setRows(r.rows.map((l) => toRow(l, id ? bySaved.get(l.po_item_id) || { qty: 0, free_qty: 0 } : null)));
    } catch (err) {
      toast(err.message || t('common.loadFailed'), 'error');
    } finally {
      setRowsLoading(false);
    }
  }

  useEffect(() => {
    const si = existing.data;
    if (!si) return;
    setHead({ supplier_id: String(si.supplier_id), po_id: String(si.po_id), si_date: String(si.si_date).slice(0, 10) });
    loadRows(si.po_id, si.lines);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing.data]);

  const setRow = (key, patch) => setRows((rs) => rs.map((r) => (r.po_item_id === key ? { ...r, ...patch } : r)));
  const toggleRow = (key) => setTicked((s) => {
    const next = new Set(s);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const allTicked = rows.length > 0 && rows.every((r) => ticked.has(r.po_item_id));
  /** Applies the filled-in bulk boxes (only those) to every ticked row */
  function applyFill() {
    const patch = Object.fromEntries(Object.entries(fill).filter(([, v]) => v !== ''));
    if (!Object.keys(patch).length) return;
    setRows((rs) => rs.map((r) => (ticked.has(r.po_item_id) ? { ...r, ...patch } : r)));
    toast(t('bulkFill.applied', { n: ticked.size }));
  }

  const thisMonth = todayLocal().slice(0, 7);   // Exp.Date from this month on, Mf.Date up to this month
  const problems = rows.map((r) => ({
    ...monthErrors(r, thisMonth, t),
    order: Number(r.r_order || 0) > r.due_order ? t('stockin.overDue', { n: r.due_order }) : undefined,
    free: Number(r.r_free || 0) > r.due_free ? t('stockin.overDue', { n: r.due_free }) : undefined,
  }));
  const hasProblem = problems.some((p) => Object.values(p).some(Boolean));

  function validate() {
    if (!head.supplier_id) return t('purchase.chooseVendor');
    if (!head.po_id) return t('stockin.chooseOrder');
    if (hasProblem) return t('stockin.fixRed');
    if (!rows.some((r) => Number(r.r_order) > 0 || Number(r.r_free) > 0)) return t('common.isRequired', { field: t('stockin.received') });
    return null;
  }

  const reset = () => { setHead(emptyHead()); setRows([]); setTicked(new Set()); };

  async function submit(e) {
    e.preventDefault();
    if (readOnly) return undefined;
    const problem = validate();
    if (problem) return toast(problem, 'error');
    setSaving(true);
    const body = {
      ...head,
      lines: rows.filter((r) => Number(r.r_order) > 0 || Number(r.r_free) > 0).map((r) => ({
        po_item_id: r.po_item_id, batch_no: r.batch_no, mfg_date: mmyyToMonth(r.mfg), exp_date: mmyyToMonth(r.exp),
        qty: r.r_order || 0, free_qty: r.r_free || 0, disc_percent: r.disc_percent,
      })),
    };
    try {
      const si = id ? await api(`/pharmacy/stock-ins/${id}`, { method: 'PUT', body }) : await api('/pharmacy/stock-ins', { method: 'POST', body });
      toast(t('stockin.saved', { no: si.si_no }));
      if (id) navigate('/pharmacy/stock-in-list');
      else { reset(); orders.reload(); }
    } catch (err) {
      toast(err.message || t('common.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
    return undefined;
  }

  async function remove() {
    if (!id || !window.confirm(t('stockin.deleteConfirm', { no: existing.data.si_no }))) return;
    try {
      await api(`/pharmacy/stock-ins/${id}`, { method: 'DELETE' });
      toast(t('stockin.deleted', { no: existing.data.si_no }));
      navigate('/pharmacy/stock-in-list');
    } catch (err) {
      toast(err.message || t('common.deleteFailed'), 'error');
    }
  }

  if (id && existing.loading) return <div className="card"><Spinner /></div>;
  if (existing.error) return <div className="card"><ErrorBox error={existing.error} onRetry={existing.reload} /></div>;
  const num = { type: 'number', min: '0', step: '0.01', inputMode: 'decimal' };
  const box = `${GRID_INPUT} text-right`;
  const orderOptions = (orders.data?.rows || []).map((o) => ({
    value: String(o.id), label: `${o.po_no} · ${fmtDate(o.po_date)} · ${money(o.total_amount)}`,
  }));
  const arrow = (key, label) => (
    <span className="flex items-center justify-center gap-0.5">
      <span>{label}</span>
      <button type="button" className={`rounded p-0.5 ${open[key] ? 'bg-amber-100 text-amber-700' : 'text-brand-600 hover:bg-brand-100'}`} aria-expanded={open[key]}
        title={open[key] ? t('purchase.hideDetails') : t('purchase.showDetails')}
        aria-label={open[key] ? t('purchase.hideDetails') : t('purchase.showDetails')}
        onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}>
        {open[key] ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}
      </button>
    </span>
  );
  const earlier = (n) => (Number(n) > 0 ? <small className="block text-10 font-normal text-ink-400">{t('stockin.earlier', { n: qtyText(n) })}</small> : null);

  // the grid's columns (shares of the width add up to 100 % whichever groups are open)
  const cols = [
    { key: 'tick', w: 2, className: 'text-center',
      head: <input type="checkbox" aria-label={t('bulkFill.tickAll')} title={t('bulkFill.tickAll')} checked={allTicked}
        onChange={() => setTicked(allTicked ? new Set() : new Set(rows.map((r) => r.po_item_id)))} />,
      cell: (r, n) => <input type="checkbox" aria-label={`${n + 1}. ${r.item_name}`} checked={ticked.has(r.po_item_id)} onChange={() => toggleRow(r.po_item_id)} /> },
    { key: 'item', w: 11, className: 'font-medium text-ink-800', head: t('items.name'), cell: (r) => r.item_name },
    { key: 'pack', w: 4, className: 'text-12 text-ink-500', head: t('items.pack'), cell: (r) => r.pack || '-' },
    { key: 'unit', w: 3.5, className: 'text-12 text-ink-500', head: t('purchase.unit'), cell: (r) => r.unit || '-' },
    { key: 'mrp', w: 4.5, num: true, head: t('items.mrp'), cell: (r) => two(r.mrp) },
    { key: 'amount', w: 5.5, num: true, head: arrow('rate', t('purchase.amount')), cell: (r, n, c) => two(c.amount) },
    ...(open.rate ? [
      { key: 'p_rate', w: 4.5, num: true, tint: 'sky', head: t('purchase.pRate'), cell: (r) => two(r.p_rate) },
      { key: 'disc', w: 3.5, num: true, tint: 'sky', head: t('purchase.disc'), cell: (r) => qtyText(r.po_disc) },
    ] : []),
    { key: 'gst_amt', w: 5, num: true, head: arrow('gst', t('purchase.gstAmount')), cell: (r, n, c) => two(c.gstAmount) },
    ...(open.gst ? [
      { key: 'gst', w: 3.5, num: true, tint: 'amber', head: t('purchase.gst'), cell: (r) => qtyText(r.gst_percent) },
      { key: 'cgst', w: 3.5, num: true, tint: 'amber', head: t('items.cgst'), cell: (r) => qtyText(r.cgst_percent) },
      { key: 'sgst', w: 3.5, num: true, tint: 'amber', head: t('items.sgst'), cell: (r) => qtyText(r.sgst_percent) },
    ] : []),
    { key: 'total', w: 5.5, num: true, head: t('purchase.total'), cell: (r, n, c) => <b className="text-ink-800">{two(c.total)}</b> },
    { key: 'ordered', w: 4.5, num: true, head: t('stockin.ordered'), cell: (r) => <>{qtyText(r.ordered)}{earlier(r.received)}</> },
    { key: 'free', w: 4, num: true, head: t('purchase.free'), cell: (r) => <>{qtyText(r.ordered_free)}{earlier(r.received_free)}</> },
    { key: 'received', w: 5, head: t('stockin.received'),
      cell: (r) => <input {...num} className={box} aria-label={t('stockin.received')} value={r.received_now}
        onChange={(e) => setRow(r.po_item_id, splitReceived(r, e.target.value))} /> },
    { key: 'r_order', w: 4.5, head: t('stockin.rOrder'), bad: 'order',
      cell: (r, n, c, bad) => <input {...num} className={`${box} ${bad ? GRID_BAD : ''}`} aria-label={t('stockin.rOrder')} value={r.r_order}
        onChange={(e) => setRow(r.po_item_id, { r_order: e.target.value, received_now: qtyText(r2(Number(e.target.value || 0) + Number(r.r_free || 0))) })} /> },
    { key: 'r_free', w: 4, head: t('stockin.rFree'), bad: 'free',
      cell: (r, n, c, bad) => <input {...num} className={`${box} ${bad ? GRID_BAD : ''}`} aria-label={t('stockin.rFree')} value={r.r_free}
        onChange={(e) => setRow(r.po_item_id, { r_free: e.target.value, received_now: qtyText(r2(Number(r.r_order || 0) + Number(e.target.value || 0))) })} /> },
    { key: 'batch', w: 6, head: t('stockin.batch'),
      cell: (r) => <input className={GRID_INPUT} aria-label={t('stockin.batch')} maxLength={50} value={r.batch_no}
        onChange={(e) => setRow(r.po_item_id, { batch_no: e.target.value })} /> },
    { key: 'mfg', w: 4.5, head: t('stockin.mfg'), bad: 'mfg',
      cell: (r, n, c, bad) => <input className={`${GRID_INPUT} text-center ${bad ? GRID_BAD : ''}`} inputMode="numeric" placeholder="MM/YY" aria-label={t('stockin.mfg')} value={r.mfg}
        onChange={(e) => setRow(r.po_item_id, { mfg: typeMMYY(e.target.value) })} /> },
    { key: 'exp', w: 4.5, head: t('stockin.exp'), bad: 'exp',
      cell: (r, n, c, bad) => <input className={`${GRID_INPUT} text-center ${bad ? GRID_BAD : ''}`} inputMode="numeric" placeholder="MM/YY" aria-label={t('stockin.exp')} value={r.exp}
        onChange={(e) => setRow(r.po_item_id, { exp: typeMMYY(e.target.value) })} /> },
    { key: 's_disc', w: 4, head: t('stockin.sDisc'),
      cell: (r) => <input {...num} max="100" className={box} aria-label={t('stockin.sDisc')} value={r.disc_percent}
        onChange={(e) => setRow(r.po_item_id, { disc_percent: e.target.value })} /> },
    { key: 'sel', w: 5.5, num: true, head: arrow('unit', t('stockin.sel')), cell: (r, n, c) => <b className="text-ink-800">{two(c.sel)}</b> },
    ...(open.unit ? [
      { key: 'unit_price', w: 4.5, num: true, tint: 'emerald', head: t('stockin.unitPrice'), cell: (r, n, c) => two(unitPrice(c.sel, r.unit)) },
    ] : []),
  ];
  const share = 100 / cols.reduce((s, c) => s + c.w, 0);
  const calc = (r) => {
    const amount = r2(Number(r.r_order || 0) * r.rate);
    const gstAmount = r2((amount * Number(r.gst_percent || 0)) / 100);
    return { amount, gstAmount, total: r2(amount + gstAmount), sel: selAmount(r) };
  };
  const sums = rows.reduce((s, r) => {
    const c = calc(r);
    return { amount: s.amount + c.amount, gst: s.gst + c.gstAmount, total: s.total + c.total };
  }, { amount: 0, gst: 0, total: 0 });
  const fillBox = (k, label, extra = {}, mmyy = false) => (
    <div>
      <label className="label">{label}</label>
      <input className="input" value={fill[k]} {...extra} onChange={(e) => setFill((f) => ({ ...f, [k]: mmyy ? typeMMYY(e.target.value) : e.target.value }))} />
    </div>
  );

  return (
    <div className="card max-md:!px-3">
      <form onSubmit={submit} noValidate>
        <CardHeader icon={PackagePlus}
          title={id ? `${readOnly ? t('stockin.viewTitle') : t('stockin.editTitle')} · ${existing.data?.si_no}` : t('stockin.masterTitle')}
          subtitle={<span className="hidden md:inline">{t('stockin.hint')}</span>} />
        {readOnly && <Note tone="info" className="mt-0 flex items-center gap-2"><Info size={15} className="shrink-0" /> {existing.data?.locked || t('stockin.adminOnly')}</Note>}

        <fieldset className="m-0 min-w-0 border-0 p-0" disabled={readOnly}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(14rem,2fr)_minmax(14rem,2fr)_minmax(9rem,1fr)]">
            <VendorPicker label={t('purchase.vendor')} required vendors={vendors.data?.rows || []} value={head.supplier_id}
              onPick={(v) => { setHead((h) => ({ ...h, supplier_id: String(v.id), po_id: '' })); setRows([]); }} />
            <div>
              <label className="label">{t('stockin.orderNo')} *</label>
              <select className="input" disabled={!head.supplier_id} value={head.po_id}
                onChange={(e) => { setHead((h) => ({ ...h, po_id: e.target.value })); loadRows(e.target.value); }}>
                <option value="">{head.supplier_id ? '-' : t('stockin.vendorFirst')}</option>
                {orderOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{t('purchase.date')} *</label>
              <input className="input" type="date" value={head.si_date} onChange={(e) => setHead((h) => ({ ...h, si_date: e.target.value }))} />
            </div>
          </div>
          {head.supplier_id && !orders.loading && !orderOptions.length && <p className="mt-2 text-13 text-ink-400">{t('stockin.noOrders')}</p>}

          {rowsLoading && <Spinner />}
          {!rowsLoading && ticked.size > 0 && (
            <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50/40 p-3">
              <p className="mb-2 text-13"><b className="text-brand-700">{t('bulkFill.title')}</b> <span className="text-ink-500">· {t('bulkFill.hint')}</span></p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(4,minmax(0,9rem))_auto] sm:items-end">
                {fillBox('batch_no', t('stockin.batch'), { maxLength: 50 })}
                {fillBox('mfg', t('stockin.mfg'), { inputMode: 'numeric', placeholder: 'MM/YY' }, true)}
                {fillBox('exp', t('stockin.exp'), { inputMode: 'numeric', placeholder: 'MM/YY' }, true)}
                {fillBox('disc_percent', t('stockin.sDisc'), { type: 'number', min: 0, max: 100, step: 0.01, placeholder: '0 – 100' })}
                <button type="button" className="btn-primary col-span-2 sm:col-span-1" onClick={applyFill} disabled={!Object.values(fill).some((v) => v !== '')}>
                  <Check size={16} /> {t('bulkFill.apply', { n: ticked.size })}
                </button>
              </div>
            </div>
          )}

          {!rowsLoading && rows.length > 0 && (
            <>
              {/* Phones: one card per item of the order */}
              <div className="mt-3 space-y-2.5 md:hidden">
                {rows.map((r, n) => {
                  const c = calc(r);
                  const p = problems[n];
                  const msgs = Object.values(p).filter(Boolean);
                  const numBox = (label, key, onChange, bad, note) => (
                    <CardField label={label} note={note}>
                      <input {...num} className={`${cardBox} no-spin ${bad ? cardBad : ''}`} value={r[key]} onChange={(e) => onChange(e.target.value)} />
                    </CardField>
                  );
                  const textBox = (label, key, bad, mmyy) => (
                    <CardField label={label}>
                      <input className={`${cardBox} ${bad ? cardBad : ''}`} inputMode={mmyy ? 'numeric' : undefined} placeholder={mmyy ? 'MM/YY' : ''} value={r[key]}
                        onChange={(e) => setRow(r.po_item_id, { [key]: mmyy ? typeMMYY(e.target.value) : e.target.value })} />
                    </CardField>
                  );
                  return (
                    <ItemCard key={r.po_item_id} no={n + 1} title={r.item_name} bad={msgs.length > 0}
                      sub={`${[r.pack, r.unit].filter(Boolean).join(' · ')} · ${t('items.mrp')} ${two(r.mrp)}`}
                      tag={`${t('stockin.ordered')} ${qtyText(r.ordered)}${Number(r.ordered_free) ? ` + ${qtyText(r.ordered_free)}` : ''}`}>
                      <div className="grid grid-cols-4 gap-1.5">
                        {numBox(t('stockin.received'), 'received_now', (v) => setRow(r.po_item_id, splitReceived(r, v)))}
                        {numBox(t('stockin.rOrder'), 'r_order', (v) => setRow(r.po_item_id, { r_order: v, received_now: qtyText(r2(Number(v || 0) + Number(r.r_free || 0))) }), p.order, `≤ ${r.due_order}`)}
                        {numBox(t('stockin.rFree'), 'r_free', (v) => setRow(r.po_item_id, { r_free: v, received_now: qtyText(r2(Number(r.r_order || 0) + Number(v || 0))) }), p.free, `≤ ${r.due_free}`)}
                        {numBox(t('stockin.sDisc'), 'disc_percent', (v) => setRow(r.po_item_id, { disc_percent: v }))}
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {textBox(t('stockin.batch'), 'batch_no')}
                        {textBox(t('stockin.mfg'), 'mfg', p.mfg, true)}
                        {textBox(t('stockin.exp'), 'exp', p.exp, true)}
                        <CardField label={t('stockin.sel')}><CardValue className="!bg-brand-50 font-bold text-brand-800">{two(c.sel)}</CardValue></CardField>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <CardField label={t('purchase.amount')}><CardValue>{two(c.amount)}</CardValue></CardField>
                        <CardField label={t('purchase.gstAmount')}><CardValue>{two(c.gstAmount)}</CardValue></CardField>
                        <CardField label={t('purchase.total')}><CardValue className="font-semibold">{two(c.total)}</CardValue></CardField>
                      </div>
                      {msgs.length > 0 && <p className="rounded-md bg-red-50 px-2 py-1 text-11 text-red-600">{msgs.join(' · ')}</p>}
                    </ItemCard>
                  );
                })}
                <div className="flex items-center justify-between rounded-xl bg-brand-600 px-3 py-1.5 text-white shadow-sm">
                  <span className="text-13 font-semibold">{t('purchase.sumTotal')}</span>
                  <span className="text-15 font-bold tabular-nums">{money(sums.total)}</span>
                </div>
              </div>

              {/* Wide screens: the editable grid */}
              <div className="mt-3 hidden overflow-x-auto md:block">
                <table className="w-full min-w-[1100px] table-fixed border-collapse text-left text-13">
                  <colgroup>{cols.map((c) => <col key={c.key} style={{ width: `${(c.w * share).toFixed(2)}%` }} />)}</colgroup>
                  <thead>
                    <tr className="bg-brand-50 font-bold leading-tight text-brand-700">
                      {cols.map((c) => <th key={c.key} className={`${hd} ${c.tint ? TINT[c.tint] : ''} ${c.key === 'item' ? '!text-left px-1.5' : ''}`}>{c.head}</th>)}
                    </tr>
                  </thead>
                  <tbody onKeyDown={arrowMove}>
                    {rows.map((r, n) => {
                      const c = calc(r);
                      const p = problems[n];
                      return (
                        <tr key={r.po_item_id} className={ticked.has(r.po_item_id) ? 'bg-brand-50/50' : 'hover:bg-brand-50/30'}>
                          {cols.map((col) => {
                            const bad = col.bad && p[col.bad];
                            return (
                              <td key={col.key} title={bad || undefined}
                                className={`${cell} ${col.num ? 'px-1.5 text-right tabular-nums text-ink-600' : ''} ${col.tint ? TINT[col.tint] : ''} ${col.className || ''}`}>
                                {col.cell(r, n, c, bad)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-ink-50 font-semibold">
                      {cols.map((col) => (
                        <td key={col.key} className={`${cell} px-1.5 text-right tabular-nums ${col.key === 'total' ? 'bg-brand-600 font-bold text-white' : ''}`}>
                          {col.key === 'item' && <span className="block text-left">{t('purchase.sumTotal')}</span>}
                          {col.key === 'amount' && money(sums.amount)}
                          {col.key === 'gst_amt' && money(sums.gst)}
                          {col.key === 'total' && money(sums.total)}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </fieldset>

        <div className={FORM_ACTIONS}>
          <button type="button" className="btn-secondary px-2 sm:px-4" onClick={() => (id ? navigate('/pharmacy/stock-in-list') : reset())}>
            <X size={16} /> {readOnly ? t('common.back') : t('common.cancel')}
          </button>
          <button type="button" className="btn-danger px-2 sm:px-4" onClick={remove} disabled={!id || readOnly}
            title={!id ? t('common.deleteHint') : readOnly ? (existing.data?.locked || t('stockin.adminOnly')) : t('common.deleteThis')}>
            <Trash2 size={16} /> {t('common.delete')}
          </button>
          <button type="submit" className="btn-primary px-2 sm:px-4" disabled={saving || readOnly || !rows.length}>
            <Save size={16} /> {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </form>
    </div>
  );
}
