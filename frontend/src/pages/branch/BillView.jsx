// Printable bill (A5). "Print / PDF" uses the browser print dialog (choose "Save as PDF").
import { useState } from 'react';
import { Ban } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useT } from '../../lib/i18n.jsx';
import { navigate } from '../../lib/router.jsx';
import { ageLabel, fmtDate, genderLabel, money } from '../../lib/format.js';
import { ErrorBox, Spinner, StatusBadge, useAsync, useToast } from '../../components/ui.jsx';
import { Doc, DocHead, DocMeta, DOC_TABLE, PrintBar } from '../../components/PrintDoc.jsx';

export default function BillView({ params }) {
  const { t } = useT();
  const auth = useAuth();
  const toast = useToast();
  const { data: b, error, loading, reload } = useAsync(() => api(`/bills/${params.id}`), [params.id]);
  const [busy, setBusy] = useState(false);

  async function cancelBill() {
    const reason = window.prompt(t('billing.cancelReason'));
    if (reason === null) return;
    setBusy(true);
    try {
      await api(`/bills/${b.id}/cancel`, { method: 'POST', body: { reason } });
      toast(t('billing.cancelled'));
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading && !b) return <div className="card"><Spinner /></div>;
  if (error) return <div className="card"><ErrorBox error={error} onRetry={reload} /></div>;
  const row = (label, value, strong) => (
    <div className={`flex justify-between gap-3 ${strong ? 'my-1 border-y border-ink-800 py-1.5 text-base font-extrabold' : ''}`}><span>{label}</span><span className="tabular-nums">{value}</span></div>
  );

  return (
    <>
      <PrintBar onBack={() => navigate(auth.can('bill.view') ? '/bills' : '/billing')}>
        {auth.can('bill.cancel') && b.status !== 'cancelled' && (
          <button type="button" className="btn-danger" onClick={cancelBill} disabled={busy}><Ban size={16} /> {t('billing.cancelBill')}</button>
        )}
      </PrintBar>

      <Doc>
        <DocHead name={b.clinic_name} address={b.clinic_address} city={b.clinic_city} phone={b.clinic_phone} brand="Ayush Pro" />
        <DocMeta
          left={[t('billing.billTo'), b.patient_name, `${b.patient_code} · ${genderLabel(b.gender, t)} / ${ageLabel(b)}`, b.mobile]}
          right={[t('billing.billNo'), b.bill_no, fmtDate(b.bill_date, true), b.doctor_name && `${t('menu.doctor')}: ${b.doctor_name}`, <span key="s" className="no-print"><StatusBadge status={b.status} /></span>]} />
        {b.status === 'cancelled' && (
          <div className="mb-3 border-2 border-red-600 p-1.5 text-center font-extrabold uppercase tracking-[2px] text-red-600">{t('status.cancelled')}</div>
        )}
        <table className={DOC_TABLE}>
          <thead>
            <tr><th>#</th><th>{t('billing.description')}</th><th className="!text-right">{t('examine.qty')}</th><th className="!text-right">{t('billing.rate')}</th><th className="!text-right">{t('dispense.amount')}</th></tr>
          </thead>
          <tbody>
            {b.items.map((it, i) => (
              <tr key={it.id}>
                <td>{i + 1}</td>
                <td>{it.line_type === 'consultation' ? t('billing.consultation') : it.description}</td>
                <td className="text-right tabular-nums">{it.qty}</td>
                <td className="text-right tabular-nums">{money(it.rate)}</td>
                <td className="text-right tabular-nums">{money(it.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ml-auto mt-4 flex max-w-xs flex-col gap-1">
          {b.consultation_fee > 0 && row(t('billing.consultation'), money(b.consultation_fee))}
          {b.items_total > 0 && row(t('billing.medicines'), money(b.items_total))}
          {b.other_total > 0 && row(t('billing.others'), money(b.other_total))}
          {b.discount > 0 && row(t('billing.discount'), `− ${money(b.discount)}`)}
          {row(t('billing.net'), money(b.net_amount), true)}
          {row(`${t('billing.paid')} (${t(`billing.mode_${b.payment_mode}`)})`, money(b.paid_amount))}
          {b.net_amount - b.paid_amount > 0 && row(t('billing.balance'), money(b.net_amount - b.paid_amount))}
        </div>
        {b.notes && <p className="mt-4 text-ink-500">{b.notes}</p>}
        <footer className="mt-9 flex flex-wrap justify-between gap-3 text-12 text-ink-500">
          <span>{t('billing.inclusive')}</span>
          <span>{t('billing.preparedBy')}: {b.created_by_name}</span>
        </footer>
      </Doc>
    </>
  );
}
