import test from 'node:test';
import assert from 'node:assert/strict';
import {
  changeSelection,
  emptySelection,
  quantityError,
  selectedOption,
  selectionPrice,
  type SelectionOption,
} from '../src/features/catalog/model/material-selection';
import { loginReturnPath } from '../src/features/auth/model/login-return';
import {
  manualEstimate,
  type ManualPreview,
} from '../src/features/catalog/model/manual-material';

const option: SelectionOption = {
  id: 'one',
  product_id: 'product',
  product_name: 'Round bar',
  grade: 'EN-8D',
  uom: 'MT',
  min_order_qty: 1,
  variant_id: null,
  attributes: {},
};

test('category and size changes clear incompatible selection and quantity', () => {
  const draft = {
    ...emptySelection(),
    category: 'sheet',
    sizeId: '2.5mm',
    grade: 'MS',
    optionId: 'sheet-ms',
    quantity: '2',
    review: true,
  };
  assert.deepEqual(changeSelection(draft, 'category', 'flat'), {
    ...emptySelection(),
    category: 'flat',
  });
  assert.deepEqual(changeSelection(draft, 'sizeId', '3mm'), {
    ...draft,
    sizeId: '3mm',
    grade: '',
    optionId: '',
    quantity: '',
    review: false,
  });
  assert.equal(changeSelection(draft, 'grade', 'EN-8').optionId, '');
  assert.equal(changeSelection(draft, 'quantity', '3').review, false);
});

test('matching grade never silently selects the first of several products', () => {
  const draft = { ...emptySelection(), grade: 'EN-8D' };
  const other = { ...option, id: 'two', product_id: 'other' };
  assert.equal(selectedOption(draft, [option]), option);
  assert.equal(selectedOption(draft, [option, other]), undefined);
  assert.equal(
    selectedOption({ ...draft, optionId: 'two' }, [option, other]),
    other,
  );
  assert.equal(
    selectedOption({ ...draft, optionId: 'removed' }, [option]),
    undefined,
  );
  assert.equal(
    selectedOption({ ...draft, grade: 'MS', optionId: 'one' }, [option]),
    undefined,
  );
});

test('quantity accepts actual units and decimal amounts, enforces MOQ and precision', () => {
  assert.equal(quantityError('1.125', option), null);
  assert.match(quantityError('0.5', option)!, /Minimum quantity is 1 MT/);
  for (const invalid of ['0', '-1', '1e3', '1.0001', 'NaN', 'Infinity', ''])
    assert.ok(quantityError(invalid, option));
  assert.ok(quantityError('2', undefined));
  assert.equal(
    quantityError('0.125', { ...option, uom: 'kg', min_order_qty: 0.1 }),
    null,
  );
});

test('price presentation preserves missing-price and Sheet GST behavior', () => {
  assert.equal(selectionPrice(option), null);
  assert.equal(
    selectionPrice({
      ...option,
      attributes: { quote_only: true, grade_list_price: '123' },
    }),
    null,
  );
  assert.deepEqual(
    selectionPrice({
      ...option,
      attributes: { sheet_flat_net_prate: '65000' },
    }),
    { amount: '65,000', unit: 'PMT', tax: 'Including 18% GST' },
  );
  assert.equal(
    selectionPrice({
      ...option,
      uom: 'kg',
      attributes: { sheet_flat_net_prate: '65000' },
    })?.unit,
    'PMT',
  );
  assert.equal(
    selectionPrice({
      ...option,
      attributes: { grade_list_price: '13500', grade_list_gst_included: false },
    })?.tax,
    'Excluding GST',
  );
});

test('login return accepts only the catalogue purpose, never a supplied URL', () => {
  assert.equal(loginReturnPath('material-selection'), '/products');
  for (const unsafe of [
    'https://example.com',
    '//example.com',
    '/admin',
    '/products',
    ['material-selection'],
    null,
  ])
    assert.equal(loginReturnPath(unsafe), '/account');
});

test('manual-size pricing calculates totals and converts kg to tonnes without changing requested size', () => {
  const preview: ManualPreview = {
    status: 'available',
    size_status: 'rounded',
    category: null,
    matched_size: {
      id: 'pricing-16',
      label: '16 mm',
      dimensions: { diameter_mm: 16 },
    },
    grades: ['EN-8D'],
    option: {
      ...option,
      attributes: { grade_list_price: '13500', grade_list_gst_included: false },
    },
  };
  assert.equal(manualEstimate(preview, '2')?.total, '27,000');
  assert.equal(preview.matched_size?.label, '16 mm');
  const sheet = {
    ...preview,
    option: {
      ...option,
      uom: 'kg' as const,
      min_order_qty: 1,
      attributes: { sheet_flat_net_prate: '65000' },
    },
  };
  assert.equal(manualEstimate(sheet, '500')?.total, '32,500');
  assert.equal(manualEstimate(sheet, '500')?.tax, 'Including 18% GST');
  assert.equal(
    manualEstimate(
      { ...preview, option: { ...option, attributes: { quote_only: true } } },
      '2',
    ),
    null,
  );
  assert.equal(manualEstimate(preview, '0.1')?.total, null);
});
