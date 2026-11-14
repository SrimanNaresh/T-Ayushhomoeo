// Doctor → Patient History: all previous visits and prescriptions
import { useState } from 'react';
import { History, Pencil, Printer, ChevronLeft, FolderOpen } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useT } from '../../lib/i18n.jsx';
import { navigate } from '../../lib/router.jsx';
import { ageLabel, fmtDate, genderLabel, money } from '../../lib/format.js';
import { CardHeader, EmptyState, ErrorBox, Spinner, SearchBox, StatusBadge, TH, useAsync, useDebounced } from '../../components/ui.jsx';
import { vitalsSummary } from '../../components/VitalSigns.jsx';
import { DosDontSummary } from '../../components/DosDontList.jsx';
import { PastHistorySummary } from '../../components/PastHistoryList.jsx';
import ComparativeStudy from '../../components/ComparativeStudy.jsx';

function PatientSearch() {
  const { t } = useT();
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const r = useAsync(() => (dq.trim() ? api('/patients', { query: { q: dq.trim(), limit: 20 } }) : Promise.resolve({ rows: [] })), [dq]);
  return (
    <div className="card">
      <CardHeader icon={History} title={t('menu.patientHistory')} subtitle={t('history.subtitle')}
        actions={<SearchBox value={q} onChange={setQ} placeholder={t('patients.searchHint')} autoFocus />} />
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
              <button type="button" className="btn-secondary shrink-0 !px-2.5 !py-1 !text-13" onClick={() => navigate(`/doctor/history/${p.id}`)}>
                <FolderOpen size={15} /> {t('history.open')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Vitals({ v, visit }) {
  const { t } = useT();
  const cls = 'mb-1.5 rounded-lg bg-teal-50/60 px-2.5 py-1 text-12 text-teal-900';
  if (visit?.vitals_id) {
    const line = [vitalsSummary(visit, t), visit.vitals_comments].filter(Boolean).join(' · ');
    return line ? <p className={cls}>{line}</p> : null;
  }
  if (!v) return null;
  const parts = [
    v.bp && `${t('examine.bp')} ${v.bp}`, v.pulse && `${t('examine.pulse')} ${v.pulse}`,
    v.temp && `${t('examine.temp')} ${v.temp}`, v.weight && `${t('examine.weight')} ${v.weight}`,
  ].filter(Boolean);
  return parts.length ? <p className={cls}>{parts.join(' · ')}</p> : null;
}

const Row = ({ label, children }) => (
  <div className="grid gap-0.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-2">
    <dt className="text-12 font-semibold text-ink-500">{label}</dt><dd className="whitespace-pre-line text-13 text-ink-800">{children}</dd>
  </div>
);

export default function PatientHistory({ params }) {
  const { t } = useT();
  const auth = useAuth();
  const h = useAsync(() => (params.patientId ? api(`/visits/patient/${params.patientId}`) : Promise.resolve(null)), [params.patientId]);
  const [csCount, setCsCount] = useState(0);

  if (!params.patientId) return <PatientSearch />;
  if (h.loading && !h.data) return <div className="card"><Spinner /></div>;
  if (h.error) return <div className="card"><ErrorBox error={h.error} onRetry={h.reload} /></div>;
  const { patient, visits } = h.data;
  const small = 'btn-secondary !px-2.5 !py-1 !text-13';

  return (
    <div className="card">
      <CardHeader icon={History} title={patient.name}
        subtitle={`${patient.patient_code} · ${genderLabel(patient.gender, t)} / ${ageLabel(patient)} · ${patient.mobile}`}
        actions={<button type="button" className="btn-secondary" onClick={() => navigate('/doctor/history')}><ChevronLeft size={16} /> {t('history.another')}</button>} />

      {/* the patient's Comparative Study table, read only; shown only when there are readings */}
      <div className={csCount ? 'mb-4 rounded-xl border border-ink-100 p-3' : ''}>
        <ComparativeStudy patientId={patient.id} readOnly onCount={setCsCount} />
      </div>

      {!visits.length && <EmptyState message={t('history.noVisits')} />}
      <ol className="relative space-y-3 border-l-2 border-brand-100 pl-4 sm:pl-5">
        {visits.map((v) => (
          <li key={v.id} className="relative">
            <span className="absolute -left-[1.42rem] top-3 h-3 w-3 rounded-full border-2 border-white bg-brand-500 ring-2 ring-brand-100 sm:-left-[1.67rem]" />
            <article className="rounded-xl border border-ink-100 bg-white p-3 shadow-card">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <b className="text-ink-800">{fmtDate(v.visit_date, true)}</b>
                  <span className="text-13 text-ink-500"> · {v.doctor_name || '-'}{v.token_no ? ` · #${v.token_no}` : ''}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {auth.user.role === 'super_admin' && (   /* editing a past visit: Super Admin only */
                    <button type="button" className={small} onClick={() => navigate(`/doctor/examine/${v.id}?from=history&patient=${patient.id}`)}>
                      <Pencil size={14} /> {t('common.edit')}
                    </button>
                  )}
                  <button type="button" className={small} onClick={() => navigate(`/doctor/prescription/${v.id}`)}>
                    <Printer size={14} /> {t('rxPrint.print')}
                  </button>
                  <StatusBadge status={v.status} />
                  <span className="text-12 text-ink-400">{money(v.consultation_fee)}</span>
                </div>
              </div>
              <Vitals v={v.vitals} visit={v} />
              <dl className="grid gap-1">
                {v.complaints && <Row label={t('examine.complaints')}>{v.complaints}</Row>}
                {v.examination_notes && <Row label={t('examine.examination')}>{v.examination_notes}</Row>}
                {v.diagnosis && <Row label={t('examine.diagnosis')}>{v.diagnosis}</Row>}
                {v.advice && <Row label={t('examine.advice')}>{v.advice}</Row>}
                {v.dos_donts?.length > 0 && <DosDontSummary marks={v.dos_donts} />}
                {v.follow_up_date && <Row label={t('examine.followUp')}>{fmtDate(v.follow_up_date)}</Row>}
              </dl>
              {v.medical_history?.length > 0 && (
                <div className="mt-2 border-t border-ink-100 pt-2">
                  <h4 className="section-title mb-1">{t('examine.medicalHistory')}</h4>
                  <PastHistorySummary value={v.medical_history} />
                </div>
              )}
              {v.past_history?.length > 0 && (
                <div className="mt-2 border-t border-ink-100 pt-2">
                  <h4 className="section-title mb-1">{t('examine.pastHistory')}</h4>
                  <PastHistorySummary value={v.past_history} />
                </div>
              )}
              {v.prescriptions?.length > 0 && (
                <div className="mt-2 overflow-x-auto rounded-lg">
                  <table className="list-pinned pin-first w-full min-w-[520px] text-left text-13 [&_td]:px-2.5 [&_td]:py-1">
                    <thead>
                      <tr className="table-head">
                        <th className={`${TH} rounded-l-lg`}>{t('examine.medicine')}</th><th className={TH}>{t('examine.potency')}</th><th className={TH}>{t('examine.dosage')}</th>
                        <th className={TH}>{t('examine.repetition')}</th><th className={`${TH} rounded-r-lg`}>{t('examine.duration')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {v.prescriptions.map((r) => (
                        <tr key={r.id}>
                          <td className="font-medium text-ink-700">{r.medicine_name}{r.instructions ? <small className="font-normal text-ink-400"> – {r.instructions}</small> : null}</td>
                          <td className="text-ink-500">{r.potency || '-'}</td>
                          <td className="text-ink-500">{r.dosage || '-'}</td>
                          <td className="text-ink-500">{r.frequency || '-'}</td>
                          <td className="text-ink-500">{r.duration || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </li>
        ))}
      </ol>
    </div>
  );
}
