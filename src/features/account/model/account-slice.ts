import type { WorkspaceSlice } from '@core/state/types';
export type AccountSlice = {
  business: { name: string; gstin: string; address: string; status: string };
  saveBusiness: (name: string, gstin: string, address: string) => void;
};
export const createAccountSlice: WorkspaceSlice<AccountSlice> = (set) => ({
  business: {
    name: '',
    gstin: '',
    address: '',
    status: 'Not submitted',
  },
  saveBusiness: (name, gstin, address) =>
    set({
      business: { name, gstin, address, status: 'Local draft' },
    }),
});
