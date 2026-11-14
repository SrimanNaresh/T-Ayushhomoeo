// Vital signs for one queue entry: the step after Confirm, editable later (reception and doctor).
// Rules live in shared/vitals.js so the API checks exactly the same thing.
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useT } from '../lib/i18n.jsx';
import { fmtDate } from '../lib/format.js';
import { bmi, BP_PAIRS, checkVitals, SUGAR_TYPES, VITAL_LIMITS } from '../../../shared/vitals.js';
import { Clock, Save } from 'lucide-react';
import { ErrorBox, Note, Spinner, Modal, TH, useAsync, useToast } from './ui.jsx';
import Attachments from './Attachments.jsx';

const EMPTY = { height_cm: '', weight_kg: '', bp_systolic: '', bp_diastolic: '', bp_r_systolic: '', bp_r_diastolic: '', pulse_bpm: '', temperature_f: '', sugar_type: '', sugar_value: '', comments: '' };

const toForm = (v) => Object.fromEntries(Object.keys(EMPTY).map((k) => [k, v?.[k] ?? '']));

/** "BP 120/80 · Pulse 72 bpm · …" – one line for lists and history. */
export function vitalsSummary(v, t) {
  if (!v) return '';
  return [
    v.bp_systolic != null && `${t('vitals.bpShort')} L ${v.bp_systolic}/${v.bp_diastolic}`,
    v.bp_r_systolic != null && `${t('vitals.bpShort')} R ${v.bp_r_systolic}/${v.bp_r_diastolic}`,
    v.pulse_bpm != null && `${t('vitals.pulseShort')} ${v.pulse_bpm}`,
    v.temperature_f != null && `${v.temperature_f} °F`,
    v.sugar_value != null && `${v.sugar_type} ${Number(v.sugar_value)} ${SUGAR_TYPES[v.sugar_type]?.[3] ?? ''}`.trim(),
    v.weight_kg != null && `${v.weight_kg} kg`,
    v.height_cm != null && `${v.height_cm} cm`,
  ].filter(Boolean).join(' · ');
}

/**
 * `hideMeta`: leave out the "Recorded by … · edited by …" line (the pop-up does).
 * `beforeActions`: shown under the fields and above Later / Save (outside the <form>, so pressing Enter
 * there does not save the vitals; the buttons still submit this form through form={formId}).
 */
export function VitalsForm({ queueId, initial, onSaved, onCancel, readOnly, beforeActions, hideMeta }) {
  const { t } = useT();
  const toast = useToast();
  const [f, setF] = useState(() => toForm(initial));
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setF(toForm(initial)); setTouched({}); setSubmitted(false); }, [initial]);

  const { errors } = checkVitals(f);
  // picking "—" in the Blood sugar drop-down clears its value too
  const setSugarType = (e) => { const v = e.target.value; setF((x) => ({ ...x, sugar_type: v, sugar_value: v ? x.sugar_value : '' })); };
  const sugar = SUGAR_TYPES[f.sugar_type];
  const err = (k) => (submitted || touched[k]) && errors[k] && t(`vitals.err.${errors[k]}`);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const blur = (k) => () => setTouched((x) => ({ ...x, [k]: true }));
  const range = (k) => `${VITAL_LIMITS[k][0]}–${VITAL_LIMITS[k][1]}`;
  const b = bmi(checkVitals(f).data);

  async function save(e) {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      const { vitals } = await api(`/queue/${queueId}/vitals`, { method: 'PUT', body: f });
      toast(t('vitals.saved'));
      onSaved?.(vitals);
    } catch (ex) {
      toast(ex.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const bad = (k) => (err(k) ? ' !border-red-400 !bg-red-50' : '');
  const num = (k, label, unit, step) => (
    <label className="block min-w-0">
      <span className="label">{label} <span className="text-ink-400">({unit})</span></span>
      <input type="number" inputMode="decimal" step={step} min={VITAL_LIMITS[k][0]} max={VITAL_LIMITS[k][1]}
        placeholder={range(k)} value={f[k]} onChange={set(k)} onBlur={blur(k)} disabled={readOnly}
        className={`input no-spin${bad(k)}`} />
      {err(k) && <small className="field-error block">{err(k)}</small>}
      {k === 'weight_kg' && b && !err(k) && <small className="mt-0.5 block text-11 font-semibold text-teal-700">{t('vitals.bmi')} {b}</small>}
    </label>
  );

  const formId = `vitals-form-${queueId}`;
  return (
    <>
    <form id={formId} onSubmit={save} noValidate>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {num('height_cm', t('vitals.height'), 'cm', '0.1')}
        {num('weight_kg', t('vitals.weight'), 'kg', '0.1')}
        {Object.entries(BP_PAIRS).map(([arm, [sys, dia]]) => (
          <label className="block min-w-0" key={arm}>
            <span className="label">{arm} – {t('vitals.bp')} <span className="text-ink-400">(mmHg)</span></span>
            <span className="flex items-center gap-1.5">
              <input type="number" inputMode="numeric" placeholder={t('vitals.sysShort')} aria-label={`${arm} ${t('vitals.systolic')}`}
                value={f[sys]} onChange={set(sys)} onBlur={blur(sys)} disabled={readOnly}
                className={`input no-spin${bad(sys)}`} />
              <b className="text-ink-400">/</b>
              <input type="number" inputMode="numeric" placeholder={t('vitals.diaShort')} aria-label={`${arm} ${t('vitals.diastolic')}`}
                value={f[dia]} onChange={set(dia)} onBlur={blur(dia)} disabled={readOnly}
                className={`input no-spin${bad(dia)}`} />
            </span>
            {(err(sys) || err(dia)) && <small className="field-error block">{err(sys) || err(dia)}</small>}
          </label>
        ))}
        {num('pulse_bpm', t('vitals.pulse'), 'bpm', '1')}
        {num('temperature_f', t('vitals.temperature'), '°F', '0.1')}
        <div className="col-span-2 min-w-0 sm:col-span-1">
          <span className="label">{t('vitals.sugar')} {sugar && <span className="text-ink-400">({sugar[3]})</span>}</span>
          <span className="flex items-center gap-1.5">
            <select value={f.sugar_type} onChange={setSugarType} onBlur={blur('sugar_type')} disabled={readOnly}
              aria-label={t('vitals.sugarTest')} className={`input !w-24 shrink-0${bad('sugar_type')}`}>
              <option value="">-</option>
              {Object.keys(SUGAR_TYPES).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <input type="number" inputMode="decimal" step={sugar?.[2] ? '0.1' : '1'} min={sugar?.[0]} max={sugar?.[1]}
              placeholder={sugar ? `${sugar[0]}–${sugar[1]}` : ''} aria-label={t('vitals.sugar')}
              value={f.sugar_value} onChange={set('sugar_value')} onBlur={blur('sugar_value')} disabled={readOnly || !sugar}
              className={`input no-spin${bad('sugar_value')}`} />
          </span>
          {(err('sugar_type') || err('sugar_value')) && <small className="field-error block">{err('sugar_type') || err('sugar_value')}</small>}
        </div>
        <label className="col-span-full block">
          <span className="label">{t('vitals.comments')}</span>
          <textarea className="input" rows={1} maxLength={500} placeholder="Anything else noticed" value={f.comments} onChange={set('comments')} disabled={readOnly} />
          {err('comments') && <small className="field-error block">{err('comments')}</small>}
        </label>
      </div>
      {submitted && errors._form && <Note tone="error">{t('vitals.err.empty')}</Note>}
      {!hideMeta && initial?.recorded_at && (
        <p className="mt-2.5 text-12 text-ink-400">
          {t('vitals.recordedBy', { name: initial.recorded_by_name || '—', at: fmtDate(initial.recorded_at, true) })}
          {initial.updated_at && ` · ${t('vitals.updatedBy', { name: initial.updated_by_name || '—', at: fmtDate(initial.updated_at, true) })}`}
        </p>
      )}
    </form>
    {beforeActions}
    {!readOnly && (
      <div className="no-print mt-4 grid grid-cols-2 gap-2 border-t border-ink-100 pt-3 sm:flex sm:justify-end">
        {onCancel && <button type="button" className="btn-secondary" onClick={onCancel}><Clock size={16} /> {t('vitals.later')}</button>}
        <button type="submit" form={formId} className="btn-primary" disabled={saving}><Save size={16} /> {saving ? t('common.saving') : initial ? t('vitals.update') : t('vitals.save')}</button>
      </div>
    )}
    </>
  );
}

const HISTORY_VISITS = 10;

/** Vital signs of the patient's last 10 earlier visits (newest first), one row per visit. */
export function VitalsHistory({ patientId, excludeVisitId }) {
  const { t } = useT();
  const h = useAsync(() => api(`/visits/patient/${patientId}`), [patientId]);
  const bp = (sys, dia) => (sys != null ? `${sys}/${dia}` : '');
  const rows = (h.data?.visits || [])
    .filter((v) => v.id !== excludeVisitId)
    .map((v) => (v.vitals_id ? v : {
      // older visits: free-text vitals saved on the visit itself
      ...v, legacy_bp: v.vitals?.bp, pulse_bpm: v.vitals?.pulse, legacy_temp: v.vitals?.temp, weight_kg: v.vitals?.weight,
    }))
    .filter((v) => v.vitals_id || v.legacy_bp || v.pulse_bpm || v.legacy_temp || v.weight_kg)
    .slice(0, HISTORY_VISITS);
  return (
    <>
      <h3 className="section-title mb-2">{t('vitals.historyTitle', { n: HISTORY_VISITS })}</h3>
      {h.loading && !h.data ? <Spinner /> : <ErrorBox error={h.error} onRetry={h.reload} />}
      {h.data && !rows.length && <p className="text-13 text-ink-400">{t('vitals.noHistory')}</p>}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg">
          <table className="list-pinned pin-first w-full min-w-[720px] text-left text-13 [&_td]:px-2.5 [&_td]:py-1 [&_td]:text-ink-600">
            <thead>
              <tr className="table-head">
                <th className={`${TH} rounded-l-lg`}>{t('field.date')}</th><th className={TH}>{t('vitals.height')} (cm)</th><th className={TH}>{t('vitals.weight')} (kg)</th><th className={TH}>{t('vitals.bmi')}</th>
                <th className={TH}>L – {t('vitals.bpShort')}</th><th className={TH}>R – {t('vitals.bpShort')}</th><th className={TH}>{t('vitals.pulseShort')}</th>
                <th className={TH}>°F</th><th className={TH}>{t('vitals.sugar')}</th><th className={`${TH} rounded-r-lg`}>{t('vitals.comments')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  <td className="whitespace-nowrap font-medium !text-ink-700">{fmtDate(v.visit_date)}</td>
                  <td>{v.height_cm ?? ''}</td>
                  <td>{v.weight_kg ?? ''}</td>
                  <td>{bmi(v) ?? ''}</td>
                  <td>{bp(v.bp_systolic, v.bp_diastolic) || v.legacy_bp || ''}</td>
                  <td>{bp(v.bp_r_systolic, v.bp_r_diastolic)}</td>
                  <td>{v.pulse_bpm ?? ''}</td>
                  <td>{v.temperature_f ?? v.legacy_temp ?? ''}</td>
                  <td className="whitespace-nowrap">{v.sugar_value != null ? `${v.sugar_type} ${Number(v.sugar_value)} ${SUGAR_TYPES[v.sugar_type]?.[3] ?? ''}` : ''}</td>
                  <td>{v.vitals_comments || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** Loads the vitals of a queue entry and lets you record / edit them in a dialog. */
export function VitalsModal({ entry, onClose, onSaved, readOnly }) {
  const { t } = useT();
  const current = useAsync(() => api(`/queue/${entry.id}/vitals`), [entry.id]);
  return (
    <Modal title={`${t('vitals.title')} – #${entry.token_no} ${entry.patient_name}`} onClose={onClose} size="lg">
      {current.loading && !current.data ? <Spinner /> : <ErrorBox error={current.error} onRetry={current.reload} />}
      {current.data && (
        <VitalsForm queueId={entry.id} initial={current.data.vitals} onCancel={onClose} readOnly={readOnly} hideMeta
          onSaved={(v) => { onSaved?.(v); onClose(); }}
          // lab reports & scans are saved on their own, right away – independent of Save below
          beforeActions={<Attachments entry={entry} canEdit={!readOnly} />} />
      )}
    </Modal>
  );
}
