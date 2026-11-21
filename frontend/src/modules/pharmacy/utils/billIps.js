// Pharmacy → Three in One → Scan Bill: the bill's columns → a Three in One line. Pure functions (no OCR, no
// React), so they can be tested in node: backend/test/billIps.test.js. Used by pages/ScanBillModal.jsx.
import { compact } from './billScan.js';

// The Three in One columns a bill column can fill, as tiles: [key, i18n key, width px]. Net Rate, Amount,
// CGST / SGST, GST Amt and Total only help work out P.Rate / GST % when the bill has no such column.
export const TARGETS = [
  ['name', 'scan.col.name', 200], ['manufacturer', 'scan.col.manufacturer', 120], ['hsnCode', 'scan.col.hsn', 85],
  ['category', 'scan.col.category', 100], ['pack', 'scan.col.pack', 70],
  ['mrp', 'scan.col.mrp', 75], ['pRate', 'scan.col.pRate', 75], ['disc', 'scan.col.disc', 60], ['oldPrice', 'scan.col.netRate', 75],
  ['qty', 'scan.col.qty', 60], ['free', 'scan.col.free', 60], ['amount', 'scan.col.amount', 80],
  ['gst', 'scan.col.gst', 60], ['cgst', 'scan.col.cgst', 65], ['sgst', 'scan.col.sgst', 65], ['gstAmt', 'scan.col.gstAmt', 75],
  ['total', 'scan.col.total', 80],
  ['batch', 'scan.col.batch', 100], ['mfg', 'scan.col.mfg', 70], ['exp', 'scan.col.exp', 70], ['sDisc', 'scan.col.sDisc', 65],
  ['sel', 'scan.col.sel', 80],
];
const NUMERIC = new Set(['mrp', 'pRate', 'disc', 'oldPrice', 'qty', 'free', 'amount', 'gst', 'cgst', 'sgst', 'gstAmt', 'total', 'sDisc', 'sel']);
const DERIVE_ONLY = ['oldPrice', 'amount', 'gstAmt', 'total', 'cgst', 'sgst'];
export const MIN_BOX = 0.02; // a selection smaller than this (share of the page) is a slip, not a box

const headKey = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
// A bill heading the reader didn't name, by its words: "Rate" → P.Rate, "GST %" → GST %, …
const BY_LABEL = [
  ['cgst', (k) => k.startsWith('cgst') && !/amt|amount|value/.test(k)],
  ['sgst', (k) => k.startsWith('sgst') && !/amt|amount|value/.test(k)],
  ['gst', (k) => /^(gst|igst|tax)/.test(k) && !/amt|amount|value|able/.test(k)],
  ['free', (k) => k.startsWith('free') || k === 'fr'],
  ['disc', (k) => /^(disc|dis|discount|cd|sch)/.test(k) && !/amt|amount/.test(k)],
  ['oldPrice', (k) => /^(netrate|nrate|netprice|effrate)$/.test(k)],
  ['pRate', (k) => /^(rate|prate|ptr|pts|purrate|purchaserate|price)$/.test(k)],
  ['gstAmt', (k) => /^(gst|igst|tax)(amt|amount|value)$/.test(k)],
  ['amount', (k) => /^(amt|amount|value|taxable|taxablevalue|taxableamt|grossamt|grossamount)$/.test(k)],
  ['total', (k) => /^(total|netamt|netamount|nettotal|totalamt|totalamount)$/.test(k)],
  ['sDisc', (k) => /^(sdisc|salesdisc|saledisc|sellingdisc)$/.test(k)],
  ['sel', (k) => /^(selamount|sellingprice|saleprice|salerate|sp|srate)$/.test(k)],
  ['exp', (k) => /^(exp|expy|expiry|expire|expires|expd|ed)(date|dt|on|mmyy|month)?$/.test(k) || k === 'expirydt'],
  ['mfg', (k) => /^(mfg|mfd|mf|md|mfgd|manufacturing|manufactured|manuf)(date|dt|on|mmyy|month)$/.test(k) || /^(mfd|md)$/.test(k)],
];
const KEYS = new Set(TARGETS.map(([k]) => k));
// The reader's own column names (billScan.js) that differ from ours
const FIELD_ALIAS = { rack: null, generic: null, unit: null };

/** The tiles placed already: a column the reader named, or whose heading says what it is */
function autoMap(heads) {
  const map = {};
  heads.forEach((h, i) => {
    const field = h.field in FIELD_ALIAS ? FIELD_ALIAS[h.field] : h.field;
    const key = KEYS.has(field) ? field : BY_LABEL.find(([k, test]) => KEYS.has(k) && test(headKey(h.label)))?.[0];
    if (key && map[key] == null) map[key] = i;
  });
  return map;
}
/** autoMap, plus date columns by what they hold: of two month columns the first is Mf.Date, the second Exp.Date */
export function autoMapTable(table) {
  const map = autoMap(table.heads);
  if (map.exp != null) return map;
  const taken = new Set(Object.values(map));
  const dated = table.heads.map((_, i) => i).filter((i) => {
    if (taken.has(i)) return false;
    const cells = table.rows.map((r) => String(r[i] || '').trim()).filter(Boolean);
    const months = cells.filter((x) => monthIn(x) && /[/\-.]|[A-Z]{3}/i.test(x) && !/\d{5,}/.test(x));
    return cells.length >= 2 && months.length >= cells.length * 0.6;
  });
  if (dated.length >= 2 && map.mfg == null) { map.mfg = dated[0]; map.exp = dated[1]; } else if (dated.length) map.exp = dated[dated.length - 1];
  return map;
}

// A bill's month as 'YYYY-MM', or '': "2/28", "12/2027", "0527", "MAY-27", "31/05/2027"… (OCR's O for 0 put right)
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
export function monthIn(text) {
  const s = String(text || '').toUpperCase().replace(/(?<=\d)O|O(?=\d)/g, '0').trim();
  const out = (mm, yy) => {
    const mo = Number(mm);
    if (!(mo >= 1 && mo <= 12)) return '';
    const y = String(yy).length === 2 ? `20${yy}` : String(yy);
    return /^20\d{2}$/.test(y) ? `${y}-${String(mo).padStart(2, '0')}` : '';
  };
  let m = /(?:^|\D)\d{1,2}\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4}|\d{2})(?!\d)/.exec(s);
  if (m) return out(m[1], m[2]);
  m = /([A-Z]{3})[A-Z]*\.?\s*[-/.,']?\s*(\d{4}|\d{2})(?!\d)/.exec(s);
  if (m && MONTHS.includes(m[1])) return out(MONTHS.indexOf(m[1]) + 1, m[2]);
  m = /(?:^|\D)(\d{1,2})\s*[/\-.]\s*(\d{4}|\d{2})(?!\d)/.exec(s);
  if (m) return out(m[1], m[2]);
  m = /^(\d{2})(\d{4}|\d{2})$/.exec(s.replace(/\s/g, ''));
  return m ? out(m[1], m[2]) : '';
}
const numIn = (text, last = false) => {
  const s = String(text || '').replace(/(?<=\d)[oO]|[oO](?=\d)/g, '0').replace(/(\d),(\d{1,2})(?!\d)/g, '$1.$2').replace(/,/g, '');
  const all = s.match(/\d+(\.\d+)?/g);
  return all ? String(Number(all[last ? all.length - 1 : 0])) : '';
};
function valueFor(key, text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (key === 'exp' || key === 'mfg') return monthIn(s);
  if (key === 'mrp') return numIn(s, true);
  if (NUMERIC.has(key)) return numIn(s);
  if (key === 'hsnCode') return s.replace(/[oO]/g, '0').replace(/\D/g, '').slice(0, 20);
  if (key === 'category' || key === 'batch') return s.replace(/ /g, '').toUpperCase().slice(0, 50);
  return s.toUpperCase().slice(0, key === 'name' || key === 'manufacturer' ? 200 : 50);
}
// "9%+9%" in one tax cell → [cgst, sgst], else null
const TAX_PAIR = /^(\d+(?:\.\d+)?)\s*%?\s*[-+]*\+[-+]*\s*(\d+(?:\.\d+)?)\s*%?$/;
const taxPair = (text) => {
  const m = TAX_PAIR.exec(String(text || '').replace(/\s+/g, ' ').trim());
  return m ? [Number(m[1]), Number(m[2])] : null;
};

/**
 * One bill line through the column matches → a scanned line. Disc % is taken off P.Rate (this app's order):
 * a value with % or up to 100 is a %, a larger one an amount (per unit below the rate, else for the line).
 * With no rate column the rate is Amount ÷ Qty (or Net Rate) – already after the discount, so Disc % is 0.
 */
export function fieldsOf(cells, map) {
  const o = {};
  for (const [key] of TARGETS) if (map[key] != null) o[key] = valueFor(key, cells[map[key]]);
  const r2 = (n) => String(Math.round(n * 100) / 100);
  const n = (k) => Number(o[k]) || 0;
  for (const k of ['gst', 'cgst', 'sgst']) {
    const pair = map[k] != null ? taxPair(cells[map[k]]) : null;
    if (!pair) continue;
    if (k === 'gst') { o.gst = r2(pair[0] + pair[1]); continue; }
    if (k === 'cgst' || map.cgst == null) o.cgst = r2(pair[0]);
    if (k === 'sgst' || map.sgst == null) o.sgst = r2(pair[1]);
  }
  let netRate = false;
  if (!(n('pRate') > 0)) {
    const net = n('amount') > 0 && n('qty') > 0 ? n('amount') / n('qty') : n('oldPrice');
    if (net > 0) { o.pRate = r2(net); netRate = true; }
  }
  if (netRate) o.disc = '';
  else if (map.disc != null && o.disc !== '') {
    const v = n('disc');
    const pct = (x) => (x >= 0 && x <= 100 ? r2(x) : '');
    if (/%/.test(String(cells[map.disc])) || v <= 100) o.disc = pct(v);
    else if (n('pRate') > 0 && v < n('pRate')) o.disc = pct((v / n('pRate')) * 100);
    else if (n('pRate') > 0 && n('qty') > 0) o.disc = pct((v / (n('pRate') * n('qty'))) * 100);
    else o.disc = '';
  }
  if (!o.gst) {
    const amt = n('amount') || n('qty') * n('oldPrice');
    if (o.cgst || o.sgst) o.gst = r2(n('cgst') + n('sgst'));
    else if (amt > 0 && n('gstAmt') > 0) o.gst = r2((n('gstAmt') / amt) * 100);
    else if (amt > 0 && n('total') > amt) o.gst = r2(((n('total') - amt) / amt) * 100);
    if (o.gst && !(Number(o.gst) <= 100)) o.gst = '';
  }
  for (const k of DERIVE_ONLY) delete o[k];
  return o;
}

/** Every bill line with an item name, through the column matches */
export function linesOf(table, map) {
  const blank = Object.fromEntries(TARGETS.map(([k]) => [k, '']));
  return table.rows.map((cells) => ({ ...blank, ...fieldsOf(cells, map) })).filter((f) => compact(f.name));
}
