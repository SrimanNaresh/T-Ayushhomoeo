// Pharmacy → Vendor → List (New vendor / Edit open the Vendor Master screen, VendorForm.jsx)
import { Store } from 'lucide-react';
import { useT } from '../../../lib/i18n.jsx';
import CrudPage, { statusColumn } from '../../../components/CrudPage.jsx';

export default function SuppliersPage() {
  const { t } = useT();
  return (
    <CrudPage
      icon={Store}
      title={t('suppliers.listTitle')}
      subtitle={t('suppliers.listSubtitle')}
      endpoint="/pharmacy/vendor-list"
      addLabel={t('suppliers.newVendor')}
      addPath="/pharmacy/vendor-master"
      editPath={(r) => `/pharmacy/vendor-master/${r.id}`}
      fields={[]}
      columns={[
        { key: 'name', label: t('suppliers.name') },
        { key: 'contact_person', label: t('suppliers.contact') },
        { key: 'mobile', label: t('suppliers.mobile') },
        { key: 'state', label: t('suppliers.state') },
        { key: 'gstin', label: 'GSTIN' },
        statusColumn(t),
      ]}
    />
  );
}
