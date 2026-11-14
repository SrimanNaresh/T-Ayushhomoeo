// Pharmacy → Item → Master: add / edit a medicine or item
import { useEffect, useState } from 'react';
import { Package, Save, Trash2, X } from 'lucide-react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/i18n.jsx';
import { navigate } from '../../../lib/router.jsx';
import { CardHeader, ErrorBox, Field, Spinner, GRID_WIDE, GRID_SHORT, FORM_ACTIONS, useAsync, useForm, useToast } from '../../../components/ui.jsx';
import ItemImportButtons from '../../../components/ItemImport.jsx';
import RxListPicker from '../../../components/RxListPicker.jsx';

// Only these fields are on the screen; anything else on an existing item (supplier, purchase rate, …)
// is not sent, so saving keeps its current value.
const EMPTY = {
  name: '', generic_name: '', hsn_code: '', manufacturer: '', unit: '', pack: '', category: '', potency: '',
  mrp: '', cgst_percent: '', sgst_percent: '',
  schedule_h: false, schedule_h1: false, status: 'active', rack: '', box: '',
};
/** The clinic's Generic Name / Manufacturer / Type / Unit / Category / Potency list (+ New, Edit, Delete), replaced locally after a change. */
function useItemList(kind) {
  const loaded = useAsync(() => api(`/visits/${kind}-options`), [kind]);
  const [changed, setChanged] = useState(null);
  return [changed || loaded.data || { rows: [], added: [] }, setChanged];
}

export default function ItemForm({ params }) {
  const { t } = useT();
  const toast = useToast();
  const id = params.id;
  const f = useForm(EMPTY);
  const [saving, setSaving] = useState(false);
  const [qty, setQty] = useState('');            // Quantity: opening stock when adding, current stock when editing
  const existing = useAsync(() => (id ? api(`/pharmacy/item-master/${id}`) : Promise.resolve(null)), [id]);
  const [genericList, setGenericList] = useItemList('generic');
  const [mfrList, setMfrList] = useItemList('manufacturer');
  const [unitList, setUnitList] = useItemList('unit');
  const [categoryList, setCategoryList] = useItemList('category');
  const [potencyList, setPotencyList] = useItemList('itempotency');

  useEffect(() => {
    const e = existing.data;
    if (!e) return;
    f.setValues({
      ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, e[k] ?? EMPTY[k]])),
      schedule_h: !!e.schedule_h, schedule_h1: !!e.schedule_h1,
    });
    setQty(String(Number(e.stock_qty ?? 0)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing.data]);

  const v = f.values;
  function validate() {
    if (!v.name.trim()) return t('common.isRequired', { field: t('items.name') });
    for (const [k, label] of [['cgst_percent', t('items.cgst')], ['sgst_percent', t('items.sgst')]]) {
      if (v[k] !== '' && (Number(v[k]) < 0 || Number(v[k]) > 14)) return `${label}: 0 – 14`;
    }
    if (v.mrp !== '' && Number(v.mrp) < 0) return `${t('items.mrp')}: 0+`;
    return null;
  }

  async function submit(e) {
    e.preventDefault();
    const problem = validate();
    if (problem) return toast(problem, 'error');
    setSaving(true);
    const num = (x) => (x === '' || x == null ? 0 : x);
    const body = {
      ...v,
      unit: v.unit || 'nos',
      cgst_percent: num(v.cgst_percent), sgst_percent: num(v.sgst_percent),
      // no separate sell price on the screen: dispense bills at MRP
      mrp: num(v.mrp), price: num(v.mrp),
    };
    if (id) body.stock_qty = num(qty);
    else body.opening_stock = num(qty);
    try {
      if (id) {
        await api(`/pharmacy/item-master/${id}`, { method: 'PUT', body });
        toast(t('common.updatedX', { x: t('menu.itemGroup') }));
        navigate('/pharmacy/item-list');
      } else {
        await api('/pharmacy/item-master', { method: 'POST', body });
        toast(t('common.savedX', { x: t('menu.itemGroup') }));
        f.setValues(EMPTY); setQty('');             // ready for the next item
      }
    } catch (err) {
      toast(err.message || t('common.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
    return undefined;
  }

  const cancel = () => (id ? navigate('/pharmacy/item-list') : (f.setValues(EMPTY), setQty('')));

  if (id && existing.loading) return <div className="card"><Spinner /></div>;
  if (existing.error) return <div className="card"><ErrorBox error={existing.error} onRetry={existing.reload} /></div>;
  const moneyBox = { type: 'number', min: '0', step: '0.01', placeholder: '0.00', inputMode: 'decimal', className: 'input no-spin' };
  const picker = (kind, field, list, setList, label) => (
    <Field label={label}>
      <RxListPicker kind={kind} label={label} value={v[field]} list={list} onChange={(x) => f.set(field, x)} onListChange={setList} />
    </Field>
  );

  return (
    <div className="card">
      <form onSubmit={submit} noValidate>
        <CardHeader icon={Package}
          title={id ? t('items.editTitle') : t('items.masterTitle')}
          subtitle={id ? [existing.data?.item_code, existing.data?.name].filter(Boolean).join(' · ') : t('items.registerHint')}
          actions={!id && <ItemImportButtons />} />

        <div className={GRID_WIDE}>
          <div>
            <label className="label">{t('items.name')} *</label>
            <input className="input" autoFocus placeholder={t('items.namePh')} {...f.bind('name')} />
          </div>
          {picker('generic', 'generic_name', genericList, setGenericList, t('items.generic'))}
          {picker('manufacturer', 'manufacturer', mfrList, setMfrList, t('items.manufacturer'))}
          {picker('unit', 'unit', unitList, setUnitList, t('items.typeUnit'))}
        </div>

        <div className={`mt-3 ${GRID_SHORT}`}>
          <div>
            <label className="label">{t('items.pack')}</label>
            <input className="input" placeholder={t('items.packPh')} {...f.bind('pack')} />
          </div>
          <div>
            <label className="label">{t('items.hsn')}</label>
            <input className="input" maxLength={20} placeholder={t('items.hsnPh')} {...f.bind('hsn_code')} />
          </div>
          <div>
            <label className="label">{t('items.quantity')}</label>
            <input {...moneyBox} step="0.01" placeholder="0" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div>
            <label className="label">{t('items.mrp')}</label>
            <input {...moneyBox} {...f.bind('mrp')} />
          </div>
          <div>
            <label className="label">{t('items.cgst')}</label>
            <input {...moneyBox} max="14" placeholder="0 – 14" {...f.bind('cgst_percent')} />
          </div>
          <div>
            <label className="label">{t('items.sgst')}</label>
            <input {...moneyBox} max="14" placeholder="0 – 14" {...f.bind('sgst_percent')} />
          </div>
          <div className="col-span-2 grid grid-cols-2 gap-3 sm:col-span-2 lg:col-span-1">
            <div>
              <label className="label">{t('items.rack')}</label>
              <input className="input" placeholder={t('items.rackPh')} {...f.bind('rack')} />
            </div>
            <div>
              <label className="label">{t('items.box')}</label>
              <input className="input" placeholder={t('items.boxPh')} {...f.bind('box')} />
            </div>
          </div>
        </div>

        <div className={`mt-3 ${GRID_WIDE}`}>
          {picker('category', 'category', categoryList, setCategoryList, t('items.category'))}
          {picker('itempotency', 'potency', potencyList, setPotencyList, t('items.potency'))}
          <div className="grid grid-cols-2 gap-3">
            {/* one Schedule choice, stored as the two schedule_h / schedule_h1 flags */}
            <div>
              <label className="label">{t('items.schedule')}</label>
              <select className="input" value={v.schedule_h1 ? 'H1' : v.schedule_h ? 'H' : ''}
                onChange={(e) => f.setValues({ ...v, schedule_h: e.target.value === 'H', schedule_h1: e.target.value === 'H1' })}>
                <option value="">{t('items.scheduleNone')}</option>
                <option value="H">H</option>
                <option value="H1">H1</option>
              </select>
            </div>
            <div>
              <label className="label">{t('field.status')}</label>
              <select className="input" {...f.bind('status')}>
                <option value="active">{t('status.active')}</option>
                <option value="inactive">{t('status.inactive')}</option>
              </select>
            </div>
          </div>
        </div>

        <div className={FORM_ACTIONS}>
          <button type="button" className="btn-secondary px-2 sm:px-4" onClick={cancel}><X size={16} /> {t('common.cancel')}</button>
          <button type="button" className="btn-danger px-2 sm:px-4" disabled title={t('common.inactiveHint')}><Trash2 size={16} /> {t('common.delete')}</button>
          <button type="submit" className="btn-primary px-2 sm:px-4" disabled={saving}><Save size={16} /> {saving ? t('common.saving') : t('common.save')}</button>
        </div>
      </form>
    </div>
  );
}
