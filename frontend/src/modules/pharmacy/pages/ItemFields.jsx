// Pharmacy → Item: the item form's fields, shared by the Item Master page and the "Add / Edit item" popup
// (ItemFormModal) that Purchase / Order opens from its item boxes – so both always ask for the same things.
import { useState } from 'react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/i18n.jsx';
import { Field, GRID_WIDE, GRID_SHORT, useAsync } from '../../../components/ui.jsx';
import RxListPicker from '../../../components/RxListPicker.jsx';

// Only these fields are on the form; anything else on an existing item (supplier, purchase rate, …)
// is not sent, so saving keeps its current value.
export const ITEM_EMPTY = {
  name: '', generic_name: '', hsn_code: '', manufacturer: '', unit: '', pack: '', category: '', potency: '',
  mrp: '', cgst_percent: '', sgst_percent: '',
  schedule_h: false, schedule_h1: false, status: 'active', rack: '', box: '',
};

/** A saved item (as the API returns it) → the form's values */
export const itemToForm = (e) => ({
  ...Object.fromEntries(Object.keys(ITEM_EMPTY).map((k) => [k, e[k] ?? ITEM_EMPTY[k]])),
  schedule_h: !!e.schedule_h, schedule_h1: !!e.schedule_h1,
});

/** The first problem with the form's values, or null */
export function validateItem(v, t) {
  if (!v.name.trim()) return t('common.isRequired', { field: t('items.name') });
  for (const [k, label] of [['cgst_percent', t('items.cgst')], ['sgst_percent', t('items.sgst')]]) {
    if (v[k] !== '' && (Number(v[k]) < 0 || Number(v[k]) > 14)) return `${label}: 0 – 14`;
  }
  if (v.mrp !== '' && Number(v.mrp) < 0) return `${t('items.mrp')}: 0+`;
  return null;
}

const num = (x) => (x === '' || x == null ? 0 : x);
/** What is sent to the API (Quantity is added by the caller: opening_stock or stock_qty) */
export const itemBody = (v) => ({
  ...v,
  unit: v.unit || 'nos',
  cgst_percent: num(v.cgst_percent), sgst_percent: num(v.sgst_percent),
  // no separate sell price on the screen: dispense bills at MRP
  mrp: num(v.mrp), price: num(v.mrp),
});

/** The clinic's Generic Name / Manufacturer / Type / Unit / Category / Potency list (+ New, Edit, Delete), replaced locally after a change. */
function useItemList(kind) {
  const loaded = useAsync(() => api(`/visits/${kind}-options`), [kind]);
  const [changed, setChanged] = useState(null);
  return [changed || loaded.data || { rows: [], added: [] }, setChanged];
}

/**
 * The fields. `f` is useForm(ITEM_EMPTY); `qty` / `setQty` the Quantity box (left out when `setQty` is not given).
 */
export function ItemFields({ f, qty, setQty, autoFocus = true }) {
  const { t } = useT();
  const v = f.values;
  const [genericList, setGenericList] = useItemList('generic');
  const [mfrList, setMfrList] = useItemList('manufacturer');
  const [unitList, setUnitList] = useItemList('unit');
  const [categoryList, setCategoryList] = useItemList('category');
  const [potencyList, setPotencyList] = useItemList('itempotency');
  const moneyBox = { type: 'number', min: '0', step: '0.01', placeholder: '0.00', inputMode: 'decimal', className: 'input no-spin' };
  const picker = (kind, field, list, setList, label) => (
    <Field label={label}>
      <RxListPicker kind={kind} label={label} value={v[field]} list={list} onChange={(x) => f.set(field, x)} onListChange={setList} />
    </Field>
  );

  return (
    <>
      <div className={GRID_WIDE}>
        <div>
          <label className="label">{t('items.name')} *</label>
          <input className="input" autoFocus={autoFocus} placeholder={t('items.namePh')} {...f.bind('name')} />
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
        {setQty && (
          <div>
            <label className="label">{t('items.quantity')}</label>
            <input {...moneyBox} step="0.01" placeholder="0" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
        )}
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
    </>
  );
}
