# Pharmacy sync with Ayush All In One — Phase 3: Round Off on Sales

## Found
- **Receipt print already here.** `components/SaleReceipt.jsx` prints an 80 mm receipt from Sales (after Save) and
  from the Sales List. All In One's `SalesBillReceipt` is one A4-style layout with the same content, so nothing
  was ported for the print.
- **Round Off was missing.** All In One rounds the sales Total to the nearest rupee (on by default).

## What changed
| Part | Change |
|---|---|
| Database | `sales.round_off DECIMAL(10,2) NOT NULL DEFAULT 0` (add-only). |
| `shared/sale.js` | `roundOffOf(total)` and `saleTotals(lines, disc, { roundOff })`, now also returning `before_round` and `round_off`. |
| API `POST / PUT /sales-billings` | `round_off: true` rounds the Total. `total_amount` is saved **after** the Round Off, so the dashboard, list and reports show what was collected. The below-cost check uses the Total **before** it (rounding down by up to 0.50 is allowed, as in All In One). |
| Sales screen | A "Round Off" tick box (on for a new sale; an edit keeps how it was saved) with the + / − amount, on desktop and phone. |
| Receipt | Prints a Round Off line when it is not zero. |
| Text | `sale.roundOff` in `en.js` and `ta.js`. |
| Tests | Round Off cases added to `backend/test/pharmacy.test.js` (75 / 75 pass). |

Examples: 99.75 → +0.25 → 100.00; 24.25 → −0.25 → 24.00; 24.50 → +0.50 → 25.00.

## Database update
Only the new statement was run on `T_Homoeo`; `sales` had 0 rows.

## Not changed
Sales Return still refunds by its lines and the sale's Bill Discount %; the sale's Round Off is not refunded
(All In One does the same). All In One also has Round Off on Purchase Order and Three in One; that was not in
this phase.

## Remaining phases
4. Items: add a new item from inside the grids (`ItemFormModal`).
5. Scan Bill on Stock In / Three in One (`tesseract.js`, `pdfjs-dist`).
6. Excel export of lists (`exceljs`).
7. Screen polish to match All In One.
