// Pharmacy → Three in One → Scan Bill: a bill's table (as the reader returns it) → Three in One lines.
// The OCR itself runs in the browser; this checks the column matching and the price rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoMapTable, fieldsOf, linesOf, monthIn } from '../../frontend/src/modules/pharmacy/utils/billIps.js';

const table = {
  heads: [
    { label: 'Item Description', field: 'name' }, { label: 'Batch', field: 'category' }, { label: 'Exp' },
    { label: 'Qty', field: 'qty' }, { label: 'Free' }, { label: 'MRP', field: 'mrp' }, { label: 'Rate' },
    { label: 'Disc %' }, { label: 'GST' }, { label: 'Rack', field: 'rack' },
  ],
  rows: [
    ['DOLO 650 TAB', 'B1234', '05/27', '10', '1', '32.00', '24.50', '10', '6%+6%', 'A1'],
    ['', '', '', '', '', '', '', '', '', ''],          // a blank line: left out
    ['Crocin Advance', 'C 77', 'MAY-28', '5', '', '20,50', '15', '120', '12', 'B2'],
  ],
};

test('Scan Bill: bill headings are matched to Three in One columns', () => {
  const map = autoMapTable(table);
  assert.deepEqual(map, { name: 0, category: 1, exp: 2, qty: 3, free: 4, mrp: 5, pRate: 6, disc: 7, gst: 8 });   // Rack: not on Three in One
});

test('Scan Bill: a line keeps the bill Rate as P.Rate and Disc % off it; "6%+6%" is GST 12', () => {
  const [dolo, crocin, ...rest] = linesOf(table, autoMapTable(table));
  assert.equal(rest.length, 0);
  assert.equal(dolo.name, 'DOLO 650 TAB');
  assert.equal(dolo.category, 'B1234');
  assert.equal(dolo.exp, '2027-05');
  assert.deepEqual([dolo.qty, dolo.free, dolo.mrp, dolo.pRate, dolo.disc, dolo.gst], ['10', '1', '32', '24.5', '10', '12']);
  // "20,50" read as 20.50; a Disc of 120 is more than the rate → an amount for the line: 120 / (15 × 5) is over 100 % → blank
  assert.equal(crocin.name, 'CROCIN ADVANCE');
  assert.equal(crocin.mrp, '20.5');
  assert.equal(crocin.category, 'C77');
  assert.equal(crocin.exp, '2028-05');
  assert.equal(crocin.disc, '');
});

test('Scan Bill: Disc printed as an amount becomes Disc % of P.Rate', () => {
  const map = { name: 0, pRate: 1, qty: 2, disc: 3 };
  assert.equal(fieldsOf(['X', '50', '10', '120'], map).disc, '24');     // 120 of a 500 line
});

test('Scan Bill: no rate column – Amount ÷ Qty is the (net) rate and Disc % is not applied again', () => {
  const map = { name: 0, qty: 1, amount: 2, disc: 3, gstAmt: 4 };
  const o = fieldsOf(['Y', '4', '90', '10', '10.80'], map);
  assert.equal(o.pRate, '22.5');
  assert.equal(o.disc, '');
  assert.equal(o.gst, '12');      // GST Amt 10.80 on an Amount of 90
  assert.equal(o.amount, undefined);
});

test('Scan Bill: bill months as YYYY-MM', () => {
  assert.equal(monthIn('MAY-27'), '2027-05');
  assert.equal(monthIn('12/2027'), '2027-12');
  assert.equal(monthIn('0528'), '2028-05');
  assert.equal(monthIn('31/05/2027'), '2027-05');
  assert.equal(monthIn('13/27'), '');
});
