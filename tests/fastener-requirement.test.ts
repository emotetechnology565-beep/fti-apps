import assert from 'node:assert/strict';
import test from 'node:test';
import { customStandard, fastenerStepError, initialFastenerDraft, type FastenerDraft } from '../src/features/drawings/model/fastener-requirement';

const standard = (): FastenerDraft => ({
  ...initialFastenerDraft(), standard: 'IS 1363:1967', definitionId: 'drawing-1', shape: 'hex-bolt',
  dimensions: { diameter_mm: '12', length_mm: '120' }, material: 'MS', grade: 'EN-8D', thread: 'UNC',
  pitch: '20 TPI', finish: 'Zinc plating', quantity: '25', notes: '',
});

test('published requirements require a selected drawing and valid geometry before proceeding', () => {
  const draft = standard();
  assert.equal(fastenerStepError(1, draft), null);
  assert.match(fastenerStepError(1, { ...draft, definitionId: '' })!, /published drawing/);
  for (const length of ['0', '-1', '1e3', '10001', '1.2345']) {
    assert.ok(fastenerStepError(1, { ...draft, dimensions: { ...draft.dimensions, length_mm: length } }), length);
  }
  assert.match(fastenerStepError(1, { ...draft, shape: 'u-round' })!, /radius/);
  assert.match(fastenerStepError(1, { ...draft, shape: 'u-square' })!, /width/);
});

test('custom requirements support unknown dimensions only with useful notes', () => {
  const draft = { ...standard(), standard: customStandard, definitionId: '', dimensions: {} };
  assert.equal(fastenerStepError(1, draft), null);
  assert.match(fastenerStepError(4, draft)!, /Describe your custom/);
  assert.equal(fastenerStepError(4, { ...draft, notes: 'Please help specify this replacement bolt.' }), null);
  assert.equal(fastenerStepError(4, { ...draft, dimensions: { diameter_mm: '12' } }), null);
});

test('quantity must be whole pieces and material, grade, thread and finish must be explicit', () => {
  const draft = standard();
  for (const quantity of ['0', '-5', '1.5', '1000001', '']) assert.ok(fastenerStepError(4, { ...draft, quantity }));
  assert.match(fastenerStepError(2, { ...draft, grade: '' })!, /material and grade/);
  assert.match(fastenerStepError(3, { ...draft, finish: '' })!, /thread and finish/);
  assert.equal(fastenerStepError(2, { ...draft, material: 'Not sure', grade: 'Not sure' }), null);
});

test('editing restores complete requirement values without converting a TPI pitch to millimetres', () => {
  const draft = initialFastenerDraft({ subcategory: 'hex-bolt', definition_id: 'drawing-1', revision: 1,
    standard: 'IS 1363:1967', shape: 'hex-bolt', dimensions: { diameter_mm: 12, length_mm: 120 },
    material: 'MS', grade: 'EN-8D', thread: 'UNC', pitch: '20 TPI', finish: 'Zinc plating',
    with_nut: true, notes: 'Keep this note', custom: false }, 30);
  assert.deepEqual(draft.dimensions, { diameter_mm: '12', length_mm: '120' });
  assert.equal(draft.pitch, '20 TPI');
  assert.equal(draft.quantity, '30');
  assert.equal(draft.withNut, true);
  assert.equal(draft.notes, 'Keep this note');
});
