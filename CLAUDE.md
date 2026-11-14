# SmartClinic (Abi Homeo single-clinic install)

React 18 + Vite + Tailwind CSS 3 + lucide-react frontend in `frontend/`, Node API in `backend/`.
The UI follows the design system of Ayush ALL IN ONE (`D:\PRODUCT\ALLINONE\TAyush\frontend`):
its tokens, shared classes and components were copied here (2026-11-14). Keep every new or changed
screen looking the same as the existing ones. Reuse what exists; do not invent colours, sizes or components.

## 1. Tokens (frontend/tailwind.config.js)
- Colours: `brand` (primary blue), `teal` (clinical accent), `ink` (greys for text, borders, backgrounds).
  emerald / red / amber only for status (Active / error / warning). Menu-section colours come from
  `src/config/tones.js`. Never hard-code hex colours.
- Text sizes: `text-9` … `text-15` (text-13 body / table text, text-12 subtitles, text-10 small labels),
  plus text-xs / sm / base for labels and titles. All rem (root size set per screen width in index.css);
  no px font sizes.
- Shadows `shadow-card | soft | elevated | glow`; font Inter (Noto Sans Tamil for Tamil);
  animations `animate-fade-in`, `animate-slide-in`.

## 2. Shared classes (src/index.css)
- Buttons: `btn-primary` (Save / New), `btn-secondary` (Cancel / Back), `btn-danger` (Delete),
  `btn-ghost` (icon-only row actions: `btn-ghost !p-1` + a 15px icon). Each button: lucide icon size 16 + short label.
- Fields: `label` + `input` (also on select / textarea), 30px tall. Containers: `card` (one per screen), `card-hover`.
- Tables: `table-head` on the header row, `table-row` on body rows; list tables
  `list-pinned pin-first w-full min-w-[720px] text-left text-13` inside `overflow-x-auto rounded-lg`.
- Others: `badge`, `section-title`, `no-scrollbar`, `no-spin`, `no-print`, `combo-input`.

## 3. Shared components
- `src/components/ui.jsx`: `CardHeader({ icon, title, subtitle, actions })` first in every card (colours itself
  from the URL's menu section, so add new pages to `src/menu.js`); `Spinner`; `EmptyState message`;
  `Modal({ open, onClose, title, size: 'md'|'lg'|'xl', footer })`; `useToast()` → `toast(msg)` / `toast(msg, 'error')`
  (one app-wide toast: top on phones, bottom-right on desktop); `ErrorBox`, `Note`, `Badge`, `StatusBadge`,
  `TokenChip`, `SearchBox`, `DateFilter`, `SummaryBar`, `RowAction`, `DataTable`, `Pagination`, `Field` / `Input` /
  `Select` / `TextArea`; class constants `GRID_WIDE`, `GRID_SHORT`, `FORM_ACTIONS`, `TH`, `TD`,
  `GRID_INPUT` / `GRID_BAD` (boxes in editable grids), `PICKER_MENU` / `pickerRow` (picker lists).
- `MobileCard.jsx` (`ItemCard`, `CardField`, `CardValue`, `cardBox`, `cardBad`) and `PhoneLayout.jsx`
  (`PhoneTabs`, `PhoneFooter`, `usePhoneFit`) for phones; `DashboardKit.jsx` (`StatCards`, `DashTabs`,
  `QueueSteps`, `QuickActionsPanel`) for dashboards and tabbed screens; `PrintDoc.jsx` (`PrintBar`, `Doc`,
  `DocHead`, `DocMeta`, `DOC_TABLE`, `SignLine`) for printouts.
- Pickers: `ItemPicker`, `VendorPicker`, `RxListPicker`, `DoctorSelect`, `ItemBulkPicker`.
- Icons: import from `lucide-react`; `components/Icon.jsx` maps the old names used in `menu.js`.

## 4. Screen patterns (examples: modules/pharmacy/pages/VendorList.jsx + VendorMaster.jsx)
- List: `card` → CardHeader with actions = SearchBox (350ms debounce via `useDebounced`) + `btn-primary` "New x";
  Spinner while loading, EmptyState when empty, else the pinned table; main column `font-medium text-ink-700`,
  others `text-ink-500`, '-' for empty; Edit (`RowAction` Pencil) in the last column, right-aligned.
- Master: one `card` with `<form onSubmit={save} noValidate>`; title "X Master" / "Register a new x" when adding,
  "Edit X" / "Update or delete this x" when editing; fields in `GRID_WIDE` / `GRID_SHORT` with `mt-3` between groups;
  sentence-case labels with " *" on required ones; example placeholders ("e.g. 98765 43210"); phones
  `type="tel" inputMode="numeric"`; codes (GSTIN, DL No) upper-cased; validate first and toast the first problem;
  buttons in `FORM_ACTIONS`: Cancel (X) → Delete (Trash2, disabled unless editing, with a title) → Save (Save,
  "Saving..." while busy). After add: toast "X saved successfully" and reset; after edit / delete: toast, then
  navigate back to the list (the toast is app-wide, so it shows on the list; the hash router has no state for a flash).
- Entry screens with item lines (Purchase, Stock In, Sales, Return, Dispense, Patient Bill): editable grid on
  `md` and up, one `ItemCard` per line on phones.
- Server messages: errors from `lib/api.js` carry the server's text in `err.message`; use
  `toast(err.message || t('common.saveFailed'), 'error')`. Never `alert()`; `confirm()` before a delete is fine.

## 5. Phone and responsive
Phone first, then `sm:` / `md:` / `lg:`. No sideways page scroll; wide tables scroll inside their wrapper with the
first column pinned. Mark anything that must not print with `no-print`. Check every screen at ~375px and desktop.

## 6. Text
All screen text goes through `t()` with keys in both `src/i18n/en.js` and `src/i18n/ta.js`. Title Case for screen
titles ("Vendor List"), sentence case for labels and buttons ("New vendor"). Messages use `common.savedX`,
`common.updatedX`, `common.deletedX`, `common.loadFailed`, `common.isRequired`.

## 7. Before finishing a UI change
Compare with an existing screen of the same type, check ~375px and desktop, and list any new shared class or
component with the reason the existing ones were not enough.

## Install notes
This copy uses the T_Homoeo database only; run locally (port 5190 for testing); never run `deploy/*`.
