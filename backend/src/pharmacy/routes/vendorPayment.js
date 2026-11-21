// Pharmacy → Vendor → Payments: pay a vendor against one Stock In (its invoice). Amounts follow the Vendor
// Payments report: Total = Σ paid qty × Cur.Rate + the order line's GST; Returns = the Returns made from it
// (+ GST); Balance = Total − Returns − Paid. A payment can't be more than the balance or dated before the
// invoice. Cash needs no Reference No; every other mode does. Only an Admin may delete a payment.
import { Router } from '../../lib/mini-express.js';
import { query, tx, insertRow } from '../../config/db.js';
import { clinicScope } from '../../middleware/access.js';
import { badRequest, forbidden, notFound, toAmount, toId } from '../../utils/http.js';
import { isISODate, todayISO } from '../../utils/dates.js';
import { nextSequence, formatVendorPaymentNo } from '../../utils/codes.js';
import { isAdmin } from '../../utils/stock.js';

const router = Router();
router.use(clinicScope());   // read / write access: pharmacy/index.js

export const PAY_MODES = ['cash', 'upi', 'bank', 'cheque', 'card'];
const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;

// One row per Stock In of the clinic with its Total, Returns and Paid
export const INVOICES = `
  SELECT si.id AS stock_in_id, si.si_no, si.bill_no, si.si_date, si.supplier_id, s.name AS supplier_name, po.po_no,
         COALESCE((SELECT SUM(ROUND(l.qty * l.rate, 2) + ROUND(l.qty * l.rate * COALESCE(p.gst_percent, 0) / 100, 2))
                     FROM stock_in_items l LEFT JOIN purchase_order_items p ON p.id = l.po_item_id
                    WHERE l.stock_in_id = si.id), 0) AS total,
         COALESCE((SELECT SUM(ri.amount + ROUND(ri.amount * COALESCE(p.gst_percent, 0) / 100, 2))
                     FROM purchase_returns r JOIN purchase_return_items ri ON ri.return_id = r.id
                     JOIN stock_in_items l ON l.id = ri.stock_in_item_id LEFT JOIN purchase_order_items p ON p.id = l.po_item_id
                    WHERE r.stock_in_id = si.id), 0) AS returns,
         COALESCE((SELECT SUM(vp.amount) FROM vendor_payments vp WHERE vp.stock_in_id = si.id), 0) AS paid
    FROM stock_ins si JOIN suppliers s ON s.id = si.supplier_id JOIN purchase_orders po ON po.id = si.po_id
   WHERE si.clinic_id = ?`;
export const withBalance = (r) => {
  const net = r2(Number(r.total) - Number(r.returns));
  return { ...r, total: r2(r.total), returns: r2(r.returns), paid: r2(r.paid), net_payable: net, balance: r2(net - Number(r.paid)) };
};

const invoice = async (q, clinicId, siId) => {
  const [row] = await q(`SELECT * FROM (${INVOICES}) i WHERE i.stock_in_id = ?`, [clinicId, siId]);
  return row ? withBalance(row) : null;
};

// GET /api/pharmacy/vendor-bill-payments/invoices?supplier_id=&all=1 – invoices newest first; without all=1
// only those with a balance left
router.get('/invoices', async (req, res) => {
  const params = [req.clinicId];
  let where = '';
  if (req.query.supplier_id) { where = ' WHERE i.supplier_id = ?'; params.push(toId(req.query.supplier_id, 'vendor')); }
  const rows = (await query(`SELECT * FROM (${INVOICES}) i${where} ORDER BY i.si_date DESC, i.stock_in_id DESC`, params)).map(withBalance);
  res.json({ rows: req.query.all === '1' ? rows : rows.filter((x) => x.balance > 0) });
});

// GET /api/pharmacy/vendor-bill-payments/invoices/:stockInId – one invoice with its items, returns and payments
router.get('/invoices/:stockInId', async (req, res) => {
  const id = toId(req.params.stockInId);
  const inv = await invoice(query, req.clinicId, id);
  if (!inv) throw notFound('Invoice');
  inv.items = (await query(
    `SELECT l.id, l.item_name, l.batch_no, l.exp_date, l.qty, l.free_qty, l.rate, l.mrp, COALESCE(p.gst_percent, 0) AS gst_percent,
            ROUND(l.qty * l.rate, 2) AS amount
       FROM stock_in_items l LEFT JOIN purchase_order_items p ON p.id = l.po_item_id WHERE l.stock_in_id = ? ORDER BY l.id`, [id],
  )).map((l) => {
    const gst = r2((Number(l.amount) * Number(l.gst_percent)) / 100);
    return { ...l, gst, line_total: r2(Number(l.amount) + gst) };
  });
  inv.return_docs = await query('SELECT id, return_no, return_date, total_amount FROM purchase_returns WHERE stock_in_id = ? ORDER BY return_date, id', [id]);
  inv.payments = await query(
    `SELECT vp.id, vp.vp_no, vp.pay_date, vp.amount, vp.pay_mode, vp.reference_no, vp.notes, e.name AS created_by_name
       FROM vendor_payments vp LEFT JOIN employees e ON e.id = vp.created_by WHERE vp.stock_in_id = ? ORDER BY vp.pay_date, vp.id`, [id],
  );
  res.json(inv);
});

// POST /api/pharmacy/vendor-bill-payments { stock_in_id, pay_date, amount, pay_mode, reference_no?, notes? }
router.post('/', async (req, res) => {
  const b = req.body || {};
  const siId = toId(b.stock_in_id, 'Invoice No');
  const payDate = b.pay_date || todayISO();
  if (!isISODate(payDate)) throw badRequest('Enter the payment date', 'VALIDATION');
  if (payDate > todayISO()) throw badRequest('Payment date cannot be in the future', 'VALIDATION');
  const amount = r2(toAmount(b.amount, 'Amount'));
  if (!(amount > 0)) throw badRequest('Amount must be more than 0', 'VALIDATION');
  const mode = String(b.pay_mode || '');
  if (!PAY_MODES.includes(mode)) throw badRequest('Choose the payment mode', 'VALIDATION');
  const ref = String(b.reference_no ?? '').trim().slice(0, 50) || null;
  if (mode !== 'cash' && !ref) throw badRequest('Enter the Reference No (UTR / cheque / card)', 'VALIDATION');
  const notes = String(b.notes ?? '').trim().slice(0, 300) || null;

  const result = await tx(async (q) => {
    // one payment at a time per clinic, so two can't both use the same balance
    await q(`EXEC sp_getapplock @Resource = ?, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 15000`,
      [`vendor-payment-${req.clinicId}`]);
    const inv = await invoice(q, req.clinicId, siId);
    if (!inv) throw notFound('Invoice');
    if (payDate < new Date(inv.si_date).toISOString().slice(0, 10)) throw badRequest('Payment date cannot be before the invoice date', 'VALIDATION');
    if (amount > inv.balance) throw badRequest(`Amount is more than the balance ${inv.balance.toFixed(2)}`, 'VALIDATION');
    const [clinic] = await q('SELECT code FROM clinics WHERE id = ?', [req.clinicId]);
    const vpNo = formatVendorPaymentNo(clinic.code, await nextSequence(q, req.clinicId, 'vendor_payment'));
    const id = await insertRow(q, 'vendor_payments', {
      clinic_id: req.clinicId, vp_no: vpNo, supplier_id: inv.supplier_id, stock_in_id: siId, pay_date: payDate,
      amount, pay_mode: mode, reference_no: ref, notes, created_by: req.user.id,
    });
    return { id, vp_no: vpNo, balance: r2(inv.balance - amount) };
  });
  res.status(201).json(result);
});

// DELETE /api/pharmacy/vendor-bill-payments/:id – Admin only
router.delete('/:id', async (req, res) => {
  if (!isAdmin(req.user)) throw forbidden('Only an Admin can delete a payment');
  const id = toId(req.params.id);
  const [vp] = await query('SELECT id FROM vendor_payments WHERE id = ? AND clinic_id = ?', [id, req.clinicId]);
  if (!vp) throw notFound('Payment');
  await query('DELETE FROM vendor_payments WHERE id = ?', [id]);
  res.json({ ok: true });
});

export default router;
