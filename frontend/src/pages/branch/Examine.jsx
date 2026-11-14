// Doctor → Examine: open a patient from the queue, enter complaints, diagnosis, prescription
import { useEffect, useState } from 'react';
import {
  Stethoscope, RefreshCw, ChevronLeft, ChevronRight, ChevronDown, Clock, Printer, Plus, Trash2, Save, CheckCircle2,
  History, HeartPulse, ClipboardList, Pill, MessageSquareText,
} from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useT } from '../../lib/i18n.jsx';
import { navigate, useLocation } from '../../lib/router.jsx';
import { ageLabel, fmtDate, fmtTime12, genderLabel, queueStatus, todayLocal } from '../../lib/format.js';
import {
  Badge, CardHeader, DataTable, EmptyState, ErrorBox, Input, Spinner, StatusBadge, TextArea, TokenChip, useAsync, useToast,
} from '../../components/ui.jsx';
import { DashTabs } from '../../components/DashboardKit.jsx';
import ItemPicker from '../../components/ItemPicker.jsx';
import { RX_LIST_DEFAULTS } from '../../../../shared/dosage.js';
import DosDontList, { DosDontSummary } from '../../components/DosDontList.jsx';
import PastHistoryList, { PastHistorySummary } from '../../components/PastHistoryList.jsx';
import RxListPicker from '../../components/RxListPicker.jsx';
import { VitalsForm, VitalsHistory, vitalsSummary } from '../../components/VitalSigns.jsx';
import Attachments from '../../components/Attachments.jsx';
import ComparativeStudy from '../../components/ComparativeStudy.jsx';
import DayBookChart from '../../components/DayBookChart.jsx';
import { cleanChartDays, defaultChartDays, MAX_CHART_DAYS } from '../../../../shared/daybook.js';

const emptyLine = () => ({ key: Math.random().toString(36).slice(2), medicine_name: '', item_id: null, potency: '', dosage: '', frequency: '', duration: '', quantity: 1, instructions: '' });

/** A clinic's Potency / Dosage / Repetition / Do's and Don'ts list (by Order), replaced locally after an add / edit / delete. */
function useRxList(kind) {
  const loaded = useAsync(() => api(`/visits/${kind}-options`), [kind]);
  const [changed, setChanged] = useState(null);
  return [changed || loaded.data || { rows: RX_LIST_DEFAULTS[kind], added: [] }, setChanged];
}

// Page 1 – Doctor → Examine: today's patients still to be seen (Pre-Examine / With doctor)
function QueuePage() {
  const { t } = useT();
  const auth = useAuth();
  const toast = useToast();
  const queue = useAsync(() => api('/queue'), []);
  const rows = (queue.data?.rows || []).filter((r) => r.status === 'waiting' || r.status === 'with_doctor');

  async function open(r) {
    try {
      const v = r.visit_id ? { id: r.visit_id } : await api('/visits/start', { method: 'POST', body: { queue_id: r.id } });
      navigate(`/doctor/examine/${v.id}`);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <div className="card">
      <CardHeader icon={Stethoscope} title={t('examine.todayQueue')} subtitle={auth.activeClinic?.name}
        actions={<button type="button" className="btn-secondary" onClick={queue.reload}><RefreshCw size={16} /> {t('common.refresh')}</button>} />
      {queue.loading && !queue.data ? <Spinner /> : <ErrorBox error={queue.error} onRetry={queue.reload} />}
      {queue.data && (
        <DataTable rows={rows} empty={t('examine.noneWaiting')} onRowClick={open} columns={[
          {
            key: 'patient_name', label: t('field.name'), render: (r) => (
              <span className="flex items-center gap-2">
                <TokenChip no={r.token_no} />
                <span><span className="block text-ink-800">{r.patient_name}</span><span className="block text-11 font-normal text-ink-400">{r.patient_code}</span></span>
              </span>
            ),
          },
          { key: 'ga', label: t('field.genderAge'), className: 'nowrap', render: (r) => `${genderLabel(r.gender, t)} / ${ageLabel(r)}` },
          {
            key: 'doctor_name', label: t('menu.doctor'), render: (r) => (r.doctor_name
              ? <>{r.doctor_name}{r.slot_time && <span className="flex items-center gap-1 text-11 text-ink-400"><Clock size={11} /> {fmtTime12(r.slot_time)}</span>}</>
              : '-'),
          },
          { key: 'vitals', label: t('vitals.title'), className: 'min-w-[14rem]', render: (r) => <span className="text-12">{r.vitals_id ? vitalsSummary(r, t) || t('vitals.commentsOnly') : <span className="text-ink-400">{t('examine.noVitals')}</span>}</span> },
          { key: 'status', label: t('field.status'), render: (r) => <StatusBadge status={queueStatus(r)} /> },
          {
            key: '_a', label: t('queue.examine'), className: 'col-actions', render: (r) => (
              <button type="button" className="btn-primary !px-2.5 !py-1 !text-13" onClick={(e) => { e.stopPropagation(); open(r); }}>
                <Stethoscope size={15} /> {r.visit_id ? t('examine.continue') : t('queue.examine')}
              </button>
            ),
          },
        ]} />
      )}
    </div>
  );
}

// The last 5 visits, each with what was filled in: Vital signs, Complaints & diagnosis, Prescription,
// Advice. Empty fields, sections and prescription columns are left out. Each visit can be folded.
const PAST_VISITS_SHOWN = 5;

const RX_COLUMNS = [
  ['medicine_name', 'examine.medicine'], ['potency', 'examine.potency'], ['dosage', 'examine.dosage'],
  ['frequency', 'examine.repetition'], ['duration', 'examine.duration'], ['instructions', 'examine.instructions'],
];
const filled = (v) => v != null && String(v).trim() !== '';

/** label → value rows, only the filled ones; null when none are filled */
function Fields({ rows }) {
  const shown = rows.filter(([, value]) => filled(value));
  if (!shown.length) return null;
  return (
    <dl className="grid gap-1">
      {shown.map(([label, value]) => (
        <div key={label} className="grid gap-0.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-2">
          <dt className="text-12 font-semibold text-ink-500">{label}</dt><dd className="whitespace-pre-line text-13 text-ink-800">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One titled block of a past visit; `wide` spans both columns. */
const PvSection = ({ title, wide, children }) => (
  <section className={`rounded-lg border border-ink-100 bg-white p-2.5 ${wide ? 'md:col-span-2' : ''}`}>
    <h4 className="section-title mb-1.5 !text-brand-600">{title}</h4>
    {children}
  </section>
);

function PastVisitDetails({ v }) {
  const { t } = useT();
  // vitals taken at reception, or the older free-text vitals saved on the visit
  const vitals = v.vitals_id
    ? vitalsSummary(v, t)
    : [v.vitals?.bp && `${t('examine.bp')} ${v.vitals.bp}`, v.vitals?.pulse && `${t('examine.pulse')} ${v.vitals.pulse}`,
      v.vitals?.temp && `${t('examine.temp')} ${v.vitals.temp}`, v.vitals?.weight && `${t('examine.weight')} ${v.vitals.weight}`]
      .filter(Boolean).join(' · ');
  const rx = (v.prescriptions || []).filter((l) => filled(l.medicine_name));
  const rxCols = RX_COLUMNS.filter(([k]) => rx.some((l) => filled(l[k])));
  const dosDonts = v.dos_donts || [];

  const sections = [
    (filled(vitals) || filled(v.vitals_comments)) && (
      <PvSection key="vitals" title={t('vitals.title')}>
        {filled(vitals) && <p className="mb-1 text-13">{vitals}</p>}
        <Fields rows={[[t('vitals.comments'), v.vitals_comments]]} />
      </PvSection>
    ),
    v.queue_id && (
      <PvSection key="attach" title={t('attach.title')} wide>
        <Attachments entry={{ id: v.queue_id }} canEdit={false} showHead={false} />
      </PvSection>
    ),
    [v.complaints, v.examination_notes, v.diagnosis].some(filled) && (
      <PvSection key="clinical" title={t('examine.clinical')}>
        <Fields rows={[[t('examine.complaints'), v.complaints], [t('examine.examination'), v.examination_notes], [t('examine.diagnosis'), v.diagnosis]]} />
      </PvSection>
    ),
    v.medical_history?.length > 0 && (
      <PvSection key="med" title={t('examine.medicalHistory')}><PastHistorySummary value={v.medical_history} /></PvSection>
    ),
    v.past_history?.length > 0 && (
      <PvSection key="past" title={t('examine.pastHistory')}><PastHistorySummary value={v.past_history} /></PvSection>
    ),
    (filled(v.advice) || v.advice_unwilling || filled(v.follow_up_date) || dosDonts.length > 0) && (
      <PvSection key="advice" title={t('examine.advice')}>
        <Fields rows={[[t('examine.advice'), v.advice], [t('examine.unwilling'), v.advice_unwilling ? '✓' : ''], [t('examine.followUp'), v.follow_up_date && fmtDate(v.follow_up_date)]]} />
        {dosDonts.length > 0 && <dl className="mt-1"><DosDontSummary marks={dosDonts} /></dl>}
      </PvSection>
    ),
    (rx.length > 0 || v.rx_unwilling) && (
      <PvSection key="rx" title={t('examine.prescription')} wide>
        {rx.length > 0 && (
          <div className="overflow-x-auto rounded-lg">
            <table className="w-full min-w-[520px] text-left text-12">
              <thead><tr className="table-head">{rxCols.map(([k, label]) => <th key={k} className="px-2 py-1">{t(label)}</th>)}</tr></thead>
              <tbody>
                {rx.map((l) => <tr key={l.id} className="table-row">{rxCols.map(([k]) => <td key={k} className={`px-2 py-1 ${k === 'medicine_name' ? 'font-semibold text-ink-800' : 'text-ink-600'}`}>{l[k] || ''}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
        )}
        {v.rx_unwilling && <p className="mt-1 text-13">{t('examine.unwilling')} ✓</p>}
      </PvSection>
    ),
    (v.daybook_routine?.length > 0 || filled(v.daybook_duration) || filled(v.daybook_frequency)) && (
      <PvSection key="daybook" title={t('daybook.title')}>
        <Fields rows={[[t('examine.dbdate'), v.daybook_date && fmtDate(v.daybook_date)], [t('examine.dbroutine'), (v.daybook_routine || []).join(', ')], [t('examine.dbduration'), v.daybook_duration], [t('examine.dbfrequency'), v.daybook_frequency]]} />
      </PvSection>
    ),
  ].filter(Boolean);

  return sections.length
    ? <div className="grid grid-cols-1 gap-2 p-2.5 md:grid-cols-2">{sections}</div>
    : <p className="px-3 py-2 text-12 text-ink-400">{t('examine.pvNothing')}</p>;
}

function PastVisits({ patientId, excludeId }) {
  const { t } = useT();
  const h = useAsync(() => api(`/visits/patient/${patientId}`), [patientId]);
  const visits = (h.data?.visits || []).filter((v) => v.id !== excludeId).slice(0, PAST_VISITS_SHOWN);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="section-title">{t('examine.lastVisits', { n: PAST_VISITS_SHOWN })}</p>
        <a className="text-13 font-semibold text-brand-700 hover:underline" href={`#/doctor/history/${patientId}`}>{t('examine.fullHistory')}</a>
      </div>
      {h.loading && !h.data && <Spinner />}
      {h.data && !visits.length && <EmptyState message={t('examine.firstVisit')} />}
      <div className="space-y-2">
        {visits.map((v) => (
          <details key={v.id} className="group overflow-hidden rounded-xl border border-ink-200 bg-ink-50/40" open>
            <summary className="flex cursor-pointer list-none items-center gap-2 bg-brand-50/60 px-3 py-1.5 text-13 [&::-webkit-details-marker]:hidden">
              <ChevronDown size={14} className="text-brand-600 transition-transform group-[:not([open])]:-rotate-90" />
              <b className="text-ink-800">{fmtDate(v.visit_date)}</b>
              <span className="text-ink-500">{[v.doctor_name, v.token_no && `#${v.token_no}`].filter(Boolean).join(' · ')}</span>
            </summary>
            <PastVisitDetails v={v} />
          </details>
        ))}
      </div>
    </div>
  );
}

// Vital signs recorded at reception (after Confirm); the doctor can correct them here.
// Lab Reports & Scans uploaded with the vitals are listed here too (files only – no upload here).
function QueueVitals({ queueId, patientName, readOnly }) {
  const v = useAsync(() => api(`/queue/${queueId}/vitals`), [queueId]);
  return (
    <div>
      {v.loading && !v.data ? <Spinner /> : <ErrorBox error={v.error} onRetry={v.reload} />}
      {v.data && (
        <VitalsForm queueId={queueId} initial={v.data.vitals} onSaved={v.reload} readOnly={readOnly}
          beforeActions={<Attachments entry={{ id: queueId, patient_name: patientName }} canEdit={false} showHead={false} />} />
      )}
    </div>
  );
}

/**
 * Sections as tabs down the left side (Complaints & diagnosis, Prescription); on phones a scrolling strip
 * above. Every panel stays mounted (only hidden), so nothing typed is lost when switching.
 * tabs: [[key, label, mark?]]
 */
function SideTabs({ tabs, tab, onTab, idPrefix, children, narrow }) {
  const { t } = useT();
  return (
    <div className={`grid grid-cols-1 gap-3 ${narrow ? 'md:grid-cols-[11rem_minmax(0,1fr)]' : 'md:grid-cols-[13rem_minmax(0,1fr)]'}`}>
      <div className="no-scrollbar flex gap-1 overflow-x-auto md:flex-col md:overflow-visible" role="tablist" aria-orientation="vertical">
        {tabs.map(([key, label, mark], i) => (
          <button key={key} type="button" role="tab" id={`${idPrefix}-${key}`} aria-selected={tab === key} onClick={() => onTab(key)}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-13 font-semibold transition-colors ${tab === key
              ? 'bg-brand-600 text-white shadow-sm' : 'text-ink-600 hover:bg-ink-50'}`}>
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-10 font-bold ${tab === key ? 'bg-white/20' : 'bg-ink-100 text-ink-500'}`}>{i + 1}</span>
            <span className="min-w-0 flex-1 whitespace-nowrap md:whitespace-normal">{t(label)}</span>
            {mark && <span className={`rounded-full px-1.5 text-11 ${tab === key ? 'bg-white/25' : 'bg-emerald-50 text-emerald-700'}`}>{mark}</span>}
          </button>
        ))}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// Complaints & diagnosis: its sections as tabs down the left side, in this order: [key, label]
const CLINICAL_TABS = [
  ['complaints', 'examine.complaints'],
  ['vitalsHistory', 'vitals.history'],
  ['medical', 'examine.medicalHistory'],
  ['exam', 'examine.pastHistory'],
  ['diagnosis', 'examine.diagnosis'],
  ['compare', 'cs.title'],
];

// Prescription: its sections as tabs down the left side: [key, label]
const RX_TABS = [
  ['medicines', 'examine.prescription'],
  ['daybook', 'daybook.title'],
];

// Patient details tabs, in this order: [key, label, icon]
const EXAMINE_TABS = [
  ['history', 'examine.previousVisits', History],
  ['vitals', 'vitals.title', HeartPulse],
  ['clinical', 'examine.clinical', ClipboardList],
  ['rx', 'examine.prescription', Pill],
  ['advice', 'examine.advice', MessageSquareText],
];

// One prescription line: a row of the grid on wide screens; on phones a card, each box with its label
const RX_ROW = 'grid grid-cols-2 gap-2 rounded-xl border border-ink-200 p-2.5 md:grid-cols-[2fr_1fr_1fr_1fr_0.8fr_1.4fr_auto] md:items-start md:gap-1.5 md:rounded-none md:border-0 md:border-b md:border-ink-100 md:px-0 md:py-1.5';
const phoneLabel = (text) => <span className="label md:hidden">{text}</span>;

function VisitForm({ visitId, backPath }) {
  const { t } = useT();
  const toast = useToast();
  const { data: visit, error, loading, reload } = useAsync(() => api(`/visits/${visitId}`), [visitId]);
  const [potencyList, setPotencyList] = useRxList('potency');
  const [dosageList, setDosageList] = useRxList('dosage');
  const [repetitionList, setRepetitionList] = useRxList('repetition');
  const [dosDontList, setDosDontList] = useRxList('dosdont');
  const [pastList, setPastList] = useRxList('pasthistory');
  const [medList, setMedList] = useRxList('medhistory');
  const [routineList, setRoutineList] = useRxList('dbroutine');
  const [dbDurationList, setDbDurationList] = useRxList('dbduration');
  const [dbFrequencyList, setDbFrequencyList] = useRxList('dbfrequency');
  const [f, setF] = useState(null);
  const [lines, setLines] = useState([emptyLine()]);
  const [focusLine, setFocusLine] = useState(null);   // line whose Medicine box gets the cursor after render
  const [saving, setSaving] = useState(null);
  const [tab, setTab] = useState('history');
  const [subTab, setSubTab] = useState('complaints');   // Complaints & diagnosis section
  const [csCount, setCsCount] = useState(0);             // Comparative Study rows (for the tab mark)
  const [rxTab, setRxTab] = useState('medicines');       // Prescription section
  const [chartDaysText, setChartDaysText] = useState('');  // Day Book chart: days typed ('' = default)
  const tabIndex = EXAMINE_TABS.findIndex(([key]) => key === tab);
  const prevTab = EXAMINE_TABS[tabIndex - 1];
  const nextTab = EXAMINE_TABS[tabIndex + 1];
  // Previous / Next: switch tab and bring the tab bar back into view
  const goTab = (key) => {
    setTab(key);
    document.getElementById('examine-tabs')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  const navBtn = 'flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3 py-1.5 text-left text-13 font-semibold text-ink-700 shadow-sm transition-colors hover:border-brand-200 hover:bg-brand-50/40 hover:text-brand-700';
  const tabNav = (
    <div className="no-print mt-4 grid grid-cols-2 items-center gap-2 border-t border-ink-100 pt-3 sm:grid-cols-[1fr_auto_1fr]">
      {prevTab ? (
        <button type="button" className={`${navBtn} justify-self-start`} onClick={() => goTab(prevTab[0])}>
          <ChevronLeft size={18} />
          <span className="flex flex-col leading-tight"><small className="text-11 font-normal text-ink-400">{t('common.previous')}</small>{t(prevTab[1])}</span>
        </button>
      ) : <span />}
      <span className="hidden text-12 text-ink-400 sm:block">{t('examine.step', { n: tabIndex + 1, total: EXAMINE_TABS.length })}</span>
      {nextTab ? (
        <button type="button" className={`${navBtn} justify-self-end text-right`} onClick={() => goTab(nextTab[0])}>
          <span className="flex flex-col leading-tight"><small className="text-11 font-normal text-ink-400">{t('common.next')}</small>{t(nextTab[1])}</span>
          <ChevronRight size={18} />
        </button>
      ) : <span />}
    </div>
  );

  useEffect(() => {
    if (!visit) return;
    setF({
      complaints: visit.complaints || '', examination_notes: visit.examination_notes || '', diagnosis: visit.diagnosis || '',
      advice: visit.advice || '', advice_unwilling: !!visit.advice_unwilling, rx_unwilling: !!visit.rx_unwilling,
      daybook_date: visit.daybook_date || todayLocal(), daybook_routine: visit.daybook_routine || [], daybook_chart: visit.daybook_chart || {}, daybook_duration: visit.daybook_duration || '', daybook_frequency: visit.daybook_frequency || '', follow_up_date: visit.follow_up_date || '', consultation_fee: visit.consultation_fee ?? 0,
      dos_donts: visit.dos_donts || [], past_history: visit.past_history || [], medical_history: visit.medical_history || [],
    });
    setLines(visit.prescriptions.length ? visit.prescriptions.map((p) => ({ ...p, key: String(p.id) })) : [emptyLine()]);
  }, [visit]);

  // "+ Add medicine": put the cursor in the new line's Medicine box
  useEffect(() => {
    if (!focusLine) return;
    document.querySelector(`[data-line="${focusLine}"] [data-cell="medicine"] input`)?.focus();
    setFocusLine(null);
  }, [focusLine, lines]);

  if (loading && !visit) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!f) return null;

  const locked = visit.issue_count > 0;
  // Day Book chart: the Frequency's number of days, else up to the follow-up date, else 7 – unless Days is typed
  const chartDayCount = cleanChartDays(chartDaysText, defaultChartDays(f.daybook_date, f.follow_up_date, f.daybook_frequency));
  const rxCount = lines.filter((l) => l.medicine_name.trim()).length;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  async function save(complete, { print = false, busy } = {}) {
    if (f.consultation_fee !== '' && Number(f.consultation_fee) < 0) return toast(`${t('field.consultationFee')}: 0+`, 'error');
    setSaving(busy || (print ? 'print' : complete ? 'complete' : 'draft'));
    try {
      const body = {
        complaints: f.complaints, examination_notes: f.examination_notes, diagnosis: f.diagnosis, advice: f.advice, advice_unwilling: f.advice_unwilling, rx_unwilling: f.rx_unwilling,
        daybook_routine: f.daybook_routine, daybook_duration: f.daybook_duration, daybook_frequency: f.daybook_frequency,
        daybook_chart: f.daybook_chart,
        // the date is kept only with a Day Book entry (it is filled in by default)
        daybook_date: (f.daybook_routine.length || f.daybook_duration || f.daybook_frequency) ? f.daybook_date || todayLocal() : null,
        follow_up_date: f.follow_up_date || null, consultation_fee: f.consultation_fee, dos_donts: f.dos_donts,
        past_history: f.past_history, medical_history: f.medical_history,
        complete,
      };
      if (!locked) body.prescriptions = lines.filter((l) => l.medicine_name.trim()).map(({ key, ...l }) => l);
      await api(`/visits/${visitId}`, { method: 'PUT', body });
      // printout shows what was just saved; print = true (prescription) or the page to open (Day Book chart)
      if (print) { navigate(print === true ? `/doctor/prescription/${visitId}` : print); return undefined; }
      toast(complete ? t('examine.completed') : t('common.savedX', { x: t('examine.visit') }));
      if (complete) navigate(backPath);
      else reload();
    } catch (err) {
      toast(err.message || t('common.saveFailed'), 'error');
    } finally {
      setSaving(null);
    }
    return undefined;
  }

  const clinicalMarks = {
    complaints: f.complaints.trim() ? '✓' : null,
    medical: f.medical_history.length || (f.examination_notes.trim() ? '✓' : null),
    exam: f.past_history.length || null,
    diagnosis: f.diagnosis.trim() ? '✓' : null,
    compare: csCount || null,
  };
  const rxMarks = { medicines: rxCount || null, daybook: (f.daybook_routine.length || f.daybook_duration || f.daybook_frequency) ? '✓' : null };
  const removeLine = (key) => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== key) : [emptyLine()]));
  const addLineAfter = (key) => { const line = emptyLine(); setLines((ls) => ls.flatMap((x) => (x.key === key ? [x, line] : [x]))); setFocusLine(line.key); };

  return (
    <>
      {/* the patient */}
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-brand-100 bg-brand-50/50 px-3 py-2">
        <TokenChip no={visit.token_no} big />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-ink-900">{visit.patient_name}</h2>
          <span className="text-13 text-ink-500">{visit.patient_code} · {genderLabel(visit.gender, t)} / {ageLabel(visit)} · {visit.mobile}{visit.blood_group ? ` · ${visit.blood_group}` : ''}</span>
        </div>
        <span className="flex flex-wrap gap-1.5">
          <StatusBadge status={visit.status} />
          {visit.bill_id && <Badge tone="success">{t('status.billed')}</Badge>}
        </span>
      </div>

      {/* Tabs: every panel stays mounted (only hidden), so nothing typed is lost when switching */}
      <div id="examine-tabs" className="scroll-mt-20">
        <DashTabs tab={tab} onChange={setTab} className="!mt-0"
          tabs={EXAMINE_TABS.map(([key, label, icon]) => ({ key, icon, label: t(label), badge: key === 'rx' && rxCount > 0 ? rxCount : undefined }))} />
      </div>

      <section role="tabpanel" hidden={tab !== 'history'}>
        <PastVisits patientId={visit.patient_id} excludeId={visit.id} />
        {tabNav}
      </section>

      <section role="tabpanel" hidden={tab !== 'vitals'}>
        {visit.queue_id
          ? <QueueVitals queueId={visit.queue_id} patientName={visit.patient_name} readOnly={visit.queue_status === 'cancelled'} />
          : <EmptyState message={t('examine.noVitals')} />}
        {visit.vitals && Object.values(visit.vitals).some(Boolean) && (
          <p className="mt-2 text-12 text-ink-400">{t('vitals.olderNote')}: {[
            visit.vitals.bp && `${t('examine.bp')} ${visit.vitals.bp}`, visit.vitals.pulse && `${t('examine.pulse')} ${visit.vitals.pulse}`,
            visit.vitals.temp && `${t('examine.temp')} ${visit.vitals.temp}`, visit.vitals.weight && `${t('examine.weight')} ${visit.vitals.weight}`,
          ].filter(Boolean).join(' · ')}</p>
        )}
        {tabNav}
      </section>

      <section role="tabpanel" hidden={tab !== 'clinical'}>
        <SideTabs idPrefix="sub" tab={subTab} onTab={setSubTab} tabs={CLINICAL_TABS.map(([k, l]) => [k, l, clinicalMarks[k]])}>
          <section role="tabpanel" hidden={subTab !== 'complaints'}>
            <TextArea label={t('examine.complaints')} rows={8} placeholder="What the patient says, in their words" value={f.complaints} onChange={set('complaints')} />
          </section>
          {/* Medical History: the list on the left, the notes on the right */}
          <section role="tabpanel" hidden={subTab !== 'medical'}>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <PastHistoryList kind="medhistory" list={medList} onListChange={setMedList} copiedFrom={visit.medical_history_from}
                value={f.medical_history} onChange={(medical_history) => setF((cur) => ({ ...cur, medical_history }))} />
              <TextArea label={t('examine.examination')} rows={10} value={f.examination_notes} onChange={set('examination_notes')} />
            </div>
          </section>
          <section role="tabpanel" hidden={subTab !== 'exam'}>
            <PastHistoryList list={pastList} onListChange={setPastList} copiedFrom={visit.past_history_from}
              value={f.past_history} onChange={(past_history) => setF((cur) => ({ ...cur, past_history }))} />
          </section>
          <section role="tabpanel" hidden={subTab !== 'diagnosis'}>
            <TextArea label={t('examine.diagnosis')} rows={8} value={f.diagnosis} onChange={set('diagnosis')} />
          </section>
          <section role="tabpanel" hidden={subTab !== 'compare'}>
            <ComparativeStudy patientId={visit.patient_id} visitId={visit.id} onCount={setCsCount} />
          </section>
          {/* last 10 visits' vital signs */}
          <section role="tabpanel" hidden={subTab !== 'vitalsHistory'}>
            <VitalsHistory patientId={visit.patient_id} excludeVisitId={visit.id} />
          </section>
        </SideTabs>
        {tabNav}
      </section>

      <section role="tabpanel" hidden={tab !== 'rx'}>
        <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
          {locked && <Badge tone="info">{t('examine.rxLocked')}</Badge>}
          <button type="button" className="btn-secondary !px-3 !py-1 !text-13" onClick={() => save(false, { print: true })} disabled={saving === 'print'}>
            <Printer size={16} /> {t('rxPrint.print')}
          </button>
        </div>
        <SideTabs narrow idPrefix="rxsub" tab={rxTab} onTab={setRxTab} tabs={RX_TABS.map(([k, l]) => [k, l, rxMarks[k]])}>
          <section role="tabpanel" hidden={rxTab !== 'medicines'}>
            <div className="space-y-2 md:space-y-0">
              <div className={`${RX_ROW} !hidden rounded-lg !border-0 bg-ink-50 !py-1.5 px-1 text-11 font-bold uppercase tracking-wide text-ink-500 md:!grid`}>
                <span>{t('examine.medicine')}</span><span>{t('examine.potency')}</span><span>{t('examine.dosage')}</span><span>{t('examine.repetition')}</span>
                <span>{t('examine.duration')}</span><span>{t('examine.instructions')}</span><span className="w-16" />
              </div>
              {lines.map((l) => (
                <div key={l.key} className={RX_ROW} data-line={l.key}>
                  <div className="col-span-2 min-w-0 md:col-span-1" data-cell="medicine">
                    {phoneLabel(t('examine.medicine'))}
                    {locked ? <span className="block py-1 font-semibold text-ink-800">{l.medicine_name}</span> : (
                      <ItemPicker value={l.medicine_name} ariaLabel={t('examine.medicine')} placeholder={t('examine.medicineHint')}
                        onPick={(p) => setLine(l.key, { medicine_name: p.medicine_name, item_id: p.item_id })} />
                    )}
                    {l.item_id ? <small className="mt-0.5 block text-11 text-emerald-700">{t('examine.inStock')}</small>
                      : l.medicine_name ? <small className="mt-0.5 block text-11 text-amber-700">{t('examine.notInStock')}</small> : null}
                  </div>
                  <div className="min-w-0">
                    {phoneLabel(t('examine.potency'))}
                    <RxListPicker kind="potency" value={l.potency || ''} disabled={locked} list={potencyList}
                      onChange={(v) => setLine(l.key, { potency: v })} onListChange={setPotencyList} />
                  </div>
                  <div className="min-w-0">
                    {phoneLabel(t('examine.dosage'))}
                    <RxListPicker kind="dosage" value={l.dosage || ''} disabled={locked} list={dosageList}
                      onChange={(v) => setLine(l.key, { dosage: v })} onListChange={setDosageList} />
                  </div>
                  <div className="min-w-0">
                    {phoneLabel(t('examine.repetition'))}
                    <RxListPicker kind="repetition" value={l.frequency || ''} disabled={locked} list={repetitionList}
                      onChange={(v) => setLine(l.key, { frequency: v })} onListChange={setRepetitionList} />
                  </div>
                  <div className="min-w-0">
                    {phoneLabel(t('examine.duration'))}
                    <input className="input" aria-label={t('examine.duration')} placeholder="7 days" value={l.duration || ''} disabled={locked} onChange={(e) => setLine(l.key, { duration: e.target.value })} />
                  </div>
                  <div className="col-span-2 min-w-0 md:col-span-1">
                    {phoneLabel(t('examine.instructions'))}
                    <input className="input" aria-label={t('examine.instructions')} placeholder={t('examine.instructionsHint')} value={l.instructions || ''} disabled={locked} onChange={(e) => setLine(l.key, { instructions: e.target.value })} />
                  </div>
                  {!locked && (
                    <div className="col-span-2 flex justify-end gap-1 md:col-span-1 md:w-16">
                      {/* + adds a new medicine line just below this one */}
                      <button type="button" className="btn-ghost !p-1 text-brand-600" aria-label={t('examine.addMedicine')} title={t('examine.addMedicine')} onClick={() => addLineAfter(l.key)}>
                        <Plus size={16} />
                      </button>
                      <button type="button" className="btn-ghost !p-1 hover:!bg-red-50 hover:!text-red-600" aria-label={t('common.remove')} title={t('common.remove')} onClick={() => removeLine(l.key)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-13 font-semibold text-ink-700">
              <input type="checkbox" checked={f.rx_unwilling} onChange={(e) => setF({ ...f, rx_unwilling: e.target.checked })} />
              {t('examine.unwilling')}
            </label>
          </section>
          <section role="tabpanel" hidden={rxTab !== 'daybook'}>
            {/* one row: Date, Routine, Duration, Frequency – each from its own list (+ New / Edit / Delete); saved with the visit */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[10rem_repeat(3,minmax(0,1fr))]">
              <Input label={t('examine.dbdate')} type="date" value={f.daybook_date} onChange={(e) => setF((cur) => ({ ...cur, daybook_date: e.target.value }))} />
              <div className="min-w-0">
                <span className="label">{t('examine.dbroutine')}</span>
                <RxListPicker kind="dbroutine" multiple value={f.daybook_routine} list={routineList}
                  onChange={(v) => setF((cur) => ({ ...cur, daybook_routine: v }))} onListChange={setRoutineList} />
              </div>
              <div className="min-w-0">
                <span className="label">{t('examine.dbduration')}</span>
                <RxListPicker kind="dbduration" value={f.daybook_duration} list={dbDurationList}
                  onChange={(v) => setF((cur) => ({ ...cur, daybook_duration: v }))} onListChange={setDbDurationList} />
              </div>
              <div className="min-w-0">
                <span className="label">{t('examine.dbfrequency')}</span>
                <RxListPicker kind="dbfrequency" value={f.daybook_frequency} list={dbFrequencyList}
                  onChange={(v) => setF((cur) => ({ ...cur, daybook_frequency: v }))} onListChange={setDbFrequencyList} />
              </div>
            </div>
            {/* day-wise chart for the patient: from the Date, by Frequency, one column per Routine */}
            <div className="mb-2 mt-4 flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 pb-1.5">
              <h3 className="text-sm font-bold text-ink-800">{t('daybook.chartTitle')}</h3>
              <span className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-13 font-semibold text-ink-600">
                  {t('daybook.days')}
                  <input className="input no-spin !w-16 text-center" type="number" min="1" max={MAX_CHART_DAYS} step="1" inputMode="numeric" value={chartDaysText || chartDayCount}
                    onChange={(e) => setChartDaysText(e.target.value)} />
                </label>
                <button type="button" className="btn-secondary !px-3 !py-1 !text-13" disabled={!f.daybook_routine.length || saving === 'chart'}
                  onClick={() => save(false, { print: `/doctor/daybook/${visitId}?days=${chartDayCount}`, busy: 'chart' })}>
                  <Printer size={16} /> {t('daybook.printChart')}
                </button>
              </span>
            </div>
            <div className="overflow-x-auto">
              <DayBookChart date={f.daybook_date} routines={f.daybook_routine} frequency={`${f.daybook_duration} ${f.daybook_frequency}`} days={chartDayCount}
                values={f.daybook_chart} onChange={(key, text) => setF((cur) => ({ ...cur, daybook_chart: { ...cur.daybook_chart, [key]: text } }))} />
            </div>
          </section>
        </SideTabs>
        {tabNav}
      </section>

      <section role="tabpanel" hidden={tab !== 'advice'}>
        {/* left: advice, follow-up, fee – right: Do's and Don'ts */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="grid content-start gap-3">
            <TextArea label={t('examine.advice')} rows={4} placeholder="Food, rest, habits" value={f.advice} onChange={set('advice')} />
            <label className="inline-flex cursor-pointer items-center gap-2 text-13 font-semibold text-ink-700">
              <input type="checkbox" checked={f.advice_unwilling} onChange={(e) => setF({ ...f, advice_unwilling: e.target.checked })} />
              {t('examine.unwilling')}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Input label={t('examine.followUp')} type="date" value={f.follow_up_date} onChange={set('follow_up_date')} />
              <Input label={t('field.consultationFee')} type="number" min="0" step="0.01" inputMode="decimal" className="no-spin" value={f.consultation_fee} onChange={set('consultation_fee')} disabled={!!visit.bill_id} />
            </div>
          </div>
          <DosDontList list={dosDontList} onListChange={setDosDontList}
            marks={f.dos_donts} onChange={(dos_donts) => setF((cur) => ({ ...cur, dos_donts }))} />
        </div>
        {tabNav}
      </section>

      {/* Save draft / Complete stay at the bottom of the screen while scrolling */}
      {/* edge to edge in the card: its sides are px-3 on phones (max-md:!px-3), px-6 from md up; its foot pb-5 / sm:pb-6 */}
      <div className="no-print sticky bottom-0 z-10 -mx-3 -mb-5 mt-4 grid grid-cols-2 gap-2 rounded-b-2xl border-t border-ink-100 bg-white/95 px-3 py-2.5 backdrop-blur sm:-mb-6 md:-mx-6 md:flex md:justify-end md:px-6">
        <button type="button" className="btn-secondary px-2 sm:px-4" onClick={() => save(false)} disabled={!!saving}><Save size={16} /> {saving === 'draft' ? t('common.saving') : t('examine.saveDraft')}</button>
        <button type="button" className="btn-primary px-2 sm:px-4" onClick={() => save(true)} disabled={!!saving}>
          <CheckCircle2 size={16} /> {saving === 'complete' ? t('common.saving') : visit.status === 'completed' ? t('examine.saveCompleted') : t('examine.complete')}
        </button>
      </div>
    </>
  );
}

export default function Examine({ params }) {
  const { t } = useT();
  const auth = useAuth();
  const { query } = useLocation();
  const visitId = params.visitId;
  if (!visitId) return <QueuePage />;

  // Opened with Edit from Patient History (?from=history&patient=12): back / finish return there
  const patientId = Number(query.patient);
  const fromHistory = query.from === 'history' && Number.isInteger(patientId) && patientId > 0;
  const backPath = fromHistory ? `/doctor/history/${patientId}` : '/doctor/examine';

  // Page 2 – one patient's details (previous visits, vitals, examination)
  return (
    <div className="card max-md:!px-3">
      <CardHeader icon={Stethoscope} title={t('examine.patientDetails')} subtitle={auth.activeClinic?.name}
        actions={<button type="button" className="btn-secondary" onClick={() => navigate(backPath)}><ChevronLeft size={16} /> {t(fromHistory ? 'examine.backToHistory' : 'examine.backToQueue')}</button>} />
      <VisitForm visitId={visitId} backPath={backPath} />
    </div>
  );
}
