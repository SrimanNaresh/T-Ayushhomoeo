// Patient & Queue → Tokens: today's tokens per doctor, made from their time slots (Employee → Time slots).
// Click an available token to book a patient into the queue for that doctor and time.
import { useEffect, useState } from 'react';
import { Clock, RefreshCw, Lock, Stethoscope, Trash2, UserPlus, ChevronLeft, CalendarPlus, AlertTriangle, Settings } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useT } from '../../lib/i18n.jsx';
import { navigate } from '../../lib/router.jsx';
import { ageLabel, fmtDate, fmtTime12, fmtTimeRange12, genderLabel, queueStatus } from '../../lib/format.js';
import { toMinutes } from '../../../../shared/timeSlots.js';
import { Badge, CardHeader, EmptyState, ErrorBox, Input, Spinner, Modal, Note, SearchBox, Select, StatusBadge, useAsync, useDebounced, useToast } from '../../components/ui.jsx';
import { VitalsModal } from '../../components/VitalSigns.jsx';

const nowMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const small = '!px-2.5 !py-1 !text-13';

/** Current time in minutes, updated every minute so tokens turn read-only as their time passes. */
function useNowMinutes() {
  const [now, setNow] = useState(nowMinutes);
  useEffect(() => {
    const id = setInterval(() => setNow(nowMinutes()), 30000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Shown when a token whose time has already passed is clicked. */
function PassedDialog({ doctor, token, onClose }) {
  const { t } = useT();
  return (
    <Modal title={t('tokens.passedTitle', { n: token.no, time: fmtTimeRange12(token.start, token.end) })} onClose={onClose}
      footer={<button type="button" className="btn-primary" onClick={onClose}>{t('common.ok')}</button>}>
      <Note tone="warning" className="mt-0 flex gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{t('tokens.passedMessage', { time: fmtTimeRange12(token.start, token.end), doctor: doctor.name })}</Note>
      <p className="text-12 text-ink-400">{t('tokens.passedHint')}</p>
    </Modal>
  );
}

/** A patient found by the search, with what can be done for them on the right. */
function ResultRow({ p, sub, children }) {
  const { t } = useT();
  return (
    <li className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <strong className="text-sm text-ink-800">{p.name}</strong>
        <span className="block text-13 text-ink-500">{p.patient_code} · {p.mobile}{p.gender !== undefined ? ` · ${genderLabel(p.gender, t)} / ${ageLabel(p)}` : ''}</span>
        {sub && <span className="block text-12 text-ink-400">{sub}</span>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
    </li>
  );
}

/** Short patient registration inside the booking dialog: register, then the slot is booked right away. */
function NewPatientForm({ token, initial, onRegistered, onBookExisting, onBack }) {
  const { t } = useT();
  const toast = useToast();
  const [f, setF] = useState({ name: '', mobile: '', gender: '', age_years: '', city: '', ...initial });
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e, force = false) {
    e?.preventDefault();
    if (!f.name.trim()) return toast(t('common.isRequired', { field: t('field.name') }), 'error');
    if (!f.mobile.trim()) return toast(t('common.isRequired', { field: t('field.mobile') }), 'error');
    if (!/^[\d\s+-]+$/.test(f.mobile)) return toast(t('common.digitsOnly', { field: t('field.mobile') }), 'error');
    setSaving(true);
    try {
      const body = { ...f, age_years: f.age_years === '' ? null : Number(f.age_years), gender: f.gender || null, force };
      const patient = await api('/patients', { method: 'POST', body });
      await onRegistered(patient);
    } catch (err) {
      if (err.code === 'POSSIBLE_DUPLICATE') setDuplicate(err.details || []);
      else toast(err.message || t('common.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
    return undefined;
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label={t('field.name')} required autoFocus placeholder="e.g. Lakshmi R" value={f.name} onChange={set('name')} />
        <Input label={t('field.mobile')} required type="tel" inputMode="numeric" placeholder="e.g. 98765 43210" value={f.mobile} onChange={set('mobile')} />
        <Select label={t('field.gender')} value={f.gender} onChange={set('gender')} placeholder="-"
          options={['M', 'F', 'O'].map((g) => ({ value: g, label: t(`gender.${g}`) }))} />
        <Input label={t('field.age')} type="number" min="0" max="130" inputMode="numeric" className="no-spin" placeholder="Years" value={f.age_years} onChange={set('age_years')} />
        <Input label={t('field.city')} placeholder="e.g. Madurai" value={f.city} onChange={set('city')} />
      </div>
      {duplicate && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-13 text-amber-800">
          <p className="font-semibold">{t('patients.possibleDuplicate')}</p>
          <ul className="divide-y divide-amber-100">
            {duplicate.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 py-1.5">
                <span>{d.patient_code} – {d.name} ({d.mobile})</span>
                <button type="button" className={`btn-primary ${small}`} onClick={() => onBookExisting(d)}><CalendarPlus size={15} /> {t('tokens.book')}</button>
              </li>
            ))}
          </ul>
          <button type="button" className={`btn-secondary mt-1 ${small}`} disabled={saving} onClick={() => submit(null, true)}>{t('patients.registerAnyway')}</button>
        </div>
      )}
      <p className="mt-2 text-12 text-ink-400">{t('tokens.newPatientHint')}</p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:justify-end">
        <button type="button" className="btn-secondary" onClick={onBack}><ChevronLeft size={16} /> {t('tokens.backToSearch')}</button>
        <button type="submit" className="btn-primary" disabled={saving}><UserPlus size={16} /> {saving ? t('common.saving') : t('tokens.registerAndBook', { time: fmtTime12(token.start) })}</button>
      </div>
    </form>
  );
}

/** Search a patient and book them into one token (or give a waiting patient this slot), or register a new patient. */
function BookDialog({ doctor, token, onClose, onBooked }) {
  const { t } = useT();
  const auth = useAuth();
  const toast = useToast();
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [busy, setBusy] = useState(null);
  const [newPatient, setNewPatient] = useState(false);
  const results = useAsync(() => (dq.trim() ? api('/queue/search', { query: { q: dq.trim() } }) : Promise.resolve({ rows: [] })), [dq]);
  const canRegister = auth.can('patient.create');
  // what was typed in the search box goes into the new-patient form
  const typed = q.trim();
  const initial = /^[+\d\s-]{6,}$/.test(typed) ? { mobile: typed.replace(/\s/g, '') } : { name: typed };

  async function book(p) {
    // already seen today (Done): a second consultation the same day gets its own new token
    const again = p.queue_status === 'done';
    if (again && !window.confirm(t('tokens.bookAgainConfirm', { name: p.name, n: p.token_no }))) return;
    const moving = !!p.queue_id && !again;
    setBusy(p.id);
    try {
      const entry = moving
        ? await api(`/queue/${p.queue_id}/slot`, { method: 'PATCH', body: { doctor_id: doctor.id, slot_time: token.start } })
        : await api('/queue', { method: 'POST', body: { patient_id: p.id, doctor_id: doctor.id, slot_time: token.start, visit_type: p.last_visit || again ? 'follow_up' : 'new' } });
      toast(t('tokens.booked', { time: fmtTime12(token.start), name: entry.patient_name, n: entry.token_no }));
      onBooked(entry, !moving);
    } catch (err) {
      toast(err.message || t('common.saveFailed'), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal title={t('tokens.bookTitle', { time: fmtTimeRange12(token.start, token.end), doctor: doctor.name })} onClose={onClose} size="lg">
      {newPatient ? (
        <NewPatientForm token={token} initial={initial} onBack={() => setNewPatient(false)}
          onBookExisting={(p) => book(p)}
          onRegistered={async (p) => {
            toast(t('patients.registered', { code: p.patient_code }));
            await book({ id: p.id });
          }} />
      ) : (
        <>
          <div className="mb-2 flex flex-col gap-2 sm:flex-row">
            <SearchBox value={q} onChange={setQ} placeholder={t('queue.searchHint')} autoFocus className="w-full sm:flex-1" />
            {canRegister && (
              <button type="button" className="btn-secondary" onClick={() => setNewPatient(true)}><UserPlus size={16} /> {t('tokens.newPatient')}</button>
            )}
          </div>
          <ErrorBox error={results.error} onRetry={results.reload} />
          {!dq.trim() ? <EmptyState message={t('queue.typeToSearch')} /> : results.loading && !results.data ? <Spinner /> : !results.data?.rows.length ? (
            <EmptyState message={(
              <>
                <span>{t('queue.noMatch')}</span>
                {canRegister && <button type="button" className={`btn-primary ${small}`} onClick={() => setNewPatient(true)}><UserPlus size={15} /> {t('tokens.registerAndBook', { time: fmtTime12(token.start) })}</button>}
              </>
            )} />
          ) : (
            <ul className="divide-y divide-ink-100">
              {results.data.rows.map((p) => {
                const inQueue = !!p.queue_id;
                const canMove = inQueue && p.queue_status === 'waiting';
                const seenToday = inQueue && p.queue_status === 'done';
                const sub = seenToday ? t('tokens.seenToday', { n: p.token_no }) : inQueue ? t('tokens.alreadyInQueue', { n: p.token_no })
                  : p.last_visit ? `${t('patients.lastVisit')} ${fmtDate(p.last_visit)}` : t('queue.firstVisit');
                return (
                  <ResultRow key={p.id} p={p} sub={sub}>
                    {seenToday ? (
                      <>
                        <StatusBadge status={p.queue_status} />
                        <button type="button" className={`btn-primary ${small}`} onClick={() => book(p)} disabled={busy === p.id}><CalendarPlus size={15} /> {t('tokens.bookAgain')}</button>
                      </>
                    ) : (!inQueue || canMove) ? (
                      <button type="button" className={`btn-primary ${small}`} onClick={() => book(p)} disabled={busy === p.id}>
                        <CalendarPlus size={15} /> {inQueue ? t('tokens.giveSlot') : t('tokens.book')}
                      </button>
                    ) : <StatusBadge status={p.queue_status} />}
                  </ResultRow>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Modal>
  );
}

// left edge colour of a booked tile by its queue status
const EDGE = { with_doctor: 'border-l-teal-500', done: 'border-l-emerald-500 bg-ink-50' };

function TokenTile({ token, past, canBook, onBook, onPassed, onFree, onVitals }) {
  const { t } = useT();
  const e = token.entry;
  const head = (
    <span className="flex justify-between tabular-nums">
      <b className="text-ink-800">#{token.no}</b><span className="text-12 text-ink-500">{fmtTime12(token.start)}</span>
    </span>
  );
  if (!e) {
    // a passed token is read-only: clicking it only explains why it cannot be booked
    return (
      <button type="button" disabled={!canBook} onClick={past ? onPassed : onBook}
        title={past ? t('tokens.readOnly') : canBook ? t('tokens.clickToBook') : undefined} aria-disabled={past || undefined}
        className={`flex min-h-[4.5rem] flex-col gap-1 rounded-xl border border-dashed px-2.5 py-2 text-left transition-colors ${past
          ? 'cursor-not-allowed border-ink-200 bg-ink-50 opacity-60'
          : 'border-brand-200 bg-white hover:border-brand-400 hover:bg-brand-50 disabled:cursor-default disabled:hover:bg-white'}`}>
        {head}
        <span className="flex items-center gap-1 text-12 text-ink-400">
          {past ? <><Lock size={12} /> {t('tokens.passed')}</> : <><CalendarPlus size={12} className="text-brand-500" /> {t('tokens.available')}</>}
        </span>
      </button>
    );
  }
  return (
    <div className={`flex min-h-[4.5rem] flex-col gap-1 rounded-xl border border-l-4 border-ink-200 border-l-brand-500 bg-white px-2.5 py-2 shadow-sm ${EDGE[queueStatus(e)] || ''} ${past ? 'opacity-60' : ''}`}
      title={past ? t('tokens.readOnly') : undefined}>
      {head}
      <span className="flex flex-col text-13 leading-tight">
        <strong className="truncate text-ink-800">{e.patient_name}</strong>
        <small className="text-11 text-ink-400">{e.patient_code} · {t('queue.token')} {e.token_no}</small>
      </span>
      <span className="mt-auto flex items-center gap-1">
        <span className="mr-auto"><StatusBadge status={queueStatus(e)} /></span>
        {onVitals && <button type="button" className="btn-ghost !p-1" title={t('vitals.title')} aria-label={t('vitals.title')} onClick={onVitals}><Stethoscope size={15} /></button>}
        {onFree && !past && e.status === 'waiting' && (
          <button type="button" className="btn-ghost !p-1 hover:!bg-red-50 hover:!text-red-600" title={t('tokens.free')} aria-label={t('tokens.free')} onClick={onFree}><Trash2 size={15} /></button>
        )}
      </span>
    </div>
  );
}

export default function Tokens() {
  const { t } = useT();
  const auth = useAuth();
  const toast = useToast();
  const [doctorId, setDoctorId] = useState('');
  const [booking, setBooking] = useState(null);       // { doctor, token }
  const [passed, setPassed] = useState(null);         // { doctor, token } – read-only popup
  const [vitalsFor, setVitalsFor] = useState(null);
  const data = useAsync(() => api('/queue/tokens', { query: { doctor_id: doctorId } }), [doctorId]);
  const allDoctors = useAsync(() => api('/queue/doctors'), []);
  const canBook = auth.can('queue.confirm');
  const now = useNowMinutes();

  async function free(entry) {
    if (!window.confirm(t('tokens.freeConfirm', { time: fmtTime12(entry.slot_time), name: entry.patient_name }))) return;
    try {
      await api(`/queue/${entry.id}/slot`, { method: 'PATCH', body: { slot_time: null } });
      data.reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <div className="card">
      <CardHeader icon={Clock} title={t('menu.tokens')}
        subtitle={`${auth.activeClinic?.name || ''} · ${t('tokens.today')} ${fmtDate(data.data?.date)}`}
        actions={(
          <>
            {allDoctors.data?.rows?.length > 1 && (
              <select className="input w-full sm:w-52" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} aria-label={t('menu.doctor')}>
                <option value="">{t('tokens.allDoctors')}</option>
                {allDoctors.data.rows.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            )}
            <button type="button" className="btn-secondary" onClick={data.reload}><RefreshCw size={16} /> {t('common.refresh')}</button>
          </>
        )} />
      {data.loading && !data.data ? <Spinner /> : <ErrorBox error={data.error} onRetry={data.reload} />}
      {data.data && !data.data.doctors.length && <EmptyState message={t('tokens.noDoctors')} />}
      <div className="space-y-3">
        {data.data?.doctors.map((d) => {
          const booked = d.tokens.filter((x) => x.entry).length;
          return (
            <section key={d.id} className="rounded-xl border border-ink-100 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-ink-800">{d.name} {d.designation && <span className="text-12 font-normal text-ink-400">{d.designation}</span>}</h2>
                {d.tokens.length > 0 && <Badge tone={booked === d.tokens.length ? 'warning' : 'success'}>{t('tokens.bookedOf', { n: booked, total: d.tokens.length })}</Badge>}
              </div>
              {!d.tokens.length ? (
                <EmptyState message={(
                  <>
                    <span>{t('tokens.noSlots')}</span>
                    {auth.can('employee.edit') && <button type="button" className={`btn-secondary ${small}`} onClick={() => navigate(`/employees/${d.id}/edit`)}><Settings size={15} /> {t('tokens.setSlots')}</button>}
                  </>
                )} />
              ) : d.sessions.map((s, i) => (
                <div key={i} className="mt-3 first:mt-0">
                  <p className="mb-1.5 text-12 text-ink-500">
                    {fmtTimeRange12(s.start_time, s.end_time)} · {t('tokens.minutesEach', { n: s.slot_minutes })}
                    {s.break_start && ` · ${t('tokens.break')} ${fmtTimeRange12(s.break_start, s.break_end)}`}
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]">
                    {d.tokens.filter((x) => x.session === i).map((x) => (
                      <TokenTile key={x.no} token={x} past={toMinutes(x.end) <= now} canBook={canBook}
                        onBook={() => setBooking({ doctor: d, token: x })}
                        onPassed={() => setPassed({ doctor: d, token: x })}
                        onFree={canBook ? () => free(x.entry) : null}
                        onVitals={auth.can('vitals.record') && x.entry?.arrived_at ? () => setVitalsFor(x.entry) : null} />
                    ))}
                  </div>
                </div>
              ))}
              {d.unslotted.length > 0 && (
                <p className="mt-2 text-12 text-ink-400">{t('tokens.unslotted', { n: d.unslotted.length })}: {d.unslotted.map((e) => `#${e.token_no} ${e.patient_name}`).join(', ')}</p>
              )}
            </section>
          );
        })}
      </div>

      {booking && (
        <BookDialog doctor={booking.doctor} token={booking.token} onClose={() => setBooking(null)}
          onBooked={() => {
            // booking only saves the patient into the slot; vital signs come after Token confirm in Confirm List
            setBooking(null);
            data.reload();
          }} />
      )}
      {passed && <PassedDialog doctor={passed.doctor} token={passed.token} onClose={() => setPassed(null)} />}
      {vitalsFor && <VitalsModal entry={vitalsFor} onClose={() => setVitalsFor(null)} onSaved={data.reload} />}
    </div>
  );
}
