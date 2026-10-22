import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeNet, gradeRowsError, newGradeRow } from '../src/features/catalog/model/grade-sheet';

const row = () => ({ grade: 'EN-8D', base_price: '40000', base_charge: '4000', profile: '1000', rolling: '8500',
  size_groups: [{ label: '16MM TO 50MM', add_price: '0' }, { label: '53MM TO 80MM', add_price: '1000' }] });

test('grade net excludes size addition until a size group is selected, with exact decimals', () => {
  assert.equal(gradeNet(row()), '53500.0000');
  assert.equal(gradeNet(row(), '1000'), '54500.0000');
  assert.equal(gradeNet({ ...row(), base_price: '0.1', base_charge: '0.2', profile: '0', rolling: '0' }), '0.3000');
});

test('missing costs remain incomplete and cannot be published as zero', () => {
  const missing = { ...row(), rolling: '' };
  assert.equal(gradeNet(missing), null);
  assert.equal(gradeRowsError([missing]), null);
  assert.match(gradeRowsError([missing], true)!, /Rolling/);
  assert.equal(gradeRowsError([{ ...row(), base_price: '0' }], true), null);
  assert.match(gradeRowsError([{ ...row(), base_price: '0', base_charge: '0', profile: '0', rolling: '0' }], true)!, /greater than zero/);
  for (const value of ['NaN', 'Infinity', '-1', '1e3', '1.00001', '1000000000000']) {
    assert.equal(gradeNet({ ...row(), rolling: value }), null);
    assert.ok(gradeRowsError([{ ...row(), rolling: value }]));
  }
  assert.ok(gradeRowsError([newGradeRow()]));
});

test('duplicate brands, grades and size groups are caught before saving', () => {
  assert.match(gradeRowsError([row(), { ...row(), grade: ' en-8d ' }])!, /twice/);
  assert.match(gradeRowsError([{ ...row(), size_groups: [{ label: 'All sizes', add_price: '0' }, { label: ' all sizes ', add_price: '1' }] }])!, /twice/);
  assert.equal(gradeRowsError([{ ...row(), grade: 'ZARA TMT' }], true), null);
});
