import type { AccountSlice } from '@features/account/model/account-slice';
import type { CartSlice } from '@features/cart/model/cart-slice';
import type { CatalogSlice } from '@features/catalog/model/catalog-slice';
import type { OrdersSlice } from '@features/orders/model/orders-slice';
import type { PricingSlice } from '@features/pricing/model/pricing-slice';
import type { QuotationsSlice } from '@features/quotations/model/quotations-slice';
import type { StateCreator } from 'zustand';
export type WorkspaceState = PricingSlice &
  CatalogSlice &
  CartSlice &
  QuotationsSlice &
  OrdersSlice &
  AccountSlice;
export type WorkspaceSlice<T> = StateCreator<WorkspaceState, [], [], T>;
