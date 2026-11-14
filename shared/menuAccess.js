// Menu Access: what each employee may do on each pharmacy page (key 'pharmacy.*'): Full, View or No Access.
// Imported by the backend (enforcement: pharmacy/index.js) and the frontend (menus, pages, Admin → Menu Access).
//
// Saved rows (table menu_access) win. A page with no saved row starts from the permission it needed before
// Menu Access existed (`perm` below; role defaults + Menu Permission changes): Full when held, else No Access.
// Super Admin / Admin always have Full. Do NOT rename or remove a key: saved rows depend on them.
import { isGlobalRole, userCan } from './permissions.js';

export const ACCESS_LEVELS = ['full', 'view', 'none'];

// Every pharmacy page key, in menu order, with the permission its default comes from.
export const PHARMACY_PAGES = [
  { key: 'pharmacy.dashboard', perm: 'dispense' },
  { key: 'pharmacy.sales-billing', perm: 'dispense' },
  { key: 'pharmacy.sales-billing-list', perm: 'dispense' },
  { key: 'pharmacy.dispense', perm: 'dispense' },
  { key: 'pharmacy.item', perm: 'item.manage' },
  { key: 'pharmacy.item-list', perm: 'item.view' },
  { key: 'pharmacy.item-list-new', perm: 'item.manage' },          // Bulk Update
  { key: 'pharmacy.vendor-master', perm: 'supplier.manage' },
  { key: 'pharmacy.vendor-list', perm: 'supplier.manage' },
  { key: 'pharmacy.vendor-payment', perm: 'stock.manage' },
  { key: 'pharmacy.purchase-master', perm: 'stock.manage' },
  { key: 'pharmacy.purchase-master-list', perm: 'stock.manage' },
  { key: 'pharmacy.stock-inward', perm: 'stock.manage' },
  { key: 'pharmacy.stock-inward-list', perm: 'stock.manage' },
  { key: 'pharmacy.stock-ips', perm: 'stock.manage' },
  { key: 'pharmacy.stock-adjustment', perm: 'stock.manage' },
  { key: 'pharmacy.stock-adjustment-list', perm: 'stock.manage' },
  { key: 'pharmacy.purchase-return', perm: 'stock.manage' },
  { key: 'pharmacy.purchase-return-list', perm: 'stock.manage' },
  { key: 'pharmacy.sales-return', perm: 'dispense' },
  { key: 'pharmacy.sales-return-list', perm: 'dispense' },
  { key: 'pharmacy.stock-report', perm: 'item.view' },
  { key: 'pharmacy.vendor-payments', perm: 'stock.manage' },
  { key: 'pharmacy.all-in-one-report', perm: 'stock.manage' },
];
export const MENU_KEYS = PHARMACY_PAGES.map((p) => p.key);

/** The level a page starts with for this user ({ role, permissions }) when no row is saved. */
export function defaultLevel(user, key) {
  if (isGlobalRole(user?.role)) return 'full';
  const page = PHARMACY_PAGES.find((p) => p.key === key);
  return page && userCan(user, page.perm) ? 'full' : 'none';
}

/** Every key → level for this user: saved rows ([{ menu_key, access_level }]) over the defaults. */
export function menuAccessMap(user, rows = []) {
  const saved = new Map(rows.map((r) => [r.menu_key, r.access_level]));
  return Object.fromEntries(MENU_KEYS.map((k) => [
    k, isGlobalRole(user?.role) ? 'full' : (ACCESS_LEVELS.includes(saved.get(k)) ? saved.get(k) : defaultLevel(user, k)),
  ]));
}

/** This user's level on a key ('full' | 'view' | 'none'); `user.menu_access` is sent by the server. */
export function accessOf(user, key) {
  if (!user) return 'none';
  if (isGlobalRole(user.role)) return 'full';
  return user.menu_access?.[key] || defaultLevel(user, key);
}

/** True when the user has at least `level` ('view' or 'full') on any of the keys. */
export function hasAccess(user, keys, level = 'view') {
  return [].concat(keys).some((k) => {
    const a = accessOf(user, k);
    return level === 'full' ? a === 'full' : a !== 'none';
  });
}
