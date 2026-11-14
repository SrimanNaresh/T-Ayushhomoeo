// Registration → Patient List → a patient: details, add to today's queue, history, edit
import { useState } from 'react';
import { UserRound, Ticket, History, Pencil } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useT } from '../../lib/i18n.jsx';
import { navigate } from '../../lib/router.jsx';
import { ageLabel, fmtDate, genderLabel } from '../../lib/format.js';
import { CardHeader, ErrorBox, Spinner, StatusBadge, useAsync, useToast } from '../../components/ui.jsx';
import DoctorSelect from '../../components/DoctorSelect.jsx';

export default function PatientView({ params }) {
  const { t } = useT();
  const auth = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [doctorId, setDoctorId] = useState('');
  const { data: p, error, loading, reload } = useAsync(() => api(`/patients/${params.id}`), [params.id]);

  async function addToQueue() {
    if (!doctorId) { toast(t('queue.doctorRequired'), 'error'); return; }
    setBusy(true);
    try {
      const q = await api('/queue', { method: 'POST', body: { patient_id: p.id, doctor_id: doctorId, visit_type: p.visit_count ? 'follow_up' : 'new' } });
      toast(t('queue.confirmed', { n: q.token_no, name: p.name }));
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="card"><Spinner /></div>;
  if (error) return <div className="card"><ErrorBox error={error} onRetry={reload} /></div>;

  const rows = [
    [t('field.patientId'), p.patient_code],
    [t('field.mobile'), p.mobile],
    [t('field.altMobile'), p.alt_mobile],
    [t('field.genderAge'), `${genderLabel(p.gender, t)} / ${ageLabel(p)}`],
    [t('field.dob'), p.dob ? fmtDate(p.dob) : null],
    [t('field.bloodGroup'), p.blood_group],
    [t('field.email'), p.email],
    [t('field.occupation'), p.occupation],
    [t('field.address'), [p.address, p.city].filter(Boolean).join(', ')],
    [t('field.notes'), p.notes],
    [t('patients.registeredOn'), fmtDate(p.created_at, true)],
    [t('patients.visits'), `${p.visit_count}${p.last_visit ? ` · ${t('patients.lastVisit')} ${fmtDate(p.last_visit)}` : ''}`],
  ];

  return (
    <div className="card">
      <CardHeader icon={UserRound} title={p.name}
        subtitle={<span className="inline-flex items-center gap-1.5">{p.patient_code} <StatusBadge status={p.status} /></span>}
        actions={(
          <>
            {auth.can('patient.history') && <button type="button" className="btn-secondary" onClick={() => navigate(`/doctor/history/${p.id}`)}><History size={16} /> {t('menu.patientHistory')}</button>}
            {auth.can('patient.edit') && <button type="button" className="btn-secondary" onClick={() => navigate(`/patients/${p.id}/edit`)}><Pencil size={16} /> {t('common.edit')}</button>}
          </>
        )} />

      {auth.can('queue.confirm') && (
        <div className="mb-3 flex flex-col gap-2 rounded-xl border border-brand-100 bg-brand-50/50 p-2.5 sm:flex-row sm:items-center">
          <span className="text-13 font-semibold text-brand-800 sm:mr-auto">{t('queue.addToQueue')}</span>
          <DoctorSelect value={doctorId} onChange={setDoctorId} />
          <button type="button" className="btn-primary" onClick={addToQueue} disabled={busy || !doctorId} title={!doctorId ? t('queue.doctorRequired') : undefined}>
            <Ticket size={16} /> {t('queue.addToQueue')}
          </button>
        </div>
      )}

      <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="border-b border-ink-100 py-2">
            <dt className="text-12 font-semibold text-ink-500">{k}</dt>
            <dd className="whitespace-pre-line break-words text-13 text-ink-800">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
