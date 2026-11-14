// Day Book → day-wise chart for the patient: one row per day from the Day Book date, one text box per
// routine (and per time of day when the Frequency asks for more than once a day), plus Remarks.
// Days that are not due (Weekly / Alternate days) show "-". Rules in shared/daybook.js.
// frequency: the Day Book's Duration and Frequency text together (e.g. "Every Day 5", "Twice a day").
// values: { [cellKey]: text } typed so far; with onChange(key, text) the boxes can be typed in (Examine),
// without it they are printed as writing boxes showing what was typed (printout).
import { useT } from '../lib/i18n.jsx';
import { fmtDate } from '../lib/format.js';
import { chartCellKey, chartDays, frequencyPlan, MAX_CHART_TEXT } from '../../../shared/daybook.js';
import { DOC_TABLE } from './PrintDoc.jsx';

export default function DayBookChart({ date, routines, frequency, days, values = {}, onChange }) {
  const { t } = useT();
  const { slots, every } = frequencyPlan(frequency);
  const rows = chartDays(date, days, every);
  const cols = routines.flatMap((r) => slots.map((s) => ({ key: `${r}|${s}`, routine: r, slot: s })));
  if (!routines.length || !rows.length) return <p className="text-12 text-ink-400">{t('daybook.chartEmpty')}</p>;

  const box = (key, label, wide) => (onChange ? (
    <input className={`input !min-h-[28px] !py-0.5 min-w-[4.5rem] ${wide ? 'text-left' : 'text-center'}`} aria-label={label} maxLength={MAX_CHART_TEXT}
      value={values[key] || ''} onChange={(e) => onChange(key, e.target.value)} />
  ) : <span className={`block min-h-[24px] min-w-[4.5rem] rounded-sm border border-ink-500 px-1.5 py-0.5 ${wide ? 'text-left' : ''}`}>{values[key] || ''}</span>);

  return (
    <table className={`${DOC_TABLE} min-w-[480px] text-13`}>
      <thead>
        {slots.length > 1 && (
          <tr>
            <th rowSpan={2}>{t('examine.dbdate')}</th><th rowSpan={2}>{t('daybook.day')}</th>
            {routines.map((r) => <th key={r} colSpan={slots.length} className="!text-center">{r}</th>)}
            <th rowSpan={2}>{t('daybook.remarks')}</th>
          </tr>
        )}
        <tr>
          {slots.length === 1 && <><th>{t('examine.dbdate')}</th><th>{t('daybook.day')}</th></>}
          {cols.map((c) => <th key={c.key} className="!text-center">{slots.length > 1 ? t(`daybook.slot.${c.slot}`) : c.routine}</th>)}
          {slots.length === 1 && <th>{t('daybook.remarks')}</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((d) => (
          <tr key={d.date} className={d.due ? '' : '[&>td]:bg-ink-50 [&>td]:text-ink-400'}>
            <td className="whitespace-nowrap">{fmtDate(d.date)}</td>
            <td>{t(`daybook.weekday.${d.weekday}`)}</td>
            {cols.map((c) => (
              <td key={c.key} className="text-center">
                {d.due ? box(chartCellKey(d.date, c.routine, c.slot), `${fmtDate(d.date)} ${c.routine}${slots.length > 1 ? ` ${t(`daybook.slot.${c.slot}`)}` : ''}`) : '-'}
              </td>
            ))}
            <td className="min-w-[10rem]">{box(chartCellKey(d.date, 'remarks'), `${fmtDate(d.date)} ${t('daybook.remarks')}`, true)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
