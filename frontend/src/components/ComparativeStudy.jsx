// Examine → Complaints & diagnosis → 5. Comparative Study: one running table per patient
// (Date, Tine, Rt.H, Lt.H), so readings can be compared over time. Every visit shows all rows.
// + Add / Edit / Delete save right away (not with Save draft). readOnly: the table only (Patient History).
// Tine is a plain text box (saved in study_time); it may be left empty.
// Below the saved rows there are always 5 blank rows to type into: a filled row is saved when the
// cursor leaves it (Date defaults to today), and a fresh blank row takes its place.
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useT } from '../lib/i18n.jsx';
import { fmtDate, todayLocal } from '../lib/format.js';
import { checkComparative, MAX_READING, MAX_TIME } from '../../../shared/comparative.js';
import { Plus, Trash2, Save, X } from 'lucide-react';
import { ErrorBox, GRID_INPUT, Input, Spinner, Modal, TH, useAsync, useToast } from './ui.jsx';
import { ListHead, RowTool } from './DosDontList.jsx';

const BLANK_ROWS = 5;
let draftSeq = 0;
const blankRow = () => ({ key: `d${++draftSeq}`, study_date: '', study_time: '', rt_h: '', lt_h: '', saving: false });



export default function ComparativeStudy({ patientId, visitId, onCount, readOnly = false }) {
  const { t } = useT();
  const toast = useToast();
  const list = useAsync(() => api(`/visits/patient/${patientId}/comparative`), [patientId]);
  const [changed, setChanged] = useState(null);     // rows after an add / edit / delete
  const [editing, setEditing] = useState(null);     // { id (null = new), study_date, study_time, rt_h, lt_h }
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState(() => Array.from({ length: BLANK_ROWS }, blankRow));
  const rows = changed || list.data?.rows || [];

  useEffect(() => { onCount?.(rows.length); }, [rows.length, onCount]);

  if (readOnly && !rows.length) return null;

  const setDraft = (key, patch) => setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  // a blank row being typed into: saved when the cursor leaves the row and Rt.H or Lt.H is filled
  async function saveDraft(d) {
    if (d.saving || (!d.rt_h.trim() && !d.lt_h.trim())) return;
    const body = { study_date: d.study_date || todayLocal(), study_time: d.study_time, rt_h: d.rt_h, lt_h: d.lt_h };
    const { error } = checkComparative(body);
    if (error) { toast(t(`cs.err.${error}`), 'error'); return; }
    setDraft(d.key, { saving: true });
    try {
      const r = await api(`/visits/patient/${patientId}/comparative`, { method: 'POST', body: { ...body, visit_id: visitId } });
      setChanged(r.rows);
      setDrafts((ds) => [...ds.filter((x) => x.key !== d.key), blankRow()]);
      toast(t('cs.saved'));
    } catch (err) {
      setDraft(d.key, { saving: false });
      toast(err.message, 'error');
    }
  }
  const leaveRow = (d) => (e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;   // still inside the same row
    saveDraft(d);
  };

  async function save(e) {
    e?.preventDefault();
    const { error } = checkComparative(editing);
    if (error) { toast(t(`cs.err.${error}`), 'error'); return; }
    setBusy(true);
    try {
      const body = { study_date: editing.study_date, study_time: editing.study_time, rt_h: editing.rt_h, lt_h: editing.lt_h };
      const r = editing.id
        ? await api(`/visits/comparative/${editing.id}`, { method: 'PUT', body })
        : await api(`/visits/patient/${patientId}/comparative`, { method: 'POST', body: { ...body, visit_id: visitId } });
      setChanged(r.rows);
      setEditing(null);
      toast(t('cs.saved'));
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const r = await api(`/visits/comparative/${removing.id}`, { method: 'DELETE' });
      setChanged(r.rows);
      setRemoving(null);
      toast(t('cs.deleted'));
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const field = (k) => ({ value: editing[k] || '', onChange: (e) => setEditing({ ...editing, [k]: e.target.value }) });

  return (
    <div className="min-w-0">
      <ListHead title={t('cs.title')}>
        {!readOnly && (
          <button type="button" className="btn-secondary !px-2.5 !py-1 !text-13" onClick={() => setEditing({ id: null, study_date: todayLocal(), study_time: '', rt_h: '', lt_h: '' })}>
            <Plus size={14} /> {t('cs.add')}
          </button>
        )}
      </ListHead>

      {list.loading && !list.data ? <Spinner /> : <ErrorBox error={list.error} onRetry={list.reload} />}
      {readOnly && list.data && !rows.length && <p className="text-12 text-ink-400">{t('cs.empty')}</p>}
      {(rows.length > 0 || (!readOnly && list.data)) && (
        <div className="overflow-x-auto rounded-lg">
          <table className="w-full min-w-[460px] text-left text-13">
            <thead>
              <tr className="table-head">
                <th className={`${TH} w-10 rounded-l-lg`}>#</th><th className={TH}>{t('cs.date')}</th><th className={TH}>{t('cs.tine')}</th>
                <th className={TH}>{t('cs.rt')}</th><th className={`${TH} ${readOnly ? 'rounded-r-lg' : ''}`}>{t('cs.lt')}</th>
                {!readOnly && <th className={`${TH} w-20 rounded-r-lg`} aria-label={t('common.edit')} />}
              </tr>
            </thead>
            <tbody className="[&_td]:px-2.5 [&_td]:py-1">
              {rows.map((r, i) => (
                <tr key={r.id} className="table-row">
                  <td className="text-ink-400">{i + 1}</td>
                  <td className="whitespace-nowrap font-medium text-ink-700">{fmtDate(r.study_date)}</td>
                  <td className="text-ink-600">{r.study_time || '-'}</td>
                  <td className="text-ink-600">{r.rt_h || '-'}</td>
                  <td className="text-ink-600">{r.lt_h || '-'}</td>
                  {!readOnly && (
                    <td className="whitespace-nowrap text-right">
                      <RowTool kind="edit" title={`${t('cs.edit')}: ${fmtDate(r.study_date)}`}
                        onClick={() => setEditing({ id: r.id, study_date: r.study_date, study_time: r.study_time || '', rt_h: r.rt_h || '', lt_h: r.lt_h || '' })} />
                      <RowTool kind="delete" title={`${t('cs.delete')}: ${fmtDate(r.study_date)}`} onClick={() => setRemoving(r)} />
                    </td>
                  )}
                </tr>
              ))}
              {!readOnly && list.data && drafts.map((d, i) => (
                <tr key={d.key} className="border-b border-dashed border-ink-100 bg-ink-50/40" onBlur={leaveRow(d)}>
                  <td className="text-ink-300">{rows.length + i + 1}</td>
                  <td><input type="date" className={GRID_INPUT} value={d.study_date} aria-label={`${t('cs.date')} ${rows.length + i + 1}`} disabled={d.saving}
                    onChange={(e) => setDraft(d.key, { study_date: e.target.value })} /></td>
                  <td><input className={GRID_INPUT} value={d.study_time} maxLength={MAX_TIME} aria-label={`${t('cs.tine')} ${rows.length + i + 1}`}
                    disabled={d.saving} onChange={(e) => setDraft(d.key, { study_time: e.target.value })} /></td>
                  <td><input className={GRID_INPUT} value={d.rt_h} maxLength={MAX_READING} aria-label={`${t('cs.rt')} ${rows.length + i + 1}`} disabled={d.saving}
                    onChange={(e) => setDraft(d.key, { rt_h: e.target.value, study_date: d.study_date || todayLocal() })} /></td>
                  <td><input className={GRID_INPUT} value={d.lt_h} maxLength={MAX_READING} aria-label={`${t('cs.lt')} ${rows.length + i + 1}`} disabled={d.saving}
                    onChange={(e) => setDraft(d.key, { lt_h: e.target.value, study_date: d.study_date || todayLocal() })} /></td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!readOnly && <p className="mt-1.5 text-12 text-ink-400">{t('cs.hint')}</p>}

      {editing && (
        <Modal title={editing.id ? t('cs.edit') : t('cs.new')} onClose={() => !busy && setEditing(null)}
          footer={(
            <>
              <button type="button" className="btn-secondary" onClick={() => setEditing(null)} disabled={busy}><X size={16} /> {t('common.cancel')}</button>
              <button type="button" className="btn-primary" onClick={save} disabled={busy}><Save size={16} /> {busy ? t('common.saving') : t('common.save')}</button>
            </>
          )}>
          <form onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label={t('cs.date')} type="date" required {...field('study_date')} />
            <Input label={t('cs.tine')} maxLength={MAX_TIME} {...field('study_time')} />
            <Input label={t('cs.rt')} maxLength={MAX_READING} autoFocus {...field('rt_h')} />
            <Input label={t('cs.lt')} maxLength={MAX_READING} {...field('lt_h')} />
            <button type="submit" hidden />
          </form>
        </Modal>
      )}

      {removing && (
        <Modal title={t('cs.delete')} onClose={() => !busy && setRemoving(null)}
          footer={(
            <>
              <button type="button" className="btn-secondary" onClick={() => setRemoving(null)} disabled={busy}><X size={16} /> {t('common.cancel')}</button>
              <button type="button" className="btn-danger" onClick={remove} disabled={busy}><Trash2 size={16} /> {t('rxList.deleteShort')}</button>
            </>
          )}>
          <p className="text-sm text-ink-700">{t('cs.deleteConfirm', { date: `${fmtDate(removing.study_date)}${removing.study_time ? `, ${removing.study_time}` : ''}` })}</p>
        </Modal>
      )}
    </div>
  );
}
