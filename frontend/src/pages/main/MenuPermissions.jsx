// Main Clinic / Admin → Menu Permission: pick an employee, tick the menus / actions they may use.
// Starts from the role's defaults; only the differences are saved (see shared/permissions.js).
import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, Save, RotateCcw, AlertTriangle } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useT } from '../../lib/i18n.jsx';
import { PERMISSION_GROUPS } from '../../../../shared/permissions.js';
import { Badge, CardHeader, EmptyState, ErrorBox, Note, Spinner, SearchBox, useAsync, useDebounced, useToast } from '../../components/ui.jsx';

export function EmployeePicker({ selectedId, onSelect }) {
  const { t } = useT();
  const auth = useAuth();
  const [q, setQ] = useState('');
  const [clinic, setClinic] = useState('all');
  const dq = useDebounced(q);
  const list = useAsync(() => api('/employees', { query: { q: dq, clinic_id: clinic, status: 'active', limit: 100 }, clinic: null }), [dq, clinic]);

  return (
    <aside className="rounded-xl border border-ink-100 p-2.5 lg:sticky lg:top-2">
      <p className="section-title mb-2">{t('perms.employees')}</p>
      <div className="mb-2 grid gap-2">
        <SearchBox value={q} onChange={setQ} placeholder={t('employees.searchHint')} className="w-full" />
        {!auth.singleClinic && (
          <select className="input" value={clinic} onChange={(e) => setClinic(e.target.value)} aria-label={t('field.clinic')}>
            <option value="all">{t('topbar.allClinics')}</option>
            <option value="main">{t('unit.main')}</option>
            {auth.clinics.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
          </select>
        )}
      </div>
      {list.loading && !list.data ? <Spinner /> : <ErrorBox error={list.error} onRetry={list.reload} />}
      {list.data && !list.data.rows.length && <EmptyState />}
      <ul className="max-h-[60vh] space-y-0.5 overflow-y-auto">
        {list.data?.rows.map((e) => {
          const on = String(e.id) === String(selectedId);
          return (
            <li key={e.id}>
              <button type="button" onClick={() => onSelect(e.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors ${on ? 'border-brand-200 bg-brand-50' : 'border-transparent hover:bg-ink-50'}`}>
                <span className="min-w-0">
                  <b className={`block truncate text-13 ${on ? 'text-brand-800' : 'text-ink-800'}`}>{e.name}</b>
                  <small className="block truncate text-11 text-ink-400">{e.emp_code} · {e.clinic_name || t('unit.main')}</small>
                </span>
                <Badge className="shrink-0">{t(`role.${e.role}`)}</Badge>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function PermissionEditor({ employeeId }) {
  const { t } = useT();
  const { singleClinic } = useAuth();
  const toast = useToast();
  const info = useAsync(() => api(`/permissions/${employeeId}`, { clinic: null }), [employeeId]);
  const [checked, setChecked] = useState(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (info.data) setChecked(new Set(info.data.permissions)); }, [info.data]);

  if (info.loading && !info.data) return <Spinner />;
  if (info.error) return <ErrorBox error={info.error} onRetry={info.reload} />;
  const d = info.data;
  const roleSet = new Set(d.role_permissions);
  const grantable = new Set(d.grantable);
  const locked = d.locked;
  const dirty = d.permissions.length !== checked.size || d.permissions.some((p) => !checked.has(p));
  const custom = [...checked].some((p) => !roleSet.has(p)) || [...roleSet].some((p) => grantable.has(p) && !checked.has(p));

  const toggle = (p, on) => setChecked((s) => { const n = new Set(s); if (on) n.add(p); else n.delete(p); return n; });
  const toggleGroup = (perms, on) => setChecked((s) => {
    const n = new Set(s);
    for (const p of perms) if (grantable.has(p)) { if (on) n.add(p); else n.delete(p); }
    return n;
  });

  async function save() {
    setSaving(true);
    try {
      await api(`/permissions/${employeeId}`, { method: 'PUT', body: { permissions: [...checked] }, clinic: null });
      toast(t('perms.saved', { name: d.employee.name }));
      info.reload();
    } catch (err) {
      toast(err.message || t('common.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 pb-2">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-ink-800">{d.employee.name}</h2>
          <span className="text-12 text-ink-400">{d.employee.emp_code} · {t(`role.${d.employee.role}`)} · {d.employee.clinic_name || t('unit.main')}</span>
        </div>
        {custom ? <Badge tone="info">{t('perms.custom')}</Badge> : <Badge>{t('perms.roleDefault')}</Badge>}
      </div>
      {locked && <Note tone="warning" className="flex gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{locked}</Note>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        {PERMISSION_GROUPS.filter((g) => g.id !== 'communication').map((g) => {   // no Tickets menu in this install
          const usable = g.perms.filter((p) => grantable.has(p));
          const allOn = usable.length > 0 && usable.every((p) => checked.has(p));
          return (
            <section key={g.id} className="rounded-xl border border-ink-200 p-2.5">
              <header className="mb-1.5 border-b border-ink-100 pb-1.5">
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={allOn} disabled={!!locked || !usable.length}
                    onChange={(e) => toggleGroup(g.perms, e.target.checked)} />
                  <b className="text-13 text-ink-800">{t(singleClinic && g.id === 'main' ? 'menu.admin' : g.label)}</b>
                </label>
              </header>
              <div className="grid gap-1">
                {g.perms.map((p) => {
                  const can = grantable.has(p);
                  const on = checked.has(p);
                  const changed = can && on !== roleSet.has(p);
                  return (
                    <label key={p} className={`flex items-center gap-2 text-13 ${can ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                      <input type="checkbox" checked={on} disabled={!!locked || !can} onChange={(e) => toggle(p, e.target.checked)} />
                      <span className={`min-w-0 flex-1 ${changed ? 'font-semibold text-ink-800' : 'text-ink-600'}`}>{t(`perm.${p}`)}</span>
                      {!can && d.employee.role !== 'super_admin' && <small className="whitespace-nowrap text-11 text-ink-400">{t('perms.mainOnly')}</small>}
                      {changed && <Badge tone={on ? 'success' : 'danger'} className="!py-0 !text-11">{on ? t('perms.added') : t('perms.removed')}</Badge>}
                    </label>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <p className="mt-2 text-12 text-ink-400">{t('perms.hint')}</p>
      {!locked && (
        <div className="no-print mt-3 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button type="button" className="btn-secondary px-2 sm:px-4" disabled={!custom}
            onClick={() => setChecked(new Set(d.role_permissions.filter((p) => grantable.has(p) || roleSet.has(p))))}>
            <RotateCcw size={16} /> {t('perms.reset')}
          </button>
          <button type="button" className="btn-primary px-2 sm:px-4" onClick={save} disabled={saving || !dirty}><Save size={16} /> {saving ? t('common.saving') : t('common.save')}</button>
        </div>
      )}
    </div>
  );
}

export default function MenuPermissions() {
  const { t } = useT();
  const [employeeId, setEmployeeId] = useState(null);
  const editorRef = useRef(null);
  const pick = (id) => {
    setEmployeeId(id);
    // one-column layout (phones / small tablets): the editor is below the list
    if (window.matchMedia('(max-width: 1023px)').matches) setTimeout(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  return (
    <div className="card">
      <CardHeader icon={ShieldCheck} title={t('menu.menuPermission')} subtitle={t('perms.subtitle')} />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(16rem,21rem)_1fr]">
        <EmployeePicker selectedId={employeeId} onSelect={pick} />
        <div ref={editorRef} className="min-w-0 scroll-mt-20">
          {employeeId ? <PermissionEditor employeeId={employeeId} /> : <EmptyState message={t('perms.pick')} />}
        </div>
      </div>
    </div>
  );
}
