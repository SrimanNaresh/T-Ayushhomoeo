// Examine → Complaints & diagnosis: a tick + note list, used twice (kind):
//   'pasthistory' – Examination History (ENT, Ortho, Dental, …), with questions per item
//   'medhistory'  – Medical History (Smoking, Alcohol, Tobacco, …), how long (text + Months / Years) instead of
//                   a note, no questions
// Tick what applies to the patient and add a short note; it is saved with this visit. A visit never
// saved starts from the patient's previous visit (copiedFrom = that visit's date).
// "+ New", "Edit" and "Delete" change the clinic's list (same pop-ups as Potency).
// A ticked item that was later deleted from the list still shows, so the patient keeps it.
// Examination History only: ticking an item also shows its questions (ENT → Symptom Character, …) with a
// short answer each; every item has its own question list with + New / Edit / Delete.
import { useState } from 'react';
import { api } from '../lib/api.js';
import { useT } from '../lib/i18n.jsx';
import { fmtDate } from '../lib/format.js';
import { DURATION_UNITS, MAX_PAST_ANSWER, MAX_PAST_DURATION, MAX_PAST_NOTE } from '../../../shared/pastHistory.js';
import { Check } from 'lucide-react';
import { useAsync } from './ui.jsx';
import { editListRow, ListTools, newListRow, RxListModals } from './RxListPicker.jsx';
import { LIST_BOX, ListFilter, ListHead, RowTool } from './DosDontList.jsx';

const KIND_TEXT = {
  pasthistory: { title: 'examine.pastHistory', note: 'examine.pastNote', hint: 'examine.pastHint' },
  medhistory: { title: 'examine.medicalHistory', note: 'examine.medNote', hint: 'examine.medHint' },
};

/**
 * list: { rows: [text], added: [{ id, value, sort_order }] } from /api/visits/{kind}-options
 * value: [{ item, note, answers?: [{ q, a }] }]; onChange(value)
 */
export default function PastHistoryList({ kind = 'pasthistory', list, onListChange, value, onChange, copiedFrom }) {
  const { t } = useT();
  const [mode, setMode] = useState(null);           // null | 'edit' | 'delete' – row icons only in a mode
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [q, setQ] = useState('');                   // filter: text in the item name
  const [show, setShow] = useState('all');          // filter: 'all' | 'ticked'
  const name = t(`examine.${kind}`);
  const text_ = KIND_TEXT[kind];
  const withQuestions = kind === 'pasthistory';
  // every item's questions { [itemId]: { rows, added } }; replaced per item after an add / edit / delete
  const questions = useAsync(() => (withQuestions ? api('/visits/pasthistory-questions') : Promise.resolve({})), [withQuestions]);
  const [qChanged, setQChanged] = useState({});
  const qmap = { ...(questions.data || {}), ...qChanged };

  const key = (s) => s.toLowerCase();
  const noteOf = new Map(value.map((h) => [key(h.item), h.note]));
  const rowBy = new Map((list.added || []).map((a) => [key(a.value), a]));
  const listed = new Set(list.rows.map(key));
  const shown = [...list.rows, ...value.map((h) => h.item).filter((i) => !listed.has(key(i)))];
  const text = key(q.trim());
  const visible = shown.filter((i) => (!text || key(i).includes(text)) && (show === 'all' || noteOf.has(key(i))));
  const count = { all: shown.length, ticked: value.length };

  const toggle = (item) => onChange(noteOf.has(key(item))
    ? value.filter((h) => key(h.item) !== key(item))
    : [...value, { item, note: '' }]);
  const setNote = (item, note) => onChange(value.map((h) => (key(h.item) === key(item) ? { ...h, note } : h)));
  const withDuration = kind === 'medhistory';
  const rowOf = (item) => value.find((h) => key(h.item) === key(item)) || {};
  const setField = (item, patch) => onChange(value.map((h) => (key(h.item) === key(item) ? { ...h, ...patch } : h)));
  const answersOf = (item) => value.find((h) => key(h.item) === key(item))?.answers || [];
  const setAnswers = (item, answers) => onChange(value.map((h) => (key(h.item) === key(item) ? { ...h, answers } : h)));

  return (
    <div className="min-w-0">
      <ListHead title={t(text_.title)}>
        <ListTools mode={mode} setMode={setMode} onNew={() => setEditing(newListRow(list))} />
      </ListHead>
      {copiedFrom && <p className="mb-2 rounded-lg bg-teal-50 px-2.5 py-1 text-12 text-teal-800">{t('examine.pastCopied', { date: fmtDate(copiedFrom) })}</p>}

      {shown.length > 0 && (
        <ListFilter q={q} setQ={setQ} show={show} setShow={setShow} counts={count}
          options={[['all', t('common.all')], ['ticked', t('examine.pastTicked')]]} />
      )}

      {shown.length === 0 && <p className="text-12 text-ink-400">{t('examine.dosDontsEmpty')}</p>}
      {shown.length > 0 && (
        <ul className={LIST_BOX}>
          {visible.length === 0 && <li className="px-3 py-2 text-12 text-ink-400">{t('examine.dosDontsNoMatch')}</li>}
          {visible.map((item) => {
            const ticked = noteOf.has(key(item));
            const row = rowBy.get(key(item));
            return (
              <li key={key(item)} className={`flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-1 ${ticked ? 'bg-brand-50/50' : ''}`}>
                <label className="flex min-w-[8rem] flex-1 cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={ticked} onChange={() => toggle(item)} />
                  <span className={`text-13 ${ticked ? 'font-semibold text-ink-800' : 'text-ink-700'}`}>{item}</span>
                </label>
                {ticked && withDuration && (
                  <span className="flex items-center gap-1">
                    <input className="input !min-h-[26px] !w-16 !py-0 text-center" value={rowOf(item).dur || ''} maxLength={MAX_PAST_DURATION} inputMode="numeric"
                      placeholder={t('examine.durationPh')} aria-label={`${item}: ${t('examine.howLong')}`}
                      onChange={(e) => setField(item, { dur: e.target.value, unit: rowOf(item).unit || 'years' })} />
                    <select className="input !min-h-[26px] !w-24 !py-0" value={rowOf(item).unit || 'years'} aria-label={`${item}: ${t('examine.durationUnit')}`}
                      onChange={(e) => setField(item, { unit: e.target.value })}>
                      {DURATION_UNITS.map((u) => <option key={u} value={u}>{t(`examine.unit.${u}`)}</option>)}
                    </select>
                  </span>
                )}
                {ticked && !withDuration && (
                  <input className="input !min-h-[26px] !w-auto min-w-[8rem] flex-[2] !py-0" value={noteOf.get(key(item))} maxLength={MAX_PAST_NOTE}
                    placeholder={t(text_.note)} aria-label={`${item}: ${t(text_.note)}`}
                    onChange={(e) => setNote(item, e.target.value)} />
                )}
                {mode === 'edit' && row && <RowTool kind="edit" title={`${t('rxList.edit', { name })}: ${item}`} onClick={() => setEditing(editListRow(row))} />}
                {mode === 'delete' && row && <RowTool kind="delete" title={`${t('rxList.delete', { name })}: ${item}`} onClick={() => setRemoving({ id: row.id, value: row.value })} />}
                {withQuestions && ticked && (row || answersOf(item).length > 0) && (
                  <PastQuestions item={item} itemId={row?.id}
                    qlist={(row && qmap[row.id]) || { rows: [], added: [] }} loading={!!row && !qmap[row.id] && questions.loading}
                    onQListChange={(r) => setQChanged((m) => ({ ...m, [row.id]: { rows: r.rows, added: r.added } }))}
                    answers={answersOf(item)} onAnswers={(answers) => setAnswers(item, answers)} />
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-1.5 text-12 text-ink-400">{t(text_.hint)}</p>

      <RxListModals kind={kind} name={name} list={list} onListChange={onListChange}
        editing={editing} setEditing={setEditing} removing={removing} setRemoving={setRemoving}
        onRenamed={(from, to) => onChange(value.map((h) => (key(h.item) === key(from) ? { ...h, item: to } : h)))} />
    </div>
  );
}

/**
 * One ticked item's questions with a short answer each. Questions come from the item's list; an answer
 * whose question was later deleted still shows, so the patient keeps it.
 */
function PastQuestions({ item, itemId, qlist, loading, onQListChange, answers, onAnswers }) {
  const { t } = useT();
  const [mode, setMode] = useState(null);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const name = t('examine.question');

  const key = (s) => s.toLowerCase();
  const answerOf = new Map(answers.map((x) => [key(x.q), x.a]));
  const rowBy = new Map((qlist.added || []).map((a) => [key(a.value), a]));
  const listed = new Set(qlist.rows.map(key));
  const qs = [...qlist.rows, ...answers.map((x) => x.q).filter((q) => !listed.has(key(q)))];

  const setAnswer = (q, a) => {
    const rest = answers.filter((x) => key(x.q) !== key(q));
    onAnswers(a ? [...rest, { q, a }] : rest);
  };

  return (
    <div className="mb-1 ml-6 w-full rounded-lg border border-brand-100 bg-white p-2">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-12 font-semibold text-brand-700">{t('examine.pastQuestions', { item })}</span>
        {itemId && <ListTools mode={mode} setMode={setMode} onNew={() => setEditing(newListRow(qlist))} />}
      </div>
      {loading && <p className="text-12 text-ink-400">{t('common.loading')}</p>}
      {!loading && qs.length === 0 && <p className="text-12 text-ink-400">{t('examine.pastNoQuestions')}</p>}
      {qs.map((q) => {
        const row = rowBy.get(key(q));
        return (
          <div key={key(q)} className="grid grid-cols-1 items-center gap-1 py-0.5 sm:grid-cols-[minmax(8rem,12rem)_minmax(0,1fr)_auto] sm:gap-2">
            <label className="text-12 font-medium text-ink-600" htmlFor={`phq-${itemId}-${key(q)}`}>{q}</label>
            <input id={`phq-${itemId}-${key(q)}`} className="input !min-h-[26px] !py-0" value={answerOf.get(key(q)) ?? ''} maxLength={MAX_PAST_ANSWER}
              onChange={(e) => setAnswer(q, e.target.value)} />
            <span className="flex">
              {mode === 'edit' && row && <RowTool kind="edit" title={`${t('rxList.edit', { name })}: ${q}`} onClick={() => setEditing(editListRow(row))} />}
              {mode === 'delete' && row && <RowTool kind="delete" title={`${t('rxList.delete', { name })}: ${q}`} onClick={() => setRemoving({ id: row.id, value: row.value })} />}
            </span>
          </div>
        );
      })}
      {itemId && (
        <RxListModals kind="pasthistory-question" url={`/visits/pasthistory-questions/${itemId}`} name={name} list={qlist}
          onListChange={onQListChange} editing={editing} setEditing={setEditing} removing={removing} setRemoving={setRemoving}
          onRenamed={(from, to) => onAnswers(answers.map((x) => (key(x.q) === key(from) ? { ...x, q: to } : x)))} />
      )}
    </div>
  );
}

/** A patient's past history to read: each ticked item with its note, then its answered questions. */
export function PastHistorySummary({ value = [] }) {
  const { t } = useT();
  return (
    <div className="grid gap-1.5">
      {value.map((h) => (
        <div key={h.item}>
          <div className="flex flex-wrap items-center gap-1 text-13">
            <Check size={14} className="text-emerald-600" /> <b className="text-ink-800">{h.item}</b>
            {h.dur && <span className="text-ink-500"> – {h.dur} {t(`examine.unit.${h.unit || 'years'}`)}</span>}
            {h.note && <span className="text-ink-500"> – {h.note}</span>}
          </div>
          {h.answers?.length > 0 && (
            <dl className="ml-5 mt-0.5 grid gap-0.5">
              {h.answers.map((x) => (
                <div key={x.q} className="grid gap-0.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-2">
                  <dt className="text-12 font-semibold text-ink-500">{x.q}</dt><dd className="text-13 text-ink-800">{x.a}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      ))}
    </div>
  );
}
