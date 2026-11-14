// Pharmacy → Purchase / Order → Master: an order to a vendor. Picking an item fills its details, MRP and GST;
// Rate (P.Rate less Disc %), Amount, GST Amount and Total are worked out as you type (shared/purchase.js, same
// as the server). Old Price is this vendor's last net rate for the item; Free units are not charged.
// Wide screens: an editable grid. Phones: one card per item line.
import { useEffect, useState } from 'react';
import { ShoppingCart, Save, Trash2, X, Plus, ListChecks, ChevronLeft, ChevronRight, Store } from 'lucide-react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/i18n.jsx';
import { useAuth } from '../../../lib/auth.jsx';
import { navigate } from '../../../lib/router.jsx';
import { money, todayLocal } from '../../../lib/format.js';
import { CardHeader, ErrorBox, Spinner, GRID_INPUT, GRID_BAD, FORM_ACTIONS, useAsync, useToast } from '../../../components/ui.jsx';
import { CardField, CardValue, ItemCard, cardBox, cardBad } from '../../../components/MobileCard.jsx';
import ItemPicker from '../../../components/ItemPicker.jsx';
import ItemBulkPicker from '../../../components/ItemBulkPicker.jsx';
import VendorPicker from '../../../components/VendorPicker.jsx';
import { calcLine, orderTotal, splitGst } from '../../../../../shared/purchase.js';
import { arrowMove, focusNewRow } from '../../../lib/tableKeys.js';

const newLine = () => ({
  key: Math.random().toString(36).slice(2), item_id: null, item_name: '',
  generic_name: '', hsn_code: '', manufacturer: '', category: '', pack: '', unit: '',
  mrp: '', p_rate: '', free_qty: '', disc_percent: '', qty: '', gst: undefined, cgst_percent: '', sgst_percent: '',
});
const fromItem = (i) => ({
  item_id: i.id, item_name: i.name, generic_name: i.generic_name || '', hsn_code: i.hsn_code || '',
  manufacturer: i.manufacturer || '', category: i.category || '', pack: i.pack || '', unit: i.unit || '',
  mrp: Number(i.mrp) || '', p_rate: Number(i.purchase_rate) || '', gst: undefined,
  cgst_percent: Number(i.cgst_percent) || '', sgst_percent: Number(i.sgst_percent) || '',
});
const overMrp = (l) => Number(l.mrp) > 0 && Number(l.p_rate) > Number(l.mrp);
const two = (n) => Number(n || 0).toFixed(2);

/** The vendor's details for the Details box: address, then State – Pin code, phones, e-mail, GSTIN, DL numbers. */
function vendorDetails(v, t) {
  if (!v) return '';
  const place = [v.state, v.pincode].filter(Boolean).join(' – ');
  const phones = [v.phone && `${t('suppliers.phone')}: ${v.phone}`, v.mobile && `${t('suppliers.mobile')}: ${v.mobile}`].filter(Boolean).join(', ');
  const dl = [v.dl_no1, v.dl_no2].filter(Boolean).join(', ');
  return [
    v.address, place, phones,
    v.email && `${t('field.email')}: ${v.email}`,
    v.gstin && `GSTIN: ${v.gstin}`,
    dl && `DL No: ${dl}`,
  ].filter(Boolean).join('\n');
}

// Grid cells (as Ayush ALL IN ONE's Purchase Order): bordered cells, centred brand-tinted headings
const cell = 'border border-ink-200 px-1 py-0.5 break-words';
const hd = 'border border-ink-200 px-0.5 py-1.5 text-center align-middle text-10 xl:text-11 xl:whitespace-nowrap';
const ro = 'px-1.5 text-right tabular-nums text-ink-600';
const opt = 'bg-amber-50 text-amber-900';

export default function PurchaseForm({ params }) {
  const { t } = useT();
  const toast = useToast();
  const { isGlobal: isAdmin } = useAuth();
  const id = params.id;
  const emptyHead = () => ({ supplier_id: '', po_date: todayLocal(), details: '' });
  const [head, setHead] = useState(emptyHead);
  const [lines, setLines] = useState([newLine()]);
  const [saving, setSaving] = useState(false);
  const [showDetails, setShowDetails] = useState(false); // Details box: hidden until the arrow beside Vendor Name is clicked
  const [bulkOpen, setBulkOpen] = useState(false);   // "Bulk add" panel: tick many items at once
  const [showMore, setShowMore] = useState(false);   // Generic Name, Manufacturer, HSN in place of the GST columns
  const existing = useAsync(() => (id ? api(`/pharmacy/purchase-orders/${id}`) : Promise.resolve(null)), [id]);
  const vendors = useAsync(() => api('/pharmacy/vendors', { query: { status: 'active' } }), []);
  const [added, setAdded] = useState([]);           // vendors added here, until the list is loaded again
  const [newVendor, setNewVendor] = useState(null); // "+ Add vendor" form: { name, address, mobile }
  const [addingBusy, setAddingBusy] = useState(false);
  const vendorRows = [...added.filter((a) => !(vendors.data?.rows || []).some((v) => v.id === a.id)), ...(vendors.data?.rows || [])]
    .sort((a, b) => a.name.localeCompare(b.name));
  const chooseVendor = (v) => setHead((h) => ({ ...h, supplier_id: String(v.id), details: vendorDetails(v, t) }));

  // New vendor from this screen: Name, Address and Mobile are all needed
  async function saveVendor() {
    const v = { name: newVendor.name.trim(), address: newVendor.address.trim(), mobile: newVendor.mobile.trim() };
    if (!v.name || !v.address || !v.mobile) { toast(t('purchase.vendorNeeds'), 'error'); return; }
    setAddingBusy(true);
    try {
      const saved = await api('/pharmacy/vendors', { method: 'POST', body: { ...v, status: 'active' } });
      setAdded((a) => [...a, saved]);
      chooseVendor(saved);
      setNewVendor(null);
      toast(t('common.savedX', { x: t('menu.vendor') }));
    } catch (err) {
      toast(err.message || t('common.saveFailed'), 'error');
    } finally {
      setAddingBusy(false);
    }
  }

  useEffect(() => {
    const po = existing.data;
    if (!po) return;
    setHead({ supplier_id: String(po.supplier_id), po_date: String(po.po_date).slice(0, 10), details: po.details || '' });
    setLines(po.lines.map((l) => ({ ...newLine(), ...l, key: String(l.id), mrp: Number(l.mrp), disc_percent: Number(l.disc_percent) || '',
      p_rate: Number(l.p_rate ?? l.mrp) || '', free_qty: Number(l.free_qty) || '',
      qty: Number(l.qty), cgst_percent: Number(l.cgst_percent) || '', sgst_percent: Number(l.sgst_percent) || '' })));
  }, [existing.data]);

  // Old Price: this vendor's last net rate for each item on the order (0 when never ordered from them)
  const itemIds = [...new Set(lines.filter((l) => l.item_id).map((l) => l.item_id))].sort((a, b) => a - b).join(',');
  const oldPrices = useAsync(
    () => (head.supplier_id && itemIds
      ? api('/pharmacy/purchase-orders/old-prices', { query: { supplier_id: head.supplier_id, item_ids: itemIds, except: id || '' } })
      : Promise.resolve({})),
    [head.supplier_id, itemIds],
  );

  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  // + on a row adds a new empty line right under it
  const addLineAfter = (key) => setLines((ls) => ls.flatMap((l) => (l.key === key ? [l, newLine()] : [l])));
  const removeLine = (key) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : [newLine()]));
  const pickItem = (l) => ({ item, medicine_name: typed }) => setLine(l.key, item ? fromItem(item) : { ...newLine(), key: l.key, item_name: typed });

  function validate() {
    if (!head.supplier_id) return t('purchase.chooseVendor');
    if (!head.po_date) return t('common.isRequired', { field: t('purchase.date') });
    if (!lines.some((l) => l.item_id)) return t('common.isRequired', { field: t('items.name') });
    const bad = lines.find((l) => l.item_id && overMrp(l));
    if (bad) return t('purchase.rateOverMrp', { name: bad.item_name });
    return null;
  }

  async function submit(e) {
    e.preventDefault();
    const problem = validate();
    if (problem) return toast(problem, 'error');
    setSaving(true);
    const body = {
      ...head,
      lines: lines.filter((l) => l.item_id).map(({ item_id, mrp, p_rate, free_qty, disc_percent, qty, cgst_percent, sgst_percent }) =>
        ({ item_id, mrp, p_rate, free_qty, disc_percent, qty, cgst_percent, sgst_percent })),
    };
    try {
      const po = id ? await api(`/pharmacy/purchase-orders/${id}`, { method: 'PUT', body }) : await api('/pharmacy/purchase-orders', { method: 'POST', body });
      toast(t('purchase.saved', { no: po.po_no }));
      if (id) navigate('/pharmacy/purchase-order-list');
      else reset();
    } catch (err) {
      toast(err.message || t('common.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
    return undefined;
  }

  async function remove() {
    if (!id || !window.confirm(t('purchase.deleteConfirm', { no: existing.data.po_no }))) return;
    try {
      await api(`/pharmacy/purchase-orders/${id}`, { method: 'DELETE' });
      toast(t('purchase.deleted', { no: existing.data.po_no }));
      navigate('/pharmacy/purchase-order-list');
    } catch (err) {
      toast(err.message || t('common.deleteFailed'), 'error');
    }
  }

  const reset = () => { setHead(emptyHead()); setLines([newLine()]); setNewVendor(null); };

  if (id && existing.loading) return <div className="card"><Spinner /></div>;
  if (existing.error) return <div className="card"><ErrorBox error={existing.error} onRetry={existing.reload} /></div>;
  const num = { type: 'number', min: '0', step: '0.01', inputMode: 'decimal' };
  const box = `${GRID_INPUT} text-right`;
  const picked = lines.filter((l) => l.item_id);
  const oldOf = (l) => (l.item_id && head.supplier_id ? Number(oldPrices.data?.[l.item_id] || 0) : null);
  const arrow = (open) => (open ? <ChevronLeft size={15} /> : <ChevronRight size={15} />);

  return (
    <div className="card max-md:!px-3">
      <form onSubmit={submit} noValidate>
        <CardHeader icon={ShoppingCart}
          title={id ? `${t('purchase.editTitle')} · ${existing.data?.po_no}` : t('purchase.masterTitle')}
          subtitle={<span className="hidden md:inline">{t('purchase.hint')}</span>} />

        <div className={`grid grid-cols-1 gap-3 ${showDetails ? 'md:grid-cols-[minmax(14rem,2fr)_minmax(9rem,1fr)_minmax(14rem,3fr)]' : 'sm:grid-cols-[minmax(14rem,24rem)_minmax(9rem,12rem)]'}`}>
          {/* picking a vendor puts its details into Details (still editable) */}
          <VendorPicker label={t('purchase.vendor')} required vendors={vendorRows} value={head.supplier_id}
            onPick={chooseVendor} onAdd={(name) => setNewVendor({ name, address: '', mobile: '' })}
            addon={(
              <button type="button" className={`btn-secondary !p-1.5 ${showDetails ? '!border-brand-200 !bg-brand-50 !text-brand-700' : ''}`} aria-expanded={showDetails}
                title={showDetails ? t('purchase.hideVendorDetails') : t('purchase.showVendorDetails')}
                aria-label={showDetails ? t('purchase.hideVendorDetails') : t('purchase.showVendorDetails')}
                onClick={() => setShowDetails(!showDetails)}>
                {arrow(showDetails)}
              </button>
            )} />
          <div>
            <label className="label">{t('purchase.date')} *</label>
            <input className="input" type="date" value={head.po_date} onChange={(e) => setHead({ ...head, po_date: e.target.value })} />
          </div>
          {showDetails && (
            <div>
              <label className="label">{t('purchase.details')}</label>
              <textarea className="input" rows={4} maxLength={1000} value={head.details} onChange={(e) => setHead({ ...head, details: e.target.value })} />
            </div>
          )}
        </div>

        {newVendor && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-13 font-bold text-amber-800"><Store size={15} /> {t('suppliers.newVendor')}</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1.5fr_1fr_auto] md:items-end">
              <div>
                <label className="label">{t('suppliers.name')} *</label>
                <input className="input" autoFocus maxLength={150} placeholder="e.g. Sri Murugan Medicals" value={newVendor.name} onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })} />
              </div>
              <div>
                <label className="label">{t('field.address')} *</label>
                <textarea className="input" rows={1} maxLength={500} placeholder="Vendor address" value={newVendor.address} onChange={(e) => setNewVendor({ ...newVendor, address: e.target.value })} />
              </div>
              <div>
                <label className="label">{t('suppliers.mobile')} *</label>
                <input className="input" type="tel" inputMode="numeric" maxLength={20} placeholder="e.g. 98765 43210" value={newVendor.mobile} onChange={(e) => setNewVendor({ ...newVendor, mobile: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2 md:flex">
                <button type="button" className="btn-secondary" onClick={() => setNewVendor(null)} disabled={addingBusy}><X size={16} /> {t('common.cancel')}</button>
                <button type="button" className="btn-primary" onClick={saveVendor} disabled={addingBusy}><Save size={16} /> {addingBusy ? t('common.saving') : t('purchase.saveVendor')}</button>
              </div>
            </div>
          </div>
        )}

        <div className="mb-2 mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className={`btn-secondary !px-3 !py-1 !text-13 ${bulkOpen ? '!border-brand-200 !bg-brand-50 !text-brand-700' : ''}`} aria-expanded={bulkOpen} onClick={() => setBulkOpen(!bulkOpen)}>
            <ListChecks size={16} /> {t('bulkAdd.button')}
          </button>
          <span className="text-12 text-ink-400">{t('purchase.lineCount', { n: picked.length })}</span>
        </div>
        {bulkOpen && (
          <ItemBulkPicker exclude={lines.filter((l) => l.item_id).map((l) => l.item_id)} onClose={() => setBulkOpen(false)}
            onAdd={(items) => {
              // ticked items become rows (MRP / GST filled in), after the rows already chosen; empty rows go
              setLines((ls) => [...ls.filter((l) => l.item_id), ...items.map((i) => ({ ...newLine(), ...fromItem(i) }))]);
              toast(t('bulkAdd.added', { n: items.length }));
            }} />
        )}

        {/* Phones: one card per line */}
        <div className="space-y-2.5 md:hidden">
          {lines.map((l, n) => {
            const c = calcLine(l);
            const old = oldOf(l);
            const bad = overMrp(l);
            const numBox = (label, key, extra = {}) => (
              <CardField label={label}>
                <input {...num} className={`${cardBox} no-spin ${extra.bad ? cardBad : ''}`} value={extra.value ?? l[key]} disabled={!l.item_id}
                  onChange={(e) => setLine(l.key, extra.onChange ? extra.onChange(e.target.value) : { [key]: e.target.value })} />
              </CardField>
            );
            return (
              <ItemCard key={l.key} no={n + 1} bad={bad}
                title={<ItemPicker browse value={l.item_name} ariaLabel={t('items.name')} placeholder={t('purchase.itemHint')} onPick={pickItem(l)} />}
                sub={l.item_id ? [l.category, l.pack, l.unit].filter(Boolean).join(' · ') : ''}>
                {l.item_id && (
                  <>
                    <div className="grid grid-cols-5 gap-1.5">
                      {numBox(t('items.mrp'), 'mrp')}
                      <CardField label={t('purchase.oldPrice')}><CardValue className="!bg-amber-50 text-amber-800">{old == null ? '-' : two(old)}</CardValue></CardField>
                      {numBox(t('purchase.disc'), 'disc_percent')}
                      {numBox(t('purchase.pRate'), 'p_rate', { bad })}
                      {numBox(t('items.quantity'), 'qty')}
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {numBox(t('purchase.free'), 'free_qty')}
                      {numBox(t('purchase.gst'), 'gst', { value: l.gst ?? (c.gst_percent || ''), onChange: (v) => ({ gst: v, ...splitGst(v) }) })}
                      <CardField label={t('purchase.amount')}><CardValue>{two(c.amount)}</CardValue></CardField>
                      <CardField label={t('purchase.gstAmount')}><CardValue>{two(c.gst_amount)}</CardValue></CardField>
                      <CardField label={t('purchase.total')}><CardValue className="!bg-brand-50 font-bold text-brand-800">{two(c.total)}</CardValue></CardField>
                    </div>
                    {bad && <p className="rounded-md bg-red-50 px-2 py-1 text-11 text-red-600">{t('purchase.rateOverMrp', { name: l.item_name })}</p>}
                  </>
                )}
                <div className="flex justify-end gap-1.5">
                  <button type="button" className="btn-secondary !px-2.5 !py-1 !text-12 hover:!text-red-600" onClick={() => removeLine(l.key)}><Trash2 size={14} /> {t('common.remove')}</button>
                </div>
              </ItemCard>
            );
          })}
          <button type="button" className="btn-secondary w-full border-dashed" onClick={() => setLines((ls) => [...ls, newLine()])}><Plus size={16} /> {t('purchase.addLine')}</button>
          <div className="flex items-center justify-between rounded-xl bg-brand-600 px-3 py-1.5 text-white shadow-sm">
            <span className="text-13 font-semibold">{t('purchase.sumTotal')}</span>
            <span className="text-15 font-bold tabular-nums">{money(orderTotal(picked))}</span>
          </div>
        </div>

        {/* Wide screens: the editable grid */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1000px] table-fixed border-collapse text-left text-13">
            <thead>
              <tr className="bg-brand-50 text-11 font-bold leading-tight text-brand-700">
                <th className={`${hd} w-[2.5%]`}>#</th>
                <th className={`${hd} w-[14%] !text-left`}>
                  <span className="flex items-center justify-between gap-1 px-1">
                    <span>{t('items.name')}</span>
                    <button type="button" className={`rounded p-0.5 ${showMore ? 'bg-amber-100 text-amber-700' : 'text-brand-600 hover:bg-brand-100'}`} aria-expanded={showMore}
                      title={showMore ? t('purchase.hideDetails') : t('purchase.showDetails')}
                      aria-label={showMore ? t('purchase.hideDetails') : t('purchase.showDetails')}
                      onClick={() => setShowMore(!showMore)}>
                      {arrow(showMore)}
                    </button>
                  </span>
                </th>
                <th className={`${hd} w-[6.5%]`}>{t('items.category')}</th>
                <th className={`${hd} w-[5%]`}>{t('items.pack')}</th>
                <th className={`${hd} w-[4.5%]`}>{t('purchase.unit')}</th>
                <th className={`${hd} w-[6%]`}>{t('items.mrp')}</th>
                <th className={`${hd} w-[5.5%]`}>{t('purchase.oldPrice')}</th>
                <th className={`${hd} w-[6%]`}>{t('purchase.pRate')}</th>
                <th className={`${hd} w-[4.5%]`}>{t('purchase.free')}</th>
                <th className={`${hd} w-[4.5%]`}>{t('purchase.disc')}</th>
                <th className={`${hd} w-[5%]`}>{t('items.quantity')}</th>
                <th className={`${hd} w-[6.5%]`}>{t('purchase.amount')}</th>
                {showMore ? (
                  <>
                    <th className={`${hd} ${opt} w-[7.5%]`}>{t('items.generic')}</th>
                    <th className={`${hd} ${opt} w-[7.5%]`}>{t('items.manufacturer')}</th>
                    <th className={`${hd} ${opt} w-[4%]`}>{t('items.hsn')}</th>
                  </>
                ) : (
                  <>
                    <th className={`${hd} w-[4.5%]`}>{t('purchase.gst')}</th>
                    <th className={`${hd} w-[4.5%]`}>{t('items.cgst')}</th>
                    <th className={`${hd} w-[4.5%]`}>{t('items.sgst')}</th>
                    <th className={`${hd} w-[5.5%]`}>{t('purchase.gstAmount')}</th>
                  </>
                )}
                <th className={`${hd} w-[6.5%]`}>{t('purchase.total')}</th>
                <th className={`${hd} w-[4.5%]`} aria-label={t('common.delete')} />
              </tr>
            </thead>
            <tbody onKeyDown={arrowMove}>
              {lines.map((l, n) => {
                const c = calcLine(l);
                const old = oldOf(l);
                return (
                  <tr key={l.key} className="hover:bg-brand-50/30">
                    <td className={`${cell} text-center text-ink-400`}>{n + 1}</td>
                    <td className={cell}>
                      <ItemPicker browse inputClass={GRID_INPUT} value={l.item_name} ariaLabel={t('items.name')} placeholder={t('purchase.itemHint')} onPick={pickItem(l)} />
                    </td>
                    <td className={`${cell} text-12 text-ink-500`}>{l.category || '-'}</td>
                    <td className={`${cell} text-12 text-ink-500`}>{l.pack || '-'}</td>
                    <td className={`${cell} text-12 text-ink-500`}>{l.unit || '-'}</td>
                    <td className={cell}><input {...num} className={box} aria-label={t('items.mrp')} value={l.mrp} onChange={(e) => setLine(l.key, { mrp: e.target.value })} /></td>
                    <td className={`${cell} ${ro} bg-amber-50/40`}>{old == null ? '-' : two(old)}</td>
                    <td className={cell} title={overMrp(l) ? t('purchase.rateOverMrp', { name: l.item_name }) : undefined}>
                      <input {...num} className={`${box} ${overMrp(l) ? GRID_BAD : ''}`} aria-label={t('purchase.pRate')} value={l.p_rate} onChange={(e) => setLine(l.key, { p_rate: e.target.value })} />
                    </td>
                    <td className={cell}><input {...num} className={box} aria-label={t('purchase.free')} value={l.free_qty} onChange={(e) => setLine(l.key, { free_qty: e.target.value })} /></td>
                    <td className={cell}><input {...num} max="100" className={box} aria-label={t('purchase.disc')} value={l.disc_percent} onChange={(e) => setLine(l.key, { disc_percent: e.target.value })} /></td>
                    <td className={cell}><input {...num} className={box} aria-label={t('items.quantity')} value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} /></td>
                    <td className={`${cell} ${ro}`}>{two(c.amount)}</td>
                    {showMore ? (
                      <>
                        <td className={`${cell} ${opt} text-12`}>{l.generic_name || '-'}</td>
                        <td className={`${cell} ${opt} text-12`}>{l.manufacturer || '-'}</td>
                        <td className={`${cell} ${opt} text-12`}>{l.hsn_code || '-'}</td>
                      </>
                    ) : (
                      <>
                        {/* GST % splits itself evenly into CGST % and SGST % */}
                        <td className={cell}><input {...num} max="28" className={box} aria-label={t('purchase.gst')} value={l.gst ?? (c.gst_percent || '')}
                          onChange={(e) => setLine(l.key, { gst: e.target.value, ...splitGst(e.target.value) })} /></td>
                        <td className={cell}><input {...num} max="14" className={box} aria-label={t('items.cgst')} value={l.cgst_percent}
                          onChange={(e) => setLine(l.key, { cgst_percent: e.target.value, gst: undefined })} /></td>
                        <td className={cell}><input {...num} max="14" className={box} aria-label={t('items.sgst')} value={l.sgst_percent}
                          onChange={(e) => setLine(l.key, { sgst_percent: e.target.value, gst: undefined })} /></td>
                        <td className={`${cell} ${ro}`}>{two(c.gst_amount)}</td>
                      </>
                    )}
                    <td className={`${cell} ${ro} font-semibold text-ink-800`}>{two(c.total)}</td>
                    <td className={`${cell} text-center`}>
                      <span className="inline-flex">
                        <button type="button" className="btn-ghost !p-1 text-brand-600" title={t('purchase.addLine')} aria-label={t('purchase.addLine')}
                          onClick={(e) => { addLineAfter(l.key); focusNewRow(e.currentTarget); }}>
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
            <tfoot>
              <tr className="bg-ink-50 font-semibold">
                <td colSpan={showMore ? 15 : 16} className={`${cell} px-2 text-right`}>{t('purchase.sumTotal')}</td>
                <td className={`${cell} ${ro} bg-brand-600 font-bold !text-white`}>{money(orderTotal(picked))}</td>
                <td className={cell} />
              </tr>
            </tfoot>
          </table>
        </div>

        <div className={FORM_ACTIONS}>
          <button type="button" className="btn-secondary px-2 sm:px-4" onClick={() => (id ? navigate('/pharmacy/purchase-order-list') : reset())}><X size={16} /> {t('common.cancel')}</button>
          <button type="button" className="btn-danger px-2 sm:px-4" onClick={remove} disabled={!id || !isAdmin}
            title={!id ? t('common.deleteHint') : isAdmin ? t('common.deleteThis') : t('common.noAccess')}>
            <Trash2 size={16} /> {t('common.delete')}
          </button>
          <button type="submit" className="btn-primary px-2 sm:px-4" disabled={saving}><Save size={16} /> {saving ? t('common.saving') : t('common.save')}</button>
        </div>
      </form>
    </div>
  );
}
