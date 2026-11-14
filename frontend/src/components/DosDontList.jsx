// Examine → Advice → Do's and Don'ts: the clinic's list (Smoking, Alcohol, …) with a Do / Don't choice per item.
// Clicking the chosen button again clears it; only marked items are saved with the visit.
// "+ New", "Edit" and "Delete" change the clinic's list (same pop-ups as Potency / Dosage).
// A marked item that was later deleted from the list still shows, so the visit keeps it.
import { useState } from 'react';
import { Search, Check, X, Pencil, Trash2 } from 'lucide-react';
import { useT } from '../lib/i18n.jsx';
import { editListRow, ListTools, newListRow, RxListModals } from './RxListPicker.jsx';

/* Pieces shared with PastHistoryList: heading + tools, filter row, the scrolling list box. */

export function ListHead({ title, children }) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 pb-1.5">
      <h3 className="text-sm font-bold text-ink-800">{title}</h3>
      {children}
    </div>
  );
}

/** Search box + a segmented "All / … " filter with counts. options: [[key, label, tone?]] */
export function ListFilter({ q, setQ, show, setShow, options, counts }) {
  const { t } = useT();
  const ON = { do: 'bg-emerald-600 text-white', dont: 'bg-red-600 text-white' };
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <span className="relative min-w-[10rem] flex-1">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
        <input type="search" className="input pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('examine.dosDontsFilter')} aria-label={t('examine.dosDontsFilter')} />
      </span>
      <div className="inline-flex overflow-hidden rounded-lg border border-ink-200 bg-white shadow-sm" role="group" aria-label={t('examine.dosDontsShow')}>
        {options.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={show === k} onClick={() => setShow(k)}
            className={`flex items-center gap-1 px-2.5 py-1 text-12 font-semibold transition-colors ${show === k ? ON[k] || 'bg-brand-600 text-white' : 'text-ink-600 hover:bg-ink-50'}`}>
            {label} <span className={`rounded-full px-1.5 text-10 ${show === k ? 'bg-white/25' : 'bg-ink-100 text-ink-500'}`}>{counts[k]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** The list box: fixed height with its own scroll bar. */
export const LIST_BOX = 'max-h-[22rem] divide-y divide-ink-100 overflow-y-auto rounded-xl border border-ink-200 bg-white';
/** Edit / Delete icon on a row while that mode is on. */
export function RowTool({ kind, title, onClick }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick}
      className={`btn-ghost shrink-0 !p-1 ${kind === 'delete' ? '!text-red-600 hover:!bg-red-50' : 'text-brand-600'}`}>
      {kind === 'delete' ? <Trash2 size={14} /> : <Pencil size={14} />}
    </button>
  );
}

/**
 * list: { rows: [text], added: [{ id, value, sort_order }] } from /api/visits/dosdont-options
 * marks: [{ item, rule: 'do' | 'dont' }]; onChange(marks)
 */
export default function DosDontList({ list, onListChange, marks, onChange }) {
  const { t } = useT();
  const [mode, setMode] = useState(null);           // null | 'edit' | 'delete' – row icons only in a mode
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [q, setQ] = useState('');                   // filter: text in the item name
  const [show, setShow] = useState('all');          // filter: 'all' | 'do' | 'dont'
  const name = t('examine.dosdont');

  const key = (s) => s.toLowerCase();
  const ruleOf = new Map(marks.map((m) => [key(m.item), m.rule]));
  const rowBy = new Map((list.added || []).map((a) => [key(a.value), a]));
  const listed = new Set(list.rows.map(key));
  const shown = [...list.rows, ...marks.map((m) => m.item).filter((i) => !listed.has(key(i)))];
  const text = key(q.trim());
  const visible = shown.filter((i) => (!text || key(i).includes(text)) && (show === 'all' || ruleOf.get(key(i)) === show));
  const count = { all: shown.length, do: marks.filter((m) => m.rule === 'do').length, dont: marks.filter((m) => m.rule === 'dont').length };

  const setRule = (item, rule) => {
    const rest = marks.filter((m) => key(m.item) !== key(item));
    onChange(ruleOf.get(key(item)) === rule ? rest : [...rest, { item, rule }]);
  };
  const seg = (on, onClass) => `flex items-center gap-1 px-2 py-0.5 text-12 font-semibold transition-colors ${on ? onClass : 'text-ink-500 hover:bg-ink-50'}`;

  return (
    <div className="min-w-0">
      <ListHead title={t('examine.dosDonts')}>
        <ListTools mode={mode} setMode={setMode} onNew={() => setEditing(newListRow(list))} />
      </ListHead>

      {shown.length > 0 && (
        <ListFilter q={q} setQ={setQ} show={show} setShow={setShow} counts={count}
          options={[['all', t('common.all')], ['do', t('examine.do')], ['dont', t('examine.dont')]]} />
      )}

      {shown.length === 0 && <p className="text-12 text-ink-400">{t('examine.dosDontsEmpty')}</p>}
      {shown.length > 0 && (
        <ul className={LIST_BOX}>
          {visible.length === 0 && <li className="px-3 py-2 text-12 text-ink-400">{t('examine.dosDontsNoMatch')}</li>}
          {visible.map((item) => {
            const rule = ruleOf.get(key(item));
            const row = rowBy.get(key(item));
            return (
              <li key={key(item)} className={`flex items-center gap-1.5 px-2.5 py-1 ${rule === 'do' ? 'bg-emerald-50/60' : rule === 'dont' ? 'bg-red-50/60' : ''}`}>
                <span className={`min-w-0 flex-1 text-13 ${rule ? 'font-semibold text-ink-800' : 'text-ink-700'}`}>{item}</span>
                {mode === 'edit' && row && <RowTool kind="edit" title={`${t('rxList.edit', { name })}: ${item}`} onClick={() => setEditing(editListRow(row))} />}
                {mode === 'delete' && row && <RowTool kind="delete" title={`${t('rxList.delete', { name })}: ${item}`} onClick={() => setRemoving({ id: row.id, value: row.value })} />}
                <div className="inline-flex shrink-0 overflow-hidden rounded-lg border border-ink-200 bg-white" role="group" aria-label={item}>
                  <button type="button" className={seg(rule === 'do', 'bg-emerald-600 text-white')} aria-pressed={rule === 'do'} onClick={() => setRule(item, 'do')}>
                    <Check size={12} /> {t('examine.do')}
                  </button>
                  <button type="button" className={`${seg(rule === 'dont', 'bg-red-600 text-white')} border-l border-ink-200`} aria-pressed={rule === 'dont'} onClick={() => setRule(item, 'dont')}>
                    <X size={12} /> {t('examine.dont')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-1.5 text-12 text-ink-400">{t('examine.dosDontsHint')}</p>

      <RxListModals kind="dosdont" name={name} list={list} onListChange={onListChange}
        editing={editing} setEditing={setEditing} removing={removing} setRemoving={setRemoving}
        onRenamed={(from, to) => onChange(marks.map((m) => (key(m.item) === key(from) ? { ...m, item: to } : m)))} />
    </div>
  );
}

/** Saved marks as two short lines for history: Do: … / Don't: … (rows of a <dl>) */
export function DosDontSummary({ marks }) {
  const { t } = useT();
  const dos = marks.filter((m) => m.rule === 'do').map((m) => m.item);
  const donts = marks.filter((m) => m.rule === 'dont').map((m) => m.item);
  const line = (label, items, tone) => (
    <div className="grid gap-0.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-2">
      <dt className={`text-12 font-semibold ${tone}`}>{label}</dt><dd className="text-13 text-ink-800">{items.join(', ')}</dd>
    </div>
  );
  return (
    <>
      {dos.length > 0 && line(t('examine.do'), dos, 'text-emerald-700')}
      {donts.length > 0 && line(t('examine.dont'), donts, 'text-red-600')}
    </>
  );
}
