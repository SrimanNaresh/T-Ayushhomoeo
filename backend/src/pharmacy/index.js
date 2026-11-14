// Pharmacy module router, mounted at /api/pharmacy.
//
// Access (Menu Access, shared/menuAccess.js):
//  - Saving (POST / PUT / PATCH / DELETE) needs Admin, or Full Menu Access on one of the pages that save
//    through that API.
//  - Reading needs the permission the API needed before (role defaults + Menu Permission changes), or at least
//    View on one of the pages that read through it – so a page opened in View can load its data.
// Admin-only rules inside the routes (deletes, item import, Stock In edit) are unchanged.
import { Router } from '../lib/mini-express.js';
import { forbidden } from '../utils/http.js';
import { userCan } from '../../../shared/permissions.js';
import { hasAccess } from '../../../shared/menuAccess.js';
import itemMasterRoutes from './routes/itemMaster.js';
import vendorRoutes from './routes/vendor.js';
import purchaseOrderRoutes from './routes/purchaseOrder.js';
import stockInRoutes from './routes/stockIn.js';
import stockReturnRoutes from './routes/stockReturn.js';
import stockAdjustmentRoutes from './routes/stockAdjustment.js';
import salesBillingRoutes from './routes/salesBilling.js';
import salesReturnRoutes from './routes/salesReturn.js';
import dispenseRoutes from './routes/dispense.js';
import vendorPaymentRoutes from './routes/vendorPayment.js';
import pharmacyReportRoutes from './routes/pharmacyReport.js';
import dashboardRoutes from './routes/dashboard.js';

const K = (...names) => names.map((n) => `pharmacy.${n}`);

/** GET: any of `perms` or View on `readKeys`; anything else: Full on `writeKeys` (Admins always pass). */
const access = ({ perms, readKeys, writeKeys = [] }) => (req, _res, next) => {
  if (req.method === 'GET') {
    if (perms.some((p) => userCan(req.user, p)) || hasAccess(req.user, [...readKeys, ...writeKeys], 'view')) return next();
    throw forbidden();
  }
  if (writeKeys.length && hasAccess(req.user, writeKeys, 'full')) return next();
  throw forbidden('Your login does not have Full access to save this');
};

const IPS = 'stock-ips';   // Three in One saves items, vendors' orders and the Stock In
const MOUNTS = [
  ['/item-master', itemMasterRoutes, {
    perms: ['item.view', 'item.manage', 'stock.manage', 'dispense'],
    readKeys: K('item-list', 'stock-report', 'stock-adjustment', 'sales-billing', 'dispense', 'purchase-master'),
    writeKeys: K('item', 'item-list-new', 'purchase-master', 'stock-inward', IPS),
  }],
  ['/vendors', vendorRoutes, {
    perms: ['supplier.manage', 'stock.manage'],
    readKeys: K('vendor-list', 'vendor-payment', 'vendor-payments', 'purchase-master-list', 'stock-inward', 'stock-inward-list', 'purchase-return', 'purchase-return-list'),
    writeKeys: K('vendor-master', 'purchase-master', IPS),
  }],
  ['/purchase-orders', purchaseOrderRoutes, {
    perms: ['stock.manage'],
    readKeys: K('purchase-master-list', 'stock-inward', 'stock-inward-list'),
    writeKeys: K('purchase-master', IPS),
  }],
  ['/stock-ins', stockInRoutes, {
    perms: ['stock.manage'],
    readKeys: K('stock-inward-list', 'purchase-return', 'purchase-return-list', 'vendor-payment', 'vendor-payments'),
    writeKeys: K('stock-inward', IPS),
  }],
  ['/stock-returns', stockReturnRoutes, {
    perms: ['stock.manage'], readKeys: K('purchase-return-list', 'vendor-payments'), writeKeys: K('purchase-return'),
  }],
  ['/stock-adjustments', stockAdjustmentRoutes, {
    perms: ['stock.manage'], readKeys: K('stock-adjustment-list'), writeKeys: K('stock-adjustment'),
  }],
  ['/sales-billings', salesBillingRoutes, {
    perms: ['dispense'], readKeys: K('sales-billing-list', 'sales-return', 'sales-return-list', 'dashboard'), writeKeys: K('sales-billing'),
  }],
  ['/sales-returns', salesReturnRoutes, {
    perms: ['dispense'], readKeys: K('sales-return-list'), writeKeys: K('sales-return'),
  }],
  ['/dispense', dispenseRoutes, {
    perms: ['dispense'], readKeys: [], writeKeys: K('dispense'),
  }],
  ['/vendor-bill-payments', vendorPaymentRoutes, {
    perms: ['stock.manage'], readKeys: K('vendor-payments'), writeKeys: K('vendor-payment'),
  }],
  ['/pharmacy-reports', pharmacyReportRoutes, {
    perms: ['stock.manage'], readKeys: K('vendor-payments', 'vendor-payment', 'all-in-one-report'),
  }],
  ['/dashboard', dashboardRoutes, {
    perms: ['dispense'], readKeys: K('dashboard'),
  }],
];

const router = Router();
for (const [path, routes, rule] of MOUNTS) router.use(path, access(rule), routes);

export default router;
