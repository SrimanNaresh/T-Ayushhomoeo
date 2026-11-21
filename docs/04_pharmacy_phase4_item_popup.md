# Pharmacy sync with Ayush All In One — Phase 4: add / edit an item from Purchase / Order

All In One's `ItemFormModal` lets Purchase / Order add a new item, or edit one, in a popup without leaving the
order. This app did not have it (its item box only picked existing items).

## What changed
| Part | Change |
|---|---|
| `pages/ItemFields.jsx` (new) | Item Master's fields, validation and the body sent to the API, in one place. |
| `pages/ItemMaster.jsx` | Uses `ItemFields`; works exactly as before. |
| `pages/ItemFormModal.jsx` (new) | The popup: "Add New Item" (name filled in from what was typed) or "Edit Item · code". |
| `components/ItemPicker.jsx` | Optional `onNew` / `onEdit`: a last row **+ Add new item "…"** when the typed name is not an item yet (↑ / ↓ / Enter reach it too), and a pencil on each suggestion. Other screens that use the picker are unchanged. |
| `pages/PurchaseOrder.jsx` | Both the grid (desktop) and the cards (phone) offer add / edit. A new item goes on the line it was typed in, with its MRP and GST. An edited item's details (name, generic, HSN, manufacturer, category, pack, unit) are refreshed on the lines holding it; prices and quantities stay. |
| Text | `items.addNewTitle`, `items.addNew`, `items.editItem` in `en.js` and `ta.js`. |

## Differences from All In One (on purpose)
- **No Quantity box in the popup.** A new item starts with no stock (the order's Stock In adds it) and an edit from
  an order never changes stock. Opening stock is still set on the Item Master page.
- **No delete from the picker.** All In One also deletes items from its order grid; here items are made Inactive on
  Item Master, as before.
- The popup is used on Purchase / Order only, as in All In One.

## Checks
- Frontend production build: OK. Backend tests: 75 / 75.
- Not yet tried by hand on screen (needs a login).

## Remaining phases
5. Scan Bill on Stock In / Three in One (`tesseract.js`, `pdfjs-dist`).
6. Excel export of lists (`exceljs`).
7. Screen polish to match All In One.
