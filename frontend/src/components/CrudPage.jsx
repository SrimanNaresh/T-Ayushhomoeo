// Generic list screen (CardHeader with search + "New X", pinned-first-column table), used for Clinics,
// Pharmacies, Labs and Vendors. Add / edit open a pop-up, or a master screen of their own (addPath / editPath).
import { useState } from 'react';
import { Plus, Pencil, Save, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { useT } from '../lib/i18n.jsx';
import { navigate } from '../lib/router.jsx';
import {
  CardHeader, DataTable, ErrorBox, Input, Spinner, Modal, SearchBox, Select, TextArea,
  StatusBadge, useAsync, useDebounced, useToast,
} from './ui.jsx';
import { ICONS } from './Icon.jsx';

/**
 * icon: lucide icon for the CardHeader
 * fields: [{ name, label, type?, required?, options?, upper?, full?, hint?, placeholder? }]
 * columns: DataTable columns (an Edit column is added at the right when canEdit)
 * filters: optional element shown before the search box
 * extraQuery: extra list query params (e.g. { clinic_id })
 */
export default function CrudPage({
  icon = ICONS.list, title, subtitle, endpoint, fields, columns, defaults = {}, canEdit = true, filters, extraQuery = {}, clinic, addLabel, onSaved,
  addPath, editPath, savedMessage,
}) {
  const { t } = useT();
  const toast = useToast();
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [editing, setEditing] = useState(null);   // null | {} (new) | row
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);

  const list = useAsync(() => api(endpoint, { query: { q: dq, ...extraQuery }, clinic }), [endpoint, dq, JSON.stringify(extraQuery), clinic]);

  function open(row) {
    setEditing(row || {});
    const v = { status: 'active', ...defaults };
    for (const f of fields) if (row && row[f.name] !== undefined) v[f.name] = row[f.name] ?? '';
    setValues(v);
  }

  async function save(e) {
    e.preventDefault();
    const missing = fields.find((f) => f.required && !String(values[f.name] ?? '').trim());
    if (missing) return toast(t('common.isRequired', { field: missing.label }), 'error');
    setSaving(true);
    try {
      const body = { ...values };
      for (const f of fields) if (f.upper && body[f.name]) body[f.name] = String(body[f.name]).toUpperCase();
      if (editing.id) await api(`${endpoint}/${editing.id}`, { method: 'PUT', body, clinic });
      else await api(endpoint, { method: 'POST', body, clinic });
      toast(savedMessage || t('common.saved'));
      setEditing(null);
      list.reload();
      onSaved?.();
    } catch (err) {
      toast(err.message || t('common.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
    return undefined;
  }

  const set = (name, upper) => (e) => setValues((v) => ({ ...v, [name]: upper ? e.target.value.toUpperCase() : e.target.value }));
  const renderField = (f) => {
    const common = { label: f.label, required: f.required, value: values[f.name] ?? '', onChange: set(f.name, f.upper), hint: f.hint, full: f.full, placeholder: f.placeholder };
    if (f.type === 'select') return <Select key={f.name} {...common} options={f.options} placeholder={f.required ? undefined : '-'} />;
    if (f.type === 'textarea') return <TextArea key={f.name} {...common} rows={2} />;
    const tel = f.type === 'tel' ? { inputMode: 'numeric' } : {};
    return <Input key={f.name} {...common} {...tel} type={f.type || 'text'} step={f.type === 'number' ? '0.01' : undefined} maxLength={f.maxLength} />;
  };

  const cols = canEdit
    ? [...columns, {
      key: '_edit', label: t('common.edit'), className: 'col-actions',
      render: (r) => (
        <button type="button" className="btn-ghost !p-1" title={t('common.edit')}
          onClick={(e) => { e.stopPropagation(); if (editPath) navigate(editPath(r)); else open(r); }}>
          <Pencil size={15} />
        </button>
      ),
    }]
    : columns;

  return (
    <div>
      <div className="card">
        <CardHeader icon={icon} title={title} subtitle={subtitle}
          actions={(
            <>
              {filters}
              <SearchBox value={q} onChange={setQ} placeholder={t('common.search')} />
              {canEdit && (
                <button type="button" className="btn-primary" onClick={() => (addPath ? navigate(addPath) : open(null))}>
                  <Plus size={16} /> {addLabel || t('common.add')}
                </button>
              )}
            </>
          )} />
        {list.loading && !list.data ? <Spinner /> : <ErrorBox error={list.error} onRetry={list.reload} />}
        {list.data && <DataTable columns={cols} rows={list.data.rows} />}
      </div>

      <Modal open={!!editing} title={editing?.id ? `${t('common.edit')} – ${editing.name}` : addLabel || t('common.add')} onClose={() => setEditing(null)}>
        <form onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {fields.map(renderField)}
          <Select label={t('field.status')} value={values.status || 'active'} onChange={set('status')}
            options={[{ value: 'active', label: t('status.active') }, { value: 'inactive', label: t('status.inactive') }]} />
          <div className="col-span-full mt-1 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <button type="button" className="btn-secondary px-2 sm:px-4" onClick={() => setEditing(null)}><X size={16} /> {t('common.cancel')}</button>
            <button type="submit" className="btn-primary px-2 sm:px-4" disabled={saving}><Save size={16} /> {saving ? t('common.saving') : t('common.save')}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/** Status column: Active in emerald, Inactive in grey. */
export const statusColumn = (t) => ({ key: 'status', label: t('field.status'), render: (r) => <StatusBadge status={r.status} /> });
