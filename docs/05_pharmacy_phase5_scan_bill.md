# Pharmacy sync with Ayush All In One — Phase 5: Scan Bill on Three in One

All In One's Three in One has a **Scan Bill** button: a photo or PDF of the supplier's bill is read in the
browser (OCR) and its lines fill the table. This app did not have it.

## How it works
1. **Scan Bill** (top right of Three in One) → upload a photo / PDF, or take a photo on a phone. Each page is
   turned upright automatically (turn / zoom buttons are there too).
2. Drag a box around the item table, header row included (or **Read whole page**).
3. **Match columns:** the bill's table as read, with a tile per Three in One column. Headings that clearly match
   are placed already (Item Description → Item Name, Batch, Exp, Qty, Free, MRP, Rate → P.Rate, Disc, GST…).
   Drag or tap tiles to fix them; remove stray columns or lines.
4. **Fill the table:** the lines go after any rows already typed; a repeat (same Item Name + HSN + Batch) is left
   out. Nothing is saved until **Save** — the rows are checked as usual (red rows show what to fix).

Also filled in from the top of the bill: the **bill date** (Date) and the **vendor**, when one in the Vendor List
has very nearly that name. A vendor that is not in the list is named in the message (add it, then pick it).
Bill No is not read: type it.

## Rules (this app's, not All In One's)
- **P.Rate** is the bill's rate **before** Disc %, and **Disc %** comes off it (this app's Purchase / Order).
  All In One takes Disc % off the MRP instead.
- No rate column: Amount ÷ Qty (or Net Rate) is the rate — already after the discount, so Disc % is left at 0.
- A Disc larger than 100 is an amount: per unit when below the rate, else for the line; one that still is not
  0–100 % is left blank.
- No GST % column: from CGST + SGST, GST Amt or Total. "9%+9%" in one cell is GST 18.
- **Pack** ("10's", "1x15") becomes the pack size (Three in One's Pack size box).
- An item is the existing one only when the names are the same (case, spaces and punctuation aside); anything
  else is a new item, added on Save as before.
- Generic, Rack and Unit columns are not used (Three in One has no such boxes).

## Files
| File | |
|---|---|
| `utils/billScan.js`, `utils/billOcr.js` | Copied unchanged from All In One (bill text parsing; Tesseract + PDF.js). |
| `utils/billIps.js` | Bill column → Three in One line: column matching and the price rules above. |
| `pages/ScanBillModal.jsx` | The popup (All In One's Three in One mode only; Item Master / Purchase Order modes not ported). |
| `pages/StockIps.jsx` | Scan Bill button; lines fill the table, item names matched, vendor / bill date filled. |
| `i18n/en.js`, `ta.js` | `scan.*`, `ips.scan*` text. |
| `backend/test/billIps.test.js` | Column matching and price rules (5 tests). |
| `package.json` | `tesseract.js` 5.1.1 and `pdfjs-dist` 4.10.38 (same versions as All In One). |

Tesseract and PDF.js load only when a bill is scanned. The first scan downloads Tesseract's English language
data from its CDN (as in All In One), so it needs the internet; the bill itself never leaves the browser.

## Checks
- Backend tests: 80 / 80 (5 new). Frontend production build: OK.
- **Not yet tried with a real bill** (needs a login and a bill photo). OCR quality depends on the photo.

## Remaining phases
6. Excel export of lists (`exceljs`).
7. Screen polish to match All In One.
