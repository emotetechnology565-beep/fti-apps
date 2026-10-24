import test from 'node:test';
import assert from 'node:assert/strict';
import { createSelectionDraftStorage } from '../src/features/catalog/data/selection-draft';
import { emptySelection } from '../src/features/catalog/model/material-selection';

function setup() {
  const memory = new Map<string, string>();
  let now = 1000;
  const store = createSelectionDraftStorage({ getItem: async key => memory.get(key) ?? null, setItem: async (key, value) => { memory.set(key, value); }, removeItem: async key => { memory.delete(key); } }, () => now);
  return { store, memory, advance: (ms: number) => { now += ms; } };
}
const draft = { ...emptySelection(), category: 'sheet', sizeId: 'size', grade: 'MS', optionId: 'option', quantity: '1.5', review: true };

test('selection drafts stay isolated by user, and no private form fields are serialized', async () => {
  const { store, memory } = setup();
  await store.save('buyer-a', { ...draft, buyerName: 'Private', location: 'Private' } as typeof draft);
  assert.deepEqual(await store.load('buyer-a'), draft);
  assert.deepEqual(await store.load('buyer-b'), emptySelection());
  assert.deepEqual(await store.load(null), emptySelection());
  assert.ok(!JSON.stringify([...memory.values()]).includes('Private'));
});

test('guest draft transfers only on explicit sign-in handoff, once', async () => {
  const { store } = setup();
  await store.save(null, draft);
  assert.deepEqual(await store.load('buyer-a'), emptySelection());
  await store.prepareLogin(draft);
  assert.deepEqual(await store.load('buyer-a'), draft);
  assert.deepEqual(await store.load('buyer-b'), emptySelection());
  assert.deepEqual(await store.load(null), emptySelection());
  await store.clear('buyer-a');
  assert.deepEqual(await store.load('buyer-a'), emptySelection());
});

test('handoff expiration, corrupted storage and stale drafts recover safely', async () => {
  const { store, memory, advance } = setup();
  await store.prepareLogin(draft);
  advance(31 * 60 * 1000);
  assert.deepEqual(await store.load('buyer-a'), emptySelection());
  await store.save('buyer-a', draft);
  advance(25 * 60 * 60 * 1000);
  assert.deepEqual(await store.load('buyer-a'), emptySelection());
  memory.set('fti-material-selection-v1-buyer-a', 'broken');
  assert.deepEqual(await store.load('buyer-a'), emptySelection());
});

test('queued saves do not resurrect a cleared submitted draft', async () => {
  const { store } = setup();
  await Promise.all([store.save('buyer-a', draft), store.clear('buyer-a')]);
  assert.deepEqual(await store.load('buyer-a'), emptySelection());
});
