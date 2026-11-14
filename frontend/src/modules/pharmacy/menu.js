// Pharmacy module menu: the sub-menus inside the top-bar "Pharmacy" group (each one is a column in the wide
// panel; a `submenu` inside a column opens in place). Labels are i18n keys; `icon` / `id` give a column its
// icon and colour (config/tones.js).
// Menu Access is per leaf `key` (pharmacy.*, shared/menuAccess.js) and stored in table menu_access:
// never rename or remove a key. Changing a label, the order or the nesting is fine. URLs (`to`) stay as they are.

// Shown under the main Reports menu in T-Ayush; this install has no Reports group, so menu.js adds these to
// the Pharmacy → Report column.
export const PHARMACY_REPORTS = [
  { key: 'pharmacy.all-in-one-report', label: 'menu.allInOne', to: '/pharmacy/all-in-one-report' },
];

// Daily pharmacy flow: Dashboard → Sales → Item → Vendor → Purchase / Order → Stock In → Return → Report
export const PHARMACY_MENU = [
  { key: 'pharmacy.dashboard', label: 'menu.pharmacyDashboard', to: '/pharmacy', id: 'pharmacyDash', icon: 'pill', column: 'menu.pharmacy' },
  {
    id: 'sales', label: 'menu.sales', icon: 'receipt',
    submenu: [
      { key: 'pharmacy.sales-billing', label: 'menu.salesDetails', to: '/pharmacy/sales-billing' },
      { key: 'pharmacy.sales-billing-list', label: 'menu.pharmacyList', to: '/pharmacy/sales-billing-list' },
      { key: 'pharmacy.dispense', label: 'menu.dispense', to: '/pharmacy/dispense' },   // medicines from a prescription
    ],
  },
  {
    id: 'item', label: 'menu.itemGroup', icon: 'box',
    submenu: [
      { key: 'pharmacy.item', label: 'menu.itemDetails', to: '/pharmacy/item' },
      { key: 'pharmacy.item-list', label: 'menu.pharmacyList', to: '/pharmacy/item-list' },
      { key: 'pharmacy.item-list-new', label: 'menu.bulkUpdate', to: '/pharmacy/item-bulk-update' },
    ],
  },
  {
    id: 'vendor', label: 'menu.vendor', icon: 'store',
    submenu: [
      { key: 'pharmacy.vendor-master', label: 'menu.vendorDetails', to: '/pharmacy/vendor-master' },
      { key: 'pharmacy.vendor-list', label: 'menu.pharmacyList', to: '/pharmacy/vendor-list' },
      { key: 'pharmacy.vendor-payment', label: 'menu.payments', to: '/pharmacy/vendor-payment' },
    ],
  },
  {
    id: 'purchase', label: 'menu.purchase', icon: 'cart',
    submenu: [
      { key: 'pharmacy.purchase-master', label: 'menu.purchaseOrderDetails', to: '/pharmacy/purchase-order' },
      { key: 'pharmacy.purchase-master-list', label: 'menu.pharmacyList', to: '/pharmacy/purchase-order-list' },
    ],
  },
  {
    id: 'stockin', label: 'menu.stockIn', icon: 'packagePlus',
    submenu: [
      { key: 'pharmacy.stock-inward', label: 'menu.stockInDetails', to: '/pharmacy/stock-in' },
      { key: 'pharmacy.stock-inward-list', label: 'menu.pharmacyList', to: '/pharmacy/stock-in-list' },
      { key: 'pharmacy.stock-ips', label: 'menu.threeInOne', to: '/pharmacy/stock-ips' },
      {
        label: 'menu.adjustment',
        submenu: [
          { key: 'pharmacy.stock-adjustment', label: 'menu.adjustmentEntry', to: '/pharmacy/stock-adjustment' },
          { key: 'pharmacy.stock-adjustment-list', label: 'menu.adjustmentList', to: '/pharmacy/stock-adjustment-list' },
        ],
      },
    ],
  },
  {
    id: 'return', label: 'menu.return', icon: 'undo',
    submenu: [
      {
        label: 'menu.salesReturn',
        submenu: [
          { key: 'pharmacy.sales-return', label: 'menu.salesReturnEntry', to: '/pharmacy/sales-return' },
          { key: 'pharmacy.sales-return-list', label: 'menu.salesReturnList', to: '/pharmacy/sales-return-list' },
        ],
      },
      {
        label: 'menu.purchaseReturn',
        submenu: [
          { key: 'pharmacy.purchase-return', label: 'menu.returnEntry', to: '/pharmacy/return' },
          { key: 'pharmacy.purchase-return-list', label: 'menu.returnList', to: '/pharmacy/return-list' },
        ],
      },
    ],
  },
  {
    id: 'report', label: 'menu.report', icon: 'chart',
    submenu: [
      { key: 'pharmacy.stock-report', label: 'menu.stockReport', to: '/pharmacy/stock-report' },
      { key: 'pharmacy.vendor-payments', label: 'menu.vendorPayments', to: '/pharmacy/vendor-payments' },
    ],
  },
];
