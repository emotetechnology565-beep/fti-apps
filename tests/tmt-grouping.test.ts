import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groupTmtProducts,
  isTmtCategory,
  tmtCartKey,
} from '../src/features/catalog/model/tmt';

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
