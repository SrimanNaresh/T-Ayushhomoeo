// Pharmacy → add or edit an item in a popup, without leaving the screen that opened it (Purchase / Order).
//  - target: null (closed), { name } to add (the name typed so far) or { id } to edit
//  - onSaved(item, isNew): the saved item as the API returns it
// The popup has no Quantity box: a new item starts with no stock (the order's Stock In adds it), and an edit
// here never changes the stock.
import { useEffect, useState } from 'react';
import { Save, X } from 'lucide-react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/i18n.jsx';
import { Modal, Spinner, useForm } from '../../../components/ui.jsx';
import { ITEM_EMPTY, ItemFields, itemBody, itemToForm, validateItem } from './ItemFields.jsx';

export default function ItemFormModal({ target, onClose, onSaved }) {
  const { t } = useT();
  const f = useForm(ITEM_EMPTY);
  const [editing, setEditing] = useState(null);   // the saved item being edited
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    setEditing(null);
    if (!target) return undefined;
    if (!target.id) { f.setValues({ ...ITEM_EMPTY, name: target.name || '' }); return undefined; }
    let live = true;
    setLoading(true);
    api(`/pharmacy/item-master/${target.id}`)
      .then((item) => { if (live) { f.setValues(itemToForm(item)); setEditing(item); } })
      .catch((err) => live && setError(err.message || t('common.loadFailed')))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  async function save(e) {
    e.preventDefault();
    e.stopPropagation();   // the popup is a portal, but React still passes its submit up to the page's form
    const problem = validateItem(f.values, t);
    if (problem) return setError(problem);
    setSaving(true);
    setError('');
    try {
      const body = itemBody(f.values);
      const item = editing
        ? await api(`/pharmacy/item-master/${editing.id}`, { method: 'PUT', body })
        : await api('/pharmacy/item-master', { method: 'POST', body });
      onSaved(item, !editing);
    } catch (err) {
      setError(err.message || t('common.saveFailed'));
    } finally {
      setSaving(false);
    }
    return undefined;
  }

  const isEdit = Boolean(target?.id);
  const title = isEdit ? `${t('items.editTitle')}${editing?.item_code ? ` · ${editing.item_code}` : ''}` : t('items.addNewTitle');
  return (
    <Modal open={Boolean(target)} onClose={onClose} size="xl" title={title}>
      {loading ? <Spinner /> : (
        // keys typed in the popup must not reach the page's grid keyboard handling
        <form onSubmit={save} onKeyDown={(e) => e.stopPropagation()} noValidate>
          <ItemFields f={f} narrow />
          {error && <p className="mt-2 text-13 text-red-600">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}><X size={16} /> {t('common.cancel')}</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              <Save size={16} /> {saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
