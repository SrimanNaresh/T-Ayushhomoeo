// Pharmacy → Stock In → Adjustment: corrects stock (count differences, breakage, expired goods).
// Each line adds (In) or takes out (Out) packs of an item – from one of its batches, or from stock with no batch –
// at its purchase price per pack (Amount = Qty × Rate). No batch and no item may go below zero.
// Saving moves the item's stock (stock_movements, reason 'adjustment', ref_type 'stock_adjustment');
// an edit applies only the change. Only an Admin may delete an Adjustment (its moves are undone).
import { Router } from '../../lib/mini-express.js';
import { query, tx, insertRow, pageSql } from '../../config/db.js';
import { clinicScope } from '../../middleware/access.js';
import { badRequest, forbidden, notFound, paging, toAmount, toId, like } from '../../utils/http.js';
import { isISODate, todayISO } from '../../utils/dates.js';
import { nextSequence, formatAdjustmentNo } from '../../utils/codes.js';
import { isAdmin, lockStock, r4 } from '../../utils/stock.js';
import { batchesOf, moveStock } from '../utils/batchStock.js';
import { packSize } from '../../../../shared/stockin.js';

const router = Router();
router.use(clinicScope());   // read / write access: pharmacy/index.js

const MAX_LINES = 200;
const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;

/** Checks the Adjustment; runs inside the save's stock lock, so the batch stock read here is current. */
async function clean(q, body, clinicId, exceptId = 0) {
  const date = body?.adj_date || todayISO();
  if (!isISODate(date)) throw badRequest('Invalid date', 'VALIDATION');
  if (date > todayISO()) throw badRequest('Date cannot be in the future', 'VALIDATION');
  const remarks = String(body?.remarks ?? '').trim().slice(0, 300) || null;
  if (!remarks) throw badRequest('Enter the reason for the adjustment', 'VALIDATION');

  const input = Array.isArray(body?.lines) ? body.lines.filter((l) => l?.item_id && (Number(l.in_qty) > 0 || Number(l.out_qty) > 0)) : [];
  if (!input.length) throw badRequest('Add at least one item with an In or Out quantity', 'VALIDATION');
  if (input.length > MAX_LINES) throw badRequest(`At most ${MAX_LINES} lines`, 'VALIDATION');

  const batchCache = new Map();
  const batchNet = new Map();   // the same batch on two lines counts once against its stock
  const lines = [];
  for (const l of input) {
    const itemId = toId(l.item_id, 'item');
    const [item] = await q('SELECT id, name, purchase_rate FROM items WHERE id = ? AND clinic_id = ?', [itemId, clinicId]);
    if (!item) throw badRequest('Item not found', 'VALIDATION');
    const inQty = r4(toAmount(l.in_qty, 'In Qty'));
    const outQty = r4(toAmount(l.out_qty, 'Out Qty'));
    if (inQty && outQty) throw badRequest(`${item.name}: enter either In or Out on one line, not both`, 'VALIDATION');
    let batch = null;
    if (l.stock_in_item_id) {
      if (!batchCache.has(itemId)) batchCache.set(itemId, await batchesOf(q, clinicId, itemId, { exceptAdjustment: exceptId }));
      batch = batchCache.get(itemId).find((b) => b.stock_in_item_id === Number(l.stock_in_item_id));
      if (!batch) throw badRequest(`${item.name}: that batch is not this item's`, 'VALIDATION');
      const net = r4((batchNet.get(batch.stock_in_item_id) ?? Number(batch.available)) + inQty - outQty);
      if (net < -0.00005) throw badRequest(`${item.name} (batch ${batch.batch_no || '—'}): only ${r4(batch.available)} in stock`, 'VALIDATION');
      batchNet.set(batch.stock_in_item_id, net);
    }
    const rate = l.rate === '' || l.rate == null ? Number(batch ? batch.cost : item.purchase_rate || 0) : toAmount(l.rate, 'Rate');
    lines.push({
      item_id: item.id, item_name: item.name, stock_in_item_id: batch?.stock_in_item_id || null,
      batch_no: batch?.batch_no || null, exp_date: batch?.exp_date || null,
      in_qty: inQty, out_qty: outQty, rate, amount: r2((inQty || outQty) * rate),
    });
  }
  const sum = (k) => r2(lines.filter((x) => x[k] > 0).reduce((s, x) => s + x.amount, 0));
  return { head: { adj_date: date, remarks, in_total: sum('in_qty'), out_total: sum('out_qty') }, lines };
}

/** Saves the lines: stock moves by (new − old) packs per item, never below zero. */
async function applyLines(q, clinicId, userId, adjId, adjNo, oldLines, lines, note) {
  const change = new Map();
  for (const l of oldLines) change.set(l.item_id, (change.get(l.item_id) || 0) - Number(l.in_qty) + Number(l.out_qty));
  for (const l of lines) change.set(l.item_id, (change.get(l.item_id) || 0) + l.in_qty - l.out_qty);
  await moveStock(q, clinicId, userId, change, { reason: 'adjustment', ref_type: 'stock_adjustment', ref_id: adjId, note },
    (item) => badRequest(`${item.name}: only ${Number(item.stock_qty)} in stock`, 'VALIDATION'));
  await q('DELETE FROM stock_adjustment_items WHERE adjustment_id = ? AND clinic_id = ?', [adjId, clinicId]);
  for (const l of lines) await insertRow(q, 'stock_adjustment_items', { clinic_id: clinicId, adjustment_id: adjId, ...l });
}

async function loadAdjustment(clinicId, id) {
  const [adj] = await query('SELECT * FROM stock_adjustments WHERE id = ? AND clinic_id = ?', [id, clinicId]);
  if (!adj) throw notFound('Adjustment');
  adj.lines = await query(
    `SELECT a.*, i.unit, i.stock_qty FROM stock_adjustment_items a JOIN items i ON i.id = a.item_id
      WHERE a.adjustment_id = ? ORDER BY a.id`, [id],
  );
  return adj;
}

// GET /api/pharmacy/stock-adjustments?q=&page= – newest first
router.get('/', async (req, res) => {
  const { limit, offset, page } = paging(req.query, { maxLimit: 100 });
  const where = ['a.clinic_id = ?'];
  const params = [req.clinicId];
  if (req.query.q) {
    where.push('(a.adj_no LIKE ? OR a.remarks LIKE ? OR EXISTS (SELECT 1 FROM stock_adjustment_items i WHERE i.adjustment_id = a.id AND i.item_name LIKE ?))');
    params.push(...Array(3).fill(like(req.query.q)));
  }
  const w = where.join(' AND ');
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM stock_adjustments a WHERE ${w}`, params);
  const rows = await query(
    `SELECT a.id, a.adj_no, a.adj_date, a.remarks, a.in_total, a.out_total,
            (SELECT STRING_AGG(i.item_name, ', ') WITHIN GROUP (ORDER BY i.id) FROM stock_adjustment_items i WHERE i.adjustment_id = a.id) AS item_names,
            (SELECT SUM(i.in_qty) FROM stock_adjustment_items i WHERE i.adjustment_id = a.id) AS in_qty,
            (SELECT SUM(i.out_qty) FROM stock_adjustment_items i WHERE i.adjustment_id = a.id) AS out_qty
       FROM stock_adjustments a WHERE ${w} ORDER BY a.adj_date DESC, a.id DESC ${pageSql}`,
    [...params, offset, limit],
  );
  res.json({ rows, total, page, limit });
});

// GET /api/pharmacy/stock-adjustments/batches/:itemId?except= – every batch of the item (sold-out ones too, for an In)
// with its packs left, and the item's own stock and purchase price
router.get('/batches/:itemId', async (req, res) => {
  const itemId = toId(req.params.itemId);
  const [item] = await query('SELECT id, stock_qty, purchase_rate, mrp, unit FROM items WHERE id = ? AND clinic_id = ?', [itemId, req.clinicId]);
  if (!item) throw notFound('Item');
  const except = req.query.except ? toId(req.query.except) : 0;
  res.json({
    rows: await batchesOf(query, req.clinicId, itemId, { exceptAdjustment: except }),
    stock_qty: Number(item.stock_qty), cost: Number(item.purchase_rate), mrp: Number(item.mrp), pack_size: packSize(item.unit),
  });
});

router.get('/:id', async (req, res) => {
  res.json(await loadAdjustment(req.clinicId, toId(req.params.id)));
});

// POST /api/pharmacy/stock-adjustments { adj_date, remarks, lines: [{ item_id, stock_in_item_id?, in_qty, out_qty, rate? }] }
router.post('/', async (req, res) => {
  const id = await tx(async (q) => {
    await lockStock(q, req.clinicId);
    const { head, lines } = await clean(q, req.body, req.clinicId);
    const [clinic] = await q('SELECT code FROM clinics WHERE id = ?', [req.clinicId]);
    const adjNo = formatAdjustmentNo(clinic.code, await nextSequence(q, req.clinicId, 'adjustment'));
    const adjId = await insertRow(q, 'stock_adjustments', { ...head, adj_no: adjNo, clinic_id: req.clinicId, created_by: req.user.id });
    await applyLines(q, req.clinicId, req.user.id, adjId, adjNo, [], lines, `Adjustment ${adjNo}`);
    return adjId;
  });
  res.status(201).json(await loadAdjustment(req.clinicId, id));
});

router.put('/:id', async (req, res) => {
  const id = toId(req.params.id);
  await tx(async (q) => {
    await lockStock(q, req.clinicId);
    const [adj] = await q('SELECT adj_no FROM stock_adjustments WITH (UPDLOCK) WHERE id = ? AND clinic_id = ?', [id, req.clinicId]);
    if (!adj) throw notFound('Adjustment');
    const { head, lines } = await clean(q, req.body, req.clinicId, id);
    const old = await q('SELECT item_id, in_qty, out_qty FROM stock_adjustment_items WHERE adjustment_id = ?', [id]);
    await q('UPDATE stock_adjustments SET adj_date = ?, remarks = ?, in_total = ?, out_total = ?, updated_at = NOW() WHERE id = ?',
      [head.adj_date, head.remarks, head.in_total, head.out_total, id]);
    await applyLines(q, req.clinicId, req.user.id, id, adj.adj_no, old, lines, `Adjustment ${adj.adj_no} changed`);
  });
  res.json(await loadAdjustment(req.clinicId, id));
});

// DELETE /api/pharmacy/stock-adjustments/:id – Admin only; undoes its stock moves (a batch it filled may have been sold since)
router.delete('/:id', async (req, res) => {
  if (!isAdmin(req.user)) throw forbidden('Only an Admin can delete an Adjustment');
  const id = toId(req.params.id);
  await tx(async (q) => {
    await lockStock(q, req.clinicId);
    const [adj] = await q('SELECT adj_no FROM stock_adjustments WITH (UPDLOCK) WHERE id = ? AND clinic_id = ?', [id, req.clinicId]);
    if (!adj) throw notFound('Adjustment');
    const old = await q('SELECT item_id, stock_in_item_id, in_qty, out_qty FROM stock_adjustment_items WHERE adjustment_id = ?', [id]);
    for (const l of old.filter((x) => x.stock_in_item_id && Number(x.in_qty) > 0)) {
      const b = (await batchesOf(q, req.clinicId, l.item_id, { exceptAdjustment: id })).find((x) => x.stock_in_item_id === l.stock_in_item_id);
      if (b && Number(b.available) < -0.00005) throw badRequest(`Batch ${b.batch_no || '—'} has been sold since – this Adjustment cannot be deleted`, 'VALIDATION');
    }
    await applyLines(q, req.clinicId, req.user.id, id, adj.adj_no, old, [], `Adjustment ${adj.adj_no} deleted`);
    await q('DELETE FROM stock_adjustments WHERE id = ?', [id]);
  });
  res.json({ ok: true });
});

export default router;
