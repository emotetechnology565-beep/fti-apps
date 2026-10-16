import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createWorkspaceState } from './create-workspace-state';
import { persistedWorkspace } from './persistence';
import type { WorkspaceState } from './types';
export const useStore = create<WorkspaceState>()(
  persist(createWorkspaceState, {
    name: 'fti-workspace-loading',
    storage: createJSONStorage(() => AsyncStorage),
    partialize: persistedWorkspace,
    skipHydration: true,
  }),
);
let pending = Promise.resolve();
export function activateWorkspace(userId: string | null) {
  pending = pending
    .catch(() => {})
    .then(async () => {
      const name = userId
        ? `fti-workspace-v2-${userId}`
        : 'fti-workspace-v2-guest';
      const raw = await AsyncStorage.getItem(name);
      useStore.persist.setOptions({ name });
      const initial = useStore.getInitialState();
      let data: Partial<WorkspaceState> = {};
      try {
        if (raw) data = JSON.parse(raw).state ?? {};
      } catch {
        /* Recover from corrupt local storage with empty state. */
      }
      // Only drafts/preferences are restored, never identity, permissions, catalog or server records.
      useStore.setState(
        {
          ...initial,
          market: typeof data.market === 'string' ? data.market : '',
          cart: Array.isArray(data.cart) ? data.cart : [],
          saved: Array.isArray(data.saved) ? data.saved : [],
          rfqs: Array.isArray(data.rfqs) ? data.rfqs : [],
          orders: [],
          business: initial.business,
        },
        true,
      );
    });
  return pending;
}
