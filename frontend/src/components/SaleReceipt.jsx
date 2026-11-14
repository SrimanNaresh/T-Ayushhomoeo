// Pharmacy → Sales: the printed receipt (80 mm wide). useReceiptPrinter() gives print(sale, after) and the node
// to render; print() shows the receipt, opens the print dialog and calls `after` once printing is done.
// Only the receipt is printed: it is hidden on screen, and body.printing-receipt hides the app (index.css).
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../lib/i18n.jsx';
import { fmtDate, money } from '../lib/format.js';

const qtyText = (n) => String(Number(n || 0));
const th = 'border-b border-black px-0.5 py-0.5 text-left align-top';
const td = 'px-0.5 py-0.5 text-left align-top';

export function SaleReceipt({ sale }) {
  const { t } = useT();
  const c = sale.clinic || {};
  const anyDisc = sale.lines.some((l) => Number(l.disc_percent) > 0);
  const billDisc = Number(sale.discount_amount) > 0;
  const span = anyDisc ? 5 : 4;
  return (
    <div className="print-receipt hidden w-full max-w-[80mm] font-[Arial,sans-serif] text-11 leading-snug text-black print:block">
      <div className="mb-1.5 text-center">
        <b className="block text-14">{c.name}</b>
        {[c.address, c.city].filter(Boolean).length > 0 && <div>{[c.address, c.city].filter(Boolean).join(', ')}</div>}
        {(c.phone || c.email) && <div>{[c.phone, c.email].filter(Boolean).join(' · ')}</div>}
      </div>
      <div className="grid gap-px border-y border-dashed border-black py-1">
        <span>{t('sale.billNo')}: <b>{sale.sale_no}</b></span>
        <span>{t('purchase.date')}: {fmtDate(sale.sale_date)}</span>
        <span>{t('sale.customer')}: {sale.customer_name}{sale.mobile ? ` · ${sale.mobile}` : ''}</span>
      </div>
      <table className="mt-1 w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>{t('sale.item')}</th>
            <th className={th}>{t('sale.batch')}</th>
            <th className={`${th} !text-right`}>{t('sale.qty')}</th>
            <th className={`${th} !text-right`}>{t('sale.rate')}</th>
            {anyDisc && <th className={`${th} !text-right`}>{t('purchase.disc')}</th>}
            <th className={`${th} !text-right`}>{t('purchase.amount')}</th>
          </tr>
        </thead>
        <tbody>
          {sale.lines.map((l) => (
            <tr key={l.id}>
              <td className={td}>{l.item_name}{l.sale_unit === 'unit' ? ` (${t('sale.unitWord')})` : ''}</td>
              <td className={td}>{l.batch_no || '-'}</td>
              <td className={`${td} !text-right`}>{qtyText(l.unit_qty ?? l.qty)}</td>
              <td className={`${td} !text-right`}>{Number(l.price).toFixed(2)}</td>
              {anyDisc && <td className={`${td} !text-right`}>{Number(l.disc_percent) > 0 ? qtyText(l.disc_percent) : ''}</td>}
              <td className={`${td} !text-right`}>{Number(l.amount).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {billDisc && (
            <>
              <tr><td colSpan={span} className={`${td} border-t border-dashed border-black`}>{t('sale.subTotal')}</td><td className={`${td} border-t border-dashed border-black !text-right`}>{money(sale.sub_total)}</td></tr>
              <tr><td colSpan={span} className={td}>{t('sale.discountN', { n: qtyText(sale.disc_percent) })}</td><td className={`${td} !text-right`}>− {money(sale.discount_amount)}</td></tr>
            </>
          )}
          <tr className="text-13 font-bold">
            <td colSpan={span} className={`${td} border-t border-black`}>{t('sale.total')}</td>
            <td className={`${td} border-t border-black !text-right`}>{money(sale.total_amount)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function useReceiptPrinter() {
  const [job, setJob] = useState(null);   // { sale, after }
  useEffect(() => {
    if (!job) return undefined;
    document.body.classList.add('printing-receipt');
    const done = () => { document.body.classList.remove('printing-receipt'); setJob(null); job.after?.(); };
    window.addEventListener('afterprint', done, { once: true });
    const timer = setTimeout(() => window.print(), 50);   // after the receipt is on the page
    return () => { clearTimeout(timer); window.removeEventListener('afterprint', done); document.body.classList.remove('printing-receipt'); };
  }, [job]);
  return {
    print: (sale, after) => setJob({ sale, after }),
    node: job ? createPortal(<SaleReceipt sale={job.sale} />, document.body) : null,   // straight under <body>, for printing
  };
}
