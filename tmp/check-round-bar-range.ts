import assert from 'node:assert/strict';
import { withinAdvertisedSizeRange as filter, type SelectionOptions } from '../src/features/catalog/model/material-selection';

const data = (slug: string): SelectionOptions => ({
  categories: [],
  category: { id: slug, slug, name: slug, product_kind: 'steel', dimension_label: 'Diameter' },
  sizes: [8, 10, 12, 16, 80, 81, 250, 251].map(n => ({ id: String(n), label: `${n} mm`, dimensions: { diameter_mm: n } })),
  options: [{ id: 'option', product_id: 'product', product_name: 'Bar', grade: 'MS', uom: 'MT', min_order_qty: 1, variant_id: null, attributes: {} }],
});
assert.deepEqual(filter(data('round-bright-bar')).sizes.map(s => s.id), ['12', '16', '80']);
assert.deepEqual(filter(data('round-bar-as-rolled')).sizes.map(s => s.id), ['12', '16', '80', '81', '250']);
assert.deepEqual(filter(data('round-bright-bar'), '8').options, []);
assert.equal(filter(data('tmt')).sizes.length, 8);
const square = data('square');
square.sizes = [10, 24, 25, 32, 150, 151].map(n => ({ id: String(n), label: `${n} mm`, dimensions: { side_mm: n } }));
assert.deepEqual(filter(square).sizes.map(s => s.id), ['25', '32', '150']);
assert.deepEqual(filter(square, '10').options, []);
console.log('Range boundaries, stale selections, and TMT preservation passed.');
