import type { PaymentSummary } from '@features/orders/model/order-payments';
import type { OrderKind } from '@features/orders/model/order-actions';
import type { RequestFulfillmentState } from '@features/operations/model/request-fulfillment';

export type OrderFilters = {
  search: string;
  kind: OrderKind | 'all';
  status: string;
  from: string;
  to: string;
};
export const emptyOrderFilters: OrderFilters = {
  search: '',
  kind: 'all',
  status: 'all',
  from: '',
  to: '',
};
export type AdminOrder = {
  payment_summary?: PaymentSummary;
  id: string;
  kind: OrderKind;
  reference: string;
  status: string;
  created_at: string;
  buyer_name: string;
  phone: string;
  business: string;
  location: string;
  material: string;
  quantity: string;
  grade: string;
  size: string;
  total: string | null;
  amount_due: string | null;
  closure_note: string | null;
  fulfillment: RequestFulfillmentState;
};
export type OrderSummary = {
  total: number;
  awaiting: number;
  active: number;
  processing: number;
  shipped: number;
  delivered: number;
  cancelled: number;
  rejected: number;
  confirmed_value: string;
};
export type AdminOrdersResult = { orders: AdminOrder[]; summary: OrderSummary };
export const orderKinds = [
  ['all', 'All types'],
  ['commerce', 'Parts'],
  ['material', 'Materials'],
  ['fastener', 'Fasteners'],
] as const;
export const orderStates = [
  ['all', 'All statuses'],
  ['pending_confirmation', 'Awaiting confirmation'],
  ['pending_payment', 'Awaiting payment'],
  ['confirmed', 'Confirmed'],
  ['processing', 'Processing'],
  ['shipped', 'Dispatched'],
  ['partially_shipped', 'Part dispatched'],
  ['delivered', 'Delivered'],
  ['cancelled', 'Cancelled'],
  ['rejected', 'Rejected'],
  ['refunded', 'Refunded'],
  ['expired', 'Expired'],
] as const;
export const orderStateLabel = (status: string) =>
  orderStates.find(([key]) => key === status)?.[1] ?? status;
export const orderKindLabel = (kind: string) =>
  orderKinds.find(([key]) => key === kind)?.[1] ?? kind;
export const indiaDate = (date = new Date()) =>
  new Date(date.getTime() + 330 * 60_000).toISOString().slice(0, 10);
export function orderDateRange(days: number, now = new Date()) {
  return {
    from: indiaDate(new Date(now.getTime() - (days - 1) * 86400000)),
    to: indiaDate(now),
  };
}
export function orderFilterError(filters: OrderFilters): string | null {
  const validDate = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
  if (
    (filters.from && !validDate(filters.from)) ||
    (filters.to && !validDate(filters.to))
  )
    return 'Enter dates as YYYY-MM-DD.';
  if (filters.from && filters.to && filters.from > filters.to)
    return 'From date must be on or before to date.';
  if (filters.search.trim().length > 200)
    return 'Search must be 200 characters or fewer.';
  return null;
}
