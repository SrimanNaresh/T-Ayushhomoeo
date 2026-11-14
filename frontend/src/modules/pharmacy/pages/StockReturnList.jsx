// Pharmacy → Return → List: every Return to a vendor, newest first
import { useState } from 'react';
import { Undo2, Plus, Pencil } from 'lucide-react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/i18n.jsx';
import { navigate } from '../../../lib/router.jsx';
import { fmtDate, money } from '../../../lib/format.js';
import { CardHeader, DataTable, ErrorBox, Spinner, Pagination, RowAction, SearchBox, useAsync, useDebounced } from '../../../components/ui.jsx';

export default function ReturnList() {
  const { t } = useT();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const list = useAsync(() => api('/pharmacy/stock-returns', { query: { q: dq, page, limit: 50 } }), [dq, page]);

  const columns = [
    { key: 'return_no', label: t('return.no') },
    { key: 'return_date', label: t('purchase.date'), render: (r) => fmtDate(r.return_date) },
    { key: 'supplier_name', label: t('purchase.vendor') },
    { key: 'si_no', label: t('stockin.no') },
    { key: 'item_names', label: t('items.name'), className: 'min-w-[12rem]' },
    { key: 'item_count', label: t('purchase.items'), className: 'num' },
    { key: 'total_qty', label: t('stockin.totalQty'), className: 'num', render: (r) => Number(r.total_qty || 0) },
    { key: 'total_amount', label: t('purchase.amount'), className: 'num', render: (r) => money(r.total_amount) },
    {
      key: '_a', label: t('common.edit'), className: 'col-actions',
      render: (r) => <RowAction icon={Pencil} title={t('common.edit')} onClick={() => navigate(`/pharmacy/return/${r.id}`)} />,
    },
  ];

  return (
    <div className="card">
      <CardHeader icon={Undo2} title={t('return.listTitle')} subtitle={list.data ? t('return.count', { n: list.data.total }) : t('common.loading')}
        actions={(
          <>
            <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder={t('return.searchHint')} />
            <button type="button" className="btn-primary" onClick={() => navigate('/pharmacy/return')}><Plus size={16} /> {t('return.new')}</button>
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
