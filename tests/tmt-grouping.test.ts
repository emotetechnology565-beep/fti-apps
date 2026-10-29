import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groupTmtProducts,
  isTmtCategory,
  lowestTmtPrice,
  tmtCartKey,
} from '../src/features/catalog/model/tmt';
import type { Variant } from '../src/features/catalog/model/types';

test('TMT starting price finds the lowest numeric rate across brands and sizes', () => {
  const variant = (id: string, price: unknown, quoteOnly = false): Variant => ({
    id, sku: id, size_label: '12 mm', diameter_mm: 12, length_mm: null,
    uom: 'MT', min_order_qty: 1, pack_qty: null,
    attributes: { grade_list_price: price, quote_only: quoteOnly },
  });
  const variants = [
    variant('first-brand-8mm', '51675'),
    variant('second-brand-12mm', '49675'),
    variant('third-brand', '100000'),
    variant('quote-only', '100', true),
    variant('missing', undefined),
    variant('invalid', 'unknown'),
    variant('zero', '0'),
    variant('negative', '-1'),
  ];
  assert.equal(lowestTmtPrice(variants)?.amount, '49,675');
  assert.equal(lowestTmtPrice(variants)?.unit, 'PMT');
  assert.equal(lowestTmtPrice([]), null);
  assert.equal(lowestTmtPrice(variants.slice(3)), null);
});

test('TMT brands form one listing before pagination, retaining variant IDs without mutating source products', () => {
  const products = Array.from({ length: 10 }, (_, index) => ({
    id: `brand-${index}`,
    category: 'TMT',
    name: `Brand ${index}`,
    description: null,
    variants: [{ id: `variant-${index}` }],
  }));
  const round = {
    id: 'round',
    category: 'Round Bar As Rolled',
    name: 'Round Bar',
    description: null,
    variants: [],
  };
  const grouped = groupTmtProducts([round, ...products]);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0], round);
  assert.equal(grouped[1].name, 'TMT Bar');
  assert.equal(grouped[1].id, 'brand-0');
  assert.deepEqual(
    grouped[1].variants.map((v) => v.id),
    products.flatMap((p) => p.variants.map((v) => v.id)),
  );
  assert.equal(products[0].variants.length, 1);
  assert.equal(grouped.slice(0, 8).length, 2);
  assert.ok(isTmtCategory('TMT Bar'));
  assert.ok(!isTmtCategory('Round Bar'));
});

test('cart keeps optional grades separate while merging equivalent trimmed selections', () => {
  assert.notEqual(
    tmtCartKey('brand-size', ''),
    tmtCartKey('brand-size', 'Fe 500D'),
  );
  assert.notEqual(
    tmtCartKey('brand-size', 'Fe 500D'),
    tmtCartKey('brand-size', 'Fe 550D'),
  );
  assert.notEqual(
    tmtCartKey('other-size', 'Fe 500D'),
    tmtCartKey('brand-size', 'Fe 500D'),
  );
  assert.equal(
    tmtCartKey('brand-size', ' Fe 500D '),
    tmtCartKey('brand-size', 'Fe 500D'),
  );
});
