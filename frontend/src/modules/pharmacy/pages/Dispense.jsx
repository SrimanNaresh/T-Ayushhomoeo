// Pharmacy → Dispense: issue prescribed items to the patient (reduces stock).
// Wide screens: a table of the prescription; phones: one card per medicine.
import { useEffect, useState } from 'react';
import { Pill, ChevronLeft, PackageCheck, ArrowRight } from 'lucide-react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/i18n.jsx';
import { navigate } from '../../../lib/router.jsx';
import { fmtDate, money, todayLocal } from '../../../lib/format.js';
import {
  Badge, Card, CardHeader, DataTable, DateFilter, EmptyState, ErrorBox, Spinner, StatusBadge, TokenChip, TH, TD, GRID_BAD, useAsync, useToast,
} from '../../../components/ui.jsx';
import { CardField, CardValue, ItemCard, cardBox, cardBad } from '../../../components/MobileCard.jsx';
import ItemPicker from '../../../components/ItemPicker.jsx';

function PendingList() {
  const { t } = useT();
  const [date, setDate] = useState(todayLocal());
  const list = useAsync(() => api('/pharmacy/dispense/pending', { query: { date } }), [date]);
  const columns = [
    { key: 'patient_name', label: t('field.name'), render: (r) => <><span className="text-ink-700">{r.patient_name}</span><span className="block text-11 text-ink-400">{r.patient_code}</span></> },
    { key: 'token_no', label: t('queue.token'), render: (r) => <TokenChip no={r.token_no} /> },
    { key: 'doctor_name', label: t('menu.doctor') },
    { key: 'visit_status', label: t('dispense.visit'), render: (r) => <StatusBadge status={r.visit_status} /> },
    { key: 'pending_lines', label: t('dispense.pending'), render: (r) => (r.pending_lines > 0 ? <Badge tone="warning">{t('dispense.linesPending', { n: r.pending_lines })}</Badge> : <Badge tone="success">{t('status.issued')}</Badge>) },
    {
      key: '_a', label: t('common.open'), className: 'col-actions',
      render: (r) => (
        <button type="button" className={r.pending_lines > 0 ? 'btn-primary !px-2.5 !py-1 !text-13' : 'btn-secondary !px-2.5 !py-1 !text-13'}
          onClick={(e) => { e.stopPropagation(); navigate(`/pharmacy/dispense/${r.visit_id}`); }}>
          {t('common.open')} <ArrowRight size={15} />
        </button>
      ),
    },
  ];
  return (
    <div className="card">
      <CardHeader icon={Pill} title={t('menu.dispense')} subtitle={t('dispense.subtitle')}
        actions={<DateFilter label={t('field.date')} value={date} max={todayLocal()} onChange={(v) => setDate(v || todayLocal())} />} />
      {list.loading && !list.data ? <Spinner /> : <ErrorBox error={list.error} onRetry={list.reload} />}
      {list.data && <DataTable columns={columns} rows={list.data.rows} rowKey="visit_id" empty={t('dispense.none')} onRowClick={(r) => navigate(`/pharmacy/dispense/${r.visit_id}`)} />}
    </div>
  );
}

function IssueForm({ visitId }) {
  const { t } = useT();
  const toast = useToast();
  const v = useAsync(() => api(`/pharmacy/dispense/visit/${visitId}`), [visitId]);
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!v.data) return;
    setLines(v.data.lines.map((l) => {
      const remaining = Math.max(0, Number(l.quantity) - Number(l.issued_qty));
      return {
        ...l,
        qty: l.item_id ? Math.min(remaining, Number(l.stock_qty) || 0) : 0,
        pick: !!l.item_id && remaining > 0 && Number(l.stock_qty) > 0,
      };
    }));
  }, [v.data]);

  if (v.loading && !v.data) return <div className="card"><Spinner /></div>;
  if (v.error) return <div className="card"><ErrorBox error={v.error} onRetry={v.reload} /></div>;
  const visit = v.data;
  const setLine = (i, patch) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const chosen = lines.filter((l) => l.pick && l.item_id && Number(l.qty) > 0);
  const total = chosen.reduce((s, l) => s + Number(l.qty) * Number(l.price || 0), 0);
  const overOf = (l) => Number(l.qty) > Number(l.stock_qty || 0);
  const linkItem = (i, remaining) => (p) => p.item && setLine(i, {
    item_id: p.item.id, item_name: p.item.name, price: p.item.price, stock_qty: p.item.stock_qty, unit: p.item.unit,
    qty: Math.min(remaining, Number(p.item.stock_qty)), pick: true,
  });

  async function issue() {
    const over = chosen.find(overOf);
    if (over) return toast(`${over.medicine_name}: ${t('items.stock')} ${over.stock_qty}`, 'error');
    if (!chosen.length) return toast(t('dispense.select'), 'error');
    setBusy(true);
    try {
      await api(`/pharmacy/dispense/visit/${visitId}`, {
        method: 'POST',
        body: { lines: chosen.map((l) => ({ prescription_id: l.prescription_id, item_id: l.item_id, qty: Number(l.qty) })) },
      });
      toast(t('dispense.issued'));
      v.reload();
    } catch (err) {
      toast(err.message || t('common.saveFailed'), 'error');
    } finally {
      setBusy(false);
    }
    return undefined;
  }

  return (
    <div>
      <div className="card max-md:!px-3">
        <CardHeader icon={Pill} title={visit.patient_name}
          subtitle={`${visit.patient_code} · ${t('queue.token')} #${visit.token_no ?? '-'} · ${fmtDate(visit.visit_date, true)}`}
          actions={<button type="button" className="btn-secondary" onClick={() => navigate('/pharmacy/dispense')}><ChevronLeft size={16} /> {t('dispense.back')}</button>} />
        <p className="section-title mb-2">{t('examine.prescription')}</p>
        {!lines.length && <EmptyState message={t('dispense.noRx')} />}

        {/* Phones: one card per medicine */}
        <div className="space-y-2.5 md:hidden">
          {lines.map((l, i) => {
            const remaining = Math.max(0, Number(l.quantity) - Number(l.issued_qty));
            const over = overOf(l);
            return (
              <ItemCard key={l.prescription_id} no={i + 1} dim={remaining === 0} bad={l.pick && over}
                title={`${l.medicine_name}${l.potency ? ` ${l.potency}` : ''}`}
                sub={[l.dosage, l.frequency, l.duration].filter(Boolean).join(' · ')}
                tag={remaining === 0 ? t('status.issued') : undefined} tagClass="bg-emerald-100 text-emerald-700">
                {l.item_id ? (
                  <label className="flex items-center gap-2 text-13 text-ink-700">
                    <input type="checkbox" checked={l.pick} onChange={(e) => setLine(i, { pick: e.target.checked })} />
                    <span className="font-medium">{l.item_name}</span>
                  </label>
                ) : (
                  <ItemPicker placeholder={t('dispense.linkItem')} ariaLabel={t('dispense.linkItem')} onPick={linkItem(i, remaining)} />
                )}
                <div className="grid grid-cols-4 gap-1.5">
                  <CardField label={t('dispense.prescribed')}><CardValue>{l.quantity}</CardValue></CardField>
                  <CardField label={t('dispense.alreadyIssued')}><CardValue>{l.issued_qty}</CardValue></CardField>
                  <CardField label={t('dispense.issueQty')} note={l.item_id ? `${t('items.stock')} ${l.stock_qty}` : ''}>
                    <input type="number" min="0" step="0.5" inputMode="decimal" className={`${cardBox} no-spin font-semibold ${over && l.pick ? cardBad : ''}`}
                      value={l.qty} disabled={!l.pick} onChange={(e) => setLine(i, { qty: e.target.value })} />
                  </CardField>
                  <CardField label={t('dispense.amount')}><CardValue className="!bg-brand-50 font-bold text-brand-800">{l.pick ? money(Number(l.qty) * Number(l.price || 0)) : '-'}</CardValue></CardField>
                </div>
              </ItemCard>
            );
          })}
        </div>

        {/* Wide screens: the table */}
        {lines.length > 0 && (
          <div className="hidden overflow-x-auto rounded-lg md:block">
            <table className="list-pinned w-full min-w-[860px] text-left text-13">
              <thead>
                <tr className="table-head">
                  <th className={`${TH} w-8 rounded-l-lg`} />
                  <th className={TH}>{t('examine.medicine')}</th><th className={TH}>{t('dispense.stockItem')}</th><th className={TH}>{t('examine.dosage')}</th>
                  <th className={`${TH} text-right`}>{t('dispense.prescribed')}</th><th className={`${TH} text-right`}>{t('dispense.alreadyIssued')}</th>
                  <th className={`${TH} text-right`}>{t('items.stock')}</th><th className={`${TH} w-28 text-right`}>{t('dispense.issueQty')}</th>
                  <th className={`${TH} rounded-r-lg text-right`}>{t('dispense.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const remaining = Math.max(0, Number(l.quantity) - Number(l.issued_qty));
                  const over = overOf(l);
                  return (
                    <tr key={l.prescription_id} className={remaining === 0 ? 'opacity-55' : ''}>
                      <td className={TD}>
                        <input type="checkbox" aria-label={t('dispense.select')} checked={l.pick} disabled={!l.item_id}
                          onChange={(e) => setLine(i, { pick: e.target.checked })} />
                      </td>
                      <td className={TD}>
                        <b className="text-ink-800">{l.medicine_name}{l.potency ? ` ${l.potency}` : ''}</b>
                        <span className="block text-11 text-ink-400">{[l.dosage, l.frequency, l.duration].filter(Boolean).join(' · ')}</span>
                      </td>
                      <td className={`${TD} min-w-[12rem] text-ink-600`}>
                        {l.item_id ? l.item_name : <ItemPicker placeholder={t('dispense.linkItem')} ariaLabel={t('dispense.linkItem')} onPick={linkItem(i, remaining)} />}
                      </td>
                      <td className={`${TD} text-ink-500`}>{l.dosage || '-'}</td>
                      <td className={`${TD} text-right tabular-nums`}>{l.quantity}</td>
                      <td className={`${TD} text-right tabular-nums`}>{l.issued_qty}</td>
                      <td className={`${TD} text-right tabular-nums`}>{l.item_id ? `${l.stock_qty} ${l.unit || ''}` : '-'}</td>
                      <td className={TD}>
                        <input type="number" className={`input no-spin text-right ${over && l.pick ? GRID_BAD : ''}`} min="0" step="0.5" value={l.qty} disabled={!l.pick}
                          onChange={(e) => setLine(i, { qty: e.target.value })} aria-label={t('dispense.issueQty')} />
                      </td>
                      <td className={`${TD} text-right font-semibold tabular-nums text-ink-800`}>{l.pick ? money(Number(l.qty) * Number(l.price || 0)) : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 flex items-center justify-between rounded-xl bg-brand-600 px-3 py-1.5 text-white shadow-sm">
          <span className="text-13 font-semibold">{t('dispense.total')}</span>
          <span className="text-15 font-bold tabular-nums">{money(total)}</span>
        </div>
        <div className="no-print mt-3 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button type="button" className="btn-secondary px-2 sm:px-4" onClick={() => navigate('/pharmacy/dispense')}><ChevronLeft size={16} /> {t('dispense.back')}</button>
          <button type="button" className="btn-primary px-2 sm:px-4" onClick={issue} disabled={busy || !chosen.length}>
            <PackageCheck size={16} /> {busy ? t('common.saving') : t('dispense.issueBtn', { n: chosen.length })}
          </button>
        </div>
      </div>

      {visit.issues.length > 0 && (
        <Card className="mt-3" title={t('dispense.history')}>
          <DataTable rows={visit.issues} minWidth="min-w-[480px]" columns={[
            { key: 'issued_at', label: t('queue.time'), render: (r) => fmtDate(r.issued_at, true) },
            { key: 'issued_by_name', label: t('dispense.by') },
            { key: 'items_total', label: t('dispense.amount'), render: (r) => money(r.items_total), className: 'num' },
            { key: 'status', label: t('field.status'), render: (r) => <StatusBadge status={r.status} /> },
          ]} />
        </Card>
      )}
    </div>
  );
}

export default function Dispense({ params }) {
  return params.visitId ? <IssueForm visitId={params.visitId} /> : <PendingList />;
}
