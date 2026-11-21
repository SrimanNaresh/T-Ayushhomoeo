// Pharmacy → Purchase / Order, Three in One, Stock In: the sums for one item line and the whole order.
// Shared by the screens (shown as you type) and the server (which saves its own result).
// Same rules as Ayush All In One (its purchaseCalc.js):
//   P.Rate       = MRP − Disc % of the MRP (Disc % is the discount off the MRP; typing either works out the other)
//   Amount       = Qty × P.Rate (Free units are not charged; the discount is already in the P.Rate)
//   GST %        = CGST % + SGST %;  GST Amount = Amount / 100 × GST %;  Total = Amount + GST Amount
// Each step is rounded to paise.

const r2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? 0 : Number(v));

/** P.Rate from the MRP and Disc %: MRP 140, Disc 40 % → 84 */
export const pRateOf = (mrp, disc) => r2(num(mrp) - (num(mrp) * num(disc)) / 100);

/** Disc % from the MRP and P.Rate: MRP 140, P.Rate 84 → 40 ('' when there is no MRP or the rate is above it) */
export function discOf(mrp, pRate) {
  if (!(num(mrp) > 0) || pRate === '' || pRate == null) return '';
  const d = r2((1 - num(pRate) / num(mrp)) * 100);
  return d >= 0 && d <= 100 ? d : '';
}

/** One line: Rate = P.Rate; Amount = Qty × Rate; GST Amount; Total. disc_percent is already in the P.Rate. */
export function calcLine({ p_rate: pRate, qty, cgst_percent: cgst, sgst_percent: sgst }) {
  const rate = r2(pRate);
  const amount = r2(num(qty) * rate);
  const gst = r2(num(cgst) + num(sgst));
  const gstAmount = r2((amount / 100) * gst);
  return { rate, amount, gst_percent: gst, gst_amount: gstAmount, total: r2(amount + gstAmount) };
}

/** GST % typed in one box: split evenly into CGST % and SGST % */
export const splitGst = (gst) => {
  const half = r2(num(gst) / 2);
  return { cgst_percent: half, sgst_percent: r2(num(gst) - half) };
};

/** Sum of Total over the lines */
export const orderTotal = (lines) => r2(lines.reduce((s, l) => s + calcLine(l).total, 0));

/** Round Off: what takes a total to the nearest rupee. 24.25 → −0.25; 24.50 → +0.50 */
export const roundOffOf = (total) => r2(Math.round(r2(total)) - r2(total));

/**
 * Typing MRP, Disc % or P.Rate on a line: the patch that keeps them in step (as in All In One).
 * MRP or Disc % works out the P.Rate; P.Rate works out the Disc %. Fields: mrp, p_rate and `discKey`.
 */
export function priced(line, key, value, { discKey = 'disc' } = {}) {
  const next = { ...line, [key]: value };
  if (!(num(next.mrp) > 0)) return { [key]: value };
  if (key === 'p_rate') {
    if (value === '') return { p_rate: value };
    const d = discOf(next.mrp, value);
    return { p_rate: value, [discKey]: d === '' || d === 0 ? '' : String(d) };
  }
  if ((next[discKey] === '' || next[discKey] == null) && key === 'mrp') return { mrp: value };
  return { [key]: value, p_rate: String(pRateOf(next.mrp, next[discKey])) };
}
