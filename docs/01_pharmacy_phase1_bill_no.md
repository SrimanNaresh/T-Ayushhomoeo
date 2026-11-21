# Pharmacy sync with Ayush All In One — Phase 1: Bill No on Stock In

Reference: Ayush All In One (`D:\PRODUCT\ALLINONE\TAyush`, commit `cc6a51b`), read-only.
Branch: `pharmacy-allinone-sync`.

This app keeps its own structure (mini-express router, `shared/` logic, snake_case tables, en + ta text).
All In One's behaviour is ported into it; nothing is dropped or renamed in the database.

## What changed
| Part | Change |
|---|---|
| Database | `stock_ins.bill_no NVARCHAR(50) NULL` — the vendor's own bill / invoice number (`database/schema.sql`, add-only). |
| API `POST /api/pharmacy/stock-ins` | Takes `bill_no`. When sent it is required, upper-cased, max 50 characters. |
| API `PUT /api/pharmacy/stock-ins/:id` | Changes `bill_no` only when sent; the Stock In screen does not send it, so an edit there keeps the saved one. |
| API `GET /stock-ins`, `/stock-ins/lines` | Return `bill_no` and search it. |
| API vendor payment invoices | Return `bill_no`. |
| Three in One | Bill No is now **required** (was optional and only went into the order's notes) and is saved on the Stock In. |
| Stock In List | Shows "Bill …" under the Stock In No (both Item wise and Date wise). |
| Vendor Payments | The invoice picker and the invoice heading show the Bill No. |
| Text | `ips.billNoRequired`, `stockin.billNo` in `en.js` and `ta.js`. |

## Database update
Only the new statement was run on `T_Homoeo` (not the whole `schema.sql`, which also repeats some one-time data
moves). `stock_ins` had 0 rows, so no saved data was touched. `npm run db:init` adds the same column on a new install.

## Checks
- `npm test` (backend): 74 / 74 pass.
- Frontend production build: OK.
- The changed SELECTs (Stock In list, lines, vendor invoices) run against `T_Homoeo`.
- Not yet checked by hand on screen (needs a login).

## Remaining phases (corrected after a closer comparison)
This app already has CGST / SGST, vendor State, the Excel item import template, pack-size logic and
IPS-style draft handling of a saved order. Still to port from All In One:
2. FIFO stock events (stock worked out from transactions).
3. Sales: Round Off, A4 + thermal receipt print (`SalesBillReceipt`).
4. Items: add a new item from inside the grids (`ItemFormModal`).
5. Scan Bill on Stock In / Three in One (`tesseract.js`, `pdfjs-dist`).
6. Excel export of lists (`exceljs`).
7. Screen polish to match All In One.
