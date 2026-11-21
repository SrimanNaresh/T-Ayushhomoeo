// Pharmacy → Purchase / Order and Three in One: a vendor's details as text (saved on the order), and the inline
// "+ Add vendor" box opened from the Vendor Name list (as in Ayush All In One: Name, Address and Mobile).
import { useState } from 'react';
import { Save, Store, X } from 'lucide-react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/i18n.jsx';
import { useToast } from '../../../components/ui.jsx';

/** The vendor's details from the Vendor List, one per line: address, state – pin, phones, email, GSTIN, DL No */
export function vendorDetails(v, t) {
  if (!v) return '';
  const place = [v.state, v.pincode].filter(Boolean).join(' – ');
  const phones = [v.phone && `${t('suppliers.phone')}: ${v.phone}`, v.mobile && `${t('suppliers.mobile')}: ${v.mobile}`].filter(Boolean).join(', ');
  const dl = [v.dl_no1, v.dl_no2].filter(Boolean).join(', ');
  return [
    v.address, place, phones,
    v.email && `${t('field.email')}: ${v.email}`,
    v.gstin && `GSTIN: ${v.gstin}`,
    dl && `DL No: ${dl}`,
  ].filter(Boolean).join('\n');
}

/** vendor: { name, address, mobile } being typed (null = closed); onSaved(savedVendor) after it is added */
export default function NewVendorBox({ vendor, setVendor, onSaved }) {
  const { t } = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!vendor) return null;

  async function save() {
    const v = { name: vendor.name.trim(), address: vendor.address.trim(), mobile: vendor.mobile.trim() };
    if (!v.name || !v.address || !v.mobile) { toast(t('purchase.vendorNeeds'), 'error'); return; }
    setBusy(true);
    try {
      const saved = await api('/pharmacy/vendors', { method: 'POST', body: { ...v, status: 'active' } });
      toast(t('common.savedX', { x: t('menu.vendor') }));
      setVendor(null);
      onSaved(saved);
    } catch (err) {
      toast(err.message || t('common.saveFailed'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-13 font-bold text-amber-800"><Store size={15} /> {t('suppliers.newVendor')}</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1.5fr_1fr_auto] md:items-end">
        <div>
          <label className="label">{t('suppliers.name')} *</label>
          <input className="input" autoFocus maxLength={150} placeholder="e.g. Sri Murugan Medicals" value={vendor.name} onChange={(e) => setVendor({ ...vendor, name: e.target.value })} />
        </div>
        <div>
          <label className="label">{t('field.address')} *</label>
          <textarea className="input" rows={1} maxLength={500} placeholder="Vendor address" value={vendor.address} onChange={(e) => setVendor({ ...vendor, address: e.target.value })} />
        </div>
        <div>
          <label className="label">{t('suppliers.mobile')} *</label>
          <input className="input" type="tel" inputMode="numeric" maxLength={20} placeholder="e.g. 98765 43210" value={vendor.mobile} onChange={(e) => setVendor({ ...vendor, mobile: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-2 md:flex">
          <button type="button" className="btn-secondary" onClick={() => setVendor(null)} disabled={busy}><X size={16} /> {t('common.cancel')}</button>
          <button type="button" className="btn-primary" onClick={save} disabled={busy}><Save size={16} /> {busy ? t('common.saving') : t('purchase.saveVendor')}</button>
        </div>
      </div>
    </div>
  );
}
