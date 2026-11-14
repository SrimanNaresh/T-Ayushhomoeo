// Pharmacy → Pharmacy Dashboard: today's and this month's sales (less Sales Returns), this month's purchases
// (Stock In at Cur.Rate + GST, as the Vendor Payments report), stock value (stock × selling price), the last
// 7 days' sales, items running low (at or below their Reorder Level, or LOW_STOCK packs when none is set),
// batches expiring within EXPIRY_DAYS that still have stock, and the latest sales. Read only.
import { Router } from '../../lib/mini-express.js';
import { query } from '../../config/db.js';
import { clinicScope } from '../../middleware/access.js';
import { addDays, monthStartISO, todayISO } from '../../utils/dates.js';

const router = Router();
router.use(clinicScope());   // read / write access: pharmacy/index.js

const LOW_STOCK = 5;
const EXPIRY_DAYS = 90;
const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;

router.get('/', async (req, res) => {
  const c = req.clinicId;
  const today = todayISO();
  const month = monthStartISO(today);
  const weekStart = addDays(today, -6);

  const [sales] = await query(
    `SELECT SUM(CASE WHEN sale_date = ? THEN total_amount END) AS today_amount, COUNT(CASE WHEN sale_date = ? THEN 1 END) AS today_bills,
            SUM(total_amount) AS month_amount, COUNT(*) AS month_bills
       FROM sales WHERE clinic_id = ? AND sale_date >= ?`, [today, today, c, month],
  );
  const [refunds] = await query(
    `SELECT SUM(CASE WHEN return_date = ? THEN total_amount END) AS today_amount, SUM(total_amount) AS month_amount, COUNT(*) AS month_count
       FROM sales_returns WHERE clinic_id = ? AND return_date >= ?`, [today, c, month],
  );
  const [purchases] = await query(
    `SELECT COUNT(DISTINCT si.id) AS entries,
            SUM(ROUND(l.qty * l.rate, 2) + ROUND(l.qty * l.rate * COALESCE(p.gst_percent, 0) / 100, 2)) AS amount
       FROM stock_ins si JOIN stock_in_items l ON l.stock_in_id = si.id LEFT JOIN purchase_order_items p ON p.id = l.po_item_id
      WHERE si.clinic_id = ? AND si.si_date >= ?`, [c, month],
  );
  const [stock] = await query(
    `SELECT COUNT(*) AS items, SUM(ROUND(CASE WHEN stock_qty > 0 THEN stock_qty ELSE 0 END * price, 2)) AS value
       FROM items WHERE clinic_id = ? AND status = 'active'`, [c],
  );
  const lowWhere = `clinic_id = ? AND status = 'active' AND stock_qty <= CASE WHEN reorder_level > 0 THEN reorder_level ELSE ${LOW_STOCK} END`;
  const [{ n: lowCount }] = await query(`SELECT COUNT(*) AS n FROM items WHERE ${lowWhere}`, [c]);
  const lowStock = await query(
    `SELECT TOP 10 id, item_code, name, category, unit, stock_qty, reorder_level FROM items WHERE ${lowWhere} ORDER BY stock_qty, name`, [c],
  );
  // batches with stock left that expire by today + EXPIRY_DAYS (same sums as utils/stock.js batchesOf)
  const expiringAll = await query(
    `SELECT * FROM (
       SELECT l.id, l.item_id, i.name, l.batch_no, l.exp_date,
              l.qty + l.free_qty
                - COALESCE((SELECT SUM(r.qty) FROM purchase_return_items r WHERE r.stock_in_item_id = l.id), 0)
                - COALESCE((SELECT SUM(s.qty) FROM sale_items s WHERE s.stock_in_item_id = l.id), 0)
                + COALESCE((SELECT SUM(x.qty) FROM sales_return_items x WHERE x.stock_in_item_id = l.id), 0)
                + COALESCE((SELECT SUM(a.in_qty - a.out_qty) FROM stock_adjustment_items a WHERE a.stock_in_item_id = l.id), 0) AS available
         FROM stock_in_items l JOIN items i ON i.id = l.item_id
        WHERE l.clinic_id = ? AND l.exp_date IS NOT NULL AND l.exp_date <= ?) b
     WHERE b.available > 0 ORDER BY b.exp_date, b.name`,
    [c, addDays(today, EXPIRY_DAYS)],
  );
  const week = await query(
    `SELECT sale_date AS day, SUM(total_amount) AS amount, COUNT(*) AS bills FROM sales
      WHERE clinic_id = ? AND sale_date >= ? GROUP BY sale_date`, [c, weekStart],
  );
  const recent = await query(
    `SELECT TOP 8 id, sale_no, sale_date, customer_name, mobile, total_amount, created_at FROM sales
      WHERE clinic_id = ? ORDER BY id DESC`, [c],
  );

  const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
  const byDay = new Map(week.map((w) => [iso(w.day), w]));
  res.json({
    today_sales: r2(Number(sales.today_amount || 0) - Number(refunds.today_amount || 0)),
    today_bills: sales.today_bills,
    month_sales: r2(Number(sales.month_amount || 0) - Number(refunds.month_amount || 0)),
    month_bills: sales.month_bills,
    month_refunds: r2(refunds.month_amount),
    month_returns: refunds.month_count,
    month_purchases: r2(purchases.amount),
    month_stock_ins: purchases.entries,
    stock_value: r2(stock.value),
    item_count: stock.items,
    low_stock_limit: LOW_STOCK,
    expiry_days: EXPIRY_DAYS,
    week: Array.from({ length: 7 }, (_, n) => {
      const day = addDays(weekStart, n);
      const w = byDay.get(day);
      return { day, amount: r2(w?.amount), bills: w?.bills || 0 };
    }),
    low_stock: lowStock,
    low_stock_count: lowCount,
    expiring: expiringAll.slice(0, 10),
    expiring_count: expiringAll.length,
    recent_sales: recent,
  });
});

export default router;
