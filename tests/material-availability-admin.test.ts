import test from 'node:test';
import assert from 'node:assert/strict';
import { materialMinimumError, parseMaterialDimensions } from '../src/features/catalog/model/material-availability-admin';

test('category dimensions accept thin sheets and multi-dimensional flat sizes without a shared size whitelist', () => {
  assert.deepEqual(parseMaterialDimensions(['thickness_mm'], { thickness_mm: '2.5' }), { thickness_mm: 2.5 });
  assert.deepEqual(parseMaterialDimensions(['width_mm', 'thickness_mm'], { width_mm: '50', thickness_mm: '6.125' }), { width_mm: 50, thickness_mm: 6.125 });
  assert.deepEqual(parseMaterialDimensions(['length_mm'], { length_mm: '999999999' }), { length_mm: 999999999 });
  assert.deepEqual(parseMaterialDimensions(['thickness_mm', 'width_mm'], { thickness_mm: '2.5', width_mm: '' }), { thickness_mm: 2.5 });
  assert.deepEqual(parseMaterialDimensions(['length_mm'], { length_mm: '999999999.999' }), { length_mm: 999999999.999 });
  for (const value of ['', '-1', '0', 'Infinity', '1e3', '1.2345', '1000000000', '1000000001']) {
    assert.throws(() => parseMaterialDimensions(['thickness_mm'], { thickness_mm: value }), /must be positive/);
  }
  assert.throws(() => parseMaterialDimensions(['width_mm', 'thickness_mm'], { thickness_mm: '6' }), /Width/);
  assert.throws(() => parseMaterialDimensions(['diameter_mm', 'diameter_mm'], { diameter_mm: '16' }), /different dimension/);
  assert.throws(() => parseMaterialDimensions(['unknown'], { unknown: '16' }), /different dimension/);
});

test('availability minimum quantities preserve a linked price minimum and reject invalid decimal input', () => {
  assert.equal(materialMinimumError('0.125'), null);
  assert.equal(materialMinimumError('2.5', 2), null);
  assert.match(materialMinimumError('1.5', 2)!, /at least 2/);
  for (const value of ['0', '-1', '1.2345', '1e3', 'NaN', '']) {
    assert.match(materialMinimumError(value)!, /positive minimum/);
  }
});
