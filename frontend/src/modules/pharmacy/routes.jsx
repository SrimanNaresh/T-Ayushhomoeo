// Pharmacy module routes: every /pharmacy/* page with its Menu Access key (shared/menuAccess.js). An edit page
// uses the key of its entry page. App.jsx shows a page when the user has at least View on its key; with View
// only, saving is refused by the server and the page shows a note.
import PharmacyDashboard from './pages/PharmacyDashboard.jsx';
import SalesBilling from './pages/SalesBilling.jsx';
import SalesBillingList from './pages/SalesBillingList.jsx';
import Dispense from './pages/Dispense.jsx';
import ItemMaster from './pages/ItemMaster.jsx';
import ItemListPage from './pages/ItemListPage.jsx';
import ItemBulkUpdate from './pages/ItemBulkUpdate.jsx';
import VendorMaster from './pages/VendorMaster.jsx';
import VendorList from './pages/VendorList.jsx';
import VendorPaymentEntry from './pages/VendorPaymentEntry.jsx';
import PurchaseOrder from './pages/PurchaseOrder.jsx';
import PurchaseOrderList from './pages/PurchaseOrderList.jsx';
import StockIn from './pages/StockIn.jsx';
import StockInList from './pages/StockInList.jsx';
import StockIps from './pages/StockIps.jsx';
import StockAdjustment from './pages/StockAdjustment.jsx';
import StockAdjustmentList from './pages/StockAdjustmentList.jsx';
import SalesReturnMaster from './pages/SalesReturnMaster.jsx';
import SalesReturnList from './pages/SalesReturnList.jsx';
import StockReturnMaster from './pages/StockReturnMaster.jsx';
import StockReturnList from './pages/StockReturnList.jsx';
import StockReport from './pages/StockReport.jsx';
import VendorPayments from './pages/VendorPayments.jsx';
import AllInOneReport from './pages/AllInOneReport.jsx';

const P = (path, key, el) => ({ path, key: `pharmacy.${key}`, el, branch: true });

export const PHARMACY_ROUTES = [
  P('/pharmacy', 'dashboard', PharmacyDashboard),
  P('/pharmacy/sales-billing', 'sales-billing', SalesBilling),
  P('/pharmacy/sales-billing/:id', 'sales-billing', SalesBilling),
  P('/pharmacy/sales-billing-list', 'sales-billing-list', SalesBillingList),
  P('/pharmacy/dispense', 'dispense', Dispense),
  P('/pharmacy/dispense/:visitId', 'dispense', Dispense),
  P('/pharmacy/item', 'item', ItemMaster),
  P('/pharmacy/item/:id', 'item', ItemMaster),
  P('/pharmacy/item-list', 'item-list', ItemListPage),
  P('/pharmacy/item-bulk-update', 'item-list-new', ItemBulkUpdate),
  P('/pharmacy/vendor-master', 'vendor-master', VendorMaster),
  P('/pharmacy/vendor-master/:id', 'vendor-master', VendorMaster),
  P('/pharmacy/vendor-list', 'vendor-list', VendorList),
  P('/pharmacy/vendor-payment', 'vendor-payment', VendorPaymentEntry),
  P('/pharmacy/purchase-order', 'purchase-master', PurchaseOrder),
  P('/pharmacy/purchase-order/:id', 'purchase-master', PurchaseOrder),
  P('/pharmacy/purchase-order-list', 'purchase-master-list', PurchaseOrderList),
  P('/pharmacy/stock-in', 'stock-inward', StockIn),
  P('/pharmacy/stock-in/:id', 'stock-inward', StockIn),
  P('/pharmacy/stock-in-list', 'stock-inward-list', StockInList),
  P('/pharmacy/stock-ips', 'stock-ips', StockIps),
  P('/pharmacy/stock-ips/:id', 'stock-ips', StockIps),
  P('/pharmacy/stock-adjustment', 'stock-adjustment', StockAdjustment),
  P('/pharmacy/stock-adjustment/:id', 'stock-adjustment', StockAdjustment),
  P('/pharmacy/stock-adjustment-list', 'stock-adjustment-list', StockAdjustmentList),
  P('/pharmacy/sales-return', 'sales-return', SalesReturnMaster),
  P('/pharmacy/sales-return/:id', 'sales-return', SalesReturnMaster),
  P('/pharmacy/sales-return-list', 'sales-return-list', SalesReturnList),
  P('/pharmacy/return', 'purchase-return', StockReturnMaster),
  P('/pharmacy/return/:id', 'purchase-return', StockReturnMaster),
  P('/pharmacy/return-list', 'purchase-return-list', StockReturnList),
  P('/pharmacy/stock-report', 'stock-report', StockReport),
  P('/pharmacy/vendor-payments', 'vendor-payments', VendorPayments),
  P('/pharmacy/all-in-one-report', 'all-in-one-report', AllInOneReport),
];

// Links saved before the pharmacy moved under /pharmacy (bookmarks, the PWA) open the same page there.
const OLD = [
  [/^\/items\/(\d+)\/edit$/, '/pharmacy/item/$1'], [/^\/items\/new$/, '/pharmacy/item'],
  [/^\/items\/bulk$/, '/pharmacy/item-bulk-update'], [/^\/items$/, '/pharmacy/item-list'],
  [/^\/suppliers\/(\d+)\/edit$/, '/pharmacy/vendor-master/$1'], [/^\/suppliers\/new$/, '/pharmacy/vendor-master'],
  [/^\/suppliers$/, '/pharmacy/vendor-list'],
  [/^\/purchase\/(\d+)\/edit$/, '/pharmacy/purchase-order/$1'], [/^\/purchase\/new$/, '/pharmacy/purchase-order'],
  [/^\/purchase$/, '/pharmacy/purchase-order-list'],
  [/^\/stock-in\/(\d+)\/edit$/, '/pharmacy/stock-in/$1'], [/^\/stock-in\/new$/, '/pharmacy/stock-in'],
  [/^\/stock-in$/, '/pharmacy/stock-in-list'], [/^\/stock-ips$/, '/pharmacy/stock-ips'],
  [/^\/stock-adjustments\/(\d+)\/edit$/, '/pharmacy/stock-adjustment/$1'], [/^\/stock-adjustments\/new$/, '/pharmacy/stock-adjustment'],
  [/^\/stock-adjustments$/, '/pharmacy/stock-adjustment-list'],
  [/^\/returns\/(\d+)\/edit$/, '/pharmacy/return/$1'], [/^\/returns\/new$/, '/pharmacy/return'], [/^\/returns$/, '/pharmacy/return-list'],
  [/^\/sales-returns\/(\d+)\/edit$/, '/pharmacy/sales-return/$1'], [/^\/sales-returns\/new$/, '/pharmacy/sales-return'],
  [/^\/sales-returns$/, '/pharmacy/sales-return-list'],
  [/^\/sales\/(\d+)\/edit$/, '/pharmacy/sales-billing/$1'], [/^\/sales\/new$/, '/pharmacy/sales-billing'],
  [/^\/sales$/, '/pharmacy/sales-billing-list'],
  [/^\/dispense\/(\d+)$/, '/pharmacy/dispense/$1'], [/^\/dispense$/, '/pharmacy/dispense'],
  [/^\/reports\/stock$/, '/pharmacy/stock-report'], [/^\/reports\/vendor-payments$/, '/pharmacy/vendor-payments'],
];

/** The /pharmacy URL for an old pharmacy URL, or null */
export function pharmacyRedirect(path) {
  for (const [re, to] of OLD) if (re.test(path)) return path.replace(re, to);
  return null;
}
