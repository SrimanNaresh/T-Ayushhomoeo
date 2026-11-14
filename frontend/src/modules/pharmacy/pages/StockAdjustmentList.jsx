// Pharmacy → Stock In → Adjustment List: every stock adjustment, newest first
import { useState } from 'react';
import { SlidersHorizontal, Plus, Pencil } from 'lucide-react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/i18n.jsx';
import { navigate } from '../../../lib/router.jsx';
import { fmtDate, money } from '../../../lib/format.js';
import { CardHeader, DataTable, ErrorBox, Spinner, Pagination, RowAction, SearchBox, useAsync, useDebounced } from '../../../components/ui.jsx';

const qty = (n) => (Number(n) ? String(Math.round(Number(n) * 10000) / 10000) : '-');

export default function AdjustmentList() {
  const { t } = useT();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const list = useAsync(() => api('/pharmacy/stock-adjustments', { query: { q: dq, page, limit: 50 } }), [dq, page]);

  const columns = [
    { key: 'adj_no', label: t('adj.no') },
    { key: 'adj_date', label: t('purchase.date'), render: (r) => fmtDate(r.adj_date) },
    { key: 'remarks', label: t('adj.remarks'), render: (r) => r.remarks || '-' },
    { key: 'item_names', label: t('items.name'), className: 'min-w-[12rem]' },
    { key: 'in_qty', label: t('adj.inQty'), className: 'num', render: (r) => qty(r.in_qty) },
    { key: 'out_qty', label: t('adj.outQty'), className: 'num', render: (r) => qty(r.out_qty) },
    { key: 'in_total', label: t('adj.inTotal'), className: 'num', render: (r) => money(r.in_total) },
    { key: 'out_total', label: t('adj.outTotal'), className: 'num', render: (r) => money(r.out_total) },
    {
      key: '_a', label: t('common.edit'), className: 'col-actions',
      render: (r) => <RowAction icon={Pencil} title={t('common.edit')} onClick={() => navigate(`/pharmacy/stock-adjustment/${r.id}`)} />,
    },
  ];

  return (
    <div className="card">
      <CardHeader icon={SlidersHorizontal} title={t('adj.listTitle')} subtitle={list.data ? t('adj.count', { n: list.data.total }) : t('common.loading')}
        actions={(
          <>
            <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder={t('adj.searchHint')} />
            <button type="button" className="btn-primary" onClick={() => navigate('/pharmacy/stock-adjustment')}><Plus size={16} /> {t('adj.new')}</button>
          </>
        )} />
      {list.loading && !list.data ? <Spinner /> : <ErrorBox error={list.error} onRetry={list.reload} />}
      {list.data && (
        <>
          <DataTable columns={columns} rows={list.data.rows} />
          <Pagination page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}
