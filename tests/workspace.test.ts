import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from 'zustand/vanilla';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createWorkspaceState } from '@core/state/create-workspace-state';
import {
  WORKSPACE_STORAGE_KEY,
  persistedWorkspace,
} from '@core/state/persistence';
import type { WorkspaceState } from '@core/state/types';
import type { Product } from '@features/catalog';
import { unconfiguredCatalogRepository } from '@features/catalog/data/unconfigured-catalog-repository';

test('new installations have no seeded business records', async () => {
  const state = createStore(createWorkspaceState).getState();
  assert.deepEqual(state.catalogProducts, []);
  assert.deepEqual(state.cart, []);
  assert.deepEqual(state.saved, []);
  assert.deepEqual(state.orders, []);
  assert.deepEqual(state.rfqs, []);
  assert.equal(state.business.name, '');
  assert.equal(state.business.gstin, '');
  assert.equal(state.business.address, '');
  assert.equal(state.market, '');
  assert.deepEqual(await unconfiguredCatalogRepository.listProducts(), {
    items: [],
    total: 0,
    categories: [],
  });
  assert.ok(!('checkout' in state));
});
test('unknown product IDs cannot create cart records', () => {
  const store = createStore(createWorkspaceState);
  const before = store.getState().business;
  store.getState().add('unknown');
  assert.deepEqual(store.getState().cart, []);
  assert.equal(store.getState().business, before);
});

test('cart keeps variants separate, respects MOQ and retains products across catalogue pages', () => {
  const store = createStore(createWorkspaceState);
  const product = { id: 'tractor', moq: 1, variants: [
    { id: 'small', min_order_qty: 2 }, { id: 'large', min_order_qty: 5 },
  ] } as Product;
  store.getState().setCatalogProducts([product]);
  store.getState().add('tractor', undefined, 'small');
  store.getState().add('tractor', undefined, 'large');
  store.getState().add('tractor', undefined, 'small');
  store.getState().add('tractor', 1, 'unknown');
  store.getState().add('tractor', NaN, 'small');
  assert.deepEqual(store.getState().cart, [
    { productId: 'tractor', variantId: 'small', quantity: 4 },
    { productId: 'tractor', variantId: 'large', quantity: 5 },
  ]);
  store.getState().setCatalogProducts([{ id: 'next-page', variants: [] } as unknown as Product]);
  store.getState().quantity('tractor', 1, 'large');
  assert.equal(store.getState().cart[1].quantity, 5);
  store.getState().quantity('tractor', 0, 'small');
  assert.deepEqual(store.getState().cart, [{ productId: 'tractor', variantId: 'large', quantity: 5 }]);
});
test('persisted user records survive the feature refactor', async () => {
  const oldState = {
    ...persistedWorkspace(createStore(createWorkspaceState).getState()),
    market: 'Delhi',
    cart: [{ productId: 'previously-selected', quantity: 3 }],
    saved: ['previously-selected'],
  };
  const memory = new Map([
    [WORKSPACE_STORAGE_KEY, JSON.stringify({ state: oldState, version: 0 })],
  ]);
  const store = createStore<WorkspaceState>()(
    persist(createWorkspaceState, {
      name: WORKSPACE_STORAGE_KEY,
      storage: createJSONStorage(() => ({
        getItem: async (key) => memory.get(key) ?? null,
        setItem: async (key, value) => {
          memory.set(key, value);
        },
        removeItem: async (key) => {
          memory.delete(key);
        },
      })),
      partialize: persistedWorkspace,
      skipHydration: true,
    }),
  );
  await store.persist.rehydrate();
  assert.deepEqual(persistedWorkspace(store.getState()), oldState);
  assert.equal(typeof store.getState().saveRfqDraft, 'function');
  assert.deepEqual(store.getState().catalogProducts, []);
  store.getState().quantity('previously-selected', 0);
  assert.deepEqual(store.getState().cart, []);
});
