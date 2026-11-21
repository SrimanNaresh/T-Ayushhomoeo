// Medicine name box with stock suggestions (searches item, Tablet Name and Generic Name).
// Each suggestion shows only the Tablet Name, with the Generic Name below in small text.
// Free text is allowed (item_id stays empty).
// browse (Purchase / Order): the list opens on click with no typing – the Item List A–Z, narrowed as you type –
// and shows the item name (not the Tablet Name).
// Keyboard: ↑ / ↓ move through the suggestions, Enter picks (browse: the first match if none is highlighted), Esc closes.
// onNew(typed) adds a last row "+ Add new item 'typed'" (when no item has exactly that name);
// onEdit(item) adds an edit (pencil) button on each suggestion. Both are optional (Purchase / Order uses them).
import { useEffect, useId, useRef, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { api } from '../lib/api.js';
import { useT } from '../lib/i18n.jsx';
import { PICKER_MENU, pickerRow, useDebounced } from './ui.jsx';

export default function ItemPicker({ value, onPick, placeholder, ariaLabel, browse = false, inputClass = 'input', onNew, onEdit }) {
  const { t } = useT();
  const [text, setText] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(-1);       // highlighted suggestion, -1 = none
  const dq = useDebounced(text, 200);
  const box = useRef(null);
  const menu = useRef(null);
  const menuId = useId();

  useEffect(() => setText(value || ''), [value]);

  useEffect(() => {
    if (!open || (!browse && dq.trim().length < 1)) { setItems([]); return undefined; }
    let live = true;
    api('/pharmacy/item-master', { query: { q: dq.trim(), status: 'active', limit: browse ? 50 : 8 } })
      .then((r) => live && setItems(r.rows))
      .catch(() => live && setItems([]));
    return () => { live = false; };
  }, [dq, open, browse]);

  // new suggestions: nothing highlighted until an arrow key is pressed
  useEffect(() => setActive(-1), [items]);

  // keep the highlighted suggestion visible inside the scrolling menu
  useEffect(() => {
    if (active >= 0) menu.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  useEffect(() => {
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const titleOf = (i) => (browse ? i.name : i.brand_name || i.name);     // Tablet Name, else the item name
  const pick = (i) => {
    const title = titleOf(i);
    setText(title); setOpen(false); setActive(-1);
    onPick({ medicine_name: title, item_id: i.id, item: i });
  };

  const typed = text.trim();
  // "+ Add new item": offered once something is typed that is not already an item's exact name
  const addRow = Boolean(onNew) && typed.length > 0 && !items.some((i) => titleOf(i).toLowerCase() === typed.toLowerCase());
  const count = items.length + (addRow ? 1 : 0);   // the add row is the last one (index items.length)
  const showMenu = open && count > 0;
  const addNew = () => { setOpen(false); setActive(-1); onNew(typed); };
  const choose = (idx) => (idx === items.length ? addNew() : pick(items[idx]));

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!showMenu) { setOpen(true); return; }
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (a < 0 && step < 0 ? count - 1 : (a + step + count) % count));
    } else if (e.key === 'Enter' && showMenu && (active >= 0 || (browse && typed))) {
      // browse: typing then Enter picks the first match (names starting with the text come first),
      // or the add row when nothing matches
      e.preventDefault();
      choose(Math.max(active, 0));
    } else if (e.key === 'Escape' && showMenu) {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={box}>
      <input
        className={inputClass}
        value={text}
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={showMenu}
        aria-controls={menuId}
        aria-autocomplete="list"
        aria-activedescendant={showMenu && active >= 0 ? `${menuId}-${active}` : undefined}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        // leaving the box (Tab, arrow keys) closes the list; a click on a suggestion keeps it until picked
        onBlur={(e) => { if (!box.current?.contains(e.relatedTarget)) setOpen(false); }}
        onKeyDown={onKeyDown}
        onChange={(e) => { setText(e.target.value); setOpen(true); onPick({ medicine_name: e.target.value, item_id: null }); }}
      />
      {showMenu && (
        <ul className={`${PICKER_MENU} ${browse ? 'w-[17rem]' : 'w-max max-w-[22rem]'}`} id={menuId} role="listbox" ref={menu}
          onMouseDown={(e) => e.preventDefault()}>
          {items.map((i, idx) => (
            <li key={i.id} id={`${menuId}-${idx}`} role="option" aria-selected={idx === active} className="relative">
              <button type="button" tabIndex={-1} className={`${pickerRow(idx === active)} ${onEdit ? 'pr-8' : ''}`}
                onMouseEnter={() => setActive(idx)} onClick={() => pick(i)}>
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="font-semibold">{titleOf(i)}</span>
                  {i.generic_name && <span className="text-11 text-ink-400">{i.generic_name}</span>}
                </span>
              </button>
              {onEdit && (
                <button type="button" tabIndex={-1} title={t('items.editItem')} aria-label={`${t('items.editItem')}: ${titleOf(i)}`}
                  className="btn-ghost absolute right-1 top-1/2 -translate-y-1/2 !p-1 text-ink-400 hover:text-brand-700"
                  onClick={() => { setOpen(false); onEdit(i); }}>
                  <Pencil size={13} />
                </button>
              )}
            </li>
          ))}
          {addRow && (
            <li id={`${menuId}-${items.length}`} role="option" aria-selected={active === items.length}>
              <button type="button" tabIndex={-1} className={`${pickerRow(active === items.length)} border-t border-ink-100 text-brand-700`}
                onMouseEnter={() => setActive(items.length)} onClick={addNew}>
                <span className="flex min-w-0 items-center gap-1.5 font-semibold"><Plus size={14} /> {t('items.addNew', { name: typed })}</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
