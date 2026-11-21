# Pharmacy: every T_Ayush function — batches A and B

Request (2026-11-21): bring **all** of T_Ayush's (Ayush All In One, `D:\PRODUCT\ALLINONE\TAyush`) pharmacy functions
into this app, starting with Three in One (`/#/pharmacy/stock-ips`). Work is in batches:
A Three in One · B Purchase Order · C Stock In · D Sales / Sales Return · E lists, reports, dashboard, payments,
returns, adjustment · F Item Master (Excel bulk file, Scan Bill on Item Master / Purchase Order).

## Price model: now T_Ayush's (decided 2026-11-21)
`shared/purchase.js` follows T_Ayush's `purchaseCalc.js`:
- **P.Rate = MRP − Disc % of the MRP**; typing MRP or Disc % works out P.Rate, typing P.Rate works out Disc % (`priced`).
- **Amount = Qty × P.Rate** (the discount is already in P.Rate); GST and Total as before.
Before, Disc % came off P.Rate. No purchase orders, Stock Ins or sales were saved yet (0 rows), so nothing saved
changes meaning. Scan Bill reads Disc % as a % of the MRP too (T_Ayush's rule, checked against MRP and rate).

## A. Three in One — as in T_Ayush
- Vendor: **+ Add vendor** inline (Name, Address, Mobile), and the **vendor details** box (arrow beside Vendor Name),
  saved on the order with the Bill No.
- Columns as T_Ayush: Item group **Generic, Manufacturer, HSN, Category, Pack, Unit, Rack**; Purchase group **MRP,
  Old Price** (this vendor's last P.Rate), **Disc %, P.Rate** (linked), **Qty, Free, Amount, GST %, GST Amt, Total**;
  Stock In group **Batch No, Mf.Date, Exp.Date, S.Disc %, Sel.Amount**.
- Headings stay on top and **# / Item Name stay on the left** while the table scrolls in its own box.
- Under each name: **"In Item List · code"** or **"New – added to the Item List on save"**. A typed name is linked to
  the Item List item with that name (and no other HSN or Category) as you type, as T_Ayush does.
- Row checks as T_Ayush: Qty, MRP, **P.Rate > 0**, P.Rate ≤ MRP, Disc %, GST %, **Batch No and Exp.Date required**,
  month rules, S.Disc %, and **repeated rows** (same Item Name + HSN + Batch). Problem rows are red with the reason.
- **Sum of Total · Round Off · Net Amount** (Round Off saved on the order).
- **+ / delete** on every row; "N lines · M new items" beside the header; **Stock In List** button;
  **Clear / Start over** and **Save all / Save Stock In** as T_Ayush.
- Scan Bill: Generic, Unit and Rack tiles back; a vendor not in the list opens **+ Add vendor** filled from the bill.
- New items are saved with Generic, Pack, Unit and Rack too.

## B. Purchase Order — the parts this app was missing
- MRP / Disc % / P.Rate linked (both desktop grid and phone cards).
- Picking an item: P.Rate starts at **this vendor's last rate** for it (else the item's purchase rate), Disc % worked
  out, Qty 1.
- Line checks as T_Ayush (Qty, MRP, P.Rate > 0, P.Rate ≤ MRP, Free, Disc %, CGST + SGST ≤ 28, **same item twice**);
  the line turns red with the reason.
- **Round Off** (tick, on by default; an edit keeps how it was saved) and **Net Amount**.
- Database: `purchase_orders.round_off` (add-only; `total_amount` is after it). Run on `T_Homoeo` alone (0 orders).

Already the same as T_Ayush here: Old Price column, CGST / SGST, show / hide Generic · Manufacturer · HSN, bulk add,
+ Add vendor, vendor Details, add / edit item popup, Admin-only delete.
Still to come for Purchase Order: Scan Bill (batch F, with Item Master's).

## Checks
- Backend tests 81 / 81 (new: P.Rate / Disc % linking, Scan Bill discount rule). Frontend build OK.
- **Not yet checked on screen** (needs a login).
