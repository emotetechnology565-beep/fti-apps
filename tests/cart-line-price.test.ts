import test from 'node:test';
import assert from 'node:assert/strict';
import { cartLinePrice } from '../src/features/cart/model/line-price';
import type { CartLine } from '../src/features/cart/model/types';
const line: CartLine = {
  productId: 'raw',
  quantity: 250,
  material: {
    key: 'kg',
    name: 'Steel',
    size: '12 mm',
    grade: 'EN8',
    minimum: 100,
    unit: 'kg',
    indicativePrice: { amount: 19000, unit: 'PMT', tax: 'Excluding GST' },
  },
};
test('material price converts kilograms to tonnes without adding unconfirmed charges', () => {
  assert.equal(cartLinePrice(line)?.total, 4750);
  assert.equal(cartLinePrice({ ...line, quantity: 500 })?.total, 9500);
  assert.equal(
    cartLinePrice({
      ...line,
      material: { ...line.material!, unit: 'MT' },
      quantity: 3,
    })?.total,
    57000,
  );
});
test('unpriced, incompatible and invalid material quantities do not produce a total', () => {
  assert.equal(
    cartLinePrice({
      ...line,
      material: { ...line.material!, indicativePrice: undefined },
    }),
    null,
  );
  assert.equal(cartLinePrice({ ...line, quantity: NaN }), null);
  assert.equal(
    cartLinePrice({ ...line, material: { ...line.material!, unit: 'piece' } }),
    null,
  );
});
