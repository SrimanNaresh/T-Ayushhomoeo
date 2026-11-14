// Doctor time slots – several rows, each: start, end, appointment length and an optional break.
// Rules live in shared/timeSlots.js so the API checks exactly the same thing.
import { Plus, Trash2 } from 'lucide-react';
import { useT } from '../lib/i18n.jsx';
import { appointmentCount, checkTimeSlots } from '../../../shared/timeSlots.js';

export const EMPTY_SLOT = { start_time: '', end_time: '', slot_minutes: 15, break_start: '', break_end: '' };

/** { [row]: { [field]: code } } – first problem per field */
export function slotErrors(slots) {
  const map = {};
  for (const e of checkTimeSlots(slots).errors) {
    map[e.row] ??= {};
    map[e.row][e.field] ??= e.code;
  }
  return map;
}

export default function TimeSlots({ value, onChange, showErrors }) {
  const { t } = useT();
  const errors = slotErrors(value);
  const set = (i, field, v) => onChange(value.map((s, j) => (j === i ? { ...s, [field]: v } : s)));
  const add = () => {
    const last = value[value.length - 1];
    // next row starts where the last one ended
    onChange([...value, { ...EMPTY_SLOT, start_time: last?.end_time || '', slot_minutes: last?.slot_minutes || 15 }]);
  };
  const remove = (i) => onChange(value.filter((_, j) => j !== i));

  const cell = (i, field, label, props = {}) => {
    const code = errors[i]?.[field];
    const shown = code && (showErrors || value[i][field] !== EMPTY_SLOT[field]);
    return (
      <label className="block min-w-0">
        <span className="label">{label}{props.required && ' *'}</span>
        <input className={`input ${shown ? '!border-red-400 !bg-red-50' : ''}`} value={value[i][field] ?? ''} onChange={(e) => set(i, field, e.target.value)} {...props} />
        {shown && <small className="field-error block">{t(`slots.err.${code}`)}</small>}
      </label>
    );
  };

  return (
    <div>
      {!value.length && <p className="text-13 text-ink-400">{t('slots.none')}</p>}
      <div className="space-y-2">
        {value.map((s, i) => (
          <div key={i} className="flex gap-2.5 rounded-xl border border-ink-100 bg-ink-50/50 p-2.5">
            <span className="mt-5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-11 font-bold text-white">{i + 1}</span>
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
              {cell(i, 'start_time', t('slots.start'), { type: 'time', required: true })}
              {cell(i, 'end_time', t('slots.end'), { type: 'time', required: true })}
              {cell(i, 'slot_minutes', t('slots.duration'), { type: 'number', min: 5, max: 480, step: 5, inputMode: 'numeric', required: true })}
              {cell(i, 'break_start', t('slots.breakStart'), { type: 'time' })}
              {cell(i, 'break_end', t('slots.breakEnd'), { type: 'time' })}
              <div className="flex items-end justify-between gap-2 sm:justify-end">
                {!errors[i] && <span className="pb-1.5 text-12 text-ink-500">{t('slots.count', { n: appointmentCount(s) })}</span>}
                <button type="button" className="btn-ghost !p-1.5 hover:!bg-red-50 hover:!text-red-600" title={t('slots.remove')} aria-label={t('slots.remove')} onClick={() => remove(i)}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-12 text-ink-400">{t('slots.hint')}</p>
        <button type="button" className="btn-secondary !px-3 !py-1 !text-13" onClick={add}><Plus size={16} /> {t('slots.add')}</button>
      </div>
    </div>
  );
}
