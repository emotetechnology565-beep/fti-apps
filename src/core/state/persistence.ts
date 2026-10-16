import type { WorkspaceState } from './types';

// Retain the original key and JSON shape so existing installations hydrate normally.
export const WORKSPACE_STORAGE_KEY = 'fti-demo-v1';
export type PersistedWorkspace = Pick<
  WorkspaceState,
  'market' | 'cart' | 'saved' | 'rfqs' | 'orders' | 'business'
>;
export function persistedWorkspace({
  market,
  cart,
  saved,
  rfqs,
  orders,
  business,
}: WorkspaceState): PersistedWorkspace {
  return { market, cart, saved, rfqs, orders, business };
}
