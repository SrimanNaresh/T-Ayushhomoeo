// Pharmacy → Item → List
import { useState } from 'react';
import { Package, Plus, Pencil } from 'lucide-react';
import { api } from '../../../lib/api.js';
import { useAuth } from '../../../lib/auth.jsx';
import { useT } from '../../../lib/i18n.jsx';
import { navigate } from '../../../lib/router.jsx';
import { money } from '../../../lib/format.js';
import { Badge, CardHeader, DataTable, ErrorBox, Spinner, Pagination, RowAction, SearchBox, StatusBadge, useAsync, useDebounced } from '../../../components/ui.jsx';

export default function ItemList() {
  const { t } = useT();
  const auth = useAuth();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const list = useAsync(() => api('/pharmacy/item-master', { query: { q: dq, category, page, limit: 50 } }), [dq, category, page]);
  const cats = useAsync(() => api('/pharmacy/item-master/categories'), []);
  const canEdit = auth.can('item.manage');

  const columns = [
    { key: 'name', label: t('items.name') },
    { key: 'item_code', label: t('items.code') },
    { key: 'category', label: t('items.category') },
    { key: 'unit', label: t('items.unit') },
    { key: 'price', label: t('items.price'), render: (r) => money(r.price), className: 'num' },
    {
      key: 'stock_qty', label: t('items.stock'), className: 'num',
      render: (r) => (Number(r.stock_qty) <= Number(r.reorder_level) ? <Badge tone="danger">{r.stock_qty}</Badge> : r.stock_qty),
    },
    { key: 'status', label: t('field.status'), render: (r) => <StatusBadge status={r.status} /> },
    ...(canEdit ? [{
      key: '_a', label: t('common.edit'), className: 'col-actions',
      render: (r) => <RowAction icon={Pencil} title={t('common.edit')} onClick={() => navigate(`/pharmacy/item/${r.id}`)} />,
    }] : []),
  ];

  return (
    <div className="card">
      <CardHeader icon={Package} title={t('menu.itemList')} subtitle={list.data ? t('items.count', { n: list.data.total }) : t('common.loading')}
        actions={(
          <>
            <select className="input w-full sm:w-44" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} aria-label={t('items.category')}>
              <option value="">{t('items.allCategories')}</option>
              {(cats.data?.rows || []).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder={t('items.searchHint')} />
            {canEdit && <button type="button" className="btn-primary" onClick={() => navigate('/pharmacy/item')}><Plus size={16} /> {t('items.newItem')}</button>}
          </>
        )} />
      {list.loading && !list.data ? <Spinner /> : <ErrorBox error={list.error} onRetry={list.reload} />}
      {list.data && (
        <>
          <DataTable columns={columns} rows={list.data.rows} empty={t('items.none')} />
          <Pagination page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}
