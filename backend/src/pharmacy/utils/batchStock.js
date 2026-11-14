// Pharmacy batch stock: each batch (Stock In line) and what is left in it, and the logged stock moves.
import { r4 } from '../../utils/stock.js';

/**
 * An item's batches (Stock In lines), earliest expiry first, with the packs left in each:
 *   received (paid + free) − returned to the vendor − sold + returned by customers + adjusted in − adjusted out.
 * `except*` leave one document's own lines out (its edit shows the stock before it). `q` is query or a tx's q.
 */
export async function batchesOf(q, clinicId, itemId, { exceptSale = 0, exceptSalesReturn = 0, exceptAdjustment = 0 } = {}) {
  return q(
    `SELECT l.id AS stock_in_item_id, l.batch_no, l.mfg_date, l.exp_date, l.sel_amount, l.mrp, l.rate AS cost, si.si_no,
            l.qty + l.free_qty
                  - COALESCE((SELECT SUM(r.qty) FROM purchase_return_items r WHERE r.stock_in_item_id = l.id), 0)
                  - COALESCE((SELECT SUM(s.qty) FROM sale_items s WHERE s.stock_in_item_id = l.id AND s.sale_id <> ?), 0)
                  + COALESCE((SELECT SUM(x.qty) FROM sales_return_items x WHERE x.stock_in_item_id = l.id AND x.sr_id <> ?), 0)
                  + COALESCE((SELECT SUM(a.in_qty - a.out_qty) FROM stock_adjustment_items a
                               WHERE a.stock_in_item_id = l.id AND a.adjustment_id <> ?), 0) AS available
       FROM stock_in_items l JOIN stock_ins si ON si.id = l.stock_in_id
      WHERE l.item_id = ? AND l.clinic_id = ?
      ORDER BY CASE WHEN l.exp_date IS NULL THEN 1 ELSE 0 END, l.exp_date, l.id`,
    [exceptSale, exceptSalesReturn, exceptAdjustment, itemId, clinicId],
  );
}

/**
 * Moves each item's stock by `change` (item_id → +/− packs), never below zero, and logs every move in
 * stock_movements. `log` gives the movement's reason / ref_type / ref_id / note.
 */
export async function moveStock(q, clinicId, userId, change, log, tooLow) {
  for (const [itemId, diff] of change) {
    if (!r4(diff)) continue;
    const [item] = await q('SELECT name, stock_qty FROM items WITH (UPDLOCK, ROWLOCK) WHERE id = ? AND clinic_id = ?', [itemId, clinicId]);
    const balance = r4(Number(item.stock_qty) + diff);
    if (balance < 0) throw tooLow(item);
    await q('UPDATE items SET stock_qty = ?, updated_at = NOW() WHERE id = ?', [balance, itemId]);
    await q(
      `INSERT INTO stock_movements (clinic_id, item_id, qty_change, balance_after, reason, ref_type, ref_id, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [clinicId, itemId, r4(diff), balance, log.reason, log.ref_type, log.ref_id, log.note, userId],
    );
  }
}
