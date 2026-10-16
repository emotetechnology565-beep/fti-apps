import type { WorkspaceSlice } from '@core/state/types';
export type PricingSlice = {
  market: string;
  setMarket: (market: string) => void;
};
export const createPricingSlice: WorkspaceSlice<PricingSlice> = (set) => ({
  market: '',
  setMarket: (market) => set({ market }),
});
