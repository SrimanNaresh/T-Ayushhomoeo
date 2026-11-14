// "Bulk add" panel (Pharmacy → Purchase / Order): search / filter the Item List, tick many items, then Add –
// onAdd(items) gets the ticked items. Shown on the page under its button (no pop-up).
// `exclude`: item ids already in the table – shown ticked and greyed, not added again.
import { useState } from 'react';
import { ListChecks, Plus, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { useT } from '../lib/i18n.jsx';
import { Spinner, SearchBox, useAsync, useDebounced } from './ui.jsx';

export default function ItemBulkPicker({ onAdd, onClose, exclude = [] }) {
  const { t } = useT();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [picked, setPicked] = useState(() => new Map());   // id → item
  const dq = useDebounced(q);
  const list = useAsync(
    () => api('/pharmacy/item-master', { query: { q: dq, category, manufacturer, status: 'active', limit: 100 } }),
    [dq, category, manufacturer],
  );
  const opts = useAsync(() => api('/pharmacy/item-master/options'), []);
  const taken = new Set(exclude.map(Number));
  const rows = list.data?.rows || [];
  const free = rows.filter((i) => !taken.has(i.id));
  const allShownPicked = free.length > 0 && free.every((i) => picked.has(i.id));

  const toggle = (item) => setPicked((m) => {
    const next = new Map(m);
    if (next.has(item.id)) next.delete(item.id); else next.set(item.id, item);
    return next;
  });
  const toggleAll = () => setPicked((m) => {
    const next = new Map(m);
    free.forEach((i) => (allShownPicked ? next.delete(i.id) : next.set(i.id, i)));
    return next;
  });

  return (
    <div className="mb-3 rounded-xl border border-brand-100 bg-brand-50/40 p-3">
      <div className="mb-2 flex items-center gap-2.5">
        <b className="flex items-center gap-1.5 text-13 text-brand-700"><ListChecks size={15} /> {t('bulkAdd.title')}</b>
        <span className="flex-1 text-12 text-ink-500">{t('bulkAdd.hint')}</span>
        <button type="button" className="btn-ghost !p-1" aria-label={t('common.close')} title={t('common.close')} onClick={onClose}><X size={16} /></button>
      </div>
      <div className="mb-2 flex flex-wrap gap-2">
        <SearchBox value={q} onChange={setQ} placeholder={t('items.searchHint')} />
        <select className="input w-full sm:w-44" value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t('items.category')}>
          <option value="">{t('items.allCategories')}</option>
          {(opts.data?.categories || []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="input w-full sm:w-48" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} aria-label={t('items.manufacturer')}>
          <option value="">{t('bulkAdd.allManufacturers')}</option>
          {(opts.data?.manufacturers || []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {list.loading && !list.data ? <Spinner /> : (
        <div className="max-h-72 overflow-y-auto rounded-lg border border-ink-200 bg-white">
          <label className="sticky top-0 z-[1] flex cursor-pointer items-center gap-2.5 border-b border-brand-100 bg-brand-50 px-2.5 py-1.5 text-13 font-semibold text-brand-700">
            <input type="checkbox" checked={allShownPicked} disabled={!free.length} onChange={toggleAll} />
            <span>{t('bulkAdd.selectShown', { n: free.length })}{list.data?.total > rows.length ? ` · ${t('bulkAdd.narrow', { n: list.data.total })}` : ''}</span>
          </label>
          {rows.map((i) => {
            const already = taken.has(i.id);
            return (
              <label key={i.id} className={`flex flex-wrap items-center gap-x-2.5 gap-y-0.5 border-b border-ink-100 px-2.5 py-1.5 text-13 last:border-b-0 ${already ? 'cursor-default opacity-55' : 'cursor-pointer hover:bg-brand-50/50'}`}>
                <input type="checkbox" checked={already || picked.has(i.id)} disabled={already} onChange={() => toggle(i)} />
                <span className="min-w-0 flex-1"><b className="text-ink-800">{i.name}</b>{i.generic_name && <small className="text-ink-400"> · {i.generic_name}</small>}</span>
                <span className="text-12 text-ink-400">{[i.category, i.manufacturer, i.pack].filter(Boolean).join(' · ')}</span>
                {already && <span className="text-12 italic text-ink-400">{t('bulkAdd.inTable')}</span>}
              </label>
            );
          })}
          {!rows.length && <p className="px-2.5 py-3 text-13 text-ink-400">{t('common.noRecords')}</p>}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto text-12 text-ink-500">{t('bulkAdd.ticked', { n: picked.size })}</span>
        {picked.size > 0 && <button type="button" className="btn-secondary !px-3 !py-1 !text-13" onClick={() => setPicked(new Map())}><X size={16} /> {t('bulkAdd.clear')}</button>}
        <button type="button" className="btn-primary !px-3 !py-1 !text-13" disabled={!picked.size} onClick={() => { onAdd([...picked.values()]); setPicked(new Map()); }}>
          <Plus size={16} /> {t('bulkAdd.add', { n: picked.size })}
        </button>
      </div>
    </div>
  );
}
