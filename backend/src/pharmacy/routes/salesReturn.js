// Pharmacy → Return → Sales Return: goods a customer brings back from one sale.
// Pick the sale (by its date or by the customer), then enter what comes back on each of its lines.
// A line returns at most what it sold less earlier returns, in the same Sell by unit as the sale.
// Refund = Qty × Sale Price less the line's Disc % and the sale's Bill Discount %.
// Saving puts the packs back into the item's stock (stock_movements, reason 'issue', ref_type 'sales_return',
// a positive change) and into the line's batch (utils/stock.js batchesOf). An edit applies only the change.
import { Router } from '../../lib/mini-express.js';
import { query, tx, insertRow, pageSql } from '../../config/db.js';
import { clinicScope } from '../../middleware/access.js';
import { badRequest, notFound, paging, toAmount, toId, like } from '../../utils/http.js';
import { isISODate, todayISO } from '../../utils/dates.js';
import { nextSequence, formatSalesReturnNo } from '../../utils/codes.js';
import { lockStock } from '../../utils/stock.js';
import { moveStock } from '../utils/batchStock.js';
import { packsOf } from '../../../../shared/sale.js';

const router = Router();
router.use(clinicScope());   // read / write access: pharmacy/index.js

const MAX_LINES = 200;
const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;

/** Refund for `unitQty` of a sale line: Qty × Price less line Disc % and the sale's Bill Discount % */
const refundOf = (unitQty, line, billDisc) =>
  r2(Number(unitQty) * Number(line.price) * (1 - Number(line.disc_percent || 0) / 100) * (1 - Number(billDisc || 0) / 100));

/** The sale's lines with what earlier Sales Returns (other than `exceptId`) already took back, in sale units. */
async function saleLines(clinicId, saleId, exceptId = 0) {
  return query(
    `SELECT l.id AS sale_item_id, l.item_id, l.item_name, l.stock_in_item_id, l.batch_no, l.exp_date, l.sale_unit, l.pack_size,
            COALESCE(l.unit_qty, l.qty) AS sold, l.price, l.disc_percent,
            COALESCE((SELECT SUM(x.unit_qty) FROM sales_return_items x WHERE x.sale_item_id = l.id AND x.sr_id <> ?), 0) AS returned
       FROM sale_items l WHERE l.sale_id = ? AND l.clinic_id = ? ORDER BY l.id`,
    [exceptId, saleId, clinicId],
  );
}

async function clean(body, clinicId, exceptId = 0) {
  const saleId = toId(body?.sale_id, 'sale');
  const [sale] = await query('SELECT id, sale_date, disc_percent FROM sales WHERE id = ? AND clinic_id = ?', [saleId, clinicId]);
  if (!sale) throw badRequest('Choose a sale', 'VALIDATION');
  const date = body?.return_date || todayISO();
  if (!isISODate(date)) throw badRequest('Invalid date', 'VALIDATION');
  if (date < new Date(sale.sale_date).toISOString().slice(0, 10)) throw badRequest('Return date cannot be before the sale date', 'VALIDATION');
  const reason = String(body?.reason ?? '').trim().slice(0, 300) || null;

  const byLine = new Map((await saleLines(clinicId, saleId, exceptId)).map((l) => [l.sale_item_id, l]));
  const input = Array.isArray(body?.lines) ? body.lines : [];
  if (input.length > MAX_LINES) throw badRequest(`At most ${MAX_LINES} lines`, 'VALIDATION');
  const lines = [];
  for (const [n, l] of input.entries()) {
    const unitQty = toAmount(l?.qty, 'quantity');
    if (!unitQty) continue;
    const src = byLine.get(Number(l.sale_item_id));
    if (!src) throw badRequest(`Line ${n + 1}: not on this sale`, 'VALIDATION');
    const left = r2(Number(src.sold) - Number(src.returned));
    if (unitQty > left) throw badRequest(`${src.item_name}: only ${left} can be returned`, 'VALIDATION');
    lines.push({
      sale_item_id: src.sale_item_id, item_id: src.item_id, item_name: src.item_name,
      stock_in_item_id: src.stock_in_item_id, batch_no: src.batch_no, exp_date: src.exp_date,
      sale_unit: src.sale_unit, pack_size: Number(src.pack_size), unit_qty: unitQty,
      qty: packsOf({ qty: unitQty, sale_unit: src.sale_unit, pack_size: src.pack_size }),
      price: Number(src.price), disc_percent: Number(src.disc_percent), amount: refundOf(unitQty, src, sale.disc_percent),
    });
  }
  if (!lines.length) throw badRequest('Enter the quantity returned for at least one item', 'VALIDATION');
  const total = r2(lines.reduce((s, l) => s + l.amount, 0));
  return { head: { sale_id: saleId, return_date: date, reason, total_amount: total }, lines };
}

/** Saves the lines: stock goes up by (new − old) packs per item. */
async function applyLines(q, clinicId, userId, srId, srNo, oldLines, lines) {
  await lockStock(q, clinicId);
  const change = new Map();
  for (const l of oldLines) change.set(l.item_id, (change.get(l.item_id) || 0) - Number(l.qty));
  for (const l of lines) change.set(l.item_id, (change.get(l.item_id) || 0) + l.qty);
  await moveStock(q, clinicId, userId, change,
    { reason: 'issue', ref_type: 'sales_return', ref_id: srId, note: oldLines.length ? `Sales Return ${srNo} changed` : `Sales Return ${srNo}` },
    (item) => badRequest(`${item.name}: only ${Number(item.stock_qty)} in stock – that much has been sold since`, 'VALIDATION'));
  await q('DELETE FROM sales_return_items WHERE sr_id = ? AND clinic_id = ?', [srId, clinicId]);
  for (const l of lines) await insertRow(q, 'sales_return_items', { clinic_id: clinicId, sr_id: srId, ...l });
}

async function loadReturn(clinicId, id) {
  const [ret] = await query(
    `SELECT r.*, s.sale_no, s.sale_date, s.customer_name, s.mobile, s.disc_percent AS bill_disc
       FROM sales_returns r JOIN sales s ON s.id = r.sale_id WHERE r.id = ? AND r.clinic_id = ?`, [id, clinicId],
  );
  if (!ret) throw notFound('Sales Return');
  ret.lines = await query('SELECT * FROM sales_return_items WHERE sr_id = ? ORDER BY id', [id]);
  return ret;
}

// GET /api/pharmacy/sales-returns?q=&page= – newest first
router.get('/', async (req, res) => {
  const { limit, offset, page } = paging(req.query, { maxLimit: 100 });
  const where = ['r.clinic_id = ?'];
  const params = [req.clinicId];
  if (req.query.q) {
    where.push(`(r.sr_no LIKE ? OR s.sale_no LIKE ? OR s.customer_name LIKE ? OR s.mobile LIKE ?
                 OR EXISTS (SELECT 1 FROM sales_return_items i WHERE i.sr_id = r.id AND i.item_name LIKE ?))`);
    params.push(...Array(5).fill(like(req.query.q)));
  }
  const w = where.join(' AND ');
  const from = 'FROM sales_returns r JOIN sales s ON s.id = r.sale_id';
  const [{ total, amount }] = await query(`SELECT COUNT(*) AS total, SUM(r.total_amount) AS amount ${from} WHERE ${w}`, params);
  const rows = await query(
    `SELECT r.id, r.sr_no, r.return_date, r.total_amount, r.reason, s.sale_no, s.customer_name, s.mobile,
            (SELECT STRING_AGG(i.item_name, ', ') WITHIN GROUP (ORDER BY i.id) FROM sales_return_items i WHERE i.sr_id = r.id) AS item_names,
            (SELECT SUM(i.unit_qty) FROM sales_return_items i WHERE i.sr_id = r.id) AS total_qty
       ${from} WHERE ${w} ORDER BY r.return_date DESC, r.id DESC ${pageSql}`,
    [...params, offset, limit],
  );
  res.json({ rows, total, page, limit, amount: Number(amount || 0) });
});

// GET /api/pharmacy/sales-returns/sales?date=YYYY-MM-DD | ?q= – sales to return from: that day's, or by sale no / customer / mobile
router.get('/sales', async (req, res) => {
  const where = ['s.clinic_id = ?'];
  const params = [req.clinicId];
  if (isISODate(req.query.date)) { where.push('s.sale_date = ?'); params.push(req.query.date); }
  if (req.query.q) {
    where.push('(s.sale_no LIKE ? OR s.customer_name LIKE ? OR s.mobile LIKE ?)');
    params.push(...Array(3).fill(like(req.query.q)));
  }
  if (params.length === 1) { res.json({ rows: [] }); return; }
  const rows = await query(
    `SELECT TOP 50 s.id, s.sale_no, s.sale_date, s.customer_name, s.mobile, s.total_amount
       FROM sales s WHERE ${where.join(' AND ')} ORDER BY s.sale_date DESC, s.id DESC`, params,
  );
  res.json({ rows });
});

// GET /api/pharmacy/sales-returns/sale/:saleId?except= – the sale and its lines (sold, already returned)
router.get('/sale/:saleId', async (req, res) => {
  const saleId = toId(req.params.saleId);
  const [sale] = await query('SELECT id, sale_no, sale_date, customer_name, mobile, disc_percent, total_amount FROM sales WHERE id = ? AND clinic_id = ?', [saleId, req.clinicId]);
  if (!sale) throw notFound('Sale');
  const except = req.query.except ? toId(req.query.except) : 0;
  res.json({ sale, rows: await saleLines(req.clinicId, saleId, except) });
});

router.get('/:id', async (req, res) => {
  res.json(await loadReturn(req.clinicId, toId(req.params.id)));
});

// POST /api/pharmacy/sales-returns { sale_id, return_date, reason, lines: [{ sale_item_id, qty }] } – qty in the sale line's unit
router.post('/', async (req, res) => {
  const id = await tx(async (q) => {
    await lockStock(q, req.clinicId);
    const { head, lines } = await clean(req.body, req.clinicId);
    const [clinic] = await q('SELECT code FROM clinics WHERE id = ?', [req.clinicId]);
    const srNo = formatSalesReturnNo(clinic.code, await nextSequence(q, req.clinicId, 'sales_return'));
    const srId = await insertRow(q, 'sales_returns', { ...head, sr_no: srNo, clinic_id: req.clinicId, created_by: req.user.id });
    await applyLines(q, req.clinicId, req.user.id, srId, srNo, [], lines);
    return srId;
  });
  res.status(201).json(await loadReturn(req.clinicId, id));
});

router.put('/:id', async (req, res) => {
  const id = toId(req.params.id);
  await tx(async (q) => {
    await lockStock(q, req.clinicId);
    const [ret] = await q('SELECT sr_no FROM sales_returns WITH (UPDLOCK) WHERE id = ? AND clinic_id = ?', [id, req.clinicId]);
    if (!ret) throw notFound('Sales Return');
    const { head, lines } = await clean(req.body, req.clinicId, id);
    const old = await q('SELECT item_id, qty FROM sales_return_items WHERE sr_id = ?', [id]);
    await q('UPDATE sales_returns SET sale_id = ?, return_date = ?, reason = ?, total_amount = ?, updated_at = NOW() WHERE id = ?',
      [head.sale_id, head.return_date, head.reason, head.total_amount, id]);
    await applyLines(q, req.clinicId, req.user.id, id, ret.sr_no, old, lines);
  });
  res.json(await loadReturn(req.clinicId, id));
});

export default router;
