// Pharmacy → Return → Sales Return List: every return from a customer, newest first
import { useState } from 'react';
import { RotateCcw, Plus, Pencil } from 'lucide-react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/i18n.jsx';
import { navigate } from '../../../lib/router.jsx';
import { fmtDate, money } from '../../../lib/format.js';
import { CardHeader, DataTable, ErrorBox, Spinner, Pagination, RowAction, SearchBox, useAsync, useDebounced } from '../../../components/ui.jsx';

export default function SalesReturnList() {
  const { t } = useT();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const list = useAsync(() => api('/pharmacy/sales-returns', { query: { q: dq, page, limit: 50 } }), [dq, page]);

  const columns = [
    { key: 'sr_no', label: t('sret.no') },
    { key: 'return_date', label: t('purchase.date'), render: (r) => fmtDate(r.return_date) },
    { key: 'sale_no', label: t('sale.no') },
    { key: 'customer_name', label: t('sret.customer'), render: (r) => <>{r.customer_name}{r.mobile && <span className="block text-11 text-ink-400">{r.mobile}</span>}</> },
    { key: 'item_names', label: t('items.name'), className: 'min-w-[12rem]' },
    { key: 'total_qty', label: t('stockin.totalQty'), className: 'num', render: (r) => Number(r.total_qty || 0) },
    { key: 'reason', label: t('sret.reason'), render: (r) => r.reason || '-' },
    { key: 'total_amount', label: t('sret.refund'), className: 'num', render: (r) => money(r.total_amount) },
    {
      key: '_a', label: t('common.edit'), className: 'col-actions',
      render: (r) => <RowAction icon={Pencil} title={t('common.edit')} onClick={() => navigate(`/pharmacy/sales-return/${r.id}`)} />,
    },
  ];

  return (
    <div className="card">
      <CardHeader icon={RotateCcw} title={t('sret.listTitle')}
        subtitle={list.data ? t('sret.count', { n: list.data.total, amount: money(list.data.amount) }) : t('common.loading')}
        actions={(
          <>
            <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder={t('sret.searchHint')} />
            <button type="button" className="btn-primary" onClick={() => navigate('/pharmacy/sales-return')}><Plus size={16} /> {t('sret.new')}</button>
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
