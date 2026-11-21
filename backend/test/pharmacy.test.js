// Pharmacy formulas shared by the screens and the server: Purchase / Order, Stock In and Sales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcLine, splitGst } from '../../shared/purchase.js';
import { packSize, selAmount, unitPrice } from '../../shared/stockin.js';
import { lineAmount, lineCost, packsOf, perSaleUnit, roundOffOf, saleTotals } from '../../shared/sale.js';

test('Purchase line: Rate = P.Rate less Disc %, free units not charged', () => {
  const c = calcLine({ p_rate: 100, disc_percent: 10, qty: 5, free_qty: 1, cgst_percent: 6, sgst_percent: 6 });
  assert.deepEqual(c, { rate: 90, amount: 450, gst_percent: 12, gst_amount: 54, total: 504 });
});

test('GST % splits evenly into CGST % and SGST %', () => {
  assert.deepEqual(splitGst(12), { cgst_percent: 6, sgst_percent: 6 });
  assert.deepEqual(splitGst(5), { cgst_percent: 2.5, sgst_percent: 2.5 });
});

test('Stock In: Sel.Amount = MRP less S.Disc %, Unit Price per piece', () => {
  assert.equal(selAmount({ mrp: 32.12, disc_percent: 5 }), 30.51);
  assert.equal(unitPrice(30.51, '15'), 2.03);
  assert.equal(packSize('15'), 15);
  assert.equal(packSize('ML'), 1);
  assert.equal(packSize(''), 1);
});

test('Sales: unit sales take a part of a pack; amount less Disc %; bill discount', () => {
  assert.equal(packsOf({ qty: 5, sale_unit: 'unit', pack_size: 15 }), 0.3333);
  assert.equal(packsOf({ qty: 2, sale_unit: 'pack', pack_size: 15 }), 2);
  assert.equal(perSaleUnit(30, 'unit', 15), 2);
  assert.equal(lineAmount({ qty: 2, price: 50, disc_percent: 10 }), 90);
  assert.equal(lineCost({ qty: 5, sale_unit: 'unit', pack_size: 15, cost: 24 }), 8);
  const s = saleTotals([
    { qty: 2, price: 50, disc_percent: 10, sale_unit: 'pack', pack_size: 1, cost: 40 },
    { qty: 1, price: 20, sale_unit: 'pack', pack_size: 1, cost: 15 },
  ], 10);
  assert.deepEqual(s, { sub_total: 110, discount_amount: 11, before_round: 99, round_off: 0, total_amount: 99, cost: 95 });
});

test('Sales: Round Off takes the Total to the nearest rupee', () => {
  assert.equal(roundOffOf(24.25), -0.25);
  assert.equal(roundOffOf(24.5), 0.5);
  assert.equal(roundOffOf(24.75), 0.25);
  assert.equal(roundOffOf(24), 0);
  const line = [{ qty: 3, price: 33.25, sale_unit: 'pack', pack_size: 1, cost: 20 }];   // 99.75
  assert.deepEqual(saleTotals(line, 0, { roundOff: true }),
    { sub_total: 99.75, discount_amount: 0, before_round: 99.75, round_off: 0.25, total_amount: 100, cost: 60 });
  assert.equal(saleTotals(line, 0).total_amount, 99.75);                                  // off: unchanged
  const down = saleTotals([{ qty: 1, price: 24.25, sale_unit: 'pack', pack_size: 1, cost: 10 }], 0, { roundOff: true });
  assert.deepEqual([down.round_off, down.total_amount], [-0.25, 24]);
});
