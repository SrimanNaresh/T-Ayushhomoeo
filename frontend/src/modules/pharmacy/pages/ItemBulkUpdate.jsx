// Pharmacy → Item → Bulk Update: the item list as an editable grid. Change values in as many rows as needed
// (across pages and searches – changes are kept until saved or discarded), then one Save updates them all.
// Changed cells are highlighted; if any row is wrong nothing is saved and that row shows why.
import { useState } from 'react';
import { Layers, Save, X, AlertCircle } from 'lucide-react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/i18n.jsx';
import { arrowMove } from '../../../lib/tableKeys.js';
import { CardHeader, EmptyState, ErrorBox, Spinner, Pagination, SearchBox, GRID_INPUT, TH, useAsync, useDebounced, useToast } from '../../../components/ui.jsx';

// [field, label key, input kind] – 'list': a drop-down of that list's values
const FIELDS = [
  ['category', 'items.category', 'list'],
  ['potency', 'items.potency', 'list'],
  ['pack', 'items.pack', 'list'],
  ['hsn_code', 'items.hsn', 'text'],
  ['manufacturer', 'items.manufacturer', 'text'],
  ['mrp', 'items.mrp', 'num'],
  ['cgst_percent', 'items.cgst', 'num'],
  ['sgst_percent', 'items.sgst', 'num'],
  ['rack', 'items.rack', 'text'],
  ['box', 'items.box', 'text'],
  ['status', 'field.status', 'status'],
];
// narrow columns for short values
const WIDTH = { category: 'min-w-[9rem]', potency: 'min-w-[7rem]', pack: 'min-w-[6rem]', hsn_code: 'w-24', manufacturer: 'min-w-[9rem]', mrp: 'w-20', cgst_percent: 'w-16', sgst_percent: 'w-16', rack: 'w-16', box: 'w-16', status: 'w-24' };
const asText = (v, kind) => (v == null ? '' : kind === 'num' ? String(Number(v)) : String(v));

export default function ItemBulk() {
  const { t } = useT();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [edits, setEdits] = useState({});       // { itemId: { field: value } } – only what differs from the saved item
  const [originals, setOriginals] = useState({}); // { itemId: item } for every edited item (name for messages)
  const [rowErrors, setRowErrors] = useState({}); // { itemId: message } from the last Save
  const [saving, setSaving] = useState(false);
  const dq = useDebounced(q);
  const list = useAsync(() => api('/pharmacy/item-master', { query: { q: dq, category, page, limit: 50 } }), [dq, category, page]);
  const cats = useAsync(() => api('/pharmacy/item-master/categories'), []);
  // drop-down choices: Category and Potency are the lists kept on the Item screen (+ New / Edit / Delete),
  // Pack the packs items already use
  const lists = useAsync(async () => {
    const [cat, potency, opts] = await Promise.all([
      api('/visits/category-options'), api('/visits/itempotency-options'), api('/pharmacy/item-master/options'),
    ]);
    return { category: cat.rows, potency: potency.rows, pack: opts.packs || [] };
  }, []);
  /** The choices for one cell: the list, plus the item's own value if the list does not have it */
  const choicesFor = (field, value) => {
    const opts = lists.data?.[field] || [];
    return value && !opts.some((v) => v.toLowerCase() === value.toLowerCase()) ? [value, ...opts] : opts;
  };
  const changedCount = Object.keys(edits).length;

  const valueOf = (item, field, kind) => (edits[item.id] && field in edits[item.id] ? edits[item.id][field] : asText(item[field], kind));
  function setValue(item, field, kind, value) {
    setEdits((all) => {
      const row = { ...(all[item.id] || {}) };
      if (value === asText(item[field], kind)) delete row[field]; else row[field] = value;
      const next = { ...all };
      if (Object.keys(row).length) next[item.id] = row; else delete next[item.id];
      return next;
    });
    setOriginals((o) => (o[item.id] ? o : { ...o, [item.id]: item }));
    setRowErrors((e) => {
      if (!e[item.id]) return e;
      const next = { ...e };
      delete next[item.id];
      return next;
    });
  }

  const discard = () => { setEdits({}); setOriginals({}); setRowErrors({}); };

  async function save() {
    if (!changedCount) return;
    setSaving(true);
    try {
      const rows = Object.entries(edits).map(([id, f]) => ({ id: Number(id), ...f }));
      const r = await api('/pharmacy/item-master/bulk', { method: 'POST', body: { rows } });
      toast(t('bulk.saved', { n: r.updated }));
      discard();
      list.reload();
    } catch (err) {
      if (err.code === 'BULK_INVALID' && Array.isArray(err.details)) {
        setRowErrors(Object.fromEntries(err.details.map((d) => [d.id, d.message])));
      }
      toast(err.message || t('common.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  }

  const errorList = Object.entries(rowErrors);
  const sel = `${GRID_INPUT} !px-1 text-12`;

  return (
    <div className="card">
      <CardHeader icon={Layers} title={t('menu.bulkUpdate')} subtitle={t('bulk.subtitle')}
        actions={(
          <>
            <select className="input w-full sm:w-44" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} aria-label={t('items.category')}>
              <option value="">{t('items.allCategories')}</option>
              {(cats.data?.rows || []).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder={t('items.searchHint')} />
          </>
        )} />

      <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
        {changedCount > 0 && <span className="mr-auto rounded-full bg-amber-50 px-2.5 py-0.5 text-12 font-semibold text-amber-700 ring-1 ring-amber-200">{t('bulk.pending', { n: changedCount })}</span>}
        <button type="button" className="btn-secondary !px-3 !py-1 !text-13" onClick={discard} disabled={saving || !changedCount}><X size={16} /> {t('bulk.discard')}</button>
        <button type="button" className="btn-primary !px-3 !py-1 !text-13" onClick={save} disabled={saving || !changedCount}>
          <Save size={16} /> {saving ? t('common.saving') : changedCount ? t('bulk.saveN', { n: changedCount }) : t('bulk.save')}
        </button>
      </div>

      {errorList.length > 0 && (
        <div className="mb-2 space-y-0.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-13 text-red-700">
          {errorList.map(([id, m]) => <p key={id} className="flex gap-1.5"><AlertCircle size={15} className="mt-0.5 shrink-0" /><span><b>{originals[id]?.name || `#${id}`}</b>: {m}</span></p>)}
        </div>
      )}
      {list.loading && !list.data ? <Spinner /> : <ErrorBox error={list.error} onRetry={list.reload} />}
      {list.data && (list.data.rows.length ? (
        <>
          <div className="overflow-x-auto rounded-lg">
            <table className="list-pinned pin-first w-full min-w-[1200px] text-left text-13">
              <thead>
                <tr className="table-head">
                  <th className={`${TH} min-w-[11rem] rounded-l-lg`}>{t('items.name')}</th>
                  <th className={`${TH} w-20`}>{t('items.code')}</th>
                  {FIELDS.map(([f, label], i) => <th key={f} className={`${TH} whitespace-nowrap ${WIDTH[f]} ${i === FIELDS.length - 1 ? 'rounded-r-lg' : ''}`}>{t(label)}</th>)}
                </tr>
              </thead>
              <tbody onKeyDown={arrowMove}>
                {list.data.rows.map((item) => {
                  const bad = !!rowErrors[item.id];
                  const changedRow = !!edits[item.id];
                  return (
                    <tr key={item.id} title={rowErrors[item.id] || undefined}
                      className={bad ? '[&>td]:!bg-red-50' : changedRow ? '[&>td]:bg-amber-50/40' : ''}>
                      <td className="px-2.5 py-0.5 font-medium text-ink-700">
                        {changedRow && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle" />}{item.name}
                      </td>
                      <td className="px-2.5 py-0.5 text-12 text-ink-400">{item.item_code}</td>
                      {FIELDS.map(([f, label, kind]) => {
                        const value = valueOf(item, f, kind);
                        const changed = edits[item.id] && f in edits[item.id];
                        const props = { 'aria-label': `${item.name} – ${t(label)}` };
                        const mark = changed ? '!border-amber-300 !bg-amber-100/70 font-semibold text-amber-900' : '';
                        return (
                          <td key={f} className="px-1 py-0.5">
                            {kind === 'list' || kind === 'status' ? (
                              <select {...props} className={`${sel} ${mark}`} value={value} onChange={(e) => setValue(item, f, kind, e.target.value)}>
                                {kind === 'status' ? (
                                  <>
                                    <option value="active">{t('status.active')}</option>
                                    <option value="inactive">{t('status.inactive')}</option>
                                  </>
                                ) : (
                                  <>
                                    <option value="">-</option>
                                    {choicesFor(f, value).map((v) => <option key={v} value={v}>{v}</option>)}
                                  </>
                                )}
                              </select>
                            ) : (
                              <input {...props} className={`${GRID_INPUT} ${kind === 'num' ? 'text-right' : ''} ${mark}`}
                                type={kind === 'num' ? 'number' : 'text'} min={kind === 'num' ? '0' : undefined}
                                step={kind === 'num' ? '0.01' : undefined} inputMode={kind === 'num' ? 'decimal' : undefined}
                                value={value} onChange={(e) => setValue(item, f, kind, e.target.value)} />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={setPage} />
        </>
      ) : <EmptyState message={t('items.none')} />)}
    </div>
  );
}
