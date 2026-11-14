// Pharmacy → Purchase / Order → List: every order, newest first (an Admin may also delete one not yet received)
import { useState } from 'react';
import { ShoppingCart, Plus, Pencil, Trash2 } from 'lucide-react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/i18n.jsx';
import { useAuth } from '../../../lib/auth.jsx';
import { navigate } from '../../../lib/router.jsx';
import { fmtDate, money } from '../../../lib/format.js';
import { CardHeader, DataTable, ErrorBox, Spinner, Pagination, RowAction, SearchBox, useAsync, useDebounced, useToast } from '../../../components/ui.jsx';

export default function PurchaseList() {
  const { t } = useT();
  const { isGlobal: isAdmin } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const list = useAsync(() => api('/pharmacy/purchase-orders', { query: { q: dq, page, limit: 50 } }), [dq, page]);

  async function remove(r) {
    if (!window.confirm(t('purchase.deleteConfirm', { no: r.po_no }))) return;
    try {
      await api(`/pharmacy/purchase-orders/${r.id}`, { method: 'DELETE' });
      toast(t('purchase.deleted', { no: r.po_no }));
      list.reload();
    } catch (err) {
      toast(err.message || t('common.deleteFailed'), 'error');
    }
  }

  const columns = [
    { key: 'po_no', label: t('purchase.no') },
    { key: 'po_date', label: t('purchase.date'), render: (r) => fmtDate(r.po_date) },
    { key: 'supplier_name', label: t('purchase.vendor') },
    { key: 'item_count', label: t('purchase.items'), className: 'num' },
    { key: 'total_amount', label: t('purchase.sumTotal'), className: 'num', render: (r) => money(r.total_amount) },
    {
      key: '_a', label: t('common.edit'), className: 'col-actions',
      render: (r) => (
        <>
          <RowAction icon={Pencil} title={t('common.edit')} onClick={() => navigate(`/pharmacy/purchase-order/${r.id}`)} />
          {isAdmin && <RowAction icon={Trash2} tone="danger" title={t('common.delete')} onClick={() => remove(r)} />}
        </>
      ),
    },
  ];

  return (
    <div className="card">
      <CardHeader icon={ShoppingCart} title={t('purchase.listTitle')} subtitle={list.data ? t('purchase.count', { n: list.data.total }) : t('common.loading')}
        actions={(
          <>
            <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder={t('purchase.searchHint')} />
            <button type="button" className="btn-primary" onClick={() => navigate('/pharmacy/purchase-order')}><Plus size={16} /> {t('purchase.new')}</button>
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
