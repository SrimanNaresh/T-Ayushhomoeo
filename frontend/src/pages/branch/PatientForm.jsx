// Registration → Patient Registration: add / edit a patient (a Super Admin may also delete one)
import { useEffect, useState } from 'react';
import { UserPlus, Save, Trash2, X, AlertTriangle } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useT } from '../../lib/i18n.jsx';
import { navigate } from '../../lib/router.jsx';
import { isDigits, isEmail } from '../../lib/validators.js';
import { CardHeader, ErrorBox, Spinner, GRID_WIDE, GRID_SHORT, FORM_ACTIONS, useAsync, useForm, useToast } from '../../components/ui.jsx';
import PatientImportButtons, { PatientDownloadButton } from '../../components/PatientImport.jsx';

const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const EMPTY = {
  name: '', gender: '', age_years: '', dob: '', mobile: '', alt_mobile: '', email: '',
  address: '', blood_group: '', notes: '', status: 'active',
};

export default function PatientForm({ params }) {
  const { t } = useT();
  const auth = useAuth();
  const toast = useToast();
  const id = params.id;
  const f = useForm(EMPTY);
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState(null);
  const existing = useAsync(() => (id ? api(`/patients/${id}`) : Promise.resolve(null)), [id]);
  // New patients get the clinic's last Patient ID + 1 – show which one (refreshed after an import)
  const nextId = useAsync(() => (id ? Promise.resolve(null) : api('/patients/next-id').catch(() => null)), [id, auth.activeClinic?.id]);
  const isSuperAdmin = auth.user?.role === 'super_admin';

  useEffect(() => {
    if (!existing.data) return;
    f.setValues((v) => Object.fromEntries(Object.keys(v).map((k) => [k, existing.data[k] ?? ''])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing.data]);

  const v = f.values;
  function validate() {
    if (!v.name.trim()) return t('common.isRequired', { field: t('field.name') });
    if (!v.mobile.trim()) return t('common.isRequired', { field: t('field.mobile') });
    if (!isDigits(v.mobile)) return t('common.digitsOnly', { field: t('field.mobile') });
    if (!isDigits(v.alt_mobile)) return t('common.digitsOnly', { field: t('field.altMobile') });
    if (!isEmail(v.email)) return t('common.badEmail');
    if (v.age_years !== '' && (Number(v.age_years) < 0 || Number(v.age_years) > 130)) return `${t('field.age')}: 0 – 130`;
    return null;
  }

  async function save(force = false) {
    const problem = validate();
    if (problem) return toast(problem, 'error');
    setSaving(true);
    try {
      const body = { ...v, force };
      const p = id
        ? await api(`/patients/${id}`, { method: 'PUT', body })
        : await api('/patients', { method: 'POST', body });
      toast(id ? t('common.updatedX', { x: t('patients.patient') }) : t('patients.registered', { code: p.patient_code }));
      navigate(`/patients/${p.id}`);
    } catch (err) {
      if (err.code === 'POSSIBLE_DUPLICATE') setDuplicate(err.details || []);
      else toast(err.message || t('common.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
    return undefined;
  }

  async function remove() {
    if (!id || !window.confirm(t('patients.deleteConfirm', { code: existing.data.patient_code, name: existing.data.name }))) return;
    try {
      await api(`/patients/${id}`, { method: 'DELETE' });
      toast(t('patients.deleted', { code: existing.data.patient_code }));
      navigate('/patients');
    } catch (err) {
      toast(err.message || t('common.deleteFailed'), 'error');
    }
  }

  const cancel = () => (id ? window.history.back() : (f.setValues(EMPTY), setDuplicate(null)));

  if (id && existing.loading) return <div className="card"><Spinner /></div>;
  if (existing.error) return <div className="card"><ErrorBox error={existing.error} onRetry={existing.reload} /></div>;

  const subtitle = id
    ? `${existing.data?.patient_code} · ${t('patients.editSubtitle')}`
    : nextId.data?.patient_code ? t('patients.nextId', { code: nextId.data.patient_code })
      : t('patients.idHint', { code: `${auth.activeClinic?.code}-0001` });

  return (
    <div className="card">
      <form onSubmit={(e) => { e.preventDefault(); save(false); }} noValidate>
        <CardHeader icon={UserPlus} title={id ? t('patients.editTitle') : t('menu.patientRegistration')} subtitle={subtitle}
          actions={!id && isSuperAdmin && (   /* Template / Import / Download: Super Admin only */
            <>
              <PatientImportButtons onImported={() => navigate('/patients')} />
              <PatientDownloadButton clinicCode={auth.activeClinic?.code} />
            </>
          )} />

        <div className={GRID_WIDE}>
          <div>
            <label className="label">{t('field.name')} *</label>
            <input className="input" autoFocus={!id} placeholder="e.g. Lakshmi R" {...f.bind('name')} />
          </div>
          <div>
            <label className="label">{t('field.mobile')} *</label>
            <input className="input" type="tel" inputMode="numeric" maxLength={15} placeholder="e.g. 98765 43210" {...f.bind('mobile')} />
          </div>
          <div>
            <label className="label">{t('field.altMobile')}</label>
            <input className="input" type="tel" inputMode="numeric" maxLength={15} placeholder="Another number" {...f.bind('alt_mobile')} />
          </div>
          <div>
            <label className="label">{t('field.email')}</label>
            <input className="input" type="email" placeholder="e.g. name@mail.com" {...f.bind('email')} />
          </div>
        </div>

        <div className={`mt-3 ${GRID_SHORT}`}>
          <div className="col-span-2 sm:col-span-2">
            <span className="label">{t('field.gender')}</span>
            <div className="flex min-h-[30px] flex-wrap items-center gap-x-4 gap-y-1">
              {['M', 'F', 'O'].map((g) => (
                <label key={g} className="inline-flex cursor-pointer items-center gap-1.5 text-13 text-ink-700">
                  <input type="radio" name="gender" value={g} checked={v.gender === g} onChange={() => f.set('gender', g)} />
                  {t(`gender.${g}`)}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="label">{t('field.age')}</label>
            <input className="input no-spin" type="number" min="0" max="130" inputMode="numeric" placeholder="Years" {...f.bind('age_years')} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="label">{t('field.dob')}</label>
            <input className="input" type="date" {...f.bind('dob')} />
          </div>
          <div>
            <label className="label">{t('field.bloodGroup')}</label>
            <select className="input" {...f.bind('blood_group')}>
              <option value="">-</option>
              {BLOOD.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          {id && (
            <div>
              <label className="label">{t('field.status')}</label>
              <select className="input" {...f.bind('status')}>
                <option value="active">{t('status.active')}</option>
                <option value="inactive">{t('status.inactive')}</option>
              </select>
            </div>
          )}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">{t('field.address')}</label>
            <textarea className="input" rows={2} placeholder="Door no, street, town" {...f.bind('address')} />
          </div>
          <div>
            <label className="label">{t('field.notes')}</label>
            <textarea className="input" rows={2} placeholder="Anything the doctor should know" {...f.bind('notes')} />
          </div>
        </div>

        {duplicate && (
          <div className="mt-3 flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-13 text-amber-800 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div>
                <b>{t('patients.possibleDuplicate')}</b>
                <ul className="mt-1 space-y-0.5">
                  {duplicate.map((d) => <li key={d.id}><a className="font-medium text-brand-700 underline" href={`#/patients/${d.id}`}>{d.patient_code} – {d.name} ({d.mobile})</a></li>)}
                </ul>
              </div>
            </div>
            <button type="button" className="btn-secondary shrink-0" disabled={saving} onClick={() => save(true)}>{t('patients.registerAnyway')}</button>
          </div>
        )}

        <div className={FORM_ACTIONS}>
          <button type="button" className="btn-secondary px-2 sm:px-4" onClick={cancel}><X size={16} /> {t('common.cancel')}</button>
          <button type="button" className="btn-danger px-2 sm:px-4" onClick={remove} disabled={!id || !isSuperAdmin}
            title={!id ? t('common.deleteHint') : isSuperAdmin ? t('common.deleteThis') : t('common.noAccess')}>
            <Trash2 size={16} /> {t('common.delete')}
          </button>
          <button type="submit" className="btn-primary px-2 sm:px-4" disabled={saving}><Save size={16} /> {saving ? t('common.saving') : t('common.save')}</button>
        </div>
      </form>
    </div>
  );
}
