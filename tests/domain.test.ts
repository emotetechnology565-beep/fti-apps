import test from 'node:test';
import assert from 'node:assert/strict';
import { roundBarWeight } from '@features/calculator';
import { totals } from '@features/cart';

test('empty carts do not invent taxes or payable totals', () => {
  assert.deepEqual(totals([], '', []), { subtotal: 0, gst: null, total: null });
});
test('unknown materials cannot produce a financial estimate', () => {
  assert.deepEqual(totals([{ productId: 'unknown', quantity: 1 }], '', []), {
    subtotal: null,
    gst: null,
    total: null,
  });
});
test('round bar mass converts millimetres to metres correctly', () => {
  const weight = roundBarWeight(12, 12, 100)!;
  assert.ok(Math.abs(weight - 1065.38) < 0.01);
  assert.ok(Math.abs(roundBarWeight(24, 12, 100)! / weight - 4) < 0.00001);
});
test('invalid dimensions and fractional counts are rejected', () => {
  assert.equal(roundBarWeight(0, 12, 1), null);
  assert.equal(roundBarWeight(12, -1, 1), null);
  assert.equal(roundBarWeight(12, 12, 1.5), null);
  assert.equal(roundBarWeight(Infinity, 12, 1), null);
});
