import test from 'node:test';
import assert from 'node:assert/strict';
import { availableCatalogFilters, matchesCatalogSize } from '../src/features/catalog/model/available-filters';
import type { Variant } from '../src/features/catalog/model/types';

const variant = (grade: string, label: string, diameter: number | null = null): Variant => ({
  id: grade + label, sku: grade + label, size_label: label, diameter_mm: diameter,
  length_mm: null, uom: 'MT', min_order_qty: 1, pack_qty: null,
  attributes: { grade, size_group: label },
});

test('available filters exclude absent sizes and narrow grades by size', () => {
  const variants = [variant('EN-8D', '16MM TO 50MM'), variant('EN-19', '53–80 mm'), variant(' en-19 ', '53MM')];
  const all = availableCatalogFilters(variants);
  assert.deepEqual(all.grades, ['EN-19', 'EN-8D']);
  assert.ok(all.sizes.includes(16));
  assert.ok(all.sizes.includes(80));
  assert.ok(!all.sizes.includes(51));
  assert.ok(!all.sizes.includes(8));
  assert.deepEqual(availableCatalogFilters(variants, 53).grades, ['EN-19']);
  assert.deepEqual(availableCatalogFilters(variants, 16).grades, ['EN-8D']);
  assert.deepEqual(availableCatalogFilters([]), { sizes: [], grades: [] });
});

test('size matching respects exact diameters, all sizes, and unknown labels', () => {
  assert.equal(matchesCatalogSize(variant('MS', 'All sizes', 20), 16), false);
  assert.equal(matchesCatalogSize(variant('MS', 'All sizes', 20), 20), true);
  assert.equal(matchesCatalogSize(variant('MS', 'All sizes'), 16), true);
  assert.equal(matchesCatalogSize(variant('MS', '20 mm'), 20), true);
  assert.equal(matchesCatalogSize(variant('MS', 'Unspecified'), 20), false);
});
