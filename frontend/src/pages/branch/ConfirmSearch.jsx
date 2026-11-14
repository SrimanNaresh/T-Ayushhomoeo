// Confirm & Search: find a patient by name / mobile / ID and confirm into today's queue
import { useState } from 'react';
import { Search, Ticket, Stethoscope, UserPlus, X, CheckCircle2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useT } from '../../lib/i18n.jsx';
import { navigate } from '../../lib/router.jsx';
import { ageLabel, fmtDate, genderLabel } from '../../lib/format.js';
import { CardHeader, EmptyState, ErrorBox, Spinner, SearchBox, StatusBadge, TokenChip, useAsync, useDebounced, useToast } from '../../components/ui.jsx';
import { VitalsModal } from '../../components/VitalSigns.jsx';
import DoctorSelect from '../../components/DoctorSelect.jsx';

export default function ConfirmSearch() {
  const { t } = useT();
  const auth = useAuth();
  const toast = useToast();
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [doctorId, setDoctorId] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [last, setLast] = useState(null);
  const [vitalsFor, setVitalsFor] = useState(null);   // queue entry whose vital signs are open

  const results = useAsync(() => (dq.trim() ? api('/queue/search', { query: { q: dq.trim() } }) : Promise.resolve({ rows: [] })), [dq]);

  async function confirm(p) {
    if (!doctorId) { toast(t('queue.doctorRequired'), 'error'); return; }
    // already seen today (Done): a second consultation the same day gets its own new token
    const again = p.queue_status === 'done';
    if (again && !window.confirm(t('tokens.bookAgainConfirm', { name: p.name, n: p.token_no }))) return;
    setBusyId(p.id);
    try {
      const entry = await api('/queue', {
        method: 'POST',
        body: { patient_id: p.id, visit_type: p.last_visit || again ? 'follow_up' : 'new', doctor_id: doctorId },
      });
      setLast(entry);
      toast(t('queue.confirmed', { n: entry.token_no, name: p.name }));
      results.reload();
      if (auth.can('vitals.record')) setVitalsFor(entry);   // next step: vital signs
    } catch (err) {
      toast(err.message || t('common.saveFailed'), 'error');
    } finally {
      setBusyId(null);
    }
  }

  const small = '!px-2.5 !py-1 !text-13';

  return (
    <div>
      {last && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 shadow-card animate-fade-in">
          <span className="flex h-12 min-w-[3.5rem] items-center justify-center rounded-xl bg-emerald-600 px-2 text-2xl font-bold tabular-nums text-white">{last.token_no}</span>
          <div className="min-w-0 flex-1">
            <strong className="block text-sm text-ink-900">{last.patient_name}</strong>
            <span className="flex items-center gap-1 text-12 text-emerald-800"><CheckCircle2 size={13} /> {last.patient_code} · {t('queue.tokenIssued')}</span>
          </div>
          {auth.can('vitals.record') && (
            <button type="button" className={`btn-secondary ${small}`} onClick={() => setVitalsFor(last)}>
              <Stethoscope size={16} /> {last.vitals_id ? t('vitals.edit') : t('vitals.title')}
            </button>
          )}
          <button type="button" className="btn-ghost !p-1" aria-label={t('common.close')} onClick={() => setLast(null)}><X size={16} /></button>
        </div>
      )}

      <div className="card">
        <CardHeader icon={Search} title={t('menu.confirmSearch')} subtitle={t('queue.searchSubtitle')}
          actions={(
            <>
              <DoctorSelect value={doctorId} onChange={setDoctorId} />
              <SearchBox value={q} onChange={setQ} placeholder={t('queue.searchHint')} autoFocus />
              <button type="button" className="btn-secondary" onClick={() => navigate('/queue')}><Ticket size={16} /> {t('menu.confirmList')}</button>
            </>
          )} />
        <ErrorBox error={results.error} onRetry={results.reload} />
        {!dq.trim() ? (
          <EmptyState message={t('queue.typeToSearch')} />
        ) : results.loading && !results.data ? <Spinner /> : results.data?.rows.length === 0 ? (
          <EmptyState message={(
            <>
              <span>{t('queue.noMatch')}</span>
              {auth.can('patient.create') && <button type="button" className={`btn-primary ${small}`} onClick={() => navigate('/patients/new')}><UserPlus size={16} /> {t('patients.newPatient')}</button>}
            </>
          )} />
        ) : (
          <ul className="divide-y divide-ink-100">
            {results.data?.rows.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <strong className="text-sm text-ink-800">{p.name}</strong>
                  <span className="block text-13 text-ink-500">{p.patient_code} · {p.mobile} · {genderLabel(p.gender, t)} / {ageLabel(p)}{p.city ? ` · ${p.city}` : ''}</span>
                  <span className="block text-12 text-ink-400">{p.last_visit ? `${t('patients.lastVisit')} ${fmtDate(p.last_visit)}` : t('queue.firstVisit')}</span>
                </div>
                {p.queue_id ? (
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <TokenChip no={p.token_no} />
                    <StatusBadge status={p.queue_status} />
                    {p.queue_status === 'done' ? (
                      <button type="button" className={`btn-primary ${small}`} onClick={() => confirm(p)} disabled={busyId === p.id || !doctorId}
                        title={!doctorId ? t('queue.doctorRequired') : undefined}><Ticket size={16} /> {t('queue.confirmAgain')}</button>
                    ) : auth.can('vitals.record') && (
                      <button type="button" className={`btn-secondary ${small}`} onClick={() => setVitalsFor({ id: p.queue_id, token_no: p.token_no, patient_name: p.name })}>
                        <Stethoscope size={16} /> {t('vitals.title')}
                      </button>
                    )}
                  </div>
                ) : (
                  <button type="button" className="btn-primary shrink-0" onClick={() => confirm(p)} disabled={busyId === p.id || !doctorId}
                    title={!doctorId ? t('queue.doctorRequired') : undefined}><Ticket size={16} /> {t('queue.confirm')}</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {vitalsFor && (
        <VitalsModal entry={vitalsFor} onClose={() => setVitalsFor(null)}
          onSaved={(v) => setLast((l) => (l && l.id === vitalsFor.id ? { ...l, vitals_id: v.id } : l))} />
      )}
    </div>
  );
}
