// Printable prescription (Doctor → Examine → Print, or Patient History → Print).
// "Print / PDF" uses the browser print dialog (choose "Save as PDF"); same A5 layout as the bill.
import { useT } from '../../lib/i18n.jsx';
import { api } from '../../lib/api.js';
import { ageLabel, fmtDate, genderLabel } from '../../lib/format.js';
import { ErrorBox, Spinner, useAsync } from '../../components/ui.jsx';
import { vitalsSummary } from '../../components/VitalSigns.jsx';
import { Doc, DocHead, DocMeta, DOC_LINE, DOC_TABLE, PrintBar, SignLine } from '../../components/PrintDoc.jsx';

export default function PrescriptionPrint({ params }) {
  const { t } = useT();
  const { data: v, error, loading, reload } = useAsync(() => api(`/visits/${params.visitId}`), [params.visitId]);

  if (loading && !v) return <div className="card"><Spinner /></div>;
  if (error) return <div className="card"><ErrorBox error={error} onRetry={reload} /></div>;
  const rx = v.prescriptions || [];
  const vitals = v.vitals_id ? vitalsSummary(v, t) : '';

  return (
    <>
      <PrintBar />
      <Doc>
        <DocHead name={v.clinic_name} address={v.clinic_address} city={v.clinic_city} phone={v.clinic_phone} brand="Ayush Pro" />
        <DocMeta
          left={[t('rxPrint.patient'), v.patient_name, `${v.patient_code} · ${genderLabel(v.gender, t)} / ${ageLabel(v)}`, v.mobile]}
          right={[t('rxPrint.date'), fmtDate(v.visit_date), v.token_no && `${t('queue.token')} #${v.token_no}`, v.doctor_name && `${t('menu.doctor')}: ${v.doctor_name}`]} />

        {(vitals || v.vitals_comments) && (
          <p className={DOC_LINE}><b>{t('vitals.title')}:</b> {[vitals, v.vitals_comments].filter(Boolean).join(' · ')}</p>
        )}
        {v.complaints && <p className={DOC_LINE}><b>{t('examine.complaints')}:</b> {v.complaints}</p>}
        {v.diagnosis && <p className={DOC_LINE}><b>{t('examine.diagnosis')}:</b> {v.diagnosis}</p>}

        <h2 className="mb-1.5 mt-3.5 font-serif text-2xl text-brand-700">℞</h2>
        {rx.length ? (
          <table className={DOC_TABLE}>
            <thead>
              <tr>
                <th>#</th><th>{t('examine.medicine')}</th><th>{t('examine.potency')}</th><th>{t('examine.dosage')}</th>
                <th>{t('examine.repetition')}</th><th>{t('examine.duration')}</th><th>{t('examine.instructions')}</th>
              </tr>
            </thead>
            <tbody>
              {rx.map((r, i) => (
                <tr key={r.id}>
                  <td>{i + 1}</td>
                  <td><b>{r.medicine_name}</b>{r.generic_name && <small className="block text-11 leading-snug text-ink-400">{r.generic_name}</small>}</td>
                  <td>{r.potency || '-'}</td>
                  <td>{r.dosage || '-'}</td>
                  <td>{r.frequency || '-'}</td>
                  <td>{r.duration || '-'}</td>
                  <td>{r.instructions || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-ink-400">{t('rxPrint.noMedicines')}</p>}

        {v.advice && <p className={DOC_LINE}><b>{t('examine.advice')}:</b> {v.advice}</p>}
        {v.follow_up_date && <p className={DOC_LINE}><b>{t('examine.followUp')}:</b> {fmtDate(v.follow_up_date)}</p>}

        <footer className="mt-12 flex justify-end">
          <SignLine name={v.doctor_name || t('menu.doctor')} sub={[v.doctor_qualification, v.doctor_designation].filter(Boolean).join(', ')} />
        </footer>
      </Doc>
    </>
  );
}
