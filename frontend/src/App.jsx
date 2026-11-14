import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { AuthProvider, useAuth } from './lib/auth.jsx';
import { LangProvider, useT } from './lib/i18n.jsx';
import { matchRoute, navigate, useLocation } from './lib/router.jsx';
import { ToastProvider, Loading, Empty, Note } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import { homePath } from './menu.js';

import Login from './pages/Login.jsx';
import Profile from './pages/Profile.jsx';
// Main Clinic
import Dashboard from './pages/main/Dashboard.jsx';
import { ClinicsPage, ClinicSettingsPage, PharmaciesPage, LabsPage } from './pages/main/Units.jsx';
import EmployeeForm from './pages/main/EmployeeForm.jsx';
import EmployeeList from './pages/main/EmployeeList.jsx';
import MenuPermissions from './pages/main/MenuPermissions.jsx';
// Branch clinic
import PatientForm from './pages/branch/PatientForm.jsx';
import PatientList from './pages/branch/PatientList.jsx';
import PatientView from './pages/branch/PatientView.jsx';
import ConfirmSearch from './pages/branch/ConfirmSearch.jsx';
import ConfirmList from './pages/branch/ConfirmList.jsx';
import Tokens from './pages/branch/Tokens.jsx';
import Examine from './pages/branch/Examine.jsx';
import PrescriptionPrint from './pages/branch/PrescriptionPrint.jsx';
import DayBookPrint from './pages/branch/DayBookPrint.jsx';
import ConsentForm from './pages/branch/ConsentForm.jsx';
import PatientHistory from './pages/branch/PatientHistory.jsx';
import PatientBill from './pages/branch/PatientBill.jsx';
import BillList from './pages/branch/BillList.jsx';
import BillView from './pages/branch/BillView.jsx';
import MenuAccess from './pages/main/MenuAccess.jsx';
import { PHARMACY_ROUTES, pharmacyRedirect } from './modules/pharmacy/routes.jsx';

// branch: true → needs an active clinic (admins pick one in the switcher)
const ROUTES = [
  { path: '/dashboard', perm: 'dashboard.view', el: Dashboard },
  { path: '/clinics', perm: 'clinic.manage', el: ClinicsPage },
  { path: '/clinic-settings', perm: 'clinic.manage', el: ClinicSettingsPage },   // single-clinic mode
  { path: '/pharmacies', perm: 'pharmacy.manage', el: PharmaciesPage },
  { path: '/labs', perm: 'lab.manage', el: LabsPage },
  { path: '/employees', perm: 'employee.create', el: EmployeeList, props: { scope: 'main' } },
  { path: '/employees/new', perm: 'employee.create', el: EmployeeForm, props: { scope: 'main' } },
  { path: '/employees/:id/edit', perm: 'employee.edit', el: EmployeeForm, props: { scope: 'main' } },
  { path: '/permissions', perm: 'permission.manage', el: MenuPermissions },
  { path: '/menu-access', perm: 'permission.manage', el: MenuAccess },

  { path: '/patients/new', perm: 'patient.create', el: PatientForm, branch: true },
  { path: '/patients', perm: 'patient.view', el: PatientList, branch: true },
  { path: '/patients/:id', perm: 'patient.view', el: PatientView, branch: true },
  { path: '/patients/:id/edit', perm: 'patient.edit', el: PatientForm, branch: true },
  { path: '/clinic/employees', perm: 'employee.view', el: EmployeeList, props: { scope: 'branch' }, branch: true },
  { path: '/clinic/employees/new', perm: 'employee.create', el: EmployeeForm, props: { scope: 'branch' }, branch: true },
  { path: '/clinic/employees/:id/edit', perm: 'employee.edit', el: EmployeeForm, props: { scope: 'branch' }, branch: true },

  { path: '/queue/confirm', perm: 'queue.confirm', el: ConfirmSearch, branch: true },
  { path: '/queue', perm: 'queue.view', el: ConfirmList, branch: true },
  { path: '/queue/tokens', perm: 'queue.view', el: Tokens, branch: true },
  { path: '/queue/consent', perm: 'patient.view', el: ConsentForm, branch: true },
  { path: '/queue/consent/:patientId', perm: 'patient.view', el: ConsentForm, branch: true },

  { path: '/doctor/examine', perm: 'visit.examine', el: Examine, branch: true },
  { path: '/doctor/examine/:visitId', perm: 'visit.examine', el: Examine, branch: true },
  { path: '/doctor/prescription/:visitId', perm: 'patient.history', el: PrescriptionPrint, branch: true },
  { path: '/doctor/daybook/:visitId', perm: 'patient.history', el: DayBookPrint, branch: true },
  { path: '/doctor/history', perm: 'patient.history', el: PatientHistory, branch: true },
  { path: '/doctor/history/:patientId', perm: 'patient.history', el: PatientHistory, branch: true },

  { path: '/billing', perm: 'bill.create', el: PatientBill, branch: true },
  { path: '/billing/:visitId', perm: 'bill.create', el: PatientBill, branch: true },
  { path: '/bills', perm: 'bill.view', el: BillList, branch: true },
  { path: '/bills/:id', perm: ['bill.view', 'bill.create'], el: BillView, branch: true },

  ...PHARMACY_ROUTES,   // /pharmacy/* (modules/pharmacy/routes.jsx), guarded by Menu Access keys

  { path: '/profile', el: Profile },
];

function Router() {
  const auth = useAuth();
  const { t } = useT();
  const { path, query } = useLocation();

  useEffect(() => {
    if (auth.user && (path === '/' || path === '/login')) navigate(homePath(auth), { replace: true });
    const moved = pharmacyRedirect(path);   // an old pharmacy link (before /pharmacy/...)
    if (moved) navigate(moved, { replace: true });
  }, [auth, path]);

  if (auth.loading) return <div className="grid min-h-full place-items-center"><Loading /></div>;
  if (!auth.user) return <Login />;

  let route = null;
  let params = {};
  for (const r of ROUTES) {
    const m = matchRoute(r.path, path);
    if (m) { route = r; params = m; break; }
  }

  let page;
  if (!route) {
    page = <div className="card"><Empty>{t('common.pageNotFound')}</Empty></div>;
  } else if ((route.perm && ![].concat(route.perm).some((p) => auth.can(p))) || (route.key && auth.access(route.key) === 'none')) {
    page = <div className="card"><Empty>{t('common.noAccess')}</Empty></div>;
  } else if (route.branch && !auth.activeClinic) {
    page = <div className="card"><Empty>{t('nav.selectClinicFirst')}</Empty></div>;
  } else {
    const El = route.el;
    // key: remount the page when the admin switches clinic, so it reloads that clinic's data
    page = <El key={`${auth.activeClinicId}|${path}`} params={params} query={query} {...(route.props || {})} />;
    // Menu Access "View": the page opens, the server refuses saving
    if (route.key && auth.access(route.key) === 'view') page = <><Note tone="warning" className="!mt-0 mb-3">{t('macc.viewOnly')}</Note>{page}</>;
  }
  return <Layout path={path}>{page}</Layout>;
}

// The built page loads one hashed bundle (assets/index-<hash>.js). A tab left open keeps running the old
// bundle after an update, so check index.html every minute and offer a reload when the bundle changed.
const bundleOf = (html) => html.match(/assets\/index-[\w-]+\.js/)?.[0] || null;

function UpdateBanner() {
  const { t } = useT();
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const current = bundleOf(document.documentElement.innerHTML);
    if (!current) return undefined;   // Vite dev server: no bundle to compare
    const check = async () => {
      try {
        const res = await fetch(window.location.pathname, { cache: 'no-store' });
        const latest = bundleOf(await res.text());
        if (latest && latest !== current) setStale(true);
      } catch { /* offline – try again next time */ }
    };
    const h = setInterval(check, 60000);
    window.addEventListener('focus', check);
    return () => { clearInterval(h); window.removeEventListener('focus', check); };
  }, []);
  if (!stale) return null;
  return (
    <div className="no-print fixed bottom-4 left-1/2 z-[200] flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl border border-amber-200 bg-white py-2 pl-4 pr-2 text-13 font-medium text-ink-800 shadow-elevated toast-in" role="status">
      <RefreshCw size={16} className="shrink-0 text-amber-600" />
      <span>{t('app.updateAvailable')}</span>
      <button type="button" className="btn-primary !px-3 !py-1 !text-13" onClick={() => window.location.reload()}>{t('app.reload')}</button>
    </div>
  );
}

export default function App() {
  return (
    <LangProvider>
      <UpdateBanner />
      <ToastProvider>
        <AuthProvider>
          <Router />
        </AuthProvider>
      </ToastProvider>
    </LangProvider>
  );
}
