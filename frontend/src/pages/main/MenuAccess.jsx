// Admin → Menu Access: per employee, Full / View / No Access on each pharmacy page (keys 'pharmacy.*',
// shared/menuAccess.js), laid out like the Pharmacy menu. "Default" follows the employee's permissions
// (Menu Permission); only other choices are saved. Full = open and save; View = open only; No Access = hidden.
import { useEffect, useRef, useState } from 'react';
import { KeySquare, Save, RotateCcw, AlertTriangle } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useT } from '../../lib/i18n.jsx';
import { PHARMACY_MENU, PHARMACY_REPORTS } from '../../modules/pharmacy/menu.js';
import { Badge, CardHeader, EmptyState, ErrorBox, Note, Spinner, useAsync, useToast } from '../../components/ui.jsx';
import { EmployeePicker } from './MenuPermissions.jsx';

const CHOICES = ['default', 'full', 'view', 'none'];
const LEVEL_TONE = { full: 'success', view: 'info', none: 'neutral' };

/** The menu as sections (one per column) of [trail, page] rows */
function sections() {
  const walk = (items, trail) => items.flatMap((m) => (m.submenu ? walk(m.submenu, [...trail, m.label]) : [{ trail, page: m }]));
  return PHARMACY_MENU.map((m) => ({
    label: m.column || m.label,
    rows: m.submenu ? [...walk(m.submenu, []), ...(m.id === 'report' ? PHARMACY_REPORTS.map((p) => ({ trail: [], page: p })) : [])] : [{ trail: [], page: m }],
  }));
}

function AccessEditor({ employeeId }) {
  const { t } = useT();
  const toast = useToast();
  const info = useAsync(() => api(`/menu-access/${employeeId}`, { clinic: null }), [employeeId]);
  const [choice, setChoice] = useState({});   // key → 'default' | 'full' | 'view' | 'none'
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (info.data) setChoice(Object.fromEntries(info.data.pages.map((p) => [p.key, p.saved || 'default'])));
  }, [info.data]);

  if (info.loading && !info.data) return <Spinner />;
  if (info.error) return <ErrorBox error={info.error} onRetry={info.reload} />;
  const d = info.data;
  const byKey = new Map(d.pages.map((p) => [p.key, p]));
  const locked = d.locked;
  const dirty = d.pages.some((p) => (p.saved || 'default') !== choice[p.key]);
  const custom = Object.values(choice).some((c) => c !== 'default');
  const levelOf = (key) => (choice[key] === 'default' ? byKey.get(key)?.default : choice[key]);
  const setAll = (keys, c) => setChoice((s) => ({ ...s, ...Object.fromEntries(keys.map((k) => [k, c])) }));

  async function save() {
    setSaving(true);
    try {
      await api(`/menu-access/${employeeId}`, { method: 'PUT', clinic: null, body: { items: d.pages.map((p) => ({ key: p.key, level: choice[p.key] })) } });
      toast(t('macc.saved', { name: d.employee.name }));
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

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {sections().map((sec) => {
          const keys = sec.rows.map((r) => r.page.key);
          return (
            <section key={sec.label} className="rounded-xl border border-ink-200 p-2.5">
              <header className="mb-1.5 flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 pb-1.5">
                <b className="text-13 text-ink-800">{t(sec.label)}</b>
                {!locked && (
                  <span className="flex gap-1">
                    {CHOICES.map((c) => (
                      <button key={c} type="button" className="rounded-md px-1.5 py-0.5 text-11 text-brand-700 hover:bg-brand-50" onClick={() => setAll(keys, c)}>
                        {t(`macc.all_${c}`)}
                      </button>
                    ))}
                  </span>
                )}
              </header>
              <div className="grid gap-1.5">
                {sec.rows.map(({ trail, page }) => {
                  const level = levelOf(page.key);
                  return (
                    <div key={page.key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="min-w-0 text-13 text-ink-700">
                        {trail.length > 0 && <span className="text-ink-400">{trail.map((x) => t(x)).join(' › ')} › </span>}
                        {t(page.label)}
                        <Badge tone={LEVEL_TONE[level]} className="ml-1.5 !py-0 !text-10">{t(`macc.level_${level}`)}</Badge>
                      </span>
                      <select className="input !h-7 !w-36 !py-0 text-12" disabled={!!locked} value={choice[page.key] || 'default'}
                        aria-label={t(page.label)} onChange={(e) => setChoice((s) => ({ ...s, [page.key]: e.target.value }))}>
                        {CHOICES.map((c) => (
                          <option key={c} value={c}>
                            {c === 'default' ? t('macc.defaultIs', { level: t(`macc.level_${byKey.get(page.key)?.default}`) }) : t(`macc.level_${c}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <p className="mt-2 text-12 text-ink-400">{t('macc.hint')}</p>
      {!locked && (
        <div className="no-print mt-3 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button type="button" className="btn-secondary px-2 sm:px-4" disabled={!custom}
            onClick={() => setAll(d.pages.map((p) => p.key), 'default')}>
            <RotateCcw size={16} /> {t('perms.reset')}
          </button>
          <button type="button" className="btn-primary px-2 sm:px-4" onClick={save} disabled={saving || !dirty}><Save size={16} /> {saving ? t('common.saving') : t('common.save')}</button>
        </div>
      )}
    </div>
  );
}

export default function MenuAccess() {
  const { t } = useT();
  const [employeeId, setEmployeeId] = useState(null);
  const editorRef = useRef(null);
  const pick = (id) => {
    setEmployeeId(id);
    if (window.matchMedia('(max-width: 1023px)').matches) setTimeout(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  return (
    <div className="card">
      <CardHeader icon={KeySquare} title={t('menu.menuAccess')} subtitle={t('macc.subtitle')} />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(16rem,21rem)_1fr]">
        <EmployeePicker selectedId={employeeId} onSelect={pick} />
        <div ref={editorRef} className="min-w-0 scroll-mt-20">
          {employeeId ? <AccessEditor employeeId={employeeId} /> : <EmptyState message={t('perms.pick')} />}
        </div>
      </div>
    </div>
  );
}
