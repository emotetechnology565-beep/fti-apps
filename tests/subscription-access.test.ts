import test from 'node:test';
import assert from 'node:assert/strict';
import { canViewPublicPrices, setPriceAccess, subscribePriceAccess } from '../src/shared/lib/price-access';

test('display access expires and clears on sign-out without persisting entitlement', () => {
  const originalNow = Date.now;
  let now = Date.parse('2026-10-29T00:00:00Z');
  let notifications = 0;
  const unsubscribe = subscribePriceAccess(() => { notifications++; });
  try {
    Date.now = () => now;
    setPriceAccess(null);
    assert.equal(canViewPublicPrices(), false);
    setPriceAccess('2027-10-29T00:00:00Z');
    assert.equal(canViewPublicPrices(), true);
    now = Date.parse('2027-10-29T00:00:00Z');
    assert.equal(canViewPublicPrices(), false);
    setPriceAccess('2028-10-29T00:00:00Z');
    assert.equal(canViewPublicPrices(), true);
    setPriceAccess(null);
    assert.equal(canViewPublicPrices(), false);
    setPriceAccess('invalid');
    assert.equal(canViewPublicPrices(), false);
    assert.equal(notifications, 5);
  } finally {
    Date.now = originalNow;
    setPriceAccess(null);
    unsubscribe();
  }
});
