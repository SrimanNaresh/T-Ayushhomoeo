// Wide editable grids (Pharmacy → Three in One, …): each column can be widened / narrowed by dragging the edge of
// its heading (double-click the edge: fit the column to what is in it), and shown / hidden from a Columns menu.
// Widths and hidden columns are remembered in this browser (per grid, by `storageKey`); a blocked or cleared
// browser store just means the defaults.
import { useEffect, useRef, useState } from 'react';
import { Columns3, RotateCcw, Eye } from 'lucide-react';

const MIN_W = 40;
const MAX_W = 600;
const load = (key, fallback) => {
  try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) || '{}') }; } catch { return fallback; }
};
const save = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* not kept: fine */ }
};

/**
 * columns: [{ id, w (default px), g? (group id), main? }]; defaultHidden: { id: true }.
 * Returns what the grid needs: widthOf(id), isHidden(id), toggle(id), setGroup(groupId, open), showAll(),
 * resetWidths(), and the props for a heading's resize handle: handle(id).
 */
export function useGridColumns(storageKey, columns, defaultHidden = {}) {
  const [hidden, setHidden] = useState(() => load(`${storageKey}.hidden`, defaultHidden));
  const [widths, setWidths] = useState(() => load(`${storageKey}.widths`, {}));
  useEffect(() => save(`${storageKey}.hidden`, hidden), [storageKey, hidden]);
  useEffect(() => save(`${storageKey}.widths`, widths), [storageKey, widths]);
  const defaults = Object.fromEntries(columns.map((c) => [c.id, c.w]));
  const widthOf = (id) => widths[id] ?? defaults[id] ?? 100;
  const setWidth = (id, w) => setWidths((ws) => ({ ...ws, [id]: Math.round(Math.min(MAX_W, Math.max(MIN_W, w))) }));

  // dragging the edge of a heading
  const drag = useRef(null);
  useEffect(() => {
    const move = (e) => { if (drag.current) setWidth(drag.current.id, drag.current.w + e.clientX - drag.current.x); };
    const up = () => { if (drag.current) { drag.current = null; document.body.style.cursor = ''; } };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // double-click: as wide as the longest text in the column (its heading, boxes and figures)
  const fit = (id, th) => {
    const table = th.closest('table');
    if (!table) return;
    const ctx = document.createElement('canvas').getContext('2d');
    let widest = 0;
    for (const el of [th, ...table.querySelectorAll(`td[data-col="${id}"]`)]) {
      const input = el.querySelector('input, select, textarea');
      const text = input ? (input.value || input.placeholder || '') : el.innerText || '';
      ctx.font = getComputedStyle(input || el).font;
      for (const line of String(text).split('\n')) widest = Math.max(widest, ctx.measureText(line).width);
    }
    setWidth(id, widest + 28);
  };

  return {
    widthOf,
    isHidden: (id) => !!hidden[id],
    toggle: (id) => setHidden((h) => ({ ...h, [id]: !h[id] })),
    setGroup: (g, open) => setHidden((h) => {
      const next = { ...h };
      for (const c of columns) if (c.g === g && (open || !c.main)) next[c.id] = !open;
      return next;
    }),
    showAll: () => setHidden({}),
    resetWidths: () => setWidths({}),
    handle: (id) => ({
      onPointerDown: (e) => {
        e.preventDefault();
        e.stopPropagation();
        drag.current = { id, x: e.clientX, w: widthOf(id) };
        document.body.style.cursor = 'col-resize';
      },
      onDoubleClick: (e) => { e.stopPropagation(); fit(id, e.currentTarget.closest('th')); },
      onClick: (e) => e.stopPropagation(),
    }),
  };
}

/** The drag handle at the right edge of a heading (the heading needs `relative`) */
export function ResizeHandle({ title, ...props }) {
  return (
    <span role="separator" aria-orientation="vertical" title={title} {...props}
      className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize select-none touch-none after:absolute after:inset-y-1 after:left-1/2 after:w-px after:bg-ink-300 hover:after:w-0.5 hover:after:bg-brand-500" />
  );
}

/**
 * The Columns menu: a tick box per column, grouped; Show all; Reset widths.
 * groups: [{ id, label }]; columns: [{ id, g, label }] (labels already translated).
 */
export function ColumnsMenu({ groups, columns, cols, labels }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const hiddenCount = columns.filter((c) => cols.isHidden(c.id)).length;
  return (
    <div className="relative" ref={box}>
      <button type="button" className={`btn-secondary !px-3 !py-1 !text-13 ${open ? '!border-brand-200 !bg-brand-50 !text-brand-700' : ''}`}
        aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        <Columns3 size={16} /> {labels.button}{hiddenCount > 0 && <span className="rounded-full bg-ink-100 px-1.5 text-11 text-ink-600">{labels.hidden.replace('{n}', hiddenCount)}</span>}
      </button>
      {open && (
        <div className="absolute left-0 z-40 mt-1 w-[min(36rem,90vw)] rounded-xl border border-ink-200 bg-white p-3 shadow-elevated">
          <div className="grid gap-3 sm:grid-cols-3">
            {groups.map((g) => (
              <fieldset key={g.id}>
                <legend className="mb-1 text-11 font-bold uppercase tracking-wide text-ink-500">{g.label}</legend>
                {columns.filter((c) => c.g === g.id).map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-13 text-ink-700 hover:bg-brand-50">
                    <input type="checkbox" checked={!cols.isHidden(c.id)} onChange={() => cols.toggle(c.id)} /> {c.label}
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-2">
            <p className="text-11 text-ink-400">{labels.hint}</p>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary !px-2.5 !py-1 !text-12" onClick={cols.showAll}><Eye size={14} /> {labels.showAll}</button>
              <button type="button" className="btn-secondary !px-2.5 !py-1 !text-12" onClick={cols.resetWidths}><RotateCcw size={14} /> {labels.resetWidths}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
