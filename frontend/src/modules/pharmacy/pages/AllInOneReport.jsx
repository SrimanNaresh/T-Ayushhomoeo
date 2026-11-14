// Pharmacy → Report → All in One: pick a screen (Item, Vendor, Purchase / Order, Stock In, …), tick the columns
// to show and, for screens with a date, a date range; Show report builds the table, which can be printed.
// Ticking any item-line column (marked "line") gives one row per item line; otherwise one row per document.
import { useEffect, useState } from 'react';
import { LayoutList, Printer, Search } from 'lucide-react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/i18n.jsx';
import { fmtDate } from '../../../lib/format.js';
import { CardHeader, DateFilter, EmptyState, ErrorBox, Note, Spinner, TH, TD, useAsync, useToast } from '../../../components/ui.jsx';

const NUMERIC = ['money', 'qty', 'percent'];
const show = (v, type) => {
  if (v == null || v === '') return '';
  if (type === 'date') return fmtDate(v);
  if (type === 'money') return Number(v).toFixed(2);
  if (type === 'qty' || type === 'percent') return Number(v).toLocaleString('en-IN', { maximumFractionDigits: 4 });
  return String(v);
};

export default function AllInOneReport() {
  const { t } = useT();
  const toast = useToast();
  const screens = useAsync(() => api('/pharmacy/pharmacy-reports/all-in-one/screens'), []);
  const [screenKey, setScreenKey] = useState('');
  const [picked, setPicked] = useState([]);
  const [range, setRange] = useState({ from: '', to: '' });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const screen = (screens.data || []).find((s) => s.key === screenKey);

  useEffect(() => { setPicked([]); setReport(null); }, [screenKey]);

  const toggle = (key) => setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));
  const colKey = (c) => `${c.line ? 'l' : 'h'}:${c.key}`;

  async function run() {
    if (!screen) return toast(t('aio.chooseScreen'), 'error');
    if (!picked.length) return toast(t('aio.pickColumns'), 'error');
    setLoading(true);
    try {
      // keep the screen's own column order
      const columns = screen.columns.filter((c) => picked.includes(colKey(c))).map((c) => c.key);
      setReport(await api('/pharmacy/pharmacy-reports/all-in-one', { query: { screen: screen.key, columns: columns.join(','), ...range } }));
    } catch (err) {
      toast(err.message || t('common.loadFailed'), 'error');
    } finally {
      setLoading(false);
    }
    return undefined;
  }

  const head = screen ? screen.columns.filter((c) => !c.line) : [];
  const lines = screen ? screen.columns.filter((c) => c.line) : [];
  const box = (c) => (
    <label key={colKey(c)} className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-13 text-ink-700 hover:bg-ink-50">
      <input type="checkbox" checked={picked.includes(colKey(c))} onChange={() => toggle(colKey(c))} /> {t(`aio.${c.key}`)}
    </label>
  );

  return (
    <div className="card">
      <CardHeader icon={LayoutList} title={t('menu.allInOne')} subtitle={t('aio.subtitle')}
        actions={report && (
          <button type="button" className="btn-secondary no-print" onClick={() => window.print()}><Printer size={16} /> {t('common.print')}</button>
        )} />
      {screens.loading && <Spinner />}
      <ErrorBox error={screens.error} onRetry={screens.reload} />
      {screens.data && (
        <div className="no-print">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(12rem,2fr)_auto_auto_auto] sm:items-end">
            <div>
              <label className="label">{t('aio.screen')} *</label>
              <select className="input" value={screenKey} onChange={(e) => setScreenKey(e.target.value)}>
                <option value="">-</option>
                {screens.data.map((s) => <option key={s.key} value={s.key}>{t(`aio.screen_${s.key}`)}</option>)}
              </select>
            </div>
            {screen?.has_date && (
              <>
                <DateFilter label={t('vp.from')} value={range.from} max={range.to || undefined} onChange={(v) => setRange((r) => ({ ...r, from: v }))} />
                <DateFilter label={t('vp.to')} value={range.to} min={range.from || undefined} onChange={(v) => setRange((r) => ({ ...r, to: v }))} />
              </>
            )}
            <button type="button" className="btn-primary" disabled={!screen || loading} onClick={run}><Search size={16} /> {t('aio.show')}</button>
          </div>

          {screen && (
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <fieldset className="rounded-lg border border-ink-100 p-2">
                <legend className="flex w-full items-center justify-between gap-2 px-1 text-12 font-semibold text-ink-600">
                  {t('aio.docColumns')}
                  <button type="button" className="text-11 font-normal text-brand-700 hover:underline"
                    onClick={() => setPicked((p) => [...new Set([...p, ...head.map(colKey)])])}>{t('aio.all')}</button>
                </legend>
                <div className="grid grid-cols-2 sm:grid-cols-3">{head.map(box)}</div>
              </fieldset>
              {lines.length > 0 && (
                <fieldset className="rounded-lg border border-ink-100 p-2">
                  <legend className="flex w-full items-center justify-between gap-2 px-1 text-12 font-semibold text-ink-600">
                    {t('aio.lineColumns')}
                    <button type="button" className="text-11 font-normal text-brand-700 hover:underline"
                      onClick={() => setPicked((p) => [...new Set([...p, ...lines.map(colKey)])])}>{t('aio.all')}</button>
                  </legend>
                  <div className="grid grid-cols-2 sm:grid-cols-3">{lines.map(box)}</div>
                </fieldset>
              )}
            </div>
          )}
        </div>
      )}

      {loading && <Spinner />}
      {report && !loading && (
        <div className="mt-4">
          <p className="mb-2 text-12 text-ink-500">
            {t(`aio.screen_${screenKey}`)} · {t(report.grain === 'line' ? 'aio.perLine' : 'aio.perDoc')} · {t('aio.rows', { n: report.rows.length })}
            {(range.from || range.to) && screen?.has_date ? ` · ${range.from ? fmtDate(range.from) : '…'} – ${range.to ? fmtDate(range.to) : '…'}` : ''}
          </p>
          {report.truncated && <Note tone="warning">{t('aio.truncated', { n: report.rows.length })}</Note>}
          {report.rows.length ? (
            <div className="overflow-x-auto rounded-lg">
              <table className="list-pinned pin-first w-full min-w-[720px] text-left text-13">
                <thead>
                  <tr className="table-head">
                    {report.columns.map((c, n) => (
                      <th key={c.key} className={`${TH} ${NUMERIC.includes(c.type) ? 'text-right' : ''} ${n === 0 ? 'rounded-l-lg' : ''} ${n === report.columns.length - 1 ? 'rounded-r-lg' : ''}`}>{t(`aio.${c.key}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <tr key={i} className="table-row text-ink-500">
                      {report.columns.map((c, n) => (
                        <td key={c.key} className={`${TD} ${NUMERIC.includes(c.type) ? 'text-right tabular-nums' : ''} ${n === 0 ? 'font-medium text-ink-700' : ''}`}>
                          {show(r[n], c.type) || (n === 0 ? '-' : '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState message={t('aio.noRows')} />}
        </div>
      )}
    </div>
  );
}
