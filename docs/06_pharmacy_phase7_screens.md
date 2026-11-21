# Pharmacy sync with Ayush All In One — Phases 6 and 7

## Phase 6: Excel export of lists — nothing to port
All In One's pharmacy has no Excel / PDF export of its lists. Its only Excel feature is the Item Bulk Update
file (download every item as .xlsx with drop-down lists, edit offline, upload: an Item Code updates that item,
a blank one adds a new item). This app already covers that work differently: a CSV template / import for new
items (Item Master) and the on-screen Bulk Update grid for editing many items. Left as it is (decided
2026-11-21); it can still be ported later if staff want to edit items in Excel.

## Phase 7: screens changed in All In One since this app copied its design (2026-11-14)
All In One's only pharmacy screen changes since then (commit `d2cd993`, 2026-11-21):

| Screen | Change |
|---|---|
| Item Master (`ItemFields.jsx`) | Every box the same width in one grid: 8 to a row on desktop (16 boxes, two rows), 4 on a tablet, 2 on a phone (Item Name full width). The add / edit item popup uses the same boxes, 5 to a row. |
| Vendor Master | One grid, 7 to a row on desktop: Vendor name, Contact person, Email, State, Pin code, Phone, Mobile, GSTIN, DL No 1, DL No 2, Status, then Address (3 columns wide). Address is checked last, as it is last on screen. |

Same fields, checks and saving as before; only the layout changed. The other changes in that commit
(Clear buttons, Confirm Patient, patient age, reports) are on the clinic side, not part of this pharmacy update.

## Checks
- Frontend production build: OK. Backend tests: 80 / 80.
- Not yet looked at on screen (needs a login).

## All phases
| Phase | Result | Commit |
|---|---|---|
| 1 | Bill No on Stock In | `d94fe29` |
| 2 | Stock: already covered, note only | `660a297` |
| 3 | Round Off on Sales | `4574b21` |
| 4 | Add / edit an item from Purchase / Order | `57a128e` |
| 5 | Scan Bill on Three in One | `4f306a5` |
| 6 | Excel export: nothing to port (see above) | — |
| 7 | Item Master and Vendor Master layout | this commit |
