// Pharmacy → Stock In → Three in One (IPS): Item, Purchase Order and Stock In in one entry, as in Ayush All In One.
// Pick the vendor (or add one), scan the supplier's bill or type its lines, check the table – its columns grouped
// as on the Item, Purchase / Order and Stock In screens – and one Save:
//   1. adds the lines' new items to the Item List (an item with the same Item Name, and no other HSN or Category,
//      is used as it is),
//   2. saves the Purchase Order (P.Rate = MRP less Disc %; Round Off; the vendor's details; shared/purchase.js),
//   3. saves the Stock In for all of it (Bill No, Batch No, Mf / Exp month, S.Disc %), which adds the stock and sets
//      each item's selling price (Sel.Amount = MRP less S.Disc %; shared/stockin.js).
// Each step goes through its own screen's server checks; the rows are checked the same way first. If the Stock In
// can't be saved after the order was, the order is kept and Save tries only the Stock In again.
// Wide screens: the grid (headings and # / Item Name stay in view while it scrolls). Phones: one card per line.
import { useEffect, useRef, useState } from 'react';
import { Layers, Save, X, Plus, Trash2, Sparkles, ScanLine, List, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/i18n.jsx';
import { navigate } from '../../../lib/router.jsx';
import { money, todayLocal } from '../../../lib/format.js';
import { arrowMove } from '../../../lib/tableKeys.js';
import { typeMMYY, mmyyToMonth, monthToMMYY } from '../../../lib/months.js';
import { CardHeader, Note, GRID_INPUT, GRID_BAD, RowAction, useAsync, useToast } from '../../../components/ui.jsx';
import { CardField, ItemCard, CardValue, cardBox, cardBad } from '../../../components/MobileCard.jsx';
import ItemPicker from '../../../components/ItemPicker.jsx';
import VendorPicker from '../../../components/VendorPicker.jsx';
import { ColumnsMenu, ResizeHandle, useGridColumns } from '../../../components/GridColumns.jsx';
import { calcLine, discOf, orderNet, priced, splitGst } from '../../../../../shared/purchase.js';
import { selAmount } from '../../../../../shared/stockin.js';
import ScanBillModal from './ScanBillModal.jsx';
import NewVendorBox, { vendorDetails } from './NewVendorBox.jsx';
import { compact, likeness } from '../utils/billScan.js';

const MAX_GST = 28;
const num = (v) => Number(v || 0);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const numStr = (v) => (num(v) ? String(num(v)) : '');
const thisMonth = () => todayLocal().slice(0, 7);
const digits = (s) => String(s || '').replace(/\D/g, '');
const code = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const newRow = () => ({
  key: Math.random().toString(36).slice(2), item_id: null, item_code: '', name: '',
  generic: '', manufacturer: '', hsn: '', category: '', pack: '', unit: '', rack: '',
  mrp: '', disc: '', p_rate: '', qty: '', free: '', gst: '',
  batch: '', mfg: '', exp: '', s_disc: '',
});
const EMPTY_HEAD = () => ({ supplier_id: '', date: todayLocal(), bill_no: '', details: '' });

const isBlank = (r) => !compact(r.name) && !num(r.qty) && !num(r.mrp);
// What makes two rows the same entry (the second is a repeat): Item Name + HSN + Batch (one item in two batches is two lines)
const entryKey = (r) => (compact(r.name) ? `${compact(r.name)}|${digits(r.hsn)}|${code(r.batch || r.category)}` : '');
// A bill's Pack as a count for Unit when the bill has no Unit: "10's" / "10" → 10, "1x15" → 15, "10x10" → 100
function packSizeOf(pack) {
  const s = String(pack || '').trim().toLowerCase();
  const times = /^(\d+)\s*[x×*]\s*(\d+)/.exec(s);
  if (times) return String(Number(times[1]) * Number(times[2]));
  const count = /^(\d+)\s*('?s|tabs?|caps?|nos|pcs?)?$/.exec(s);
  return count && Number(count[1]) > 0 ? String(Number(count[1])) : '';
}
/** The Item List item this row is: the same Item Name, with no other HSN or Category (a blank one doesn't count) */
const sameItem = (i, r) => {
  const differs = (a, b) => a !== '' && b !== '' && a !== b;
  return compact(i.name) === compact(r.name) && !differs(digits(i.hsn_code), digits(r.hsn)) && !differs(code(i.category), code(r.category));
};
// The Stock In No that already has this vendor's Bill No, or null (also null when the check itself fails:
// the server refuses a repeated Bill No when the Stock In is saved)
async function checkBillNo(supplierId, billNo) {
  try {
    const res = await api('/pharmacy/stock-ins/bill-no', { query: { supplier_id: supplierId, bill_no: billNo.trim().toUpperCase() } });
    return res.si_no || null;
  } catch {
    return null;
  }
}
async function findItem(r) {
  try {
    const res = await api('/pharmacy/item-master', { query: { q: r.name.trim(), limit: 20 } });
    return res.rows.find((i) => sameItem(i, r)) || null;
  } catch {
    return null;
  }
}
/** An existing item's details on a row (empty boxes only when `onlyEmpty`), with its MRP, P.Rate, Disc % and GST % */
function withItem(r, i, onlyEmpty = false) {
  const fill = {
    generic: i.generic_name, manufacturer: i.manufacturer, hsn: i.hsn_code, category: i.category,
    pack: i.pack, unit: i.unit, rack: i.rack,
  };
  const patch = { item_id: i.id, item_code: i.item_code || '', name: i.name };
  for (const [f, v] of Object.entries(fill)) if (!onlyEmpty || !r[f]) patch[f] = v ? String(v) : '';
  if ((!onlyEmpty || !r.mrp) && num(i.mrp)) patch.mrp = String(num(i.mrp));
  if ((!onlyEmpty || !r.p_rate) && num(i.purchase_rate)) patch.p_rate = String(num(i.purchase_rate));
  const mrp = patch.mrp ?? r.mrp;
  const rate = patch.p_rate ?? r.p_rate;
  if (patch.mrp || patch.p_rate) patch.disc = String(discOf(mrp, rate) || '');
  const gst = num(i.cgst_percent) + num(i.sgst_percent) || num(i.gst_percent);
  if ((!onlyEmpty || !r.gst) && gst) patch.gst = String(r2(gst));
  return patch;
}

/** What is wrong with a row: [i18n key, params], or null (same checks as the servers) */
function rowProblem(r, firstOf) {
  if (!compact(r.name)) return ['ips.lineName'];
  if (firstOf != null) return ['ips.lineRepeat', { m: firstOf + 1 }];
  if (!(num(r.qty) > 0)) return ['ips.lineQty'];
  if (num(r.free) < 0) return ['ips.lineFree'];
  if (!(num(r.mrp) > 0)) return ['ips.lineMrp'];
  if (!(num(r.p_rate) > 0)) return ['ips.lineRate'];
  if (num(r.p_rate) > num(r.mrp)) return ['ips.lineOverMrp', { mrp: money(r.mrp) }];
  if (num(r.disc) > 100) return ['ips.lineDisc'];
  if (num(r.gst) > MAX_GST) return ['ips.lineGst'];
  if (!r.batch.trim()) return ['ips.lineBatch'];
  if (!r.exp.trim()) return ['ips.lineExp'];
  const mfg = mmyyToMonth(r.mfg);
  const exp = mmyyToMonth(r.exp);
  if (mfg === null || exp === null) return ['ips.lineMonth'];
  if (exp < thisMonth()) return ['ips.lineExpPast'];
  if (mfg && mfg > thisMonth()) return ['ips.lineMfgFuture'];
  if (mfg && exp <= mfg) return ['ips.lineExpAfter'];
  if (num(r.s_disc) > 100) return ['ips.lineSDisc'];
  return null;
}
const lineCalc = (r) => calcLine({ p_rate: r.p_rate, qty: r.qty, ...splitGst(r.gst) });

// The grid's column groups. Which columns show and how wide they are is remembered in this browser (components/
// GridColumns.jsx); the Item group's columns start hidden (an existing item's details come from the Item List).
const GROUPS = [
  { id: 'item', label: 'ips.groupItem', tone: 'bg-violet-50 text-violet-700' },
  { id: 'purchase', label: 'ips.groupPurchase', tone: 'bg-sky-50 text-sky-700' },
  { id: 'stock', label: 'ips.groupStock', tone: 'bg-emerald-50 text-emerald-700' },
];
const cell = 'border border-ink-200 px-0.5 py-0.5 align-top bg-inherit';
const hd = 'border border-ink-200 px-0.5 py-1.5 text-center align-middle text-10 xl:text-11';
const grp = 'border border-ink-200 px-1 py-1 text-center text-11 font-bold uppercase tracking-wide';
const ro = 'px-1 text-right tabular-nums text-ink-600';
const freeze0 = 'sticky left-0 z-10 w-8 min-w-[2rem]';
const freeze1 = 'sticky left-8 z-10';

export default function StockIps() {
  const { t } = useT();
  const toast = useToast();
  const [head, setHead] = useState(EMPTY_HEAD);
  const [rows, setRows] = useState([newRow()]);
  const [roundOn, setRoundOn] = useState(true);
  const [allDisc, setAllDisc] = useState('');       // Disc % on all lines: fills every line's Disc % (new rows too)
  const [showDetails, setShowDetails] = useState(false);
  const [newVendor, setNewVendor] = useState(null);
  const [added, setAdded] = useState([]);            // vendors added here, until the list is loaded again
  const [saving, setSaving] = useState('');            // the step being saved ('' = idle)
  const [savedOrder, setSavedOrder] = useState(null);  // an order saved whose Stock In failed
  // The vendor's Bill No already on a saved Stock In (that Stock In No), checked as it is typed
  const [billUsed, setBillUsed] = useState(null);
  const billUsedText = billUsed ? t('ips.billNoUsed', { no: head.bill_no.trim().toUpperCase(), si: billUsed }) : '';
  useEffect(() => {
    setBillUsed(null);
    if (!head.supplier_id || !head.bill_no.trim() || savedOrder) return undefined;
    let live = true;
    const timer = setTimeout(async () => {
      const used = await checkBillNo(head.supplier_id, head.bill_no);
      if (live) setBillUsed(used);
    }, 400);
    return () => { live = false; clearTimeout(timer); };
  }, [head.supplier_id, head.bill_no, savedOrder]);
  const [scanOpen, setScanOpen] = useState(false);
  const vendors = useAsync(() => api('/pharmacy/vendors', { query: { status: 'active' } }), []);
  const vendorRows = [...added.filter((a) => !(vendors.data?.rows || []).some((v) => v.id === a.id)), ...(vendors.data?.rows || [])]
    .sort((a, b) => a.name.localeCompare(b.name));
  const locked = !!savedOrder;   // the order is saved: only the Stock In columns can still change

  const setRow = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const fresh = () => ({ ...newRow(), disc: allDisc });
  const removeRow = (key) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : [fresh()]));
  const addRowAfter = (key) => setRows((rs) => rs.flatMap((r) => (r.key === key ? [r, fresh()] : [r])));
  // Disc % on all lines: each line's P.Rate becomes MRP less that Disc %, so its Total Amount and the Sum of Total drop
  const discAll = (value) => { setAllDisc(value); setRows((rs) => rs.map((r) => ({ ...r, ...priced(r, 'disc', value) }))); };
  const setPrice = (r, key, value) => setRow(r.key, priced(r, key, value));
  const chooseVendor = (v) => setHead((h) => ({ ...h, supplier_id: String(v.id), details: vendorDetails(v, t) }));

  // Old Price: this vendor's last P.Rate for each item on the table (0 when never ordered from them)
  const itemIds = [...new Set(rows.filter((r) => r.item_id).map((r) => r.item_id))].sort((a, b) => a - b).join(',');
  const oldPrices = useAsync(
    () => (head.supplier_id && itemIds ? api('/pharmacy/purchase-orders/old-prices', { query: { supplier_id: head.supplier_id, item_ids: itemIds } }) : Promise.resolve({})),
    [head.supplier_id, itemIds],
  );

  // Typing a name: once it stops, an Item List item with that name (and no other HSN / Category) is linked,
  // filling the row's empty boxes – so "In Item List" / "New item" shows as you type, as in All In One.
  const timers = useRef(new Map());
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const lookUp = (r) => {
    clearTimeout(timers.current.get(r.key));
    if (!compact(r.name)) return;
    timers.current.set(r.key, setTimeout(async () => {
      const i = await findItem(r);
      if (i) setRows((rs) => rs.map((x) => (x.key === r.key && !x.item_id && compact(x.name) === compact(r.name) ? { ...x, ...withItem(x, i, true) } : x)));
    }, 450));
  };
  const pickItem = (r) => (p) => {
    if (p.item_id) { setRow(r.key, withItem(r, p.item || { id: p.item_id, name: p.medicine_name })); return; }
    const next = { ...r, item_id: null, item_code: '', name: p.medicine_name };
    setRow(r.key, { item_id: null, item_code: '', name: p.medicine_name });
    lookUp(next);
  };

  // Scan Bill: the bill's lines fill the table after the rows already typed; repeats are left out. Lines whose
  // item is in the Item List are linked to it. The bill's vendor is picked when one in the Vendor List has very
  // nearly that name (else it is offered as a new vendor); its date fills Date.
  // The popup stays open for the bill's next page; the supplier comes with the first page's lines only.
  async function fromBill(lines, { supplier } = {}) {
    // A repeat is the same line read twice: same Item Name, HSN, Batch and figures. The same name, HSN and
    // batch with other figures is another line of the bill (a name read without its potency, "30C" / "200C"):
    // it is kept – marked as a repeat on the table to correct – rather than lost.
    const lineKey = (r) => (entryKey(r) ? `${entryKey(r)}|${num(r.mrp)}|${num(r.p_rate)}|${num(r.qty)}` : '');
    const have = new Set(rows.filter((r) => !isBlank(r)).map(lineKey));
    const add = [];
    let repeats = 0;
    for (const b of lines) {
      let r = {
        ...newRow(), name: b.name, generic: b.generic, manufacturer: b.manufacturer, hsn: b.hsnCode, category: b.category,
        pack: b.pack, unit: b.unit || packSizeOf(b.pack), rack: b.rack, mrp: numStr(b.mrp), disc: numStr(b.disc), p_rate: numStr(b.pRate),
        qty: numStr(b.qty), free: numStr(b.free), gst: numStr(b.gst),
        batch: b.batch || b.category, mfg: monthToMMYY(b.mfg), exp: monthToMMYY(b.exp), s_disc: numStr(b.sDisc),
      };
      // P.Rate and Disc % stay exactly as read from the bill – neither is worked out from the other or from
      // the MRP. S.Disc % from a selling price.
      if (r.s_disc === '' && num(b.sel) > 0 && num(r.mrp) >= num(b.sel)) r.s_disc = String(r2((1 - num(b.sel) / num(r.mrp)) * 100));
      const k = lineKey(r);
      if (k && have.has(k)) { repeats += 1; continue; }
      have.add(k);
      add.push(r);
    }
    const linked = await Promise.all(add.map(async (r) => {
      const i = compact(r.name) ? await findItem(r) : null;   // (a bill line whose name couldn't be read comes unnamed)
      return i ? { ...r, ...withItem(r, i, true) } : r;
    }));
    setRows((rs) => [...rs.filter((r) => !isBlank(r)), ...linked, ...(linked.length ? [] : [newRow()])]);

    const notes = [];
    if (!locked && supplier?.billDate && supplier.billDate <= todayLocal()) {
      setHead((h) => ({ ...h, date: supplier.billDate }));
      notes.push(t('ips.scanDate'));
    }
    if (!locked && supplier?.vendorName && !head.supplier_id) {
      const best = vendorRows.map((v) => ({ v, score: likeness(v.name, supplier.vendorName) })).sort((a, b) => b.score - a.score)[0];
      if (best && best.score >= 0.85) {
        chooseVendor(best.v);
        notes.push(t('ips.scanVendor', { name: best.v.name }));
      } else {
        setNewVendor({ name: supplier.vendorName, address: supplier.address || '', mobile: supplier.mobile || '' });
        notes.push(t('ips.scanNewVendor'));
      }
    }
    toast([
      t('ips.scanFilled', { n: linked.length }),
      notes.length ? t('ips.scanFilledIn', { list: notes.join(', ') }) : '',
      repeats ? t('ips.scanRepeats', { n: repeats }) : '',
    ].filter(Boolean).join(' · '));
  }

  // each row's problem, the first row with the same entry, and its sums
  const firstSeen = new Map();
  const view = rows.map((r, n) => {
    const used = !isBlank(r);
    const k = entryKey(r);
    const first = k && firstSeen.has(k) ? firstSeen.get(k) : null;
    if (k && !firstSeen.has(k)) firstSeen.set(k, n);
    return { r, used, problem: used ? rowProblem(r, first) : null, calc: lineCalc(r) };
  });
  const usedRows = view.filter((v) => v.used);
  const newCount = usedRows.filter((v) => !v.r.item_id).length;
  const sum = r2(usedRows.reduce((s, v) => s + v.calc.total, 0));
  const net = orderNet(sum, 0, roundOn);
  const roundOff = net.round_off;
  const allDiscBad = Number(allDisc) < 0 || Number(allDisc) > 100;
  const problemText = (p, n) => (p ? `${t('ips.lineN', { n: n + 1 })}: ${t(p[0], p[1])}` : '');

  function validate() {
    if (!head.supplier_id) return t('purchase.chooseVendor');
    if (!head.date) return t('common.isRequired', { field: t('purchase.date') });
    if (!head.bill_no.trim()) return t('ips.billNoRequired');
    if (billUsed && !savedOrder) return billUsedText;
    if (!usedRows.length) return t('ips.empty');
    const bad = view.findIndex((v) => v.problem);
    return bad >= 0 ? problemText(view[bad].problem, bad) : null;
  }

  const reset = () => { setHead(EMPTY_HEAD()); setRows([newRow()]); setSavedOrder(null); setRoundOn(true); setAllDisc(''); setNewVendor(null); setShowDetails(false); };

  async function submit(e) {
    e.preventDefault();
    const problem = validate();
    if (problem) return toast(problem, 'error');
    const lines = usedRows.map((v) => v.r);
    let order = savedOrder;
    let newItems = 0;
    try {
      if (!order) {
        // 0. this vendor's Bill No must not be saved already – checked before anything is added
        const used = await checkBillNo(head.supplier_id, head.bill_no);
        if (used) { setBillUsed(used); return toast(t('ips.billNoUsed', { no: head.bill_no.trim().toUpperCase(), si: used }), 'error'); }
        // 1. new items (a row typed without picking is linked first if its item is in the Item List)
        setSaving('ips.stepItems');
        const ids = new Map(lines.filter((r) => r.item_id).map((r) => [r.key, r.item_id]));
        for (const r of lines.filter((x) => !x.item_id)) {
          const found = await findItem(r);
          if (found) { ids.set(r.key, found.id); setRow(r.key, { item_id: found.id, item_code: found.item_code || '' }); continue; }
          const item = await api('/pharmacy/item-master', {
            method: 'POST',
            body: {
              name: r.name.trim(), generic_name: r.generic.trim(), manufacturer: r.manufacturer.trim(), hsn_code: r.hsn.trim().toUpperCase(),
              category: r.category.trim(), pack: r.pack.trim(), unit: r.unit.trim() || 'nos', rack: r.rack.trim(),
              mrp: r.mrp, purchase_rate: r.p_rate, ...splitGst(r.gst),
              price: selAmount({ mrp: r.mrp, disc_percent: r.s_disc }), supplier_id: head.supplier_id, status: 'active',
            },
          });
          newItems += 1;
          ids.set(r.key, item.id);
          setRow(r.key, { item_id: item.id, item_code: item.item_code || '' });   // kept if a later step fails, so Save does not add it twice
        }
        // 2. the purchase order
        setSaving('ips.stepOrder');
        order = await api('/pharmacy/purchase-orders', {
          method: 'POST',
          body: {
            supplier_id: head.supplier_id, po_date: head.date, round_off: roundOn, disc_percent: 0,
            details: [head.details.trim(), `${t('menu.threeInOne')} · ${t('ips.billNo')}: ${head.bill_no.trim().toUpperCase()}`].filter(Boolean).join('\n'),
            lines: lines.map((r) => ({
              item_id: ids.get(r.key), mrp: r.mrp, p_rate: r.p_rate, disc_percent: r.disc || 0,
              qty: r.qty, free_qty: r.free || 0, ...splitGst(r.gst),
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
          lines: lines.map((r, n) => ({
            po_item_id: order.lines[n].id, qty: r.qty, free_qty: r.free || 0, batch_no: r.batch.trim().toUpperCase(),
            mfg_date: mmyyToMonth(r.mfg), exp_date: mmyyToMonth(r.exp), disc_percent: r.s_disc || 0,
          })),
        },
      });
      toast([t('ips.saved', { po: order.po_no, si: si.si_no }), newItems ? t('ips.savedNew', { n: newItems }) : ''].filter(Boolean).join(' · '));
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
      aria-label={props.label} placeholder={props.placeholder} inputMode={props.inputMode} maxLength={props.maxLength}
      type={props.type || 'text'} min={props.type === 'number' ? '0' : undefined} step={props.type === 'number' ? '0.01' : undefined}
      onChange={(e) => (props.onValue ? props.onValue(e.target.value) : setRow(r.key, { [field]: props.mmyy ? typeMMYY(e.target.value) : e.target.value }))} />
  );
  const numBox = (r, field, label, extra = {}) => box(r, field, { type: 'number', inputMode: 'decimal', label, ...extra, className: `text-right no-spin ${extra.className || ''}` });
  const priceBox = (r, field, label, extra = {}) => numBox(r, field, label, { ...extra, onValue: (v) => setPrice(r, field, v) });
  const monthBox = (r, field, label) => box(r, field, { mmyy: true, inputMode: 'numeric', placeholder: 'MM/YY', label, className: 'text-center' });
  const status = (r, used) => (used && compact(r.name) ? (
    r.item_id
      ? <span className="block px-1.5 text-10 text-ink-400">{t('ips.inList', { code: r.item_code || r.item_id })}</span>
      : <span className="flex items-center gap-1 px-1.5 text-10 font-semibold text-violet-600"><Sparkles size={11} /> {t('ips.newItem')}</span>
  ) : null);
  const arrow = showDetails ? <ChevronLeft size={15} /> : <ChevronRight size={15} />;

  // The grid's columns: [group, id, heading, width px, cell]. `main` columns stay when their group is closed.
  const COLUMNS = [
    { g: 'item', id: 'generic', head: 'items.generic', w: 120, td: ({ r, detail }) => box(r, 'generic', { disabled: detail, label: t('items.generic'), maxLength: 150 }) },
    { g: 'item', id: 'manufacturer', head: 'items.manufacturer', w: 120, td: ({ r, detail }) => box(r, 'manufacturer', { disabled: detail, label: t('items.manufacturer'), maxLength: 150 }) },
    { g: 'item', id: 'hsn', head: 'items.hsn', w: 90, td: ({ r, detail }) => box(r, 'hsn', { disabled: detail, label: t('items.hsn'), className: 'uppercase', maxLength: 20 }) },
    { g: 'item', id: 'category', head: 'items.category', w: 110, td: ({ r, detail }) => box(r, 'category', { disabled: detail, label: t('items.category'), maxLength: 100 }) },
    { g: 'item', id: 'pack', head: 'items.pack', w: 70, td: ({ r, detail }) => box(r, 'pack', { disabled: detail, label: t('items.pack'), maxLength: 50 }) },
    { g: 'item', id: 'unit', head: 'purchase.unit', w: 60, td: ({ r, detail }) => box(r, 'unit', { disabled: detail, label: t('purchase.unit'), className: 'text-center', maxLength: 30 }) },
    { g: 'item', id: 'rack', head: 'items.rack', w: 60, td: ({ r, detail }) => box(r, 'rack', { disabled: detail, label: t('items.rack'), maxLength: 50 }) },
    { g: 'purchase', id: 'mrp', main: true, head: 'items.mrp', w: 85, td: ({ r, bad }) => priceBox(r, 'mrp', t('items.mrp'), { disabled: locked, className: bad('ips.lineMrp') }) },
    { g: 'purchase', id: 'old', head: 'purchase.oldPrice', w: 80, ro: true, td: ({ oldPrice }) => (oldPrice == null ? '' : money(oldPrice)) },
    { g: 'purchase', id: 'disc', main: true, head: 'purchase.disc', w: 65, td: ({ r, bad }) => priceBox(r, 'disc', t('purchase.disc'), { disabled: locked, className: bad('ips.lineDisc') }) },
    { g: 'purchase', id: 'p_rate', main: true, head: 'purchase.pRate', w: 85, td: ({ r, bad }) => priceBox(r, 'p_rate', t('purchase.pRate'), { disabled: locked, className: `${bad('ips.lineRate')} ${bad('ips.lineOverMrp')}` }) },
    { g: 'purchase', id: 'qty', main: true, head: 'sale.qty', w: 65, td: ({ r, bad }) => numBox(r, 'qty', t('sale.qty'), { disabled: locked, className: bad('ips.lineQty') }) },
    { g: 'purchase', id: 'free', head: 'purchase.free', w: 60, td: ({ r }) => numBox(r, 'free', t('purchase.free'), { disabled: locked }) },
    { g: 'purchase', id: 'amount', head: 'purchase.amount', w: 95, ro: true, td: ({ used, calc }) => (used ? money(calc.amount) : '') },
    { g: 'purchase', id: 'gst', main: true, head: 'purchase.gst', w: 60, td: ({ r, bad }) => numBox(r, 'gst', t('purchase.gst'), { disabled: locked, className: bad('ips.lineGst') }) },
    { g: 'purchase', id: 'gstAmt', head: 'purchase.gstAmount', w: 90, ro: true, td: ({ used, calc }) => (used ? money(calc.gst_amount) : '') },
    { g: 'purchase', id: 'total', main: true, head: 'purchase.total', w: 100, ro: true, className: 'font-semibold text-ink-800', td: ({ used, calc }) => (used ? money(calc.total) : '') },
    { g: 'stock', id: 'batch', main: true, head: 'stockin.batch', w: 110, td: ({ r, bad }) => box(r, 'batch', { label: t('stockin.batch'), className: `uppercase ${bad('ips.lineBatch')}`, maxLength: 50 }) },
    { g: 'stock', id: 'mfg', head: 'stockin.mfg', w: 75, td: ({ r }) => monthBox(r, 'mfg', t('stockin.mfg')) },
    { g: 'stock', id: 'exp', main: true, head: 'stockin.exp', w: 75, td: ({ r }) => monthBox(r, 'exp', t('stockin.exp')) },
    { g: 'stock', id: 's_disc', head: 'stockin.sDisc', w: 65, td: ({ r, bad }) => numBox(r, 's_disc', t('stockin.sDisc'), { className: bad('ips.lineSDisc') }) },
    { g: 'stock', id: 'sel', head: 'stockin.sel', w: 85, ro: true, td: ({ r }) => (num(r.mrp) ? selAmount({ mrp: r.mrp, disc_percent: r.s_disc }).toFixed(2) : '') },
  ];
  const cols = useGridColumns('pharmacy.ips', [{ id: 'name', w: 220 }, ...COLUMNS],
    Object.fromEntries(COLUMNS.filter((c) => c.g === 'item').map((c) => [c.id, true])));
  const shown = COLUMNS.filter((c) => !cols.isHidden(c.id));
  const groupOpen = (g) => COLUMNS.filter((c) => c.g === g).every((c) => !cols.isHidden(c.id));
  // the group arrow: open → hide all but the group's main columns; anything hidden → show all of the group
  const toggleGroup = (g) => cols.setGroup(g, !groupOpen(g));
  const emptyGroups = GROUPS.filter((g) => !shown.some((c) => c.g === g.id)).length;
  const tableWidth = 32 + cols.widthOf('name') + shown.reduce((sum, c) => sum + cols.widthOf(c.id), 0) + emptyGroups * 32 + 64;
  const resizeTitle = t('grid.resize');

  return (
    <div className="card max-md:!px-3">
      <form onSubmit={submit} noValidate>
        <CardHeader icon={Layers} title={t('menu.threeInOne')} subtitle={<span className="hidden md:inline">{t('ips.hint')}</span>}
          actions={(
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" disabled={locked || !!saving} title={t('ips.scanHint')} onClick={() => setScanOpen(true)}>
                <ScanLine size={16} /> {t('ips.scan')}
              </button>
              <button type="button" className="btn-secondary hidden md:inline-flex" onClick={() => navigate('/pharmacy/stock-in-list')}>
                <List size={16} /> {t('ips.stockInList')}
              </button>
            </div>
          )} />

        {savedOrder && <Note tone="warning" className="mb-3">{t('ips.orderSaved', { po: savedOrder.po_no })}</Note>}

        <div className={`grid grid-cols-1 gap-3 ${showDetails ? 'md:grid-cols-[minmax(14rem,3fr)_minmax(9rem,1fr)_minmax(10rem,1fr)_minmax(14rem,3fr)]' : 'md:grid-cols-[minmax(14rem,3fr)_minmax(9rem,1fr)_minmax(10rem,1fr)_auto]'}`}>
          <VendorPicker label={t('purchase.vendor')} required vendors={vendorRows} value={head.supplier_id}
            onPick={(v) => !locked && chooseVendor(v)} onAdd={locked ? undefined : (name) => setNewVendor({ name, address: '', mobile: '' })}
            addon={(
              <button type="button" className={`btn-secondary !p-1.5 ${showDetails ? '!border-brand-200 !bg-brand-50 !text-brand-700' : ''}`} aria-expanded={showDetails}
                title={showDetails ? t('purchase.hideVendorDetails') : t('purchase.showVendorDetails')}
                aria-label={showDetails ? t('purchase.hideVendorDetails') : t('purchase.showVendorDetails')}
                onClick={() => setShowDetails(!showDetails)}>
                {arrow}
              </button>
            )} />
          <div>
            <label className="label">{t('purchase.date')} *</label>
            <input className="input" type="date" max={todayLocal()} disabled={locked} value={head.date} onChange={(e) => setHead((h) => ({ ...h, date: e.target.value }))} />
          </div>
          <div>
            <label className="label">{t('ips.billNo')} *</label>
            <input className={`input uppercase ${billUsed ? '!border-red-400 focus:!ring-red-200' : ''}`} maxLength={50} value={head.bill_no} placeholder={t('ips.billNoPh')}
              aria-invalid={billUsed ? true : undefined}
              onChange={(e) => setHead((h) => ({ ...h, bill_no: e.target.value.toUpperCase() }))} />
            {billUsed && <p className="mt-1 text-11 font-medium text-red-600">{billUsedText}</p>}
          </div>
          {showDetails ? (
            <div>
              <label className="label">{t('purchase.details')}</label>
              <textarea className="input text-12" rows={4} maxLength={900} disabled={locked} value={head.details} placeholder={t('ips.vendorDetailsPh')}
                onChange={(e) => setHead((h) => ({ ...h, details: e.target.value }))} />
            </div>
          ) : (
            <p className="self-end pb-2 text-12 text-ink-500">
              {t('ips.lineCount', { n: usedRows.length })}{newCount ? ` · ${t('ips.newCount', { n: newCount })}` : ''}
            </p>
          )}
        </div>

        <NewVendorBox vendor={newVendor} setVendor={setNewVendor} onSaved={(v) => { setAdded((a) => [...a, v]); chooseVendor(v); }} />
        {saving && <Note className="mt-3">{t(saving)}</Note>}

        {/* Disc % on all lines (every size), then the grid's Columns menu (wide screens) */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-1.5 text-13 text-ink-600" title={t('ips.discAllHint')}>
            {t('ips.discAll')}
            <input type="number" min="0" max="100" step="0.01" inputMode="decimal" disabled={locked} value={allDisc} placeholder="0"
              className={`input no-spin !h-8 !w-16 !py-0 text-right ${allDiscBad ? GRID_BAD : ''}`} aria-label={t('ips.discAll')}
              onChange={(e) => discAll(e.target.value)} />
          </label>
          <div className="hidden items-center gap-3 md:flex">
            <ColumnsMenu groups={GROUPS.map((g) => ({ id: g.id, label: t(g.label) }))} cols={cols}
              columns={COLUMNS.map((c) => ({ id: c.id, g: c.g, label: t(c.head) }))}
              labels={{ button: t('grid.columns'), hidden: t('grid.hiddenN'), hint: t('grid.hint'), showAll: t('grid.showAll'), resetWidths: t('grid.resetWidths') }} />
            <span className="text-11 text-ink-400">{t('grid.dragHint')}</span>
          </div>
        </div>

        {/* Phones: one card per line */}
        <div className="mt-3 space-y-2.5 md:hidden">
          {view.map(({ r, used, problem, calc }, n) => {
            const field = (f, label, extra = {}) => (
              <CardField label={label}>
                <input className={`${cardBox} no-spin ${extra.bad ? cardBad : ''}`} value={r[f]} disabled={extra.disabled}
                  type={extra.mmyy || extra.text ? 'text' : 'number'} inputMode={extra.mmyy ? 'numeric' : extra.text ? undefined : 'decimal'}
                  placeholder={extra.mmyy ? 'MM/YY' : extra.placeholder}
                  onChange={(e) => (extra.price ? setPrice(r, f, e.target.value) : setRow(r.key, { [f]: extra.mmyy ? typeMMYY(e.target.value) : e.target.value }))} />
              </CardField>
            );
            const detail = !!r.item_id || locked;
            return (
              <ItemCard key={r.key} no={n + 1} bad={!!problem}
                title={locked ? r.name : <ItemPicker value={r.name} ariaLabel={t('items.name')} placeholder={t('purchase.itemHint')} onPick={pickItem(r)} />}
                sub={problem ? problemText(problem, n) : (used && compact(r.name) ? (r.item_id ? t('ips.inList', { code: r.item_code || r.item_id }) : t('ips.newItem')) : '')}
                tag={calc.total ? money(calc.total) : undefined}>
                {!detail && (
                  <div className="grid grid-cols-2 gap-1.5">
                    {field('generic', t('items.generic'), { text: true })}
                    {field('manufacturer', t('items.manufacturer'), { text: true })}
                    {field('hsn', t('items.hsn'), { text: true })}
                    {field('category', t('items.category'), { text: true })}
                    {field('pack', t('items.pack'), { text: true })}
                    {field('unit', t('purchase.unit'), { text: true })}
                    {field('rack', t('items.rack'), { text: true })}
                  </div>
                )}
                <div className="grid grid-cols-3 gap-1.5">
                  {field('mrp', t('items.mrp'), { disabled: locked, price: true })}
                  {field('disc', t('purchase.disc'), { disabled: locked, price: true })}
                  {field('p_rate', t('purchase.pRate'), { disabled: locked, price: true, bad: num(r.p_rate) > num(r.mrp) && num(r.mrp) > 0 })}
                  {field('qty', t('sale.qty'), { disabled: locked })}
                  {field('free', t('purchase.free'), { disabled: locked })}
                  {field('gst', t('purchase.gst'), { disabled: locked })}
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {field('batch', t('stockin.batch'), { text: true })}
                  {field('mfg', t('stockin.mfg'), { mmyy: true })}
                  {field('exp', t('stockin.exp'), { mmyy: true })}
                  {field('s_disc', t('stockin.sDisc'))}
                </div>
                <div className="flex items-center justify-between">
                  <CardField label={t('stockin.sel')}><CardValue>{selAmount({ mrp: r.mrp, disc_percent: r.s_disc }).toFixed(2)}</CardValue></CardField>
                  {!locked && <RowAction icon={Trash2} tone="danger" title={t('ips.removeRow')} onClick={() => removeRow(r.key)} />}
                </div>
              </ItemCard>
            );
          })}
          {!locked && <button type="button" className="btn-secondary w-full" onClick={() => setRows((rs) => [...rs, fresh()])}><Plus size={16} /> {t('ips.addRow')}</button>}
        </div>

        {/* Wide screens: the grid, columns grouped as on the Item, Purchase / Order and Stock In screens; each group opens /
            closes with the arrow in its heading (closed: only its main columns). It scrolls in its own box with the
            headings on top and # / Item Name on the left. */}
        <div className="mt-2 hidden max-h-[65vh] overflow-auto rounded-lg border border-ink-200 md:block">
          <table className="table-fixed border-separate border-spacing-0 text-left text-12" style={{ width: tableWidth, minWidth: '100%' }}>
            {/* each column's width (a fixed table takes them from here, not from the merged group headings) */}
            <colgroup>
              <col style={{ width: 32 }} />
              <col style={{ width: cols.widthOf('name') }} />
              {GROUPS.map((g) => {
                const inGroup = shown.filter((c) => c.g === g.id);
                return inGroup.length ? inGroup.map((c) => <col key={c.id} style={{ width: cols.widthOf(c.id) }} />) : <col key={g.id} style={{ width: 32 }} />;
              })}
              <col style={{ width: 64 }} />
            </colgroup>
            <thead className="sticky top-0 z-20">
              <tr>
                <th className={`${grp} ${freeze0} z-30 bg-ink-50 text-ink-500`} rowSpan={2}>#</th>
                <th className={`${grp} ${freeze1} z-30 bg-violet-50 !text-left text-violet-700`} rowSpan={2} style={{ width: cols.widthOf('name') }}>
                  {t('items.name')}
                  <ResizeHandle title={resizeTitle} {...cols.handle('name')} />
                </th>
                {GROUPS.map((g) => {
                  const isOpen = groupOpen(g.id);
                  const inGroup = shown.filter((c) => c.g === g.id);
                  const hidden = COLUMNS.filter((c) => c.g === g.id).length - inGroup.length;
                  return (
                    <th key={g.id} colSpan={Math.max(inGroup.length, 1)} className={`${grp} ${g.tone} !p-0`}>
                      <button type="button" className="flex w-full items-center justify-center gap-1.5 px-1 py-1 hover:brightness-95" aria-expanded={isOpen}
                        title={isOpen ? t('ips.groupClose') : t('ips.groupOpen', { n: hidden })} onClick={() => toggleGroup(g.id)}>
                        {isOpen ? <ChevronsLeft size={14} /> : <ChevronsRight size={14} />}
                        {t(g.label)}
                        {!isOpen && hidden > 0 && <span className="rounded-full bg-white/70 px-1.5 text-10 normal-case tracking-normal">+{hidden}</span>}
                      </button>
                    </th>
                  );
                })}
                <th className={`${grp} bg-ink-50`} rowSpan={2} />
              </tr>
              <tr className="font-bold">
                {GROUPS.map((g) => {
                  const inGroup = shown.filter((c) => c.g === g.id);
                  if (!inGroup.length) {
                    return <th key={g.id} className={`${hd} w-8 ${g.tone}`} title={t('ips.groupOpen', { n: COLUMNS.filter((c) => c.g === g.id).length })}>…</th>;
                  }
                  return inGroup.map((c) => (
                    <th key={c.id} className={`${hd} ${g.tone} relative`} style={{ width: cols.widthOf(c.id) }}>
                      {t(c.head)}
                      <ResizeHandle title={resizeTitle} {...cols.handle(c.id)} />
                    </th>
                  ));
                })}
              </tr>
            </thead>
            <tbody onKeyDown={arrowMove}>
              {view.map((v, n) => {
                const { r, used, problem } = v;
                const bg = problem ? 'bg-red-50' : 'bg-white';
                const ctx = {
                  ...v,
                  detail: !!r.item_id || locked,   // an existing item's details come from the Item List
                  bad: (key) => (problem?.[0] === key ? GRID_BAD : ''),
                  oldPrice: r.item_id && head.supplier_id ? Number(oldPrices.data?.[r.item_id] || 0) : null,
                };
                return (
                  <tr key={r.key} className={bg} title={problem ? problemText(problem, n) : undefined}>
                    <td className={`${cell} ${freeze0} ${bg} text-center text-ink-400`}>{n + 1}</td>
                    <td data-col="name" className={`${cell} ${freeze1} ${bg}`}>
                      {locked ? <span className="block px-1.5 py-1">{r.name}</span> : (
                        <ItemPicker inputClass={`${GRID_INPUT} ${ctx.bad('ips.lineName')} ${ctx.bad('ips.lineRepeat')}`} value={r.name} ariaLabel={t('items.name')} placeholder={t('purchase.itemHint')} onPick={pickItem(r)} />
                      )}
                      {status(r, used)}
                      {problem && <span className="block px-1.5 text-10 text-red-600">{problemText(problem, n)}</span>}
                    </td>
                    {GROUPS.map((g) => {
                      const inGroup = shown.filter((c) => c.g === g.id);
                      if (!inGroup.length) return <td key={g.id} className={`${cell} text-center text-ink-300`}>…</td>;
                      return inGroup.map((c) => <td key={c.id} data-col={c.id} className={`${cell} ${c.ro ? ro : ''} ${c.className || ''}`}>{c.td(ctx)}</td>);
                    })}
                    <td className={`${cell} whitespace-nowrap text-center`}>
                      {!locked && (
                        <>
                          <RowAction icon={Plus} title={t('ips.addRowBelow')} onClick={() => addRowAfter(r.key)} />
                          <RowAction icon={Trash2} tone="danger" title={t('ips.removeRow')} onClick={() => removeRow(r.key)} />
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4 text-13 text-ink-600">
            <span>{t('purchase.sumTotal')} <b className="tabular-nums text-ink-800">{money(sum)}</b></span>
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked={roundOn} disabled={locked} onChange={(e) => setRoundOn(e.target.checked)} /> {t('sale.roundOff')}
              <span className={`tabular-nums ${roundOff < 0 ? 'text-red-600' : ''}`}>{roundOff > 0 ? '+' : ''}{money(roundOff)}</span>
            </label>
            <span>{t('ips.netAmount')} <b className="tabular-nums text-brand-800">{money(net.net)}</b></span>
            {!locked && <button type="button" className="btn-ghost !px-2 !py-1 text-13 max-md:hidden" onClick={() => setRows((rs) => [...rs, fresh()])}><Plus size={15} /> {t('ips.addRow')}</button>}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary px-2 sm:px-4" onClick={reset} disabled={!!saving}><X size={16} /> {locked ? t('ips.startOver') : t('ips.clear')}</button>
            <button type="submit" className="btn-primary px-2 sm:px-4" disabled={!!saving}>
              <Save size={16} /> {saving ? t('common.saving') : locked ? t('ips.saveStock') : t('ips.saveAll')}
            </button>
          </div>
        </div>
      </form>
      <ScanBillModal open={scanOpen} onClose={() => setScanOpen(false)} onLines={fromBill} />
    </div>
  );
}
