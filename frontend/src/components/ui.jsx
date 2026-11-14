import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Inbox, CheckCircle2, AlertCircle, Info, Search, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useT } from '../lib/i18n.jsx';
import { useLocation } from '../lib/router.jsx';
import { useAuth } from '../lib/auth.jsx';
import { menuFor } from '../menu.js';
import { sectionOf } from '../config/tones.js';

// Shared screen pieces, styled like Ayush ALL IN ONE (src/components/ui.jsx).
// Use these (and the classes in index.css) on every screen; see the UI rules in ../../CLAUDE.md.

/* ---------------- data hooks ---------------- */

/** Runs `fn` on mount and whenever deps change. Returns { data, error, loading, reload }. */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const seq = useRef(0);
  const run = useCallback(async () => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fn();
      if (id === seq.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (id === seq.current) setState({ data: null, error, loading: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run };
}

/** Search boxes wait 350ms after the last key before searching. */
export function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const h = setTimeout(() => setV(value), ms);
    return () => clearTimeout(h);
  }, [value, ms]);
  return v;
}

/** Simple form state: const f = useForm(initial); f.bind('name') → props for an input */
export function useForm(initial) {
  const [values, setValues] = useState(initial);
  const set = (name, value) => setValues((v) => ({ ...v, [name]: value }));
  const bind = (name) => ({
    name,
    value: values[name] ?? '',
    onChange: (e) => set(name, e.target.type === 'checkbox' ? e.target.checked : e.target.value),
  });
  return { values, setValues, set, bind };
}

/* ---------------- toast ---------------- */

// Toasts drop in at the top on phones and sit bottom-right on wider screens.
export function Toast({ toast }) {
  if (!toast) return null;
  const styles = {
    success: { box: 'border-emerald-200 bg-white', icon: 'bg-emerald-500', Icon: CheckCircle2 },
    error: { box: 'border-red-200 bg-white', icon: 'bg-red-500', Icon: AlertCircle },
    info: { box: 'border-ink-200 bg-white', icon: 'bg-ink-700', Icon: Info },
  };
  const s = styles[toast.type] || styles.info;
  return (
    <div className="no-print fixed inset-x-3 top-14 z-[60] flex justify-center sm:inset-x-auto sm:bottom-6 sm:right-6 sm:top-auto" role="status" aria-live="polite">
      <div key={toast.id} className={`flex max-w-md items-center gap-2.5 rounded-xl border py-2 pl-2 pr-4 text-sm font-medium text-ink-800 shadow-elevated toast-in ${s.box}`}>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white ${s.icon}`}><s.Icon size={16} /></span>
        {toast.message}
      </div>
    </div>
  );
}

// One toast for the whole app: const toast = useToast(); toast('Vendor saved successfully'); toast(msg, 'error').
// The provider draws it, so a page needs no <Toast /> of its own, and a message survives going back to a list.
const ToastContext = createContext(() => {});
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const push = useCallback((message, type = 'success') => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Math.random().toString(36).slice(2), message, type });
    timer.current = setTimeout(() => setToast(null), type === 'error' ? 6000 : 3000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <Toast toast={toast} />
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);

/* ---------------- headers and cards ---------------- */

/**
 * The first thing inside every card: an icon badge in the colour of the page's menu section,
 * the menu path above the title on wider screens, the title and subtitle, and actions on the right.
 * The section comes from the URL (config/tones.js), so add every page to menu.js.
 */
export function CardHeader({ icon: Icon, title, subtitle, actions }) {
  const { path } = useLocation();
  const auth = useAuth();
  const { t } = useT();
  const section = sectionOf(path, menuFor(auth));
  const { tone } = section;
  const crumbs = [section.group, ...section.trail].filter(Boolean).map((k) => t(k))
    .filter((p, i, a) => a.indexOf(p) === i && p !== title);
  return (
    <div className="relative mb-2.5 flex flex-col flex-wrap gap-2 border-b border-ink-100 pb-2 sm:flex-row sm:items-center sm:justify-between">
      <span className={`pointer-events-none absolute -bottom-px left-0 h-0.5 w-14 rounded-full ${tone.bar}`} />
      <div className="flex min-w-0 shrink-0 items-center gap-2.5">
        {Icon && (
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm ring-4 ${tone.grad} ${tone.ring}`}>
            <Icon size={15} />
          </div>
        )}
        <div className="min-w-0">
          {crumbs.length > 0 && (
            <p className={`hidden text-10 font-bold uppercase leading-tight tracking-[0.12em] sm:block ${tone.text}`}>{crumbs.join(' › ')}</p>
          )}
          <h3 className="text-15 font-bold leading-tight tracking-tight text-ink-900 sm:whitespace-nowrap">{title}</h3>
          {subtitle && <p className="text-12 leading-snug text-ink-400">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="no-print flex flex-wrap items-center justify-end gap-2">{actions}</div>}
    </div>
  );
}

/**
 * A card. With `icon` it starts with a CardHeader (title, subtitle, actions); otherwise an optional
 * small heading row (for a second card on a screen, or a pop-up section).
 */
export function Card({ icon, title, subtitle, actions, children, className = '' }) {
  return (
    <section className={`card mb-3 last:mb-0 ${className}`}>
      {icon ? (
        <CardHeader icon={icon} title={title} subtitle={subtitle} actions={actions} />
      ) : (title || actions) && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 pt-1">
          {title && <h2 className="text-sm font-bold text-ink-800">{title}</h2>}
          {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/* ---------------- buttons, badges, states ---------------- */

const BTN = { primary: 'btn-primary', ghost: 'btn-secondary', secondary: 'btn-secondary', danger: 'btn-danger', icon: 'btn-ghost !p-1', link: 'btn-ghost' };

/**
 * <Button> Save </Button> → btn-primary. variant: 'primary' | 'secondary' (also 'ghost': the white
 * bordered button) | 'danger' | 'icon' (icon-only row action). size="sm" for compact rows.
 */
export function Button({ variant = 'primary', size, loading, children, className = '', type = 'button', ...rest }) {
  const sm = size === 'sm' && variant !== 'icon' ? '!px-2.5 !py-1 !text-13' : '';
  return (
    <button type={type} className={`${BTN[variant] || BTN.primary} ${sm} ${className}`} disabled={loading || rest.disabled} {...rest}>
      {loading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

const BADGE = {
  neutral: 'bg-ink-100 text-ink-600',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-600',
  info: 'bg-teal-50 text-teal-700',
  brand: 'bg-brand-50 text-brand-700 ring-1 ring-brand-100',
};
export function Badge({ tone = 'neutral', children, className = '' }) {
  return <span className={`badge ${BADGE[tone] || BADGE.neutral} ${className}`}>{children}</span>;
}

export const STATUS_TONE = {
  active: 'success', inactive: 'neutral',
  booked: 'brand', confirmed: 'success', waiting: 'warning', with_doctor: 'info', done: 'success', cancelled: 'neutral',
  paid: 'success', partial: 'warning', unpaid: 'danger',
  open: 'info', completed: 'success', issued: 'info', billed: 'success',
};
export function StatusBadge({ status }) {
  const { t } = useT();
  return <Badge tone={STATUS_TONE[status] || 'neutral'}>{t(`status.${status}`)}</Badge>;
}

export function Spinner({ label }) {
  const { t } = useT();
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 py-12 text-ink-400">
      <div className="relative h-8 w-8">
        <div className="absolute inset-0 rounded-full border-[3px] border-brand-100" />
        <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-transparent border-r-teal-400 border-t-brand-500" />
      </div>
      <span className="text-13 font-medium">{label || t('common.loading')}</span>
    </div>
  );
}
export const Loading = Spinner;

export function EmptyState({ message, children }) {
  const { t } = useT();
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <span className="mb-2.5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-ink-50 to-ink-100 text-ink-400 ring-1 ring-ink-100">
        <Inbox size={22} />
      </span>
      <div className="flex max-w-md flex-wrap items-center justify-center gap-2 text-sm text-ink-500">{message || children || t('common.noRecords')}</div>
    </div>
  );
}
/** <Empty>No X found.</Empty> — same as <EmptyState message="No X found." /> */
export const Empty = ({ children }) => <EmptyState message={children} />;

/** A red box for a page that could not load, with a Try again button. */
export function ErrorBox({ error, onRetry }) {
  const { t } = useT();
  if (!error) return null;
  return (
    <div className="my-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-13 font-medium text-red-700">
      <span className="flex items-center gap-2"><AlertCircle size={16} className="shrink-0" /> {error.message}</span>
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>{t('common.retry')}</Button>}
    </div>
  );
}

const NOTE = {
  error: 'border-red-200 bg-red-50 text-red-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  info: 'border-brand-100 bg-brand-50/60 text-brand-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
};
/** A coloured message box inside a screen (a warning that stays, not a toast). */
export function Note({ tone = 'info', children, className = '' }) {
  return <div className={`my-2 rounded-xl border px-3.5 py-2 text-13 ${NOTE[tone] || NOTE.info} ${className}`}>{children}</div>;
}

/**
 * Totals of the rows a list shows (Bills, Sales, Stock In): items = [[label, value, strong?], …].
 * Added for this app: the reference app has no list with a totals strip.
 */
export function SummaryBar({ items, className = '' }) {
  return (
    <div className={`mb-2 flex flex-wrap gap-x-5 gap-y-1 rounded-lg bg-brand-50/60 px-3 py-1.5 text-13 text-ink-500 ring-1 ring-brand-100/60 ${className}`}>
      {items.filter(Boolean).map(([label, value, strong]) => (
        <span key={label}>{label}{value !== undefined && <>: <b className={strong ? 'text-brand-700' : 'text-ink-800'}>{value}</b></>}</span>
      ))}
    </div>
  );
}

/** A queue token number (#12) in a small tinted chip; `big` on the token tiles. */
export function TokenChip({ no, big = false }) {
  return (
    <span className={`inline-flex items-center justify-center rounded-lg bg-brand-50 font-bold tabular-nums text-brand-700 ring-1 ring-brand-100 ${big ? 'min-w-[3.5rem] px-2.5 py-1.5 text-lg' : 'min-w-[2.6rem] px-2 py-0.5 text-13'}`}>
      #{no ?? '-'}
    </span>
  );
}

/** A date box with its label in front, for list filters: <DateFilter label="From" value onChange /> */
export function DateFilter({ label, value, onChange, min, max }) {
  return (
    <label className="flex items-center gap-1.5 whitespace-nowrap text-12 font-medium text-ink-500">
      {label}
      <input type="date" className="input w-auto" value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** Icon-only row action: <RowAction icon={Pencil} title="Edit" onClick /> (tone="danger" for Delete). */
export function RowAction({ icon: I, title, onClick, tone, disabled }) {
  return (
    <button type="button" className={`btn-ghost !p-1 ${tone === 'danger' ? 'hover:!bg-red-50 hover:!text-red-600' : ''}`} title={title} aria-label={title}
      disabled={disabled} onClick={(e) => { e.stopPropagation(); onClick(e); }}>
      <I size={15} />
    </button>
  );
}

/* ---------------- form fields ---------------- */

/** Label (sentence case, " *" when required) above any field; `full` spans the whole grid row. */
export function Field({ label, required, hint, error, children, full, className = '' }) {
  return (
    <label className={`block min-w-0 ${full ? 'col-span-full' : ''} ${className}`}>
      {label && <span className="label">{label}{required && <span className="text-red-500"> *</span>}</span>}
      {children}
      {hint && !error && <small className="mt-0.5 block text-11 text-ink-400">{hint}</small>}
      {error && <small className="field-error block">{error}</small>}
    </label>
  );
}

export function Input({ label, required, hint, error, full, className = '', ...props }) {
  return (
    <Field label={label} required={required} hint={hint} error={error} full={full}>
      <input required={required} className={`input ${error ? '!border-red-400' : ''} ${className}`} {...props} />
    </Field>
  );
}

export function Select({ label, required, hint, full, options, placeholder, className = '', ...props }) {
  return (
    <Field label={label} required={required} hint={hint} full={full}>
      <select required={required} className={`input ${className}`} {...props}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

export function TextArea({ label, required, full = true, rows = 2, className = '', ...props }) {
  return (
    <Field label={label} required={required} full={full}>
      <textarea rows={rows} required={required} className={`input ${className}`} {...props} />
    </Field>
  );
}

/** List screens: the search box in the CardHeader actions. */
export function SearchBox({ value, onChange, placeholder, autoFocus, className = 'w-full sm:w-72' }) {
  return (
    <div className={`relative ${className}`}>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
      <input type="search" className="input pl-9" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} />
    </div>
  );
}

/* Pickers (a box with a list under it), styled like Ayush ALL IN ONE's SearchSelect / ComboBox. */
/** The list under a picker box (the box's wrapper is `relative`). */
export const PICKER_MENU = 'absolute left-0 top-full z-40 mt-1 max-h-72 min-w-full overflow-y-auto overflow-x-hidden rounded-lg border border-ink-200 bg-white p-1 shadow-elevated animate-fade-in';
/** One row of a picker list; `active` = highlighted by the arrow keys or the mouse. */
export const pickerRow = (active) => `flex w-full items-center justify-between gap-2.5 rounded-md px-2.5 py-1.5 text-left text-13 transition-colors ${active ? 'bg-brand-50 text-brand-700 shadow-[inset_3px_0_0_theme(colors.brand.500)]' : 'text-ink-700 hover:bg-ink-50'}`;

/**
 * A box inside an editable grid cell (Purchase / Stock In / Sales / Bulk Update lines): looks like plain text
 * until hovered or focused, so a wide grid stays readable. Add GRID_BAD when the value is wrong.
 */
export const GRID_INPUT = 'no-spin h-[28px] w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 text-13 tabular-nums text-ink-800 transition-colors placeholder:text-ink-300 hover:border-ink-200 hover:bg-white focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:text-ink-400';
export const GRID_BAD = '!border-red-400 !bg-red-50 text-red-700';

/** Responsive form grids: wide fields (name, address) and short fields (codes, numbers). */
export const GRID_WIDE = 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4';
export const GRID_SHORT = 'grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7';
/** The Cancel / Delete / Save row at the foot of a master screen. */
export const FORM_ACTIONS = 'no-print mt-3 grid grid-cols-3 gap-2 sm:flex sm:justify-end';

/* ---------------- table + paging ---------------- */

// Column classes kept from the old screens: num (right, tabular), col-actions (right), col-center.
const COL = { num: 'text-right tabular-nums', 'col-actions': 'text-right whitespace-nowrap', 'col-center': 'text-center', 'col-icon': 'w-px text-center whitespace-nowrap', nowrap: 'whitespace-nowrap', wrap: 'whitespace-normal' };
export const colClass = (c = '') => c.split(' ').map((k) => COL[k] ?? k).join(' ');
export const TH = 'px-2.5 py-1.5';
export const TD = 'px-2.5 py-1';

/**
 * columns: [{ key, label, render?(row), className?, main? }]. The first column stays pinned while the
 * others scroll sideways on a phone. `main` (or the first column) is font-medium ink-700, others ink-500.
 */
export function DataTable({ columns, rows, rowKey = 'id', onRowClick, rowClassName, empty, minWidth = 'min-w-[720px]' }) {
  if (!rows?.length) return <EmptyState message={empty} />;
  const mainKey = (columns.find((c) => c.main) || columns[0]).key;
  return (
    <div className="overflow-x-auto rounded-lg">
      <table className={`list-pinned pin-first w-full ${minWidth} text-left text-13`}>
        <thead>
          <tr className="table-head">
            {columns.map((c, i) => (
              <th key={c.key} className={`${TH} whitespace-nowrap ${i === 0 ? 'rounded-l-lg' : ''} ${i === columns.length - 1 ? 'rounded-r-lg' : ''} ${colClass(c.className)}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[rowKey]} onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={['table-row', onRowClick && 'cursor-pointer', rowClassName?.(r)].filter(Boolean).join(' ')}>
              {columns.map((c) => {
                const v = c.render ? c.render(r) : r[c.key];
                return (
                  <td key={c.key} className={`${TD} ${c.key === mainKey ? 'font-medium text-ink-700' : 'text-ink-500'} ${colClass(c.className)}`}>
                    {v === null || v === undefined || v === '' ? '-' : v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, limit, total, onPage }) {
  const { t } = useT();
  const pages = Math.max(1, Math.ceil((total || 0) / limit));
  if (pages <= 1) return null;
  return (
    <div className="no-print mt-3 flex items-center justify-end gap-2">
      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={16} /> {t('common.prev')}</Button>
      <span className="text-13 text-ink-500">{t('common.pageOf', { page, pages })}</span>
      <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>{t('common.next')} <ChevronRight size={16} /></Button>
    </div>
  );
}

/* ---------------- modal ---------------- */

/**
 * <Modal open title onClose size="md|lg|xl" footer>. `open` may be left out when the parent only
 * renders it while open; `wide` is the same as size="lg". Esc and a click outside close it.
 */
export function Modal({ open = true, title, onClose, children, footer, size, wide }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const s = size || (wide ? 'lg' : 'md');
  const width = s === 'xl' ? 'max-w-5xl' : s === 'lg' ? 'max-w-3xl' : 'max-w-lg';
  // in <body> (a portal), so it is never clipped by a scrolling area and can be printed on its own
  return createPortal(
    <div className="modal-root fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/50 p-3 backdrop-blur-sm sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`mt-6 w-full ${width} animate-fade-in overflow-hidden rounded-2xl bg-white shadow-elevated sm:mt-8`} role="dialog" aria-modal="true" aria-label={title}>
        <div data-modal-head className="flex items-center justify-between gap-3 border-b border-ink-100 bg-gradient-to-r from-ink-50 to-white px-4 py-3 sm:px-6 sm:py-4">
          <h3 className="min-w-0 text-base font-bold tracking-tight text-ink-800 sm:text-lg">{title}</h3>
          <button type="button" onClick={onClose} className="no-print rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-600" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div data-modal-body className="max-h-[70vh] overflow-y-auto p-4 sm:p-6">{children}</div>
        {footer && <div className="no-print flex flex-wrap justify-end gap-2 border-t border-ink-100 bg-ink-50/60 px-4 py-3 sm:px-6">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
