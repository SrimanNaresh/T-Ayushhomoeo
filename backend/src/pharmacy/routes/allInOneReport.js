// Pharmacy → Report → All in One: pick a screen, then the columns to show (and a date range for screens with a
// date). Each screen lists its columns here as SQL expressions, so only these can be asked for. A screen with
// item lines has `lines`: picking any line column gives one row per line (the document's columns repeat on
// each); otherwise one row per document. Column labels are i18n keys 'aio.<column key>' on the screen.
import { Router } from '../../lib/mini-express.js';
import { query } from '../../config/db.js';
import { badRequest } from '../../utils/http.js';
import { isISODate } from '../../utils/dates.js';

const router = Router();
const MAX_ROWS = 5000;
const SCHEDULE = `CASE WHEN i.schedule_h1 = 1 THEN 'H1' WHEN i.schedule_h = 1 THEN 'H' ELSE 'None' END`;

// Column: [key, sql, type]; type: text (default) | date | qty | money | percent
const SCREENS = {
  item: {
    from: 'items i', where: 'i.clinic_id = ?', order: 'i.name',
    columns: [
      ['item_code', 'i.item_code'], ['item_name', 'i.name'], ['generic_name', 'i.generic_name'], ['manufacturer', 'i.manufacturer'],
      ['category', 'i.category'], ['item_type', 'i.item_type'], ['unit', 'i.unit'], ['pack', 'i.pack'], ['hsn_code', 'i.hsn_code'],
      ['rack', 'i.rack'], ['box', 'i.box'], ['mrp', 'i.mrp', 'money'], ['sell_price', 'i.price', 'money'],
      ['purchase_rate', 'i.purchase_rate', 'money'], ['cgst', 'i.cgst_percent', 'percent'], ['sgst', 'i.sgst_percent', 'percent'],
      ['gst', 'i.gst_percent', 'percent'], ['schedule', SCHEDULE], ['status', 'i.status'], ['stock', 'i.stock_qty', 'qty'],
      ['reorder_level', 'i.reorder_level', 'qty'], ['stock_value', 'ROUND(i.stock_qty * i.price, 2)', 'money'],
    ],
  },
  vendor: {
    from: 'suppliers v', where: 'v.clinic_id = ?', order: 'v.name',
    columns: [
      ['vendor', 'v.name'], ['contact_person', 'v.contact_person'], ['mobile', 'v.mobile'], ['phone', 'v.phone'], ['email', 'v.email'],
      ['address', 'v.address'], ['state', 'v.state'], ['pincode', 'v.pincode'], ['gstin', 'v.gstin'], ['dl_no1', 'v.dl_no1'],
      ['dl_no2', 'v.dl_no2'], ['status', 'v.status'],
    ],
  },
  purchase_order: {
    from: 'purchase_orders h JOIN suppliers v ON v.id = h.supplier_id', where: 'h.clinic_id = ?', date: 'h.po_date', order: 'h.po_date DESC, h.id DESC',
    columns: [['po_no', 'h.po_no'], ['date', 'h.po_date', 'date'], ['vendor', 'v.name'], ['details', 'h.details'], ['doc_total', 'h.total_amount', 'money']],
    lines: {
      join: 'JOIN purchase_order_items l ON l.po_id = h.id', order: 'l.id',
      columns: [
        ['item_name', 'l.item_name'], ['generic_name', 'l.generic_name'], ['manufacturer', 'l.manufacturer'], ['hsn_code', 'l.hsn_code'],
        ['category', 'l.category'], ['pack', 'l.pack'], ['mrp', 'l.mrp', 'money'], ['p_rate', 'l.p_rate', 'money'],
        ['disc', 'l.disc_percent', 'percent'], ['rate', 'l.rate', 'money'], ['qty', 'l.qty', 'qty'], ['free', 'l.free_qty', 'qty'],
        ['amount', 'l.amount', 'money'], ['gst', 'l.gst_percent', 'percent'], ['gst_amount', 'l.gst_amount', 'money'], ['line_total', 'l.total', 'money'],
      ],
    },
  },
  stock_in: {
    from: 'stock_ins h JOIN suppliers v ON v.id = h.supplier_id JOIN purchase_orders po ON po.id = h.po_id',
    where: 'h.clinic_id = ?', date: 'h.si_date', order: 'h.si_date DESC, h.id DESC',
    columns: [['si_no', 'h.si_no'], ['date', 'h.si_date', 'date'], ['vendor', 'v.name'], ['po_no', 'po.po_no']],
    lines: {
      join: 'JOIN stock_in_items l ON l.stock_in_id = h.id', order: 'l.id',
      columns: [
        ['item_name', 'l.item_name'], ['batch_no', 'l.batch_no'], ['mfg_date', 'l.mfg_date', 'date'], ['exp_date', 'l.exp_date', 'date'],
        ['qty', 'l.qty', 'qty'], ['free', 'l.free_qty', 'qty'], ['rate', 'l.rate', 'money'], ['mrp', 'l.mrp', 'money'],
        ['s_disc', 'l.disc_percent', 'percent'], ['sel_amount', 'l.sel_amount', 'money'], ['amount', 'ROUND(l.qty * l.rate, 2)', 'money'],
      ],
    },
  },
  purchase_return: {
    from: 'purchase_returns h JOIN suppliers v ON v.id = h.supplier_id JOIN stock_ins si ON si.id = h.stock_in_id',
    where: 'h.clinic_id = ?', date: 'h.return_date', order: 'h.return_date DESC, h.id DESC',
    columns: [['return_no', 'h.return_no'], ['date', 'h.return_date', 'date'], ['vendor', 'v.name'], ['si_no', 'si.si_no'], ['doc_total', 'h.total_amount', 'money']],
    lines: {
      join: 'JOIN purchase_return_items l ON l.return_id = h.id', order: 'l.id',
      columns: [['item_name', 'l.item_name'], ['batch_no', 'l.batch_no'], ['exp_date', 'l.exp_date', 'date'], ['qty', 'l.qty', 'qty'],
        ['rate', 'l.rate', 'money'], ['amount', 'l.amount', 'money']],
    },
  },
  sale: {
    from: 'sales h', where: 'h.clinic_id = ?', date: 'h.sale_date', order: 'h.sale_date DESC, h.id DESC',
    columns: [['sale_no', 'h.sale_no'], ['date', 'h.sale_date', 'date'], ['customer', 'h.customer_name'], ['mobile', 'h.mobile'],
      ['sub_total', 'h.sub_total', 'money'], ['bill_disc', 'h.disc_percent', 'percent'], ['discount', 'h.discount_amount', 'money'],
      ['doc_total', 'h.total_amount', 'money']],
    lines: {
      join: 'JOIN sale_items l ON l.sale_id = h.id', order: 'l.id',
      columns: [['item_name', 'l.item_name'], ['batch_no', 'l.batch_no'], ['exp_date', 'l.exp_date', 'date'], ['sell_by', 'l.sale_unit'],
        ['qty', 'COALESCE(l.unit_qty, l.qty)', 'qty'], ['price', 'l.price', 'money'], ['disc', 'l.disc_percent', 'percent'], ['amount', 'l.amount', 'money']],
    },
  },
  sales_return: {
    from: 'sales_returns h JOIN sales s ON s.id = h.sale_id', where: 'h.clinic_id = ?', date: 'h.return_date', order: 'h.return_date DESC, h.id DESC',
    columns: [['return_no', 'h.sr_no'], ['date', 'h.return_date', 'date'], ['sale_no', 's.sale_no'], ['customer', 's.customer_name'],
      ['mobile', 's.mobile'], ['reason', 'h.reason'], ['doc_total', 'h.total_amount', 'money']],
    lines: {
      join: 'JOIN sales_return_items l ON l.sr_id = h.id', order: 'l.id',
      columns: [['item_name', 'l.item_name'], ['batch_no', 'l.batch_no'], ['sell_by', 'l.sale_unit'], ['qty', 'l.unit_qty', 'qty'],
        ['price', 'l.price', 'money'], ['disc', 'l.disc_percent', 'percent'], ['amount', 'l.amount', 'money']],
    },
  },
  adjustment: {
    from: 'stock_adjustments h', where: 'h.clinic_id = ?', date: 'h.adj_date', order: 'h.adj_date DESC, h.id DESC',
    columns: [['adj_no', 'h.adj_no'], ['date', 'h.adj_date', 'date'], ['reason', 'h.remarks'], ['in_total', 'h.in_total', 'money'], ['out_total', 'h.out_total', 'money']],
    lines: {
      join: 'JOIN stock_adjustment_items l ON l.adjustment_id = h.id', order: 'l.id',
      columns: [['item_name', 'l.item_name'], ['batch_no', 'l.batch_no'], ['exp_date', 'l.exp_date', 'date'], ['in_qty', 'l.in_qty', 'qty'],
        ['out_qty', 'l.out_qty', 'qty'], ['rate', 'l.rate', 'money'], ['amount', 'l.amount', 'money']],
    },
  },
  vendor_payment: {
    from: 'vendor_payments h JOIN suppliers v ON v.id = h.supplier_id JOIN stock_ins si ON si.id = h.stock_in_id',
    where: 'h.clinic_id = ?', date: 'h.pay_date', order: 'h.pay_date DESC, h.id DESC',
    columns: [['vp_no', 'h.vp_no'], ['date', 'h.pay_date', 'date'], ['vendor', 'v.name'], ['si_no', 'si.si_no'], ['pay_mode', 'h.pay_mode'],
      ['reference_no', 'h.reference_no'], ['notes', 'h.notes'], ['paid', 'h.amount', 'money']],
  },
};

const colOut = (line) => ([key, , type = 'text']) => ({ key, type, line });

// GET /api/pharmacy/pharmacy-reports/all-in-one/screens – every screen with its columns
router.get('/screens', (_req, res) => {
  res.json(Object.entries(SCREENS).map(([key, s]) => ({
    key, has_date: !!s.date,
    columns: [...s.columns.map(colOut(false)), ...(s.lines ? s.lines.columns.map(colOut(true)) : [])],
  })));
});

// GET /api/pharmacy/pharmacy-reports/all-in-one?screen=&columns=a,b&from=&to=
router.get('/', async (req, res) => {
  const s = SCREENS[req.query.screen];
  if (!s) throw badRequest('Choose a screen', 'VALIDATION');
  const wanted = String(req.query.columns || '').split(',').filter(Boolean);
  const head = new Map(s.columns.map((c) => [c[0], c]));
  const line = new Map((s.lines?.columns || []).map((c) => [c[0], c]));
  // a key on both (e.g. Item Name) is the line's; the document's own columns come first
  const picked = wanted.map((k) => (line.has(k) ? [line.get(k), true] : head.has(k) ? [head.get(k), false] : null)).filter(Boolean);
  if (!picked.length) throw badRequest('Pick at least one column', 'VALIDATION');
  const byLine = picked.some(([, isLine]) => isLine);

  const where = [s.where];
  const params = [req.clinicId];
  if (s.date && isISODate(req.query.from)) { where.push(`${s.date} >= ?`); params.push(req.query.from); }
  if (s.date && isISODate(req.query.to)) { where.push(`${s.date} <= ?`); params.push(req.query.to); }
  const select = picked.map(([[key, sql]], n) => `${sql} AS c${n}`).join(', ');
  const rows = await query(
    `SELECT TOP ${MAX_ROWS + 1} ${select} FROM ${s.from} ${byLine ? s.lines.join : ''}
      WHERE ${where.join(' AND ')} ORDER BY ${s.order}${byLine ? `, ${s.lines.order}` : ''}`,
    params,
  );
  res.json({
    columns: picked.map(([[key, , type = 'text'], isLine]) => ({ key, type, line: isLine })),
    grain: byLine ? 'line' : 'document',
    truncated: rows.length > MAX_ROWS,
    rows: rows.slice(0, MAX_ROWS).map((r) => picked.map((_, n) => r[`c${n}`])),
  });
});

export default router;
