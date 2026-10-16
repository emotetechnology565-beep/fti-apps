import { createAccountSlice } from '@features/account/model/account-slice';
import { createCartSlice } from '@features/cart/model/cart-slice';
import { createCatalogSlice } from '@features/catalog/model/catalog-slice';
import { createOrdersSlice } from '@features/orders/model/orders-slice';
import { createPricingSlice } from '@features/pricing/model/pricing-slice';
import { createQuotationsSlice } from '@features/quotations/model/quotations-slice';
import type { WorkspaceSlice, WorkspaceState } from './types';

export const createWorkspaceState: WorkspaceSlice<WorkspaceState> = (
  ...args
) => ({
  ...createPricingSlice(...args),
  ...createCatalogSlice(...args),
  ...createCartSlice(...args),
  ...createQuotationsSlice(...args),
  ...createOrdersSlice(...args),
  ...createAccountSlice(...args),
});
