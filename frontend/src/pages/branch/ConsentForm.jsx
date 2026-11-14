// Patient & Queue → Patient Consent Form: find a patient, then print their consent form
// (Patient Name, Age / Date of Birth, Gender, Mobile Number, Address filled in) for signing.
// "Blank form" prints the same form with empty lines, for a patient not yet registered.
// "Print / PDF" uses the browser print dialog; the form prints on A4 portrait.
import { useState } from 'react';
import { FileSignature, Printer, FileText } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useT } from '../../lib/i18n.jsx';
import { navigate } from '../../lib/router.jsx';
import { ageLabel, fmtDate, genderLabel, todayLocal } from '../../lib/format.js';
import { CardHeader, EmptyState, ErrorBox, Spinner, SearchBox, useAsync, useDebounced } from '../../components/ui.jsx';
import { Doc, DocHead, PrintBar, SignLine } from '../../components/PrintDoc.jsx';

const CONSENT_POINTS = 5;   // consent.point.1 … consent.point.5

function PatientSearch() {
  const { t } = useT();
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const r = useAsync(() => (dq.trim() ? api('/patients', { query: { q: dq.trim(), limit: 20 } }) : Promise.resolve({ rows: [] })), [dq]);
  return (
    <div className="card">
      <CardHeader icon={FileSignature} title={t('menu.consentForm')} subtitle={t('consent.subtitle')}
        actions={(
          <>
            <SearchBox value={q} onChange={setQ} placeholder={t('patients.searchHint')} autoFocus />
            <button type="button" className="btn-secondary" onClick={() => navigate('/queue/consent/blank')}><Printer size={16} /> {t('consent.blank')}</button>
          </>
        )} />
      {!dq.trim() ? <EmptyState message={t('queue.typeToSearch')} /> : r.loading && !r.data ? <Spinner /> : r.data?.rows.length === 0 ? (
        <EmptyState message={t('queue.noMatch')} />
      ) : (
        <ul className="divide-y divide-ink-100">
          {r.data?.rows.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <strong className="text-sm text-ink-800">{p.name}</strong>
                <span className="block text-13 text-ink-500">{p.patient_code} · {p.mobile} · {genderLabel(p.gender, t)} / {ageLabel(p)}</span>
              </div>
              <button type="button" className="btn-secondary shrink-0 !px-2.5 !py-1 !text-13" onClick={() => navigate(`/queue/consent/${p.id}`)}>
                <FileText size={15} /> {t('consent.open')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One "label: value" line of the form; an empty value prints as a line to write on. */
function FormLine({ label, value, wide }) {
  return (
    <div className={`grid grid-cols-1 items-end gap-0.5 sm:gap-2 ${wide ? 'sm:grid-cols-[15rem_minmax(0,1fr)]' : 'sm:grid-cols-[10.5rem_minmax(0,1fr)]'} print:gap-2 ${wide ? 'print:grid-cols-[15rem_minmax(0,1fr)]' : 'print:grid-cols-[10.5rem_minmax(0,1fr)]'}`}>
      <span className="font-semibold">{label}</span>
      <span className="min-h-[22px] border-b border-dotted border-ink-500 px-1 pb-0.5">{value || ''}</span>
    </div>
  );
}

function ConsentSheet({ patient: p, clinic: c }) {
  const { t } = useT();
  const clinicName = c?.name || '';
  const age = p && (p.age_years != null || p.dob) ? ageLabel(p) : '';
  const ageDob = p ? [age && `${age} ${t('consent.years')}`, p.dob && fmtDate(p.dob)].filter(Boolean).join(' / ') : '';
  return (
    <Doc className="print-consent !max-w-[800px] leading-relaxed">
      <DocHead name={clinicName} address={c?.address} city={c?.city} phone={c?.phone} brand="Ayush Pro" />

      <h2 className="my-3.5 text-center text-lg font-bold uppercase tracking-wide">{t('consent.title')}</h2>

      <section className="mb-3.5 grid gap-2">
        <FormLine label={t('consent.patientName')} value={p?.name} />
        {p?.patient_code && <FormLine label={t('consent.patientId')} value={p.patient_code} />}
        <FormLine label={t('consent.ageDob')} value={ageDob} />
        <FormLine label={t('consent.gender')} value={p?.gender ? genderLabel(p.gender, t) : ''} />
        <FormLine label={t('consent.mobile')} value={p?.mobile} />
        <FormLine label={t('consent.address')} value={p?.address} />
      </section>

      <p className="my-2.5">{t('consent.intro', { name: p?.name || '______________________', clinic: clinicName || '______________________' })}</p>
      <ol className="my-1.5 list-decimal space-y-1 pl-6">
        {Array.from({ length: CONSENT_POINTS }, (_, i) => <li key={i}>{t(`consent.point.${i + 1}`)}</li>)}
      </ol>
      <p className="my-2.5">{t('consent.closing')}</p>

      <div className="my-12 grid grid-cols-1 gap-9 text-center font-semibold sm:grid-cols-3 sm:gap-7 print:grid-cols-3 print:gap-7">
        <SignLine name={t('consent.signPatient')} className="!min-w-0" />
        <SignLine name={t('consent.signWitness')} className="!min-w-0" />
        <SignLine name={t('consent.signDoctor')} className="!min-w-0" />
      </div>
      <div className="grid gap-2">
        <FormLine wide label={t('consent.guardian')} value="" />
        <FormLine wide label={t('consent.date')} value={p ? fmtDate(todayLocal()) : ''} />
        <FormLine wide label={t('consent.place')} value={p ? c?.city : ''} />
      </div>
    </Doc>
  );
}

export default function ConsentForm({ params }) {
  const blank = params.patientId === 'blank';
  const id = params.patientId && !blank ? params.patientId : null;
  const pt = useAsync(() => (id ? api(`/patients/${id}`) : Promise.resolve(null)), [id]);
  const clinic = useAsync(() => (params.patientId ? api('/patients/clinic-info') : Promise.resolve(null)), [!!params.patientId]);

  if (!params.patientId) return <PatientSearch />;
  if ((pt.loading && !pt.data) || (clinic.loading && !clinic.data)) return <div className="card"><Spinner /></div>;
  if (pt.error || clinic.error) return <div className="card"><ErrorBox error={pt.error || clinic.error} onRetry={pt.error ? pt.reload : clinic.reload} /></div>;
  return (
    <>
      <PrintBar onBack={() => navigate('/queue/consent')} />
      <ConsentSheet patient={blank ? null : pt.data} clinic={clinic.data} />
    </>
  );
}
