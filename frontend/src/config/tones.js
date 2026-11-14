// One colour per main menu, used by the menus and by every screen's card
// header, so a section looks the same wherever it appears. Same palette as
// Ayush ALL IN ONE (src/config/tones.js). Full class names (not built from
// parts) so Tailwind keeps them.
// Keys are this app's menu group ids (menu.js), and the Pharmacy sub-menu ids.
export const MENU_TONE_OF = {
  dashboard: 'brand', main: 'slate', registration: 'teal', queue: 'sky', doctor: 'indigo', billing: 'rose', pharmacy: 'emerald',
  // Pharmacy sub-menus keep their own colours on their screens
  pharmacyDash: 'brand', item: 'violet', vendor: 'amber', purchase: 'sky', stockin: 'emerald', return: 'rose', sales: 'teal', report: 'indigo',
};

export const MENU_TONES = {
  brand: { chip: 'bg-brand-50 text-brand-600', solid: 'bg-brand-600 text-white', soft: 'bg-brand-50', bar: 'bg-brand-500', text: 'text-brand-700', grad: 'from-brand-500 to-brand-700', ring: 'ring-brand-100' },
  violet: { chip: 'bg-violet-50 text-violet-600', solid: 'bg-violet-600 text-white', soft: 'bg-violet-50', bar: 'bg-violet-500', text: 'text-violet-700', grad: 'from-violet-500 to-violet-700', ring: 'ring-violet-100' },
  amber: { chip: 'bg-amber-50 text-amber-600', solid: 'bg-amber-500 text-white', soft: 'bg-amber-50', bar: 'bg-amber-500', text: 'text-amber-700', grad: 'from-amber-400 to-amber-600', ring: 'ring-amber-100' },
  sky: { chip: 'bg-sky-50 text-sky-600', solid: 'bg-sky-600 text-white', soft: 'bg-sky-50', bar: 'bg-sky-500', text: 'text-sky-700', grad: 'from-sky-500 to-sky-700', ring: 'ring-sky-100' },
  emerald: { chip: 'bg-emerald-50 text-emerald-600', solid: 'bg-emerald-600 text-white', soft: 'bg-emerald-50', bar: 'bg-emerald-500', text: 'text-emerald-700', grad: 'from-emerald-500 to-emerald-700', ring: 'ring-emerald-100' },
  rose: { chip: 'bg-rose-50 text-rose-600', solid: 'bg-rose-600 text-white', soft: 'bg-rose-50', bar: 'bg-rose-500', text: 'text-rose-700', grad: 'from-rose-500 to-rose-700', ring: 'ring-rose-100' },
  teal: { chip: 'bg-teal-50 text-teal-600', solid: 'bg-teal-600 text-white', soft: 'bg-teal-50', bar: 'bg-teal-500', text: 'text-teal-700', grad: 'from-teal-500 to-teal-700', ring: 'ring-teal-100' },
  indigo: { chip: 'bg-indigo-50 text-indigo-600', solid: 'bg-indigo-600 text-white', soft: 'bg-indigo-50', bar: 'bg-indigo-500', text: 'text-indigo-700', grad: 'from-indigo-500 to-indigo-700', ring: 'ring-indigo-100' },
  slate: { chip: 'bg-slate-100 text-slate-600', solid: 'bg-slate-700 text-white', soft: 'bg-slate-100', bar: 'bg-slate-500', text: 'text-slate-700', grad: 'from-slate-500 to-slate-700', ring: 'ring-slate-200' },
};

export const toneOf = (id) => MENU_TONES[MENU_TONE_OF[id] || 'brand'];

/**
 * The menu section a page belongs to: { group, trail, label, tone } (labels are i18n keys).
 * groups: the menu groups for this install (menuFor(auth)). A page reached from a menu page
 * (/patients/12/edit from /patients) belongs to the menu page whose path is the longest prefix of its own.
 */
export function sectionOf(pathname, groups) {
  // nested sub-menus (Return → Sales Return → …) keep the column as `sub` and add their own label to the trail
  const walk = (items, g, sub, trail) => items.flatMap((c) => (c.children
    ? walk(c.children, g, sub, [...trail, c.label])
    : [{ ...c, group: g, sub, trail }]));
  const pages = groups.flatMap((g) => g.items.flatMap((i) => (i.children
    ? walk(i.children, g, i, [i.label])
    : [{ ...i, group: g, sub: null, trail: [] }])));
  const exact = pages.find((p) => p.path === pathname);
  const page = exact || pages
    .filter((p) => pathname.startsWith(p.path + '/'))
    .sort((a, b) => b.path.length - a.path.length)[0];
  if (!page) return { group: null, trail: [], label: '', tone: toneOf(pathname === '/dashboard' ? 'dashboard' : '') };
  // the Dashboard page has its own colour inside the Admin / Main Clinic group
  const toneId = page.path === '/dashboard' ? 'dashboard' : (page.sub?.id || page.group.id);
  return { group: page.group.label, trail: page.trail, label: page.label, tone: toneOf(toneId) };
}
