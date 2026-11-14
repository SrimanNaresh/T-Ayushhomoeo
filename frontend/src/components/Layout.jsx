import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Menu, X, Search, ChevronDown, ChevronRight, LogOut, KeyRound, Building2, Settings, UserPlus, ClipboardList, Stethoscope,
  Package, Receipt, LayoutDashboard, Layers,
} from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { useT } from '../lib/i18n.jsx';
import { Link, navigate } from '../lib/router.jsx';
import { menuFor, menuLinks, pageAllowed } from '../menu.js';
import { toneOf } from '../config/tones.js';
import Icon from './Icon.jsx';

// App frame in the Ayush ALL IN ONE style: a white header (menu button, clinic name, clinic, language,
// user), the menu as a bar across the top or a column on the left (the menu button switches, remembered
// in this browser), and on phones / tablets a drawer that the same button opens.

const GROUP_ICONS = { main: Settings, registration: UserPlus, queue: ClipboardList, doctor: Stethoscope, pharmacy: Package, billing: Receipt };
const groupIcon = (g) => (g.id === 'main' && g.items.length === 1 && g.items[0].path === '/dashboard' ? LayoutDashboard : GROUP_ICONS[g.id] || ClipboardList);
const DESKTOP = '(min-width: 1024px)';

export function LangToggle({ className = '' }) {
  const { lang, setLang } = useT();
  const btn = (on) => `px-2.5 py-1 text-12 font-semibold transition-colors ${on ? 'bg-brand-600 text-white' : 'text-ink-500 hover:bg-ink-50 hover:text-ink-700'}`;
  return (
    <div className={`inline-flex overflow-hidden rounded-lg border border-ink-200 bg-white shadow-sm ${className}`} role="group" aria-label="Language">
      <button type="button" className={btn(lang === 'en')} onClick={() => setLang('en')}>EN</button>
      <button type="button" className={btn(lang === 'ta')} onClick={() => setLang('ta')}>தமிழ்</button>
    </div>
  );
}

function ClinicSwitcher() {
  const auth = useAuth();
  const { t } = useT();
  const chip = (name, code) => (
    <div className="hidden min-w-0 items-center gap-1.5 rounded-full border border-ink-100 bg-ink-50 px-2.5 py-0.5 text-12 text-ink-500 md:flex" title={t('topbar.yourClinic')}>
      <Building2 size={13} className="shrink-0 text-teal-600" />
      <span className="truncate font-semibold text-ink-700">{name}</span> <span className="text-ink-400">({code})</span>
    </div>
  );
  // Single clinic: no switcher, the clinic name + code for every user (admins too)
  if (auth.singleClinic && auth.appClinic) return chip(auth.appClinic.name, auth.appClinic.code);
  if (!auth.isGlobal) return chip(auth.user.clinic_name, auth.user.clinic_code);
  return (
    <label className="relative flex items-center">
      <Building2 size={14} className="pointer-events-none absolute left-2.5 text-teal-600" />
      <span className="sr-only">{t('topbar.switchClinic')}</span>
      <select className="input max-w-[11rem] pl-8 font-semibold sm:max-w-[16rem]" value={auth.activeClinicId || 'all'}
        onChange={(e) => auth.setActiveClinic(e.target.value)} aria-label={t('topbar.switchClinic')}>
        <option value="all">{t('topbar.allClinics')}</option>
        {auth.clinics.map((c) => (
          <option key={c.id} value={c.id} disabled={c.status !== 'active'}>
            {c.name} ({c.code}){c.status !== 'active' ? ` – ${t('status.inactive')}` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

// Menu groups this user can see, shared by every menu.
// locked: an admin has not picked a clinic yet, so the clinic menus are not shown.
function useMenu(path) {
  const auth = useAuth();
  const branchReady = !!auth.activeClinic;
  // a sub-menu (nested ones too) keeps only the pages this user may open, and is dropped when none are left
  const allowed = (items) => items
    .map((i) => (i.children ? { ...i, children: allowed(i.children) } : i))
    .filter((i) => (i.children ? i.children.length : pageAllowed(auth, i)));
  const groups = menuFor(auth).map((g) => ({ ...g, items: allowed(g.items) }))
    .filter((g) => g.items.length && (g.scope === 'main' ? auth.isGlobal : true));
  // the most specific menu path that matches the current page
  const activePath = groups.flatMap((g) => menuLinks(g.items).map((i) => i.path))
    .filter((p) => path === p || path.startsWith(p + '/'))
    .sort((a, b) => b.length - a.length)[0];
  const isActive = (p) => p === activePath;
  const hasActive = (i) => (i.children ? i.children.some(hasActive) : isActive(i.path));
  return {
    groups: groups.filter((g) => !(g.scope === 'branch' && auth.isGlobal && !branchReady)),
    locked: auth.isGlobal && !branchReady,
    isActive,
    hasActive,
  };
}

/* ---------------- left menu (desktop column and phone drawer) ---------------- */

function SideSub({ item, isActive, hasActive, current, onNavigate }) {
  const { t } = useT();
  const [open, setOpen] = useState(current);
  useEffect(() => { if (current) setOpen(true); }, [current]);
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-13 font-medium transition-colors ${current ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white/90'}`}>
        <span className="flex items-center gap-2">
          {item.icon && <Icon name={item.icon} size={14} className={current ? 'text-teal-300' : 'text-white/40'} />} {t(item.label)}
        </span>
        <ChevronRight size={13} className={`transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="ml-[18px] mt-0.5 space-y-0.5 border-l border-white/10 pl-3">
          {item.children.map((c) => (c.children
            ? <SideSub key={c.id} item={c} isActive={isActive} hasActive={hasActive} current={hasActive(c)} onNavigate={onNavigate} />
            : <SideLink key={c.path} to={c.path} label={t(c.label)} active={isActive(c.path)} onNavigate={onNavigate} />))}
        </div>
      )}
    </div>
  );
}

function SideLink({ to, label, active, onNavigate, icon }) {
  return (
    <Link to={to} onClick={onNavigate}
      className={`relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-13 transition-colors ${active ? 'bg-white/10 font-semibold text-white' : 'text-white/60 hover:bg-white/5 hover:text-white/90'}`}>
      {active && !icon && <span className="absolute -left-[13px] top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-teal-300" />}
      {icon && <Icon name={icon} size={14} className={active ? 'text-teal-300' : 'text-white/40'} />}
      {label}
    </Link>
  );
}

function SideGroup({ group, isActive, hasActive, onNavigate }) {
  const { t } = useT();
  const GIcon = groupIcon(group);
  const current = group.items.some(hasActive);
  const [open, setOpen] = useState(current);
  useEffect(() => { if (current) setOpen(true); }, [current]);
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${current ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}>
        <span className="flex items-center gap-3"><GIcon size={17} className={current ? 'text-teal-300' : 'text-white/50'} /> {t(group.label)}</span>
        <ChevronRight size={15} className={`transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="ml-[22px] mt-1 space-y-0.5 border-l border-white/10 pl-3 animate-slide-in">
          {group.items.map((i) => (i.children
            ? <SideSub key={i.id} item={i} isActive={isActive} hasActive={hasActive} current={hasActive(i)} onNavigate={onNavigate} />
            : <SideLink key={i.path} to={i.path} label={t(i.label)} icon={i.icon} active={isActive(i.path)} onNavigate={onNavigate} />))}
        </div>
      )}
    </div>
  );
}

/** Every page as "Group › Sub-menu › Page", for the menu search boxes. */
function usePages(groups) {
  const { t } = useT();
  return useMemo(() => {
    const walk = (items, trail) => items.flatMap((i) => (i.children
      ? walk(i.children, [...trail, t(i.label)])
      : [{ path: i.path, title: [...trail, t(i.label)].join(' › ') }]));
    return groups.flatMap((g) => walk(g.items, [t(g.label)]));
  }, [groups, t]);
}

function SideNav({ path, onNavigate = () => {}, className = '' }) {
  const { t } = useT();
  const { groups, locked, isActive, hasActive } = useMenu(path);
  const pages = usePages(groups);
  const [query, setQuery] = useState('');
  const [pick, setPick] = useState(0);
  const q = query.trim().toLowerCase();
  const results = q ? pages.filter((p) => p.title.toLowerCase().includes(q)) : [];
  useEffect(() => setPick(0), [q]);
  const open = (to) => { setQuery(''); navigate(to); onNavigate(); };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setPick((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setPick((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && results[pick]) { e.preventDefault(); open(results[pick].path); }
    else if (e.key === 'Escape') { setQuery(''); e.currentTarget.blur(); }
  };
  return (
    <aside className={`no-print no-scrollbar w-56 shrink-0 overflow-y-auto bg-sidebar-gradient shadow-sm ${className}`}>
      <div className="sticky top-0 z-10 bg-[#1d306e] px-2 pb-1 pt-2">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-white/50" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown}
            placeholder={t('topbar.menuSearch')} aria-label={t('topbar.menuSearch')}
            className="w-full rounded-lg border border-white/15 bg-white/10 py-1.5 pl-8 pr-7 text-13 text-white outline-none transition-colors placeholder:text-white/40 focus:border-teal-300/60 focus:bg-white/15" />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-white/50 hover:text-white">
              <X size={13} />
            </button>
          )}
        </div>
      </div>
      <nav className="space-y-0.5 px-2 py-1 pb-6">
        {q ? (
          <>
            {results.length === 0 && <p className="px-3 py-2 text-13 text-white/50">{t('common.noRecords')}</p>}
            {results.map((r, i) => (
              <button key={r.path} type="button" onClick={() => open(r.path)} onMouseEnter={() => setPick(i)}
                className={`flex w-full rounded-lg px-3 py-2 text-left text-13 transition-colors ${i === pick ? 'bg-white/15 text-white' : 'text-white/70 hover:text-white'} ${isActive(r.path) ? 'font-semibold' : ''}`}>
                {r.title}
              </button>
            ))}
          </>
        ) : groups.map((g) => <SideGroup key={g.id} group={g} isActive={isActive} hasActive={hasActive} onNavigate={onNavigate} />)}
        {locked && <p className="px-3 py-2 text-12 text-white/60">{t('nav.selectClinicHint')}</p>}
      </nav>
    </aside>
  );
}

/* ---------------- menu bar across the top (desktop) ---------------- */

// Where a pop-up of this width goes: under its button, 8px inside both screen edges, as tall as fits below.
function fitToScreen(rect, width) {
  const w = Math.min(width, window.innerWidth - 16);
  const left = Math.min(Math.max(rect.left, 8), window.innerWidth - w - 8);
  const top = rect.bottom + 6;
  return { position: 'fixed', top, left, width: w, maxHeight: Math.max(160, window.innerHeight - top - 12) };
}

function DropLink({ to, label, active, onNavigate, icon }) {
  return (
    <Link to={to} onClick={onNavigate}
      className={`group mx-1 flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${active ? 'bg-brand-50 font-semibold text-brand-700' : 'text-ink-600 hover:bg-ink-50'}`}>
      {icon && <Icon name={icon} size={15} className={active ? 'text-brand-600' : 'text-ink-400 group-hover:text-brand-500'} />}
      {label}
    </Link>
  );
}

function PanelLink({ page, isActive, onNavigate, nested = false }) {
  const { t } = useT();
  const on = isActive(page.path);
  return (
    <Link to={page.path} onClick={onNavigate}
      className={`group flex items-start gap-1 rounded-md px-1.5 py-[3px] text-13 leading-[18px] transition-all ${nested ? 'ml-3' : ''} ${on ? 'bg-brand-50 font-semibold text-brand-700' : 'text-ink-600 hover:bg-ink-50 hover:text-brand-700'}`}>
      <ChevronRight size={12} strokeWidth={2.5} className={`mt-[3px] shrink-0 transition-transform group-hover:translate-x-0.5 ${on ? 'text-brand-600' : 'text-ink-300 group-hover:text-brand-500'}`} />
      <span>{t(page.label)}</span>
    </Link>
  );
}

// A nested sub-menu inside a column (Return → Sales Return → Entry / List): a row that opens its pages in place.
// Open while searching (forced) or when one of its pages is the current one.
function PanelFolder({ folder, isActive, onNavigate, forced }) {
  const { t } = useT();
  const current = menuLinks(folder.children).some((c) => isActive(c.path));
  const [open, setOpen] = useState(current);
  const shown = forced || open;
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={shown}
        className={`flex w-full items-center justify-between gap-1 rounded-md px-1.5 py-[3px] text-left text-13 leading-[18px] transition-colors ${current ? 'font-semibold text-brand-700' : 'text-ink-700 hover:bg-ink-50'}`}>
        <span className="flex items-start gap-1">
          <Layers size={12} className={`mt-[3px] shrink-0 ${current ? 'text-brand-600' : 'text-ink-400'}`} />
          {t(folder.label)}
        </span>
        <ChevronRight size={13} className={`shrink-0 text-ink-400 transition-transform duration-200 ${shown ? 'rotate-90' : ''}`} />
      </button>
      {shown && folder.children.map((c) => (c.children
        ? <PanelFolder key={c.id} folder={c} isActive={isActive} onNavigate={onNavigate} forced={forced} />
        : <PanelLink key={c.path} page={c} isActive={isActive} onNavigate={onNavigate} nested />))}
    </div>
  );
}

// A group made of sub-menus (Pharmacy: Item, Vendor, …) opens as a row of small cards with a search box;
// Enter opens the first match, the first Esc clears the search and the next closes the menu.
function ColumnsPanel({ group, rect, panelRef, isActive, onNavigate }) {
  const { t } = useT();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const parts = group.items.map((i) => (i.children ? i : { ...i, id: i.path, children: [i] }));
  // a page matches when its column, nested sub-menu or own label holds the search text
  const keep = (items, prefix) => items.flatMap((c) => {
    const text = `${prefix} ${t(c.label)}`.toLowerCase();
    if (!c.children) return text.includes(q) ? [c] : [];
    if (text.includes(q)) return [c];
    const children = keep(c.children, text);
    return children.length ? [{ ...c, children }] : [];
  });
  const shown = parts.map((p) => {
    if (!q || t(p.label).toLowerCase().includes(q)) return p;
    const children = keep(p.children, t(p.label));
    return children.length ? { ...p, children } : null;
  }).filter(Boolean);
  const firstPath = (items) => (items[0].children ? firstPath(items[0].children) : items[0].path);
  const box = fitToScreen(rect, parts.length * 168 + 16);
  const cols = Math.max(1, Math.min(parts.length, Math.floor((box.width - 16) / 136)));
  const GIcon = groupIcon(group);
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && shown[0]) { navigate(firstPath(shown[0].children)); onNavigate(); }
    else if (e.key === 'Escape') { if (query) setQuery(''); else onNavigate(); }
  };
  return createPortal(
    <div ref={panelRef} style={box} className="z-50 overflow-y-auto rounded-xl border border-ink-200/70 bg-gradient-to-b from-slate-50 to-white shadow-elevated menu-drop">
      <div className="flex items-center gap-2 border-b border-ink-100 px-3 py-1.5">
        <GIcon size={13} className="text-brand-600" />
        <span className="text-xs font-semibold text-ink-700">{t(group.label)}</span>
        <div className="relative ml-auto w-56">
          <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-400" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown} placeholder={t('topbar.menuSearch')}
            className="h-7 w-full rounded-md border border-ink-200 bg-white pl-7 pr-6 text-xs text-ink-700 placeholder:text-ink-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100" />
          {query && (
            <button type="button" title="Clear" onClick={() => setQuery('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600"><X size={12} /></button>
          )}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-ink-400">{t('common.noRecords')}</p>
      ) : (
        <div className="grid gap-1.5 p-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {shown.map((p) => {
            const tone = toneOf(p.id);
            return (
              <div key={p.id} className="relative overflow-hidden rounded-lg bg-white px-2 pb-1.5 pt-2 ring-1 ring-ink-100 transition-shadow hover:shadow-md hover:ring-ink-200">
                <div className={`absolute inset-x-0 top-0 h-0.5 ${tone.bar}`} />
                <div className="mb-1 flex h-[34px] items-center gap-1.5 px-1.5">
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br text-white shadow-sm ${tone.grad}`}>
                    <Icon name={p.icon} size={13} />
                  </span>
                  <span className="min-w-0 text-13 font-semibold leading-tight text-ink-800">{t(p.label)}</span>
                </div>
                {p.children.map((c) => (c.children
                  ? <PanelFolder key={c.id} folder={c} isActive={isActive} onNavigate={onNavigate} forced={!!q} />
                  : <PanelLink key={c.path} page={c} isActive={isActive} onNavigate={onNavigate} />))}
              </div>
            );
          })}
        </div>
      )}
    </div>,
    document.body,
  );
}

function TopNav({ path }) {
  const { t } = useT();
  const { groups, locked, isActive, hasActive } = useMenu(path);
  const [openId, setOpenId] = useState(null);
  const [rect, setRect] = useState(null);
  const bar = useRef(null);
  const panel = useRef(null);
  const btn = useRef(null);

  useEffect(() => setOpenId(null), [path]);
  useEffect(() => {
    const outside = (e) => { if (!bar.current?.contains(e.target) && !panel.current?.contains(e.target)) setOpenId(null); };
    const esc = (e) => { if (e.key === 'Escape') setOpenId(null); };
    const resize = () => { if (btn.current?.isConnected) setRect(btn.current.getBoundingClientRect()); };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', esc);
    window.addEventListener('resize', resize);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', esc); window.removeEventListener('resize', resize); };
  }, []);

  const toggle = (id, e) => {
    if (openId === id) return setOpenId(null);
    btn.current = e.currentTarget;
    setRect(e.currentTarget.getBoundingClientRect());
    return setOpenId(id);
  };
  const open = groups.find((g) => g.id === openId);
  const close = () => setOpenId(null);

  return (
    <>
      <nav ref={bar} onScroll={close} aria-label={t('topbar.menu')}
        className="no-print no-scrollbar hidden items-center gap-1 overflow-x-auto bg-sidebar-gradient px-4 py-1 shadow-sm lg:flex lg:px-6">
        {groups.map((g) => {
          const GIcon = groupIcon(g);
          const current = g.items.some(hasActive);
          const isOpen = openId === g.id;
          return (
            <button key={g.id} type="button" onClick={(e) => toggle(g.id, e)} aria-expanded={isOpen}
              onMouseEnter={(e) => { if (openId && !isOpen) toggle(g.id, e); }}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1 text-sm font-medium transition-colors ${current || isOpen ? 'bg-white/15 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'}`}>
              <GIcon size={16} className={current ? 'text-teal-300' : 'text-white/50'} />
              {t(g.label)}
              <ChevronDown size={13} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
          );
        })}
        {locked && <span className="px-2 text-13 text-white/60">{t('nav.selectClinicHint')}</span>}
      </nav>
      {open && rect && (open.items.some((i) => i.children) ? (
        <ColumnsPanel group={open} rect={rect} panelRef={panel} isActive={isActive} onNavigate={close} />
      ) : createPortal(
        <div ref={panel} style={fitToScreen(rect, 280)} className="z-50 overflow-y-auto rounded-xl border border-ink-100 bg-white py-2 shadow-elevated menu-drop">
          {open.items.map((i) => <DropLink key={i.path} to={i.path} label={t(i.label)} icon={i.icon} active={isActive(i.path)} onNavigate={close} />)}
        </div>,
        document.body,
      ))}
    </>
  );
}

/* ---------------- header pieces ---------------- */

function UserMenu() {
  const auth = useAuth();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const initials = (auth.user.name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  useEffect(() => {
    const outside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex items-center gap-2 rounded-lg px-1.5 py-0.5 transition-colors hover:bg-ink-100">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-gradient text-11 font-semibold text-white shadow-sm">{initials}</span>
        <span className="hidden text-13 font-semibold text-ink-700 sm:block">{auth.user.name}</span>
        <ChevronDown size={14} className="hidden text-ink-400 sm:block" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-48 rounded-xl border border-ink-100 bg-white py-1.5 shadow-elevated menu-drop">
          <div className="border-b border-ink-100 px-3.5 pb-1.5 pt-0.5">
            <p className="truncate text-13 font-semibold text-ink-800">{auth.user.name}</p>
            <p className="text-11 text-ink-400">{t(`role.${auth.user.role}`)}</p>
          </div>
          <button type="button" onClick={() => { setOpen(false); navigate('/profile'); }}
            className="flex w-full items-center gap-2 px-3.5 py-2 text-sm text-ink-700 transition-colors hover:bg-ink-50">
            <KeyRound size={15} /> {t('profile.changePassword')}
          </button>
          <button type="button" onClick={auth.logout}
            className="flex w-full items-center gap-2 px-3.5 py-2 text-sm text-red-600 transition-colors hover:bg-red-50">
            <LogOut size={15} /> {t('topbar.logout')}
          </button>
        </div>
      )}
    </div>
  );
}

const MENU_MODE_KEY = 'sc_menu_mode';
const readSide = () => { try { return localStorage.getItem(MENU_MODE_KEY) === 'side'; } catch { return false; } };

export default function Layout({ path, children }) {
  const auth = useAuth();
  const { t } = useT();
  const [side, setSide] = useState(readSide);
  const [drawer, setDrawer] = useState(false);
  useEffect(() => setDrawer(false), [path]);

  // Desktop: the menu button moves the menu between the top bar and the left column.
  // Phones and tablets: it opens the menu drawer.
  const toggleMenu = () => {
    if (!window.matchMedia(DESKTOP).matches) return setDrawer((o) => !o);
    const next = !side;
    setSide(next);
    try { localStorage.setItem(MENU_MODE_KEY, next ? 'side' : 'top'); } catch { /* private mode: not remembered */ }
    return undefined;
  };
  const clinicName = auth.appClinic?.name || auth.activeClinic?.name || 'Ayush Pro';

  return (
    <div className="flex h-full flex-col">
      <div className="no-print sticky top-0 z-20">
        <header className="relative z-10 flex items-center gap-3 border-b border-ink-100 bg-white/85 px-3 py-0.5 backdrop-blur-md sm:px-4 lg:px-6">
          <button type="button" onClick={toggleMenu}
            className={`rounded-lg p-1 transition-colors hover:bg-ink-100 ${side ? 'lg:bg-ink-100 lg:text-brand-700' : 'text-ink-600'}`}
            aria-label={t('topbar.menu')} title={side ? t('topbar.menuTop') : t('topbar.menuSide')}>
            <Menu size={18} />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-ink-100">
              <img src="/logo-128.png" alt="" className="h-full w-full object-contain" />
            </span>
            <div className="flex min-w-0 items-baseline gap-2">
              <p className="truncate font-display text-base font-bold tracking-tight text-brand-800 sm:text-lg">{clinicName}</p>
              <p className="hidden truncate text-xs text-ink-300 xl:block">Ayush Pro · SmartClinic</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <ClinicSwitcher />
            <LangToggle />
            <UserMenu />
          </div>
        </header>
        {!side && <TopNav path={path} />}
      </div>

      {drawer && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink-900/45 backdrop-blur-[3px]" onClick={() => setDrawer(false)} />
          <SideNav path={path} onNavigate={() => setDrawer(false)} className="absolute inset-y-0 left-0 w-64 animate-slide-in" />
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {side && <SideNav path={path} className="hidden animate-slide-in lg:block" />}
        <main className="no-scrollbar min-w-0 flex-1 overflow-y-auto px-3 pb-6 pt-2 sm:px-4 lg:px-6">
          <div className="mx-auto w-full max-w-[1800px] animate-fade-in">{children}</div>
        </main>
      </div>
    </div>
  );
}
