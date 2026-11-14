// Admin → All Employees / Registration → Employee List
import { useState } from 'react';
import { Users, Plus, Pencil } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useT } from '../../lib/i18n.jsx';
import { navigate } from '../../lib/router.jsx';
import { CardHeader, DataTable, ErrorBox, Spinner, Pagination, RowAction, SearchBox, StatusBadge, useAsync, useDebounced } from '../../components/ui.jsx';

const ROLES = ['super_admin', 'admin', 'receptionist', 'doctor', 'pharmacist', 'billing'];

export default function EmployeeList({ scope }) {
  const { t } = useT();
  const auth = useAuth();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [clinicFilter, setClinicFilter] = useState(scope === 'main' ? 'all' : '');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);

  const base = scope === 'main' ? '/employees' : '/clinic/employees';
  const query = { q: dq, role, page, ...(scope === 'main' ? { clinic_id: clinicFilter } : {}) };
  const list = useAsync(() => api('/employees', { query, clinic: scope === 'main' ? null : undefined }), [dq, role, page, clinicFilter]);

  const unitLabel = (r) => (r.unit_type === 'pharmacy' ? r.pharmacy_name : r.unit_type === 'lab' ? r.lab_name : r.unit_type === 'main' ? t('unit.main') : t('unit.clinic'));
  const canEditRow = (r) => !(['admin', 'super_admin'].includes(r.role) && auth.user.role !== 'super_admin');
  const columns = [
    { key: 'name', label: t('field.name') },
    { key: 'emp_code', label: t('field.code') },
    { key: 'role', label: t('field.role'), render: (r) => t(`role.${r.role}`) },
    ...(scope === 'main' && !auth.singleClinic ? [{ key: 'clinic_name', label: t('field.clinic'), render: (r) => (r.clinic_name ? `${r.clinic_name} (${r.clinic_code})` : t('unit.main')) }] : []),
    { key: 'unit', label: t('employees.workUnit'), render: unitLabel },
    { key: 'mobile', label: t('field.mobile') },
    { key: 'username', label: t('login.username'), render: (r) => (r.can_login ? r.username : <span className="text-ink-400">{t('employees.noLogin')}</span>) },
    { key: 'status', label: t('field.status'), render: (r) => <StatusBadge status={r.status} /> },
    ...(auth.can('employee.edit') ? [{
      key: '_e', label: t('common.edit'), className: 'col-actions',
      render: (r) => (canEditRow(r) ? <RowAction icon={Pencil} title={t('common.edit')} onClick={() => navigate(`${base}/${r.id}/edit`)} /> : ''),
    }] : []),
  ];

  return (
    <div className="card">
      <CardHeader icon={Users}
        title={scope === 'main' ? t('menu.allEmployees') : t('menu.employeeList')}
        subtitle={list.data ? t('employees.count', { n: list.data.total }) : (scope === 'branch' ? auth.activeClinic?.name : t('common.loading'))}
        actions={(
          <>
            <select className="input w-full sm:w-40" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} aria-label={t('field.role')}>
              <option value="">{t('employees.allRoles')}</option>
              {ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
            </select>
            {scope === 'main' && !auth.singleClinic && (
              <select className="input w-full sm:w-48" value={clinicFilter} onChange={(e) => { setClinicFilter(e.target.value); setPage(1); }} aria-label={t('field.clinic')}>
                <option value="all">{t('topbar.allClinics')}</option>
                <option value="main">{t('unit.main')}</option>
                {auth.clinics.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
              </select>
            )}
            <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder={t('employees.searchHint')} />
            {auth.can('employee.create') && <button type="button" className="btn-primary" onClick={() => navigate(`${base}/new`)}><Plus size={16} /> {t('employees.newEmployee')}</button>}
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
