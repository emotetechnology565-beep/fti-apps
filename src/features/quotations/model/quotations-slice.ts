import type { WorkspaceSlice } from '@core/state/types';
import type { RFQ } from '@features/quotations';
export type QuotationsSlice = {
  rfqs: RFQ[];
  saveRfqDraft: (title: string, quantity: string, notes: string) => string;
};
export const createQuotationsSlice: WorkspaceSlice<QuotationsSlice> = (
  set,
) => ({
  rfqs: [],
  saveRfqDraft: (title, quantity, notes) => {
    const id = 'RFQ-DRAFT-' + Date.now().toString().slice(-7);
    set((s) => ({
      rfqs: [
        {
          id,
          title,
          quantity,
          notes,
          status: 'Draft',
          created: new Date().toLocaleDateString('en-IN'),
        },
        ...s.rfqs,
      ],
    }));
    return id;
  },
});
