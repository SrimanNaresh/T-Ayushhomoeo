// Clinic Generation, Pharmacy Generation, Lab Generation (and Clinic Settings in single-clinic mode)
import { useEffect, useState } from 'react';
import { Building2, Pill, FlaskConical, Save, X } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { CardHeader, ErrorBox, Spinner, GRID_WIDE, useAsync, useForm, useToast } from '../../components/ui.jsx';
import { useT } from '../../lib/i18n.jsx';
import { money } from '../../lib/format.js';
import CrudPage, { statusColumn } from '../../components/CrudPage.jsx';

export function ClinicsPage() {
  const { t } = useT();
  const { reloadClinics } = useAuth();
  return (
    <CrudPage
      icon={Building2}
      onSaved={reloadClinics}
      title={t('menu.clinicGeneration')}
      subtitle={t('clinics.subtitle')}
      endpoint="/clinics"
      clinic={null}
      addLabel={t('clinics.add')}
      fields={[
        { name: 'name', label: t('field.clinicName'), required: true, placeholder: 'e.g. Abi Homeo Clinic' },
        { name: 'code', label: t('field.code'), required: true, upper: true, maxLength: 10, hint: t('clinics.codeHint'), placeholder: 'e.g. DC' },
        { name: 'phone', label: t('field.phone'), type: 'tel', placeholder: 'e.g. 98765 43210' },
        { name: 'email', label: t('field.email'), type: 'email', placeholder: 'e.g. clinic@mail.com' },
        { name: 'city', label: t('field.city') },
        { name: 'consultation_fee', label: t('field.consultationFee'), type: 'number', placeholder: '0.00' },
        { name: 'address', label: t('field.address'), type: 'textarea', full: true },
      ]}
      columns={[
        { key: 'name', label: t('field.clinicName') },
        { key: 'code', label: t('field.code') },
        { key: 'city', label: t('field.city') },
        { key: 'phone', label: t('field.phone') },
        { key: 'consultation_fee', label: t('field.consultationFee'), className: 'num', render: (r) => money(r.consultation_fee) },
        { key: 'units', label: t('clinics.units'), render: (r) => `${r.pharmacy_count} / ${r.lab_count} / ${r.employee_count}` },
        statusColumn(t),
      ]}
    />
  );
}

const CLINIC_FIELDS = ['name', 'code', 'phone', 'email', 'city', 'consultation_fee', 'address'];

/** Single-clinic mode: Admin → Clinic Settings, the edit form of the one clinic (no Clinic Generation list). */
export function ClinicSettingsPage() {
  const { t } = useT();
  const toast = useToast();
  const auth = useAuth();
  const id = auth.appClinic?.id || auth.activeClinicId;
  const clinic = useAsync(() => (auth.singleClinic && id ? api(`/clinics/${id}`, { clinic: null }) : Promise.resolve(null)), [id]);
  const f = useForm({ name: '', code: '', phone: '', email: '', city: '', consultation_fee: '', address: '' });
  const [saving, setSaving] = useState(false);

  const load = (c) => f.setValues(Object.fromEntries(CLINIC_FIELDS.map((k) => [k, c?.[k] ?? ''])));
  useEffect(() => { if (clinic.data) load(clinic.data); }, [clinic.data]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!auth.singleClinic) return <ClinicsPage />;
  if (clinic.loading && !clinic.data) return <div className="card"><Spinner /></div>;
  if (clinic.error) return <div className="card"><ErrorBox error={clinic.error} onRetry={clinic.reload} /></div>;

  const v = f.values;
  async function submit(e) {
    e.preventDefault();
    if (!v.name.trim()) return toast(t('common.isRequired', { field: t('field.clinicName') }), 'error');
    if (!v.code.trim()) return toast(t('common.isRequired', { field: t('field.code') }), 'error');
    setSaving(true);
    try {
      await api(`/clinics/${id}`, { method: 'PUT', body: { ...v, code: String(v.code).toUpperCase() }, clinic: null });
      toast(t('common.updatedX', { x: t('menu.clinicSettings') }));
      await auth.reloadClinics();
      clinic.reload();
    } catch (err) {
      toast(err.message || t('common.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
    return undefined;
  }

  return (
    <div className="card">
      <form onSubmit={submit} noValidate>
        <CardHeader icon={Building2} title={t('menu.clinicSettings')} subtitle={t('clinics.settingsSubtitle')} />
        <div className={GRID_WIDE}>
          <div>
            <label className="label">{t('field.clinicName')} *</label>
            <input className="input" placeholder="e.g. Abi Homeo Clinic" {...f.bind('name')} />
          </div>
          <div>
            <label className="label">{t('field.code')} *</label>
            <input className="input" maxLength={10} placeholder={t('clinics.codeHint')} value={v.code} onChange={(e) => f.set('code', e.target.value.toUpperCase())} />
          </div>
          <div>
            <label className="label">{t('field.phone')}</label>
            <input className="input" type="tel" inputMode="numeric" placeholder="e.g. 98765 43210" {...f.bind('phone')} />
          </div>
          <div>
            <label className="label">{t('field.email')}</label>
            <input className="input" type="email" placeholder="e.g. clinic@mail.com" {...f.bind('email')} />
          </div>
          <div>
            <label className="label">{t('field.city')}</label>
            <input className="input" placeholder="e.g. Madurai" {...f.bind('city')} />
          </div>
          <div>
            <label className="label">{t('field.consultationFee')}</label>
            <input className="input no-spin" type="number" step="0.01" min="0" inputMode="decimal" placeholder="0.00" {...f.bind('consultation_fee')} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">{t('field.address')}</label>
            <textarea className="input" rows={2} placeholder="Door no, street, town" {...f.bind('address')} />
          </div>
        </div>
        <div className="no-print mt-3 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button type="button" className="btn-secondary px-2 sm:px-4" onClick={() => load(clinic.data)}><X size={16} /> {t('common.cancel')}</button>
          <button type="submit" className="btn-primary px-2 sm:px-4" disabled={saving}><Save size={16} /> {saving ? t('common.saving') : t('common.save')}</button>
        </div>
      </form>
    </div>
  );
}

function UnitPage({ kind }) {
  const { t } = useT();
  const { clinics, singleClinic } = useAuth();
  const [clinicFilter, setClinicFilter] = useState('');
  const clinicOptions = clinics.map((c) => ({ value: String(c.id), label: `${c.name} (${c.code})` }));
  const isPharmacy = kind === 'pharmacy';
  const nameLabel = t(isPharmacy ? 'field.pharmacyName' : 'field.labName');
  const common = {
    icon: isPharmacy ? Pill : FlaskConical,
    title: t(isPharmacy ? 'menu.pharmacyGeneration' : 'menu.labGeneration'),
    subtitle: t(isPharmacy ? 'pharmacies.subtitle' : 'labs.subtitle'),
    endpoint: isPharmacy ? '/pharmacies' : '/labs',
    clinic: null,
    addLabel: t(isPharmacy ? 'pharmacies.add' : 'labs.add'),
  };
  const fields = [
    { name: 'name', label: nameLabel, required: true },
    { name: 'code', label: t('field.code'), required: true, upper: true, maxLength: 10 },
    { name: 'phone', label: t('field.phone'), type: 'tel', placeholder: 'e.g. 98765 43210' },
    ...(isPharmacy ? [{ name: 'license_no', label: t('field.licenseNo'), upper: true }] : []),
    { name: 'address', label: t('field.address'), type: 'textarea', full: true },
  ];

  // Single clinic: every unit belongs to the one clinic, so no clinic picker, filter or column
  if (singleClinic) {
    return (
      <CrudPage {...common} fields={fields}
        columns={[{ key: 'name', label: nameLabel }, { key: 'code', label: t('field.code') }, { key: 'phone', label: t('field.phone') }, statusColumn(t)]} />
    );
  }

  return (
    <CrudPage {...common}
      extraQuery={{ clinic_id: clinicFilter }}
      filters={(
        <select className="input w-full sm:w-52" value={clinicFilter} onChange={(e) => setClinicFilter(e.target.value)} aria-label={t('field.clinic')}>
          <option value="">{t('topbar.allClinics')}</option>
          {clinicOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
      defaults={{ clinic_id: clinicFilter }}
      fields={[{ name: 'clinic_id', label: t('field.linkedClinic'), type: 'select', required: true, options: clinicOptions }, ...fields]}
      columns={[
        { key: 'name', label: nameLabel },
        { key: 'code', label: t('field.code') },
        { key: 'clinic_name', label: t('field.linkedClinic'), render: (r) => `${r.clinic_name} (${r.clinic_code})` },
        { key: 'phone', label: t('field.phone') },
        statusColumn(t),
      ]}
    />
  );
}

export const PharmaciesPage = () => <UnitPage kind="pharmacy" />;
export const LabsPage = () => <UnitPage kind="lab" />;
