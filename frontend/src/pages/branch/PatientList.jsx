// Registration → Patient List: search, view / edit / delete, and a printable Patient card per row
import { useState } from 'react';
import { Users, Plus, Eye, Pencil, Trash2, Printer } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useT } from '../../lib/i18n.jsx';
import { navigate } from '../../lib/router.jsx';
import { ageLabel, fmtDate, genderLabel } from '../../lib/format.js';
import { CardHeader, DataTable, ErrorBox, Spinner, Modal, Pagination, RowAction, SearchBox, StatusBadge, useAsync, useDebounced, useToast } from '../../components/ui.jsx';
import { PatientCardIcon } from '../../components/Icon.jsx';
import PatientImportButtons, { PatientDownloadButton } from '../../components/PatientImport.jsx';

export default function PatientList({ query }) {
  const { t } = useT();
  const auth = useAuth();
  const [q, setQ] = useState(query.q || '');
  const [page, setPage] = useState(1);
  const [card, setCard] = useState(null);
  const dq = useDebounced(q);
  const list = useAsync(() => api('/patients', { query: { q: dq, page } }), [dq, page]);
  const toast = useToast();
  const isSuperAdmin = auth.user?.role === 'super_admin';

  async function remove(r) {
    if (!window.confirm(t('patients.deleteConfirm', { code: r.patient_code, name: r.name }))) return;
    try {
      await api(`/patients/${r.id}`, { method: 'DELETE' });
      toast(t('patients.deleted', { code: r.patient_code }));
      list.reload();
    } catch (err) {
      toast(err.message || t('common.deleteFailed'), 'error');
    }
  }

  // Print only the open Patient card (index.css: body.printing-card)
  function printCard() {
    document.body.classList.add('printing-card');
    window.addEventListener('afterprint', () => document.body.classList.remove('printing-card'), { once: true });
    window.print();
  }

  const columns = [
    { key: 'name', label: t('field.name') },
    { key: 'patient_code', label: t('field.patientId') },
    { key: 'gender', label: t('field.genderAge'), render: (r) => `${genderLabel(r.gender, t)} / ${ageLabel(r)}` },
    { key: 'mobile', label: t('field.mobile') },
    { key: 'city', label: t('field.city') },
    { key: 'created_at', label: t('patients.registeredOn'), render: (r) => fmtDate(r.created_at) },
    { key: 'status', label: t('field.status'), render: (r) => <StatusBadge status={r.status} /> },
    {
      key: '_card', label: t('patients.card'), className: 'col-center',
      render: (r) => (
        <button type="button" className="btn-ghost !p-1" title={t('patients.card')} aria-label={t('patients.card')}
          onClick={(e) => { e.stopPropagation(); setCard(r); }}>
          <PatientCardIcon size={20} />
        </button>
      ),
    },
    {
      key: '_a', label: t('common.edit'), className: 'col-actions',
      render: (r) => (
        <>
          <RowAction icon={Eye} title={t('common.view')} onClick={() => navigate(`/patients/${r.id}`)} />
          {auth.can('patient.edit') && <RowAction icon={Pencil} title={t('common.edit')} onClick={() => navigate(`/patients/${r.id}/edit`)} />}
          {isSuperAdmin && <RowAction icon={Trash2} tone="danger" title={t('common.delete')} onClick={() => remove(r)} />}
        </>
      ),
    },
  ];

  const Info = ({ label, children }) => (
    <div className="grid grid-cols-[7rem_1fr] gap-2 py-1">
      <dt className="text-12 font-semibold text-ink-500">{label}</dt>
      <dd className="min-w-0 whitespace-pre-line break-words text-13 text-ink-800">{children || '-'}</dd>
    </div>
  );

  return (
    <div className="card">
      <CardHeader icon={Users} title={t('menu.patientList')}
        subtitle={list.data ? t('patients.count', { n: list.data.total }) : auth.activeClinic?.name}
        actions={(
          <>
            <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder={t('patients.searchHint')} autoFocus />
            {isSuperAdmin && <PatientImportButtons onImported={list.reload} />}
            {isSuperAdmin && <PatientDownloadButton clinicCode={auth.activeClinic?.code} />}
            {auth.can('patient.create') && <button type="button" className="btn-primary" onClick={() => navigate('/patients/new')}><Plus size={16} /> {t('patients.newPatient')}</button>}
          </>
        )} />
      {list.loading && !list.data ? <Spinner /> : <ErrorBox error={list.error} onRetry={list.reload} />}
      {list.data && (
        <>
          <DataTable columns={columns} rows={list.data.rows} onRowClick={(r) => navigate(`/patients/${r.id}`)} />
          <Pagination page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={setPage} />
        </>
      )}

      <Modal open={!!card} title={t('patients.card')} onClose={() => setCard(null)}
        footer={<button type="button" className="btn-primary" onClick={printCard}><Printer size={16} /> {t('billing.print')}</button>}>
        {card && (
          <div className="grid overflow-hidden rounded-xl border border-ink-200 sm:grid-cols-2">
            <dl className="px-4 py-3">
              <Info label={t('field.patientId')}><b>{card.patient_code}</b></Info>
              <Info label={t('field.name')}>{card.name}</Info>
              <Info label={t('field.age')}>{ageLabel(card)}</Info>
              <Info label={t('field.gender')}>{card.gender ? genderLabel(card.gender, t) : ''}</Info>
            </dl>
            <dl className="border-t border-ink-200 px-4 py-3 sm:border-l sm:border-t-0">
              <Info label={t('field.address')}>{card.address}</Info>
              <Info label={t('field.mobile')}>{card.mobile}</Info>
            </dl>
          </div>
        )}
      </Modal>
    </div>
  );
}
