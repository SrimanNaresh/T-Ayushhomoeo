// Pharmacy → Sales → List: every counter sale, newest first, with its items and the total of all matching sales;
// Print reprints a sale's receipt.
import { useState } from 'react';
import { Receipt, Plus, Pencil, Printer } from 'lucide-react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/i18n.jsx';
import { navigate } from '../../../lib/router.jsx';
import { fmtDate, money } from '../../../lib/format.js';
import { CardHeader, DataTable, ErrorBox, Spinner, Pagination, RowAction, SearchBox, SummaryBar, useAsync, useDebounced, useToast } from '../../../components/ui.jsx';
import { useReceiptPrinter } from '../../../components/SaleReceipt.jsx';

export default function SaleList() {
  const { t } = useT();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const list = useAsync(() => api('/pharmacy/sales-billings', { query: { q: dq, page, limit: 50 } }), [dq, page]);
  const printer = useReceiptPrinter();
  const toast = useToast();
  const reprint = (r) => api(`/pharmacy/sales-billings/${r.id}`).then((sale) => printer.print(sale)).catch((err) => toast(err.message, 'error'));

  const columns = [
    { key: 'sale_no', label: t('sale.no') },
    { key: 'sale_date', label: t('purchase.date'), render: (r) => fmtDate(r.sale_date) },
    { key: 'customer_name', label: t('sale.customer') },
    { key: 'mobile', label: t('suppliers.mobile') },
    { key: 'item_names', label: t('items.name'), className: 'min-w-[12rem]' },
    { key: 'total_qty', label: t('stockin.totalQty'), className: 'num', render: (r) => Number(r.total_qty || 0) },
    { key: 'total_amount', label: t('purchase.amount'), className: 'num', render: (r) => <b className="text-ink-800">{money(r.total_amount)}</b> },
    {
      key: '_a', label: t('common.edit'), className: 'col-actions',
      render: (r) => (
        <>
          <RowAction icon={Printer} title={t('sale.print')} onClick={() => reprint(r)} />
          <RowAction icon={Pencil} title={t('common.edit')} onClick={() => navigate(`/pharmacy/sales-billing/${r.id}`)} />
        </>
      ),
    },
  ];

  return (
    <div className="card">
      {printer.node}
      <CardHeader icon={Receipt} title={t('sale.listTitle')} subtitle={t('sale.listSubtitle')}
        actions={(
          <>
            <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder={t('sale.searchHint')} />
            <button type="button" className="btn-primary" onClick={() => navigate('/pharmacy/sales-billing')}><Plus size={16} /> {t('sale.new')}</button>
          </>
        )} />
      {list.data && <SummaryBar items={[[t('sale.countLabel'), list.data.total], [t('purchase.amount'), money(list.data.amount), true]]} />}
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
