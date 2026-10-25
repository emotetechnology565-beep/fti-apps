import test from 'node:test';
import assert from 'node:assert/strict';
import { isSheetFlatCategory, sheetFlatPricing } from '../src/features/catalog/model/sheet-flat-pricing';

test('Sheet and Flat net rates exclude GST and retain base plus Vadha', () => {
  assert.deepEqual(sheetFlatPricing('52900', '3300'), {
    base: '52900.00', vadha: '3300.00', total: '56200.00', gst: '0.00', net: '56200.00',
  });
  assert.equal(sheetFlatPricing('53000', '6000')?.net, '59000.00');
  assert.equal(sheetFlatPricing('55000', '6000')?.net, '61000.00');
  assert.equal(sheetFlatPricing('0.25', '0')?.gst, '0.00');
});

test('incomplete or invalid prices cannot produce a saved rate', () => {
  for (const value of ['', '-1', 'NaN', 'Infinity', '1e3', '1.001', '1000000000000']) {
    assert.equal(sheetFlatPricing(value, '0'), null);
    assert.equal(sheetFlatPricing('52900', value), null);
  }
  assert.equal(sheetFlatPricing('0', '3300'), null);
  assert.equal(sheetFlatPricing('52900', '0')?.net, '52900.00');
});

test('only Sheet and Flat categories use the specialized product fields', () => {
  for (const category of ['sheet', 'flat', 'Sheet MS', 'FLAT MS']) assert.equal(isSheetFlatCategory(category), true);
  for (const category of ['square', 'round-bright-bar', 'sheet-metal-tools']) assert.equal(isSheetFlatCategory(category), false);
});
