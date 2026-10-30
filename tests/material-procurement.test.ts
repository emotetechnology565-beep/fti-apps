import assert from 'node:assert/strict';
import test from 'node:test';
import { cartLinePrice } from '../src/features/cart/model/line-price';
import { basketQuantitySummary } from '../src/features/cart/model/quantity-summary';
import type { CartLine } from '../src/features/cart/model/types';
import { initialPreviewState, materialScreens, previewReducer, previewTotals, requirementErrors } from '../src/features/catalog/preview/material-preview-model';

const line = (unit: string, rateUnit: string, quantity: number, amount: number): CartLine => ({ productId: 'bright', quantity, material: { key: 'bright', name: 'Bright bar', size: '40 mm', grade: 'EN-8', unit, minimum: 1, indicativePrice: { amount, unit: rateUnit, tax: 'GST extra' } } });

test('shared basket pricing converts mass units in both directions and refuses unsupported unit assumptions', () => {
  assert.equal(cartLinePrice(line('kg', 'PMT', 500, 72000))?.total, 36000);
  assert.equal(cartLinePrice(line('MT', 'kg', 0.5, 72))?.total, 36000);
  assert.equal(cartLinePrice(line('piece', 'kg', 20, 72)), null);
  assert.equal(cartLinePrice(line('bundle', 'PMT', 1, 72000)), null);
  assert.equal(cartLinePrice(line('kg', 'kg', -1, 72)), null);
});

test('tonnage summary excludes pieces and combines kilograms and tonnes', () => {
  const summary = basketQuantitySummary([line('kg', 'kg', 500, 72), line('MT', 'PMT', 1, 72000), line('piece', 'piece', 20, 10)]);
  assert.equal(summary.tonnes, 1.5);
  assert.deepEqual(summary.otherUnits, { piece: 20 });
});

test('customer cannot confirm a receipt or dispatch before staff verifies full payment', () => {
  let state = initialPreviewState();
  state = previewReducer(state, { type: 'patch', value: { access: 'buyer' } });
  state = previewReducer(state, { type: 'add' });
  state = previewReducer(state, { type: 'order' });
  state = previewReducer(state, { type: 'payment', reference: 'TEST123456', amount: 10000 });
  assert.equal(state.payment, 'review');
  assert.equal(previewReducer(state, { type: 'verify' }).payment, 'review');
  assert.equal(previewReducer(state, { type: 'dispatch', pieces: 12, carrier: 'Demo transport', tracking: 'LR123' }).dispatched, 0);
  state = previewReducer(state, { type: 'patch', value: { role: 'accounts' } });
  state = previewReducer(state, { type: 'verify' });
  assert.equal(state.payment, 'partial');
  state = previewReducer(state, { type: 'payment', reference: 'TESTSECOND', amount: previewTotals(state).due });
  state = previewReducer(state, { type: 'verify' });
  assert.equal(state.payment, 'verified');
  assert.equal(state.order, 'processing');
  state = previewReducer(state, { type: 'dispatch', pieces: 12, carrier: 'Demo transport', tracking: 'LR123' });
  assert.equal(state.dispatched, 12);
  assert.equal(state.order, 'shipped');
});

test('RFQ requires sign in and complete requirement lines, expired quotation cannot be accepted', () => {
  let state = initialPreviewState();
  assert.ok(requirementErrors(state.requirements).length);
  assert.equal(previewReducer(state, { type: 'rfq' }).rfq, 'draft');
  state = previewReducer(state, { type: 'patch', value: { access: 'buyer', requirements: state.requirements.map(item => ({ ...item, grade: item.grade || 'MS / GI / blue' })) } });
  state = previewReducer(state, { type: 'rfq' });
  assert.equal(state.rfq, 'submitted');
  state = previewReducer(state, { type: 'quote' });
  state = previewReducer(state, { type: 'patch', value: { expired: true } });
  assert.notEqual(previewReducer(state, { type: 'accept' }).rfq, 'accepted');
});

test('accepted rate survives indicative rate changes; reorder clears accepted pricing', () => {
  let state = initialPreviewState();
  state = previewReducer(state, { type: 'patch', value: { access: 'buyer' } });
  state = previewReducer(state, { type: 'quote' });
  state = previewReducer(state, { type: 'accept' });
  const accepted = previewTotals(state).total;
  state = previewReducer(state, { type: 'patch', value: { currentRate: 90 } });
  assert.equal(previewTotals(state).total, accepted);
  state = previewReducer(state, { type: 'reorder' });
  assert.equal(state.acceptedRate, null);
  assert.equal(state.rfq, 'draft');
});

test('cutting approval needs an attached revision and an explicit reason', () => {
  let state = initialPreviewState();
  assert.equal(previewReducer(state, { type: 'approveCut', reason: 'Agreed revised length' }).cuttingApproved, false);
  state = previewReducer(state, { type: 'patch', value: { uploaded: true } });
  assert.equal(previewReducer(state, { type: 'approveCut', reason: '' }).cuttingApproved, false);
  state = previewReducer(state, { type: 'approveCut', reason: 'Agreed revised length' });
  assert.equal(state.cutLength, 950);
  assert.equal(state.cuttingApproved, true);
  assert.equal(materialScreens.length, 65);
});
