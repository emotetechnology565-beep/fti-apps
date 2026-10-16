import type { WorkspaceSlice } from '@core/state/types';
import type { Order } from './types';
export type OrdersSlice = { orders: Order[] };
export const createOrdersSlice: WorkspaceSlice<OrdersSlice> = () => ({
  orders: [],
});
