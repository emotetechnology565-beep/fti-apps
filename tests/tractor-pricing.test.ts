import assert from 'node:assert/strict';
import test from 'node:test';
import { tractorPricing, tractorPricingError, formatTractorPrice } from '../src/features/catalog/model/tractor-pricing';

test('tractor prices support no price, base only, and a lower discounted price', () => {
  assert.equal(tractorPricingError('', ''), null);
  assert.equal(tractorPricing({ attributes: {} }), null);
  assert.deepEqual(tractorPricing({ attributes: { base_price: '1000.00' } }), { base: 1000, discounted: null });
  assert.equal(tractorPricingError('1000', '800'), null);
  assert.deepEqual(tractorPricing({ attributes: { base_price: '1000.00', discounted_price: '800.00' } }), { base: 1000, discounted: 800 });
  assert.equal(formatTractorPrice(1000), '₹1,000.00');
});

test('invalid or misleading discounts are rejected and never shown as a sale', () => {
  for (const [base, sale] of [['', '800'], ['0', ''], ['-1', ''], ['Infinity', ''], ['1.001', ''], ['100', '100'], ['100', '101'], ['100', '-1'], ['100', '0'], ['100', '1e1'], ['100', '80.001']]) {
    assert.ok(tractorPricingError(base, sale), `${base} / ${sale}`);
  }
  assert.deepEqual(tractorPricing({ attributes: { base_price: 100, discounted_price: 120 } }), { base: 100, discounted: null });
  assert.equal(tractorPricing({ attributes: { base_price: true } }), null);
});
