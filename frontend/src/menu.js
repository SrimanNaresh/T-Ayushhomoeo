// Sidebar / top-bar menus. A page shows only if the user has its permission (`perm`) or, for a pharmacy
// page, at least View Menu Access on its `key` (shared/menuAccess.js).
// `scope: 'main'`   → Main Clinic menu (Admin / Super Admin)
// `scope: 'branch'` → same for every clinic; admins see it once a clinic is selected
// A sub-menu (sub(...)) has `children` instead of a path; a child may itself have `children` (a nested
// sub-menu, e.g. Return → Sales Return → Entry / List). A sub-menu shows if any page inside it is allowed.
import { PHARMACY_MENU, PHARMACY_REPORTS } from './modules/pharmacy/menu.js';

const sub = (id, label, icon, children) => ({ id, label, icon, children });

/** Every page link of a group, nested sub-menus included. */
export const menuLinks = (items) => items.flatMap((i) => (i.children ? menuLinks(i.children) : [i]));

/** Can this user open this menu page? */
export const pageAllowed = (auth, page) => (page.key ? auth.access(page.key) !== 'none' : auth.can(page.perm));

/** PHARMACY_MENU (key / label / to / submenu) as menu items; the reports join the Report column. */
function pharmacyItems() {
  const leaf = (m) => ({ path: m.to, label: m.label, key: m.key });
  const node = (m, n) => (m.submenu ? { id: m.id || `${m.label}-${n}`, label: m.label, children: m.submenu.map(node) } : leaf(m));
  return PHARMACY_MENU.map((m) => {
    if (!m.submenu) return sub(m.id, m.column || m.label, m.icon, [leaf(m)]);
    const children = m.submenu.map(node);
    if (m.id === 'report') children.push(...PHARMACY_REPORTS.map(leaf));
    return sub(m.id, m.label, m.icon, children);
  });
}

export const MENU = [
  {
    id: 'main', scope: 'main', label: 'menu.mainClinic',
    items: [
      { path: '/dashboard', label: 'menu.dashboard', perm: 'dashboard.view', icon: 'dashboard' },
      { path: '/employees/new', label: 'menu.employeeRegistration', perm: 'employee.create', icon: 'userPlus' },
      { path: '/employees', label: 'menu.allEmployees', perm: 'employee.create', icon: 'users' },
      { path: '/clinics', label: 'menu.clinicGeneration', perm: 'clinic.manage', icon: 'building' },
      { path: '/pharmacies', label: 'menu.pharmacyGeneration', perm: 'pharmacy.manage', icon: 'pill' },
      { path: '/labs', label: 'menu.labGeneration', perm: 'lab.manage', icon: 'flask' },
      { path: '/permissions', label: 'menu.menuPermission', perm: 'permission.manage', icon: 'key' },
      { path: '/menu-access', label: 'menu.menuAccess', perm: 'permission.manage', icon: 'shield' },
    ],
  },
  {
    id: 'registration', scope: 'branch', label: 'menu.registration',
    items: [
      { path: '/patients/new', label: 'menu.patientRegistration', perm: 'patient.create', icon: 'userPlus' },
      { path: '/patients', label: 'menu.patientList', perm: 'patient.view', icon: 'list' },
      { path: '/clinic/employees/new', label: 'menu.employeeRegistration', perm: 'employee.create', icon: 'userPlus' },
      { path: '/clinic/employees', label: 'menu.employeeList', perm: 'employee.view', icon: 'users' },
    ],
  },
  {
    id: 'queue', scope: 'branch', label: 'menu.patientQueue',
    items: [
      { path: '/queue/confirm', label: 'menu.confirmSearch', perm: 'queue.confirm', icon: 'search' },
      { path: '/queue', label: 'menu.confirmList', perm: 'queue.view', icon: 'ticket' },
      { path: '/queue/tokens', label: 'menu.tokens', perm: 'queue.view', icon: 'clock' },
      { path: '/queue/consent', label: 'menu.consentForm', perm: 'patient.view', icon: 'file' },
    ],
  },
  {
    id: 'doctor', scope: 'branch', label: 'menu.doctor',
    items: [
      { path: '/doctor/examine', label: 'menu.examine', perm: 'visit.examine', icon: 'stethoscope' },
      { path: '/doctor/history', label: 'menu.patientHistory', perm: 'patient.history', icon: 'history' },
    ],
  },
  {
    id: 'pharmacy', scope: 'branch', label: 'menu.pharmacy',
    items: pharmacyItems(),   // modules/pharmacy/menu.js
  },
  {
    id: 'billing', scope: 'branch', label: 'menu.billing',
    items: [
      { path: '/billing', label: 'menu.patientBill', perm: 'bill.create', icon: 'receipt' },
      { path: '/bills', label: 'menu.billList', perm: 'bill.view', icon: 'list' },
    ],
  },
  // Communication → Tickets is not used in this install
];

/**
 * The menu for this install. Multi-branch: MENU as it is.
 * Single clinic (SINGLE_CLINIC=1): the `main` group becomes "Admin" with Dashboard, Employee Registration,
 * All Employees, Menu Permission and Clinic Settings (the one clinic's form instead of Clinic Generation);
 * Pharmacy / Lab Generation only show once the clinic has such a unit.
 */
export function menuFor(auth) {
  if (!auth.singleClinic) return MENU;
  const clinic = auth.activeClinic || {};
  return MENU.map((g) => {
    if (g.id === 'main') {
      const items = g.items.flatMap((i) => {
        if (i.path === '/clinics') return [{ path: '/clinic-settings', label: 'menu.clinicSettings', perm: 'clinic.manage', icon: 'building' }];
        if (i.path === '/pharmacies' && !Number(clinic.pharmacy_count)) return [];
        if (i.path === '/labs' && !Number(clinic.lab_count)) return [];
        return [i];
      });
      // Menu Permission and Menu Access last, after Clinic Settings
      for (const p of ['/permissions', '/menu-access']) {
        const at = items.findIndex((i) => i.path === p);
        if (at >= 0) items.push(...items.splice(at, 1));
      }
      return { ...g, label: 'menu.admin', items };
    }
    // Admin → Employee Registration already covers the one clinic
    if (g.id === 'registration') return { ...g, items: g.items.filter((i) => i.path !== '/clinic/employees/new') };
    return g;
  });
}

/** First page a user lands on after login. */
export function homePath(auth) {
  if (auth.can('dashboard.view')) return '/dashboard';
  for (const g of menuFor(auth)) for (const i of menuLinks(g.items)) if (g.scope === 'branch' && pageAllowed(auth, i)) return i.path;
  return '/profile';
}
