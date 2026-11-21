// Pharmacy → Vendor → Payments: pay a vendor against one Stock In (its invoice). Pick the vendor, then the
// invoice (those with a balance left; tick "Show paid" for all) – its Total, Returns, Paid and Balance show,
// with its items and earlier payments. Enter the Date, Amount (up to the balance), Mode and Reference No
// (needed for every mode except Cash). Only an Admin may delete a payment.
import { useState } from 'react';
import { Wallet, Save, Trash2, X } from 'lucide-react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/i18n.jsx';
import { useAuth } from '../../../lib/auth.jsx';
import { fmtDate, money, todayLocal } from '../../../lib/format.js';
import { CardHeader, ErrorBox, Spinner, EmptyState, FORM_ACTIONS, GRID_WIDE, RowAction, TH, TD, useAsync, useToast } from '../../../components/ui.jsx';
import VendorPicker from '../../../components/VendorPicker.jsx';

const MODES = ['cash', 'upi', 'bank', 'cheque', 'card'];
const EMPTY = () => ({ pay_date: todayLocal(), amount: '', pay_mode: 'cash', reference_no: '', notes: '' });

export default function VendorPaymentEntry() {
  const { t } = useT();
  const toast = useToast();
  const { isGlobal: isAdmin } = useAuth();
  const [supplierId, setSupplierId] = useState('');
  const [showPaid, setShowPaid] = useState(false);
  const [siId, setSiId] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const vendors = useAsync(() => api('/pharmacy/vendors', { query: { status: 'active' } }), []);
  const invoices = useAsync(
    () => (supplierId ? api('/pharmacy/vendor-bill-payments/invoices', { query: { supplier_id: supplierId, all: showPaid ? '1' : '' } }) : Promise.resolve({ rows: [] })),
    [supplierId, showPaid],
  );
  const inv = useAsync(() => (siId ? api(`/pharmacy/vendor-bill-payments/invoices/${siId}`) : Promise.resolve(null)), [siId]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const d = inv.data;

  function pickInvoice(id) {
    setSiId(id);
    const row = (invoices.data?.rows || []).find((r) => String(r.stock_in_id) === String(id));
    setForm({ ...EMPTY(), amount: row && row.balance > 0 ? row.balance.toFixed(2) : '' });
  }

  function validate() {
    if (!supplierId) return t('purchase.chooseVendor');
    if (!siId) return t('vpay.chooseInvoice');
    if (!form.pay_date) return t('common.isRequired', { field: t('purchase.date') });
    if (!(Number(form.amount) > 0)) return t('common.isRequired', { field: t('vpay.amount') });
    if (d && Number(form.amount) > d.balance) return t('vpay.overBalance', { n: money(d.balance) });
    if (form.pay_mode !== 'cash' && !form.reference_no.trim()) return t('common.isRequired', { field: t('vpay.referenceNo') });
    return null;
  }

  async function submit(e) {
    e.preventDefault();
    const problem = validate();
    if (problem) return toast(problem, 'error');
    setSaving(true);
    try {
      const r = await api('/pharmacy/vendor-bill-payments', { method: 'POST', body: { ...form, stock_in_id: siId } });
      toast(t('vpay.saved', { no: r.vp_no, balance: money(r.balance) }));
      setForm(EMPTY());
      inv.reload();
      invoices.reload();
    } catch (err) {
      toast(err.message || t('common.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
    return undefined;
  }

  async function remove(p) {
    if (!window.confirm(t('vpay.deleteConfirm', { no: p.vp_no }))) return;
    try {
      await api(`/pharmacy/vendor-bill-payments/${p.id}`, { method: 'DELETE' });
      toast(t('vpay.deleted', { no: p.vp_no }));
      inv.reload();
      invoices.reload();
    } catch (err) {
      toast(err.message || t('common.saveFailed'), 'error');
    }
  }

  const reset = () => { setSupplierId(''); setSiId(''); setForm(EMPTY()); };
  const options = invoices.data?.rows || [];
  const sums = d ? [
    [t('vp.stockInTotal'), d.total], [t('vp.returnTotal'), d.returns], [t('vp.payable'), d.net_payable],
    [t('vpay.paid'), d.paid], [t('vpay.balance'), d.balance, true],
  ] : [];

  return (
    <div className="card max-md:!px-3">
      <form onSubmit={submit} noValidate>
        <CardHeader icon={Wallet} title={t('vpay.title')} subtitle={<span className="hidden md:inline">{t('vpay.hint')}</span>} />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(14rem,2fr)_minmax(14rem,2fr)]">
          <VendorPicker label={t('purchase.vendor')} required vendors={vendors.data?.rows || []} value={supplierId}
            onPick={(v) => { setSupplierId(String(v.id)); setSiId(''); setForm(EMPTY()); }} />
          <div>
            <div className="flex items-end justify-between gap-2">
              <label className="label">{t('vpay.invoiceNo')} *</label>
              <label className="mb-1 flex items-center gap-1.5 text-12 text-ink-500">
                <input type="checkbox" checked={showPaid} onChange={(e) => setShowPaid(e.target.checked)} /> {t('vpay.showPaid')}
              </label>
            </div>
            <select className="input" disabled={!supplierId} value={siId} onChange={(e) => pickInvoice(e.target.value)}>
              <option value="">{!supplierId ? t('stockin.vendorFirst') : invoices.loading ? t('common.loading') : options.length ? '-' : t('vpay.noInvoices')}</option>
              {options.map((r) => (
                <option key={r.stock_in_id} value={r.stock_in_id}>{`${r.si_no}${r.bill_no ? ` · ${t('stockin.billNo', { no: r.bill_no })}` : ''} · ${fmtDate(r.si_date)} · ${t('vpay.balance')} ${money(r.balance)}`}</option>
              ))}
            </select>
          </div>
        </div>

        {siId && inv.loading && <Spinner />}
        {inv.error && <ErrorBox error={inv.error} onRetry={inv.reload} />}
        {d && (
          <>
            <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {sums.map(([label, value, strong]) => (
                <div key={label} className={`rounded-lg border px-3 py-1.5 ${strong ? 'border-brand-200 bg-brand-50' : 'border-ink-100 bg-ink-50/50'}`}>
                  <dt className="text-11 text-ink-500">{label}</dt>
                  <dd className={`text-sm font-bold tabular-nums ${strong ? 'text-brand-800' : 'text-ink-800'}`}>{money(value)}</dd>
                </div>
              ))}
            </dl>

            <p className="section-title mb-1.5 mt-4">{t('vpay.items')} <span className="font-normal text-ink-400">· {d.po_no}{d.bill_no ? ` · ${t('stockin.billNo', { no: d.bill_no })}` : ''}</span></p>
            <div className="overflow-x-auto rounded-lg">
              <table className="list-pinned pin-first w-full min-w-[720px] text-left text-13">
                <thead>
                  <tr className="table-head">
                    <th className={`${TH} rounded-l-lg`}>{t('items.name')}</th>
                    <th className={TH}>{t('stockin.batch')}</th>
                    <th className={`${TH} text-right`}>{t('sale.qty')}</th>
                    <th className={`${TH} text-right`}>{t('purchase.free')}</th>
                    <th className={`${TH} text-right`}>{t('purchase.rate')}</th>
                    <th className={`${TH} text-right`}>{t('purchase.amount')}</th>
                    <th className={`${TH} text-right`}>{t('purchase.gst')}</th>
                    <th className={`${TH} rounded-r-lg text-right`}>{t('purchase.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((l) => (
                    <tr key={l.id} className="table-row text-ink-500">
                      <td className={`${TD} font-medium text-ink-700`}>{l.item_name}</td>
                      <td className={TD}>{l.batch_no || '-'}</td>
                      <td className={`${TD} text-right tabular-nums`}>{Number(l.qty)}</td>
                      <td className={`${TD} text-right tabular-nums`}>{Number(l.free_qty) || '-'}</td>
                      <td className={`${TD} text-right tabular-nums`}>{Number(l.rate).toFixed(2)}</td>
                      <td className={`${TD} text-right tabular-nums`}>{money(l.amount)}</td>
                      <td className={`${TD} text-right tabular-nums`}>{Number(l.gst_percent)}</td>
                      <td className={`${TD} text-right font-semibold tabular-nums text-ink-700`}>{money(l.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="section-title mb-1.5 mt-4">{t('vpay.payments')}</p>
            {d.payments.length ? (
              <div className="overflow-x-auto rounded-lg">
                <table className="list-pinned pin-first w-full min-w-[720px] text-left text-13">
                  <thead>
                    <tr className="table-head">
                      <th className={`${TH} rounded-l-lg`}>{t('vpay.no')}</th>
                      <th className={TH}>{t('purchase.date')}</th>
                      <th className={TH}>{t('vpay.mode')}</th>
                      <th className={TH}>{t('vpay.referenceNo')}</th>
                      <th className={TH}>{t('vpay.notes')}</th>
                      <th className={`${TH} text-right`}>{t('vpay.amount')}</th>
                      <th className={`${TH} rounded-r-lg text-right`}>{t('common.delete')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.payments.map((p) => (
                      <tr key={p.id} className="table-row text-ink-500">
                        <td className={`${TD} font-medium text-ink-700`}>{p.vp_no}</td>
                        <td className={TD}>{fmtDate(p.pay_date)}</td>
                        <td className={TD}>{t(`vpay.mode_${p.pay_mode}`)}</td>
                        <td className={TD}>{p.reference_no || '-'}</td>
                        <td className={TD}>{p.notes || '-'}</td>
                        <td className={`${TD} text-right font-semibold tabular-nums text-ink-700`}>{money(p.amount)}</td>
                        <td className={`${TD} text-right`}>
                          <RowAction icon={Trash2} tone="danger" disabled={!isAdmin} title={isAdmin ? t('common.delete') : t('vpay.adminOnly')} onClick={() => remove(p)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState message={t('vpay.noPayments')} />}

            {d.balance > 0 && (
              <>
                <p className="section-title mb-1.5 mt-4">{t('vpay.newPayment')}</p>
                <div className={GRID_WIDE}>
                  <div>
                    <label className="label">{t('purchase.date')} *</label>
                    <input className="input" type="date" max={todayLocal()} value={form.pay_date} onChange={(e) => set('pay_date', e.target.value)} />
                  </div>
                  <div>
                    <label className="label">{t('vpay.amount')} *</label>
                    <input className="input no-spin text-right" type="number" inputMode="decimal" min="0" step="0.01" max={d.balance}
                      placeholder={`≤ ${d.balance.toFixed(2)}`} value={form.amount} onChange={(e) => set('amount', e.target.value)} />
                  </div>
                  <div>
                    <label className="label">{t('vpay.mode')} *</label>
                    <select className="input" value={form.pay_mode} onChange={(e) => set('pay_mode', e.target.value)}>
                      {MODES.map((m) => <option key={m} value={m}>{t(`vpay.mode_${m}`)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">{t('vpay.referenceNo')}{form.pay_mode !== 'cash' ? ' *' : ''}</label>
                    <input className="input uppercase" maxLength={50} value={form.reference_no} placeholder={t('vpay.referencePh')}
                      onChange={(e) => set('reference_no', e.target.value)} />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="label">{t('vpay.notes')}</label>
                  <input className="input" maxLength={300} value={form.notes} placeholder={t('vpay.notesPh')} onChange={(e) => set('notes', e.target.value)} />
                </div>
              </>
            )}
          </>
        )}

        <div className={FORM_ACTIONS}>
          <button type="button" className="btn-secondary px-2 sm:px-4" onClick={reset}><X size={16} /> {t('common.cancel')}</button>
          <button type="button" className="btn-danger px-2 sm:px-4" disabled title={t('vpay.deleteHint')}><Trash2 size={16} /> {t('common.delete')}</button>
          <button type="submit" className="btn-primary px-2 sm:px-4" disabled={saving || !d || d.balance <= 0}><Save size={16} /> {saving ? t('common.saving') : t('common.save')}</button>
        </div>
      </form>
    </div>
  );
}
