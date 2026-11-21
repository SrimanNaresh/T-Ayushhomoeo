# Pharmacy sync with Ayush All In One — Phase 2: stock (no code change)

Compared All In One's `stockEvents.js` / `batchStock.js` with this app's stock logic.

| | All In One | This app |
|---|---|---|
| Item stock | Worked out by summing every transaction (`CURRENT_STOCK`) | `items.stock_qty`, changed only together with a `stock_movements` row (running `balance_after`), never below zero |
| Stock history | `EVENTS` union over the documents | `stock_movements` log, shown by `GET /item-master/:id/movements` |
| Batch stock | Received − returned − sold + sales returns ± adjustments, per batch | Same sum per Stock In line (`pharmacy/utils/batchStock.js` `batchesOf`) |
| Batch order | Earliest expiry first, no expiry last | Same |
| Sales | The user picks the batch from that list | Same |
| Concurrency | — | `sp_getapplock` per clinic around stock saves |

**Result:** this app already has the behaviour phase 2 was for, so no code was ported. Moving it to
All In One's "sum the transactions" model would mean rewriting every stock save, including the clinic side
(`dispense.js`, `routes/branch/patients.js`), with no gain for the user.

**One difference that stays (by design here):** Item Master can change an item's Quantity directly
(logged as an adjustment) and Dispense takes stock without a batch, so the item total can differ from the
sum of its batches. All In One avoids that by recording opening stock as an Adjust In on a batch.
Changing it here would change how the screens work, so it is left for a separate decision.

## Remaining phases
3. Sales: Round Off, A4 + thermal receipt print (`SalesBillReceipt`).
4. Items: add a new item from inside the grids (`ItemFormModal`).
5. Scan Bill on Stock In / Three in One (`tesseract.js`, `pdfjs-dist`).
6. Excel export of lists (`exceljs`).
7. Screen polish to match All In One.
