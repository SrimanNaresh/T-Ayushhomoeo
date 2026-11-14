// Billing → Bill List: bills between two dates (today by default); a row opens the bill
import { useState } from 'react';
import { ReceiptText, Receipt, Eye } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useT } from '../../lib/i18n.jsx';
import { navigate } from '../../lib/router.jsx';
import { fmtDate, money, todayLocal } from '../../lib/format.js';
import {
  CardHeader, DataTable, DateFilter, ErrorBox, Spinner, Pagination, RowAction, SearchBox, StatusBadge, SummaryBar, useAsync, useDebounced,
} from '../../components/ui.jsx';

export default function BillList() {
  const { t } = useT();
  const auth = useAuth();
  const [from, setFrom] = useState(todayLocal());
  const [to, setTo] = useState(todayLocal());
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const list = useAsync(() => api('/bills', { query: { from, to, q: dq, page } }), [from, to, dq, page]);

  const columns = [
    { key: 'bill_no', label: t('billing.billNo') },
    { key: 'bill_date', label: t('field.date'), className: 'nowrap', render: (r) => fmtDate(r.bill_date, true) },
    {
      key: 'patient_name', label: t('field.name'),
      render: (r) => <><span className="text-ink-700">{r.patient_name}</span><span className="block text-11 text-ink-400">{r.patient_code}</span></>,
    },
    { key: 'net_amount', label: t('billing.net'), render: (r) => money(r.net_amount), className: 'num' },
    { key: 'paid_amount', label: t('billing.paid'), render: (r) => money(r.paid_amount), className: 'num' },
    { key: 'payment_mode', label: t('billing.mode'), render: (r) => t(`billing.mode_${r.payment_mode}`) },
    { key: 'status', label: t('field.status'), render: (r) => <StatusBadge status={r.status} /> },
    { key: '_a', label: t('common.view'), className: 'col-actions', render: (r) => <RowAction icon={Eye} title={t('common.view')} onClick={() => navigate(`/bills/${r.id}`)} /> },
  ];

  return (
    <div className="card">
      <CardHeader icon={ReceiptText} title={t('menu.billList')} subtitle={auth.activeClinic?.name}
        actions={(
          <>
            <DateFilter label={t('billing.from')} value={from} onChange={(v) => { setFrom(v); setPage(1); }} />
            <DateFilter label={t('billing.to')} value={to} min={from} onChange={(v) => { setTo(v); setPage(1); }} />
            <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder={t('billing.searchHint')} />
            {auth.can('bill.create') && <button type="button" className="btn-primary" onClick={() => navigate('/billing')}><Receipt size={16} /> {t('menu.patientBill')}</button>}
          </>
        )} />
      {list.data && (
        <SummaryBar items={[[t('billing.billsCount', { n: list.data.total })], [t('billing.net'), money(list.data.net_total)], [t('billing.collected'), money(list.data.paid_total), true]]} />
      )}
      {list.loading && !list.data ? <Spinner /> : <ErrorBox error={list.error} onRetry={list.reload} />}
      {list.data && (
        <>
          <DataTable columns={columns} rows={list.data.rows} onRowClick={(r) => navigate(`/bills/${r.id}`)} />
          <Pagination page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}
