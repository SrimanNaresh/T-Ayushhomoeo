// Billing → Patient Bill: consultation + issued pharmacy items (+ extra lines) → bill → print/PDF.
// The bill's lines are a table on wide screens and one card per line on phones.
import { useState } from 'react';
import { Receipt, ReceiptText, ChevronLeft, Plus, Trash2, Check, X } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useT } from '../../lib/i18n.jsx';
import { navigate } from '../../lib/router.jsx';
import { money, todayLocal } from '../../lib/format.js';
import { Badge, CardHeader, DataTable, DateFilter, EmptyState, ErrorBox, Input, Spinner, Modal, Select, TokenChip, TH, TD, useAsync, useToast } from '../../components/ui.jsx';
import { CardField, CardValue, ItemCard, cardBox } from '../../components/MobileCard.jsx';
import { UploadIcon } from '../../components/Icon.jsx';
import Attachments from '../../components/Attachments.jsx';

function Pending() {
  const { t } = useT();
  const [date, setDate] = useState(todayLocal());
  const list = useAsync(() => api('/bills/pending', { query: { date } }), [date]);
  const [attachFor, setAttachFor] = useState(null);   // row whose Lab Reports & Scans pop-up is open
  const columns = [
    { key: 'patient_name', label: t('field.name'), render: (r) => <><span className="text-ink-700">{r.patient_name}</span><span className="block text-11 text-ink-400">{r.patient_code}</span></> },
    { key: 'token_no', label: t('queue.token'), render: (r) => <TokenChip no={r.token_no} /> },
    { key: 'mobile', label: t('field.mobile') },
    { key: 'consultation_fee', label: t('field.consultationFee'), render: (r) => money(r.consultation_fee), className: 'num' },
    { key: 'unbilled_items', label: t('billing.medicines'), render: (r) => money(r.unbilled_items), className: 'num' },
    { key: 'bill_count', label: t('field.status'), render: (r) => (r.bill_count > 0 ? <Badge tone="info">{t('billing.partBilled')}</Badge> : '') },
    { key: 'reports', label: t('billing.reports'), className: 'col-center', render: (r) => r.queue_id && (
      // same Lab Reports & Scans upload as in the Vital signs pop-up; green tick once a file is there
      <button type="button" className="btn-ghost relative !p-1"
        title={r.attach_count > 0 ? t('billing.viewReports', { n: r.attach_count }) : t('billing.uploadReports')}
        aria-label={t('billing.uploadReports')} onClick={() => setAttachFor(r)}>
        <UploadIcon size={24} />
        {r.attach_count > 0 && <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-white"><Check size={10} strokeWidth={3} /></span>}
      </button>
    ) },
    {
      key: '_a', label: t('billing.makeBill'), className: 'col-actions',
      render: (r) => <button type="button" className="btn-primary !px-2.5 !py-1 !text-13" onClick={() => navigate(`/billing/${r.visit_id}`)}><Receipt size={15} /> {t('billing.makeBill')}</button>,
    },
  ];
  return (
    <div className="card">
      <CardHeader icon={Receipt} title={t('menu.patientBill')} subtitle={t('billing.subtitle')}
        actions={(
          <>
            <DateFilter label={t('field.date')} value={date} max={todayLocal()} onChange={(v) => setDate(v || todayLocal())} />
            <button type="button" className="btn-secondary" onClick={() => navigate('/bills')}><ReceiptText size={16} /> {t('menu.billList')}</button>
          </>
        )} />
      {list.loading && !list.data ? <Spinner /> : <ErrorBox error={list.error} onRetry={list.reload} />}
      {list.data && <DataTable columns={columns} rows={list.data.rows} rowKey="visit_id" empty={t('billing.nonePending')} />}
      <Modal open={!!attachFor} size="lg" title={attachFor ? `${t('attach.title')} – #${attachFor.token_no ?? '-'} ${attachFor.patient_name}` : ''}
        onClose={() => { setAttachFor(null); list.reload(); }}>
        {attachFor && <Attachments entry={{ id: attachFor.queue_id, patient_name: attachFor.patient_name }} showHead={false} />}
      </Modal>
    </div>
  );
}

function BillForm({ visitId }) {
  const { t } = useT();
  const toast = useToast();
  const draft = useAsync(() => api(`/bills/draft/${visitId}`), [visitId]);
  const [extra, setExtra] = useState([]);
  const [discount, setDiscount] = useState('');
  const [paid, setPaid] = useState('');
  const [mode, setMode] = useState('cash');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  if (draft.loading && !draft.data) return <div className="card"><Spinner /></div>;
  if (draft.error) return <div className="card"><ErrorBox error={draft.error} onRetry={draft.reload} /></div>;
  const { visit, lines } = draft.data;

  const extraLines = extra.filter((l) => l.description.trim());
  const gross = lines.reduce((s, l) => s + Number(l.amount), 0) + extraLines.reduce((s, l) => s + Number(l.qty || 1) * Number(l.rate || 0), 0);
  const net = Math.max(0, gross - Number(discount || 0));
  const setX = (i, patch) => setExtra((x) => x.map((y, j) => (j === i ? { ...y, ...patch } : y)));
  const dropX = (i) => setExtra((x) => x.filter((_, j) => j !== i));
  const addX = () => setExtra((x) => [...x, { key: Math.random(), description: '', qty: 1, rate: '' }]);
  const desc = (l) => (l.line_type === 'consultation' ? t('billing.consultation') : l.description);

  function validate() {
    if (!lines.length && !extraLines.length) return t('billing.nothing');
    if (Number(discount) < 0) return `${t('billing.discount')}: 0+`;
    if (Number(discount) > gross) return `${t('billing.discount')} > ${money(gross)}`;
    if (paid !== '' && Number(paid) < 0) return `${t('billing.paid')}: 0+`;
    if (extra.some((l) => l.description.trim() && !(Number(l.rate) >= 0))) return t('common.isRequired', { field: t('billing.rate') });
    return null;
  }

  async function submit() {
    const problem = validate();
    if (problem) return toast(problem, 'error');
    setBusy(true);
    try {
      const bill = await api('/bills', {
        method: 'POST',
        body: {
          visit_id: visit.id, extra_lines: extraLines, discount: discount || 0,
          paid_amount: paid === '' ? undefined : paid, payment_mode: mode, notes,
        },
      });
      toast(t('billing.created', { no: bill.bill_no }));
      navigate(`/bills/${bill.id}`);
    } catch (err) {
      toast(err.message || t('common.saveFailed'), 'error');
    } finally {
      setBusy(false);
    }
    return undefined;
  }

  const num = { type: 'number', inputMode: 'decimal', className: 'input no-spin text-right' };

  return (
    <div className="card max-md:!px-3">
      <CardHeader icon={Receipt} title={visit.patient_name} subtitle={`${visit.patient_code} · ${visit.mobile}`}
        actions={<button type="button" className="btn-secondary" onClick={() => navigate('/billing')}><ChevronLeft size={16} /> {t('dispense.back')}</button>} />

      <p className="section-title mb-2">{t('billing.lines')}</p>
      {!lines.length && !extra.length && <EmptyState message={t('billing.nothing')} />}

      {/* Phones: one card per line */}
      <div className="space-y-2.5 md:hidden">
        {lines.map((l, i) => (
          <ItemCard key={`l${i}`} no={i + 1} title={desc(l)} tag={money(l.amount)} tagClass="bg-brand-50 text-brand-700">
            <div className="grid grid-cols-3 gap-1.5">
              <CardField label={t('examine.qty')}><CardValue>{l.qty}</CardValue></CardField>
              <CardField label={t('billing.rate')}><CardValue>{money(l.rate)}</CardValue></CardField>
              <CardField label={t('dispense.amount')}><CardValue className="!bg-brand-50 font-bold text-brand-800">{money(l.amount)}</CardValue></CardField>
            </div>
          </ItemCard>
        ))}
        {extra.map((l, i) => (
          <ItemCard key={l.key} no={lines.length + i + 1}
            title={<input className="input" value={l.description} placeholder={t('billing.otherHint')} aria-label={t('billing.description')} onChange={(e) => setX(i, { description: e.target.value })} />}>
            <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-1.5">
              <CardField label={t('examine.qty')}>
                <input type="number" min="1" inputMode="numeric" className={`${cardBox} no-spin`} value={l.qty} onChange={(e) => setX(i, { qty: e.target.value })} />
              </CardField>
              <CardField label={t('billing.rate')}>
                <input type="number" min="0" step="0.01" inputMode="decimal" className={`${cardBox} no-spin`} value={l.rate} placeholder="0.00" onChange={(e) => setX(i, { rate: e.target.value })} />
              </CardField>
              <CardField label={t('dispense.amount')}><CardValue className="!bg-brand-50 font-bold text-brand-800">{money(Number(l.qty || 1) * Number(l.rate || 0))}</CardValue></CardField>
              <button type="button" className="btn-secondary mb-3.5 !h-[30px] !px-2 hover:!text-red-600" aria-label={t('common.remove')} onClick={() => dropX(i)}><Trash2 size={14} /></button>
            </div>
          </ItemCard>
        ))}
      </div>

      {/* Wide screens: the table */}
      {(lines.length > 0 || extra.length > 0) && (
        <div className="hidden overflow-x-auto rounded-lg md:block">
          <table className="list-pinned w-full min-w-[640px] text-left text-13">
            <thead>
              <tr className="table-head">
                <th className={`${TH} rounded-l-lg`}>{t('billing.description')}</th>
                <th className={`${TH} w-24 text-right`}>{t('examine.qty')}</th>
                <th className={`${TH} w-32 text-right`}>{t('billing.rate')}</th>
                <th className={`${TH} w-32 text-right`}>{t('dispense.amount')}</th>
                <th className={`${TH} w-10 rounded-r-lg`} />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={`l${i}`}>
                  <td className={`${TD} font-medium text-ink-700`}>{desc(l)}</td>
                  <td className={`${TD} text-right tabular-nums text-ink-500`}>{l.qty}</td>
                  <td className={`${TD} text-right tabular-nums text-ink-500`}>{money(l.rate)}</td>
                  <td className={`${TD} text-right font-semibold tabular-nums text-ink-800`}>{money(l.amount)}</td>
                  <td className={TD} />
                </tr>
              ))}
              {extra.map((l, i) => (
                <tr key={l.key}>
                  <td className={TD}>
                    <input className="input" value={l.description} placeholder={t('billing.otherHint')} aria-label={t('billing.description')} onChange={(e) => setX(i, { description: e.target.value })} />
                  </td>
                  <td className={TD}><input {...num} min="1" value={l.qty} aria-label={t('examine.qty')} onChange={(e) => setX(i, { qty: e.target.value })} /></td>
                  <td className={TD}><input {...num} min="0" step="0.01" value={l.rate} placeholder="0.00" aria-label={t('billing.rate')} onChange={(e) => setX(i, { rate: e.target.value })} /></td>
                  <td className={`${TD} text-right font-semibold tabular-nums text-ink-800`}>{money(Number(l.qty || 1) * Number(l.rate || 0))}</td>
                  <td className={TD}>
                    <button type="button" className="btn-ghost !p-1 hover:!bg-red-50 hover:!text-red-600" aria-label={t('common.remove')} title={t('common.remove')} onClick={() => dropX(i)}><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button type="button" className="btn-secondary mt-2 w-full border-dashed !py-1 !text-13 md:w-auto" onClick={addX}><Plus size={16} /> {t('billing.addOther')}</button>

      <p className="section-title mb-2 mt-5">{t('billing.payment')}</p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
          <Input label={t('billing.discount')} type="number" min="0" step="0.01" inputMode="decimal" className="no-spin" placeholder="0.00" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          <Select label={t('billing.mode')} value={mode} onChange={(e) => setMode(e.target.value)}
            options={['cash', 'upi', 'card', 'other'].map((m) => ({ value: m, label: t(`billing.mode_${m}`) }))} />
          <Input label={t('billing.paid')} type="number" min="0" step="0.01" inputMode="decimal" className="no-spin" value={paid} placeholder={String(net.toFixed(2))}
            onChange={(e) => setPaid(e.target.value)} hint={t('billing.paidHint')} />
          <Input label={t('field.notes')} value={notes} placeholder="Optional" onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="self-start overflow-hidden rounded-xl border border-ink-200 bg-white text-13 shadow-sm">
          <div className="flex justify-between px-3 py-1.5 text-ink-600"><span>{t('billing.gross')}</span><b className="tabular-nums text-ink-800">{money(gross)}</b></div>
          <div className="flex justify-between border-t border-ink-100 px-3 py-1.5 text-ink-600"><span>{t('billing.discount')}</span><b className="tabular-nums text-ink-800">− {money(discount || 0)}</b></div>
          <div className="flex items-center justify-between bg-brand-600 px-3 py-1.5 text-white"><span className="font-semibold">{t('billing.net')}</span><span className="text-15 font-bold tabular-nums">{money(net)}</span></div>
        </div>
      </div>
      <div className="no-print mt-3 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
        <button type="button" className="btn-secondary px-2 sm:px-4" onClick={() => navigate('/billing')}><X size={16} /> {t('common.cancel')}</button>
        <button type="button" className="btn-primary px-2 sm:px-4" onClick={submit} disabled={busy}><Receipt size={16} /> {busy ? t('common.saving') : t('billing.generate')}</button>
      </div>
    </div>
  );
}

export default function PatientBill({ params }) {
  return params.visitId ? <BillForm visitId={params.visitId} /> : <Pending />;
}
