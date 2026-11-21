// Pharmacy → Item → Master: add / edit a medicine or item (fields: ItemFields.jsx, shared with the item popup)
import { useEffect, useState } from 'react';
import { Package, Save, Trash2, X } from 'lucide-react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/i18n.jsx';
import { navigate } from '../../../lib/router.jsx';
import { CardHeader, ErrorBox, Spinner, FORM_ACTIONS, useAsync, useForm, useToast } from '../../../components/ui.jsx';
import ItemImportButtons from '../../../components/ItemImport.jsx';
import { ITEM_EMPTY, ItemFields, itemBody, itemToForm, validateItem } from './ItemFields.jsx';

export default function ItemForm({ params }) {
  const { t } = useT();
  const toast = useToast();
  const id = params.id;
  const f = useForm(ITEM_EMPTY);
  const [saving, setSaving] = useState(false);
  const [qty, setQty] = useState('');            // Quantity: opening stock when adding, current stock when editing
  const existing = useAsync(() => (id ? api(`/pharmacy/item-master/${id}`) : Promise.resolve(null)), [id]);

  useEffect(() => {
    const e = existing.data;
    if (!e) return;
    f.setValues(itemToForm(e));
    setQty(String(Number(e.stock_qty ?? 0)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing.data]);

  async function submit(e) {
    e.preventDefault();
    const problem = validateItem(f.values, t);
    if (problem) return toast(problem, 'error');
    setSaving(true);
    const num = (x) => (x === '' || x == null ? 0 : x);
    const body = itemBody(f.values);
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
        f.setValues(ITEM_EMPTY); setQty('');             // ready for the next item
      }
    } catch (err) {
      toast(err.message || t('common.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
    return undefined;
  }

  const cancel = () => (id ? navigate('/pharmacy/item-list') : (f.setValues(ITEM_EMPTY), setQty('')));

  if (id && existing.loading) return <div className="card"><Spinner /></div>;
  if (existing.error) return <div className="card"><ErrorBox error={existing.error} onRetry={existing.reload} /></div>;

  return (
    <div className="card">
      <form onSubmit={submit} noValidate>
        <CardHeader icon={Package}
          title={id ? t('items.editTitle') : t('items.masterTitle')}
          subtitle={id ? [existing.data?.item_code, existing.data?.name].filter(Boolean).join(' · ') : t('items.registerHint')}
          actions={!id && <ItemImportButtons />} />

        <ItemFields f={f} qty={qty} setQty={setQty} />

        <div className={FORM_ACTIONS}>
          <button type="button" className="btn-secondary px-2 sm:px-4" onClick={cancel}><X size={16} /> {t('common.cancel')}</button>
          <button type="button" className="btn-danger px-2 sm:px-4" disabled title={t('common.inactiveHint')}><Trash2 size={16} /> {t('common.delete')}</button>
          <button type="submit" className="btn-primary px-2 sm:px-4" disabled={saving}><Save size={16} /> {saving ? t('common.saving') : t('common.save')}</button>
        </div>
      </form>
    </div>
  );
}
