// Printable Day Book chart (Doctor → Examine → Prescription → Day Book → Print chart).
// "Print / PDF" uses the browser print dialog; printed on A4 landscape so the routine columns fit.
// ?days=N sets how many days the chart covers (default: the Frequency's number of days, else up to the
// follow-up date, else 7).
import { useT } from '../../lib/i18n.jsx';
import { api } from '../../lib/api.js';
import { useLocation } from '../../lib/router.jsx';
import { ageLabel, fmtDate, genderLabel } from '../../lib/format.js';
import { ErrorBox, Spinner, useAsync } from '../../components/ui.jsx';
import DayBookChart from '../../components/DayBookChart.jsx';
import { Doc, DocHead, DocMeta, DOC_LINE, PrintBar } from '../../components/PrintDoc.jsx';
import { cleanChartDays, defaultChartDays } from '../../../../shared/daybook.js';

export default function DayBookPrint({ params }) {
  const { t } = useT();
  const { query } = useLocation();
  const { data: v, error, loading, reload } = useAsync(() => api(`/visits/${params.visitId}`), [params.visitId]);

  if (loading && !v) return <div className="card"><Spinner /></div>;
  if (error) return <div className="card"><ErrorBox error={error} onRetry={reload} /></div>;
  const start = v.daybook_date || String(v.visit_date).slice(0, 10);
  const days = cleanChartDays(query.days, defaultChartDays(start, v.follow_up_date, v.daybook_frequency));

  return (
    <>
      <PrintBar />
      <Doc className="print-daybook !max-w-[1100px]">
        <DocHead name={v.clinic_name} address={v.clinic_address} city={v.clinic_city} phone={v.clinic_phone} brand={t('daybook.chartTitle')} />
        <DocMeta
          left={[t('rxPrint.patient'), v.patient_name, `${v.patient_code} · ${genderLabel(v.gender, t)} / ${ageLabel(v)}`, v.mobile]}
          right={[t('daybook.from'), fmtDate(start), t('daybook.daysCount', { n: days }), v.doctor_name && `${t('menu.doctor')}: ${v.doctor_name}`]} />

        <p className={DOC_LINE}>
          <b>{t('examine.dbroutine')}:</b> {v.daybook_routine.join(', ') || '-'}
          {v.daybook_duration && <> · <b>{t('examine.dbduration')}:</b> {v.daybook_duration}</>}
          {v.daybook_frequency && <> · <b>{t('examine.dbfrequency')}:</b> {v.daybook_frequency}</>}
        </p>

        <div className="overflow-x-auto print:overflow-visible">
          <DayBookChart date={start} routines={v.daybook_routine} frequency={`${v.daybook_duration || ''} ${v.daybook_frequency || ''}`} days={days}
            values={v.daybook_chart} />
        </div>
        <p className="mt-2.5 text-12 text-ink-400">{t('daybook.chartNote')}</p>
      </Doc>
    </>
  );
}
