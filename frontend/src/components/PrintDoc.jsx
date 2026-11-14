// Printed documents (Bill, Prescription, Day Book chart, Consent form): a toolbar that is not printed, then the
// paper itself with the clinic's letterhead. "Print / PDF" uses the browser print dialog (choose "Save as PDF").
// Added for this app: the reference app's printouts live in their own modules; these keep this app's four
// documents looking the same as each other and as the screens around them.
import { ChevronLeft, Printer } from 'lucide-react';
import { useT } from '../lib/i18n.jsx';

/** The bar above a printout: Back on the left, Print (and any other buttons) on the right. Not printed. */
export function PrintBar({ onBack, children }) {
  const { t } = useT();
  return (
    <div className="no-print mx-auto mb-3 flex max-w-[820px] flex-wrap items-center justify-between gap-2">
      <button type="button" className="btn-secondary" onClick={onBack || (() => window.history.back())}><ChevronLeft size={16} /> {t('dispense.back')}</button>
      <div className="flex flex-wrap gap-2">
        {children}
        <button type="button" className="btn-primary" onClick={() => window.print()}><Printer size={16} /> {t('billing.print')}</button>
      </div>
    </div>
  );
}

/** The paper: a white sheet on screen, the whole page when printed. */
export function Doc({ className = '', children }) {
  return (
    <article className={`mx-auto max-w-[820px] rounded-2xl border border-ink-100 bg-white p-4 text-13 text-ink-800 shadow-card sm:p-8 print:max-w-none print:rounded-none print:border-0 print:p-0 print:text-12 print:shadow-none ${className}`}>
      {children}
    </article>
  );
}

/** Clinic letterhead; `brand` (e.g. "Ayush Pro") is printed as letters stacked top to bottom at the right. */
export function DocHead({ name, address, city, phone, brand }) {
  const { t } = useT();
  return (
    <header className="flex items-center justify-between gap-4 border-b-2 border-brand-600 pb-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-brand-700 print:text-lg">{name}</h1>
        {[address, city].filter(Boolean).length > 0 && <p className="text-ink-500">{[address, city].filter(Boolean).join(', ')}</p>}
        {phone && <p className="text-ink-500">{t('field.phone')}: {phone}</p>}
      </div>
      {brand && (
        <div className="shrink-0 text-9 font-extrabold uppercase leading-none tracking-[-1px] text-teal-600 [text-orientation:upright] [writing-mode:vertical-rl]">{brand}</div>
      )}
    </header>
  );
}

/** Two columns under the letterhead: who (left) and when / what (right). Each is [label, strong, ...lines]. */
export function DocMeta({ left, right }) {
  const col = ([label, strong, ...lines], align) => (
    <div className={`flex flex-col gap-0.5 ${align}`}>
      <span className="text-12 text-ink-400">{label}</span>
      <strong className="text-base text-ink-900">{strong}</strong>
      {lines.filter(Boolean).map((l, i) => <span key={i}>{l}</span>)}
    </div>
  );
  return (
    <div className="my-4 flex justify-between gap-4">
      {col(left, '')}
      {col(right, 'items-end text-right')}
    </div>
  );
}

/** Tables on a printout: shaded heading row, a line under each row. */
export const DOC_TABLE = 'w-full border-collapse [&_td]:border-b [&_td]:border-ink-100 [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top [&_th]:bg-brand-50 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:text-12 [&_th]:font-bold [&_th]:text-ink-700';
/** A labelled line of text on a printout: <p className={DOC_LINE}><b>Label:</b> text</p> */
export const DOC_LINE = 'my-1.5';

/** A signature line with the signer's name under it. */
export function SignLine({ name, sub, className = '' }) {
  return (
    <div className={`flex min-w-[12rem] flex-col items-center gap-0.5 ${className}`}>
      <span className="mb-1 block w-full border-t border-ink-800" />
      <strong>{name}</strong>
      {sub && <span className="text-ink-500">{sub}</span>}
    </div>
  );
}
