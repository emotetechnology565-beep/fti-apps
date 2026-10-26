import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  calculateWeight,
  categoryWeightColumn,
  drawingWeightTarget,
  weightQuantity,
  type WeightRow,
} from '../src/features/drawings/model/weight';
import type { DrawingDefinition } from '../src/features/drawings/model/types';
const definitions = JSON.parse(
  readFileSync(
    'deployment/fastener-dimensions/hex-source-definitions.json',
    'utf8',
  ),
) as DrawingDefinition[];
const bolt = definitions.find(
  (row) => row.shape === 'hex-bolt' && row.size === 'M6',
)!;

test('Drawing weight uses matching edition, pitch, length and supply assembly', () => {
  const without = drawingWeightTarget(bolt, 20, false)!;
  assert.deepEqual(without.charts, ['07 Half bolts only Metric']);
  assert.ok(without.columns.includes('DIAMETER / M6'));
  const withNut = drawingWeightTarget(bolt, 20, true)!;
  assert.ok(withNut.charts.includes('01 Half bolts+nuts Metric 1'));
  assert.ok(withNut.columns.includes('M 6'));
  const full = drawingWeightTarget(
    {
      ...bolt,
      shape: 'hex-screw',
      dimensions: { ...bolt.dimensions, thread_end_allowance: 4 },
    },
    20,
    false,
  )!;
  assert.ok(full.charts.includes('09 Full bolts only Metric 1'));
  assert.ok(full.rows.includes('20 mm'));
  assert.equal(drawingWeightTarget(bolt, 10, false), null);
  for (const changed of [
    { ...bolt, edition: '1992' },
    { ...bolt, standard: 'IS 1364' },
    { ...bolt, size: 'M6 x 0.75 Fine' },
    { ...bolt, dimensions: { ...bolt.dimensions, pitch: 0.75 } },
    { ...bolt, shape: 'lock-nut' as const },
  ])
    assert.equal(drawingWeightTarget(changed, 120, false), null);
  const nut = { ...bolt, shape: 'hex-nut' as const, edition: '1992' };
  assert.deepEqual(drawingWeightTarget(nut, 0, false)?.columns, [
    'NEW SPEC IS 1363/92',
  ]);
});
test('Quantity calculation does not divide generated per-piece weights a second time', () => {
  const row: WeightRow = {
    chart: '01 Half bolts+nuts Metric 1',
    row_label: '20mm',
    column_label: 'M 6',
    weight_basis: '100_pieces',
    weight_kg_per_piece: '0.00812',
    weight_kg_per_metre: null,
  };
  const result = calculateWeight([row], 250)!;
  assert.equal(result.each, 0.00812);
  assert.ok(Math.abs(result.total - 2.03) < 1e-12);
  assert.equal(calculateWeight([row, row], 1), null);
  assert.equal(calculateWeight([], 1), null);
  assert.equal(
    calculateWeight([{ ...row, weight_kg_per_piece: null }], 1),
    null,
  );
  assert.equal(calculateWeight([{ ...row, weight_basis: 'metre' }], 1), null);
  for (const invalid of ['', '0', '-1', '1.5', '2e3', 'Infinity', '1000001'])
    assert.equal(weightQuantity(invalid), null);
  assert.equal(weightQuantity('250'), 250);
  assert.equal(
    categoryWeightColumn('plain-washer', 'MACHINED WASHER / IS:2016'),
    false,
  );
  assert.equal(
    categoryWeightColumn('heavy-hex-nut', 'ASTM A-194 / UNC HEAVY HEX NUTS'),
    true,
  );
  assert.equal(
    categoryWeightColumn('heavy-hex-nut', 'OLD SPEC IS 1363/67'),
    false,
  );
});
