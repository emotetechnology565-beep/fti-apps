import { useSyncExternalStore } from 'react';
import { canViewPublicPrices, subscribePriceAccess } from '../lib/price-access';
export function usePriceAccess() {
  return useSyncExternalStore(
    subscribePriceAccess,
    canViewPublicPrices,
    () => false,
  );
}
