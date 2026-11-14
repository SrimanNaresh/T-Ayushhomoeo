// Confirm List: today's queue with token number and status (waiting / with doctor / done)
import { useEffect, useState } from 'react';
import { Ticket, Plus, Check, Clock, Lock, Undo2, RotateCcw, ListChecks, CalendarCheck, Hourglass, Stethoscope, CheckCircle2, XCircle, Users } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useT } from '../../lib/i18n.jsx';
import { navigate } from '../../lib/router.jsx';
import { ageLabel, fmtDate, fmtTime12, genderLabel, queueStatus, todayLocal } from '../../lib/format.js';
import { CardHeader, DataTable, DateFilter, ErrorBox, Spinner, StatusBadge, TokenChip, useAsync, useToast } from '../../components/ui.jsx';
import { DashTabs } from '../../components/DashboardKit.jsx';
import { CancelIcon, ConfirmIcon, DoctorIcon, VitalsIcon } from '../../components/Icon.jsx';
import { VitalsModal, vitalsSummary } from '../../components/VitalSigns.jsx';

const TABS = [
  ['all', Users], ['booked', CalendarCheck], ['confirmed', ListChecks], ['waiting', Hourglass],
  ['with_doctor', Stethoscope], ['done', CheckCircle2], ['cancelled', XCircle],
];
/** Picture buttons in a row (Send to doctor, Cancel token, Confirm token) */
const PIC_BTN = 'btn-ghost relative !p-1 disabled:opacity-50';
const DOT = 'absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full';

export default function ConfirmList() {
  const { t } = useT();
  const auth = useAuth();
  const toast = useToast();
  const [date, setDate] = useState(todayLocal());
  const [tab, setTab] = useState('all');
  const [vitalsFor, setVitalsFor] = useState(null);
  const list = useAsync(() => api('/queue', { query: { date } }), [date]);
  const isToday = date === todayLocal();

  // Auto-refresh today's queue every 30 seconds
  useEffect(() => {
    if (!isToday) return undefined;
    const h = setInterval(list.reload, 30000);
    return () => clearInterval(h);
  }, [isToday, list.reload]);

  async function move(row, status) {
    try {
      await api(`/queue/${row.id}/status`, { method: 'PATCH', body: { status } });
      list.reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // Token confirm: a patient booked from Tokens has arrived – this unlocks vital signs
  async function confirmToken(row) {
    try {
      await api(`/queue/${row.id}/arrive`, { method: 'PATCH' });
      toast(t('queue.tokenConfirmed', { name: row.patient_name }));
      list.reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // tabs and counts use the shown status, so "Token booked" patients are kept apart from Pre-Examine
  const rows = (list.data?.rows || []).filter((r) => tab === 'all' || queueStatus(r) === tab);
  const counts = {};
  for (const r of list.data?.rows || []) counts[queueStatus(r)] = (counts[queueStatus(r)] || 0) + 1;
  const total = (list.data?.rows || []).filter((r) => r.status !== 'cancelled').length;

  // Row actions only for today's queue. Confirm token sits in the Vital signs column, since it unlocks the vitals;
  // examining happens from Doctor → Examine, not from this list.
  const canMove = isToday && auth.can('queue.update');
  // once vital signs are saved the token is confirmed and can no longer be cancelled
  const canCancel = (r) => canMove && r.status === 'waiting' && !r.vitals_id;
  const canRequeue = (r) => canMove && r.status === 'cancelled';
  // the Cancel column (header and cells) only shows while a listed row can be cancelled or re-queued
  const showCancelCol = rows.some((r) => canCancel(r) || canRequeue(r));
  const small = 'btn-secondary !px-2.5 !py-1 !text-13';

  const doctorCell = (r) => {
    // Send to doctor only appears once vital signs are saved (a Tokens booking must be confirmed before vitals can be saved)
    if (canMove && r.status === 'waiting' && r.vitals_id) {
      return (
        <button type="button" className={PIC_BTN} title={t('queue.sendToDoctor')} aria-label={t('queue.sendToDoctor')} onClick={() => move(r, 'with_doctor')}>
          <DoctorIcon />
        </button>
      );
    }
    if (canMove && r.status === 'with_doctor' && !r.visit_id) {
      return <button type="button" className={small} onClick={() => move(r, 'waiting')}><Undo2 size={15} /> {t('queue.backToWaiting')}</button>;
    }
    return '';
  };

  const cancelCell = (r) => {
    if (canCancel(r)) {
      return (
        <button type="button" className={PIC_BTN} title={t('queue.cancelToken')} aria-label={t('queue.cancelToken')} onClick={() => move(r, 'cancelled')}>
          <CancelIcon />
        </button>
      );
    }
    if (canRequeue(r)) return <button type="button" className={small} onClick={() => move(r, 'waiting')}><RotateCcw size={15} /> {t('queue.requeue')}</button>;
    return '';
  };

  const columns = [
    {
      key: 'patient_name', label: t('field.name'), render: (r) => (
        <span className="flex items-center gap-2">
          <TokenChip no={r.token_no} />
          <span className="min-w-0">
            <span className="block font-semibold text-ink-800">{r.patient_name}</span>
            {/* code and booking tag share one line, so every row has the same height */}
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-11 font-normal text-ink-400">{r.patient_code}</span>
              {/* only the Tokens page books a time slot, so slot_time marks a token booking */}
              {r.slot_time && (
                <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border bg-white px-2 text-11 font-semibold ${r.arrived_at ? 'border-emerald-300 text-emerald-700' : 'border-amber-300 text-amber-700'}`}>
                  {r.arrived_at ? <Check size={11} /> : <Clock size={11} />} {t(r.arrived_at ? 'queue.tokenBookingConfirmed' : 'queue.tokenBooking', { time: fmtTime12(r.slot_time) })}
                </span>
              )}
            </span>
          </span>
        </span>
      ),
    },
    { key: 'ga', label: t('field.genderAge'), className: 'nowrap', render: (r) => `${genderLabel(r.gender, t)} / ${ageLabel(r)}` },
    { key: 'visit_type', label: t('queue.visitType'), render: (r) => t(`queue.${r.visit_type}`) },
    { key: 'confirmed_at', label: t('queue.time'), className: 'nowrap', render: (r) => fmtDate(r.confirmed_at, true).split(', ')[1] },
    { key: 'status', label: t('field.status'), render: (r) => <StatusBadge status={queueStatus(r)} /> },
    {
      key: 'vitals', label: t('vitals.title'), render: (r) => {
        const canEdit = auth.can('vitals.record') && r.status !== 'cancelled';
        const locked = !r.arrived_at;   // Tokens booking not confirmed yet
        const recorded = !!r.vitals_id;
        const confirmBtn = isToday && locked && r.status !== 'cancelled' && auth.can('queue.confirm') && (
          <button type="button" className={PIC_BTN} title={t('queue.confirmTokenTitle')} aria-label={t('queue.confirmTokenTitle')} onClick={() => confirmToken(r)}>
            <ConfirmIcon />
          </button>
        );
        // recorded vitals can always be opened (read-only without the right / before confirming); new ones need both
        const title = recorded
          ? `${t('vitals.viewTitle')}: ${vitalsSummary(r, t) || t('vitals.commentsOnly')}`
          : locked ? t('queue.confirmTokenFirst') : t('vitals.addTitle');
        const vitalsBtn = (recorded || canEdit) && (
          <button type="button" className={`${PIC_BTN} rounded-lg border ${recorded ? 'border-emerald-300' : 'border-ink-200'}`} disabled={!recorded && locked}
            title={title} aria-label={recorded ? t('vitals.viewTitle') : t('vitals.addTitle')}
            onClick={() => setVitalsFor({ ...r, readOnly: !canEdit || locked })}>
            <VitalsIcon />
            {recorded
              ? <span className={`${DOT} bg-emerald-600 text-white`}><Check size={10} strokeWidth={3} /></span>
              : locked && <span className={`${DOT} border border-ink-200 bg-white text-ink-400`}><Lock size={9} /></span>}
          </button>
        );
        if (!confirmBtn && !vitalsBtn) return '';
        return <span className="inline-flex items-center gap-2">{confirmBtn}{vitalsBtn}</span>;
      },
    },
    isToday && { key: '_doctor', label: t('queue.colDoctor'), className: 'col-icon', render: doctorCell },
    showCancelCol && { key: '_cancel', label: t('queue.colCancel'), className: 'col-icon', render: cancelCell },
  ].filter(Boolean);

  return (
    <div className="card">
      <CardHeader icon={Ticket} title={t('menu.confirmList')} subtitle={`${auth.activeClinic?.name} · ${t('queue.totalToday', { n: total })}`}
        actions={(
          <>
            <DateFilter label={t('field.date')} value={date} max={todayLocal()} onChange={(v) => setDate(v || todayLocal())} />
            {auth.can('queue.confirm') && <button type="button" className="btn-primary" onClick={() => navigate('/queue/confirm')}><Plus size={16} /> {t('menu.confirmSearch')}</button>}
          </>
        )} />
      <DashTabs tab={tab} onChange={setTab}
        tabs={TABS.map(([k, icon]) => ({ key: k, icon, label: k === 'all' ? t('common.all') : t(`status.${k}`), badge: k === 'all' ? (list.data?.rows.length || 0) : counts[k] || 0 }))} />
      {list.loading && !list.data ? <Spinner /> : <ErrorBox error={list.error} onRetry={list.reload} />}
      {list.data && (
        <DataTable columns={columns} rows={rows} empty={t('queue.empty')} minWidth="min-w-[860px]"
          rowClassName={(r) => (r.slot_time ? '[&>td]:!bg-amber-50/70 [&>td:first-child]:shadow-[inset_4px_0_0_theme(colors.amber.400)]' : '')} />
      )}
      {rows.some((r) => r.slot_time) && (
        <p className="mt-2 flex items-center gap-1.5 text-12 text-ink-400">
          <span className="inline-block h-3.5 w-3.5 rounded-sm border border-ink-200 bg-amber-50 shadow-[inset_3px_0_0_theme(colors.amber.400)]" /> {t('queue.tokenBookingLegend')}
        </p>
      )}
      {vitalsFor && <VitalsModal entry={vitalsFor} readOnly={vitalsFor.readOnly} onClose={() => setVitalsFor(null)} onSaved={list.reload} />}
    </div>
  );
}
