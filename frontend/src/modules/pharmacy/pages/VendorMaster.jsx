// Pharmacy → Vendor → Master: add / edit a vendor on its own screen
import { useEffect, useState } from 'react';
import { Store, Save, Trash2, X } from 'lucide-react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/i18n.jsx';
import { navigate } from '../../../lib/router.jsx';
import { isDigits, isEmail, isGstin, isPincode } from '../../../lib/validators.js';
import { CardHeader, ErrorBox, Spinner, GRID_SHORT, FORM_ACTIONS, useAsync, useForm, useToast } from '../../../components/ui.jsx';

// Indian states and union territories, for the State drop-down
const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
  'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

const EMPTY = {
  name: '', contact_person: '', address: '', state: '', pincode: '', phone: '', mobile: '', email: '',
  gstin: '', dl_no1: '', dl_no2: '', status: 'active',
};

export default function VendorForm({ params }) {
  const { t } = useT();
  const toast = useToast();
  const id = params.id;
  const f = useForm(EMPTY);
  const [saving, setSaving] = useState(false);
  const existing = useAsync(() => (id ? api(`/pharmacy/vendors/${id}`) : Promise.resolve(null)), [id]);

  useEffect(() => {
    const e = existing.data;
    if (e) f.setValues(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, e[k] ?? EMPTY[k]])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing.data]);

  const v = f.values;
  const upper = (k) => ({ value: v[k], onChange: (e) => f.set(k, e.target.value.toUpperCase()) });
  const digits = (k, max) => ({ value: v[k], onChange: (e) => f.set(k, e.target.value.replace(/\D/g, '').slice(0, max)) });

  // Same checks the server runs; the first problem or null.
  function validate() {
    if (!v.name.trim()) return t('common.isRequired', { field: t('suppliers.name') });
    if (!v.mobile.trim()) return t('common.isRequired', { field: t('suppliers.mobile') });
    if (!isDigits(v.mobile)) return t('common.digitsOnly', { field: t('suppliers.mobile') });
    if (!isDigits(v.phone)) return t('common.digitsOnly', { field: t('suppliers.phone') });
    if (!isPincode(v.pincode)) return t('common.nDigits', { field: t('suppliers.pincode'), n: 6 });
    if (!isGstin(v.gstin)) return t('suppliers.gstinLen');
    if (!isEmail(v.email)) return t('common.badEmail');
    if (!v.address.trim()) return t('common.isRequired', { field: t('field.address') });   // last, as it is on screen
    return null;
  }

  async function submit(e) {
    e.preventDefault();
    const problem = validate();
    if (problem) return toast(problem, 'error');
    setSaving(true);
    try {
      if (id) {
        await api(`/pharmacy/vendors/${id}`, { method: 'PUT', body: v });
        toast(t('common.updatedX', { x: t('menu.vendor') }));
        navigate('/pharmacy/vendor-list');
      } else {
        await api('/pharmacy/vendors', { method: 'POST', body: v });
        toast(t('common.savedX', { x: t('menu.vendor') }));
        f.setValues(EMPTY);                       // ready for the next vendor
      }
    } catch (err) {
      toast(err.message || t('common.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
    return undefined;
  }

  const cancel = () => (id ? navigate('/pharmacy/vendor-list') : f.setValues(EMPTY));

  if (id && existing.loading) return <div className="card"><Spinner /></div>;
  if (existing.error) return <div className="card"><ErrorBox error={existing.error} onRetry={existing.reload} /></div>;

  return (
    <div>
      <div className="card">
        <form onSubmit={submit} noValidate>
          <CardHeader icon={Store}
            title={id ? t('suppliers.editTitle') : t('suppliers.masterTitle')}
            subtitle={id ? t('suppliers.editSubtitle') : t('suppliers.masterSubtitle')} />

          {/* One grid as in Ayush All In One: 7 to a row on desktop, Address last and wide */}
          <div className={GRID_SHORT}>
            <div className="col-span-2 sm:col-span-1">
              <label className="label">{t('suppliers.name')} *</label>
              <input className="input" autoFocus maxLength={150} placeholder="e.g. Sri Murugan Medicals" {...f.bind('name')} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="label">{t('suppliers.contact')}</label>
              <input className="input" maxLength={150} placeholder="Person to contact" {...f.bind('contact_person')} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="label">{t('field.email')}</label>
              <input type="email" className="input" maxLength={150} placeholder="e.g. orders@vendor.com" {...f.bind('email')} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="label">{t('suppliers.state')}</label>
              <select className="input" {...f.bind('state')}>
                <option value="">Select state</option>
                {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{t('suppliers.pincode')}</label>
              <input className="input" inputMode="numeric" placeholder="6 digits" {...digits('pincode', 6)} />
            </div>
            <div>
              <label className="label">{t('suppliers.phone')}</label>
              <input className="input" type="tel" inputMode="numeric" maxLength={20} placeholder="Landline" {...f.bind('phone')} />
            </div>
            <div>
              <label className="label">{t('suppliers.mobile')} *</label>
              <input className="input" type="tel" inputMode="numeric" maxLength={20} placeholder="e.g. 98765 43210" {...f.bind('mobile')} />
            </div>
            <div>
              <label className="label">GSTIN</label>
              <input className="input" maxLength={15} placeholder="15 characters" {...upper('gstin')} />
            </div>
            <div>
              <label className="label">{t('suppliers.dl1')}</label>
              <input className="input" maxLength={50} placeholder="Drug licence 1" {...upper('dl_no1')} />
            </div>
            <div>
              <label className="label">{t('suppliers.dl2')}</label>
              <input className="input" maxLength={50} placeholder="Drug licence 2" {...upper('dl_no2')} />
            </div>
            <div>
              <label className="label">{t('field.status')}</label>
              <select className="input" {...f.bind('status')}>
                <option value="active">{t('status.active')}</option>
                <option value="inactive">{t('status.inactive')}</option>
              </select>
            </div>
            <div className="col-span-2 sm:col-span-4 lg:col-span-3">
              <label className="label">{t('field.address')} *</label>
              <textarea className="input" rows={2} maxLength={500} placeholder="Vendor address" {...f.bind('address')} />
            </div>
          </div>

          <div className={FORM_ACTIONS}>
            <button type="button" className="btn-secondary px-2 sm:px-4" onClick={cancel}><X size={16} /> {t('common.cancel')}</button>
            {/* vendors are never deleted (their purchases point to them); set Status to Inactive instead */}
            <button type="button" className="btn-danger px-2 sm:px-4" disabled title={t('common.inactiveHint')}>
              <Trash2 size={16} /> {t('common.delete')}
            </button>
            <button type="submit" className="btn-primary px-2 sm:px-4" disabled={saving}><Save size={16} /> {saving ? t('common.saving') : t('common.save')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
