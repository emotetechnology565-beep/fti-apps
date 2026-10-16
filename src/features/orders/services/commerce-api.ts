import { supabase } from '@core/api/supabase-client';
import type { DeliveryAddress, OrderDetail, OrderSummary, PaymentReview, StockLocation, StockRow } from '../model/commerce-types';

export async function commerceRpc<T>(operation: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new Error('Commerce service is not configured.');
  const { data, error } = await supabase.functions.invoke('commerce', { body: { operation, arguments: args } });
  if (error) {
    let message = 'Commerce service is unavailable. Please try again.';
    if (error.context instanceof Response) {
      try { const body = await error.context.json(); if (typeof body.message === 'string') message = body.message; }
      catch { /* No structured error body. */ }
    }
    throw new Error(message);
  }
  return data.data as T;
}

export const commerceApi = {
  mine: (offset = 0) => commerceRpc<OrderSummary[]>('fti_commerce_my', { p_offset: offset }),
  detail: (id: string) => commerceRpc<OrderDetail>('fti_commerce_detail', { p_id: id }),
  addresses: () => commerceRpc<DeliveryAddress[]>('fti_commerce_addresses'),
  saveAddress: (line1: string, city: string, state: string, pincode: string) =>
    commerceRpc<string>('fti_commerce_address_save', { p_line1: line1, p_city: city, p_state: state, p_pincode: pincode }),
  placeQuote: (requestId: string, quote: string, address: string) =>
    commerceRpc<{ id: string; replayed: boolean }>('fti_commerce_quote_order', {
      p_request_id: requestId, p_quote: quote, p_address: address,
    }),
  bankSubmit: (order: string, reference: string) =>
    commerceRpc<{ id: string; replayed: boolean }>('fti_commerce_bank_submit', { p_order: order, p_utr: reference }),
  stock: () => commerceRpc<{ locations: StockLocation[]; inventory: StockRow[] }>('fti_commerce_stock'),
  createLocation: (code: string, name: string, city: string) =>
    commerceRpc<string>('fti_commerce_location_create', { p_code: code, p_name: name, p_city: city }),
  adjustStock: (variant: string, location: string, delta: string, reason: string, reference: string) =>
    commerceRpc<{ on_hand: string; reserved: string; available: string }>('fti_commerce_stock_adjust', {
      p_variant: variant, p_location: location, p_delta: delta, p_reason: reason, p_reference: reference,
    }),
  policy: () => commerceRpc<{ reservation_hours: number; updated_at: string } | null>('fti_commerce_policy_get'),
  setPolicy: (hours: number) => commerceRpc<void>('fti_commerce_policy_set', { p_hours: hours }),
  paymentQueue: (offset = 0) => commerceRpc<PaymentReview[]>('fti_commerce_payment_queue', { p_offset: offset }),
  paymentDecide: (id: string, approved: boolean, note: string) =>
    commerceRpc<void>('fti_commerce_payment_decide', { p_payment: id, p_approved: approved, p_note: note }),
  expire: () => commerceRpc<number>('fti_commerce_expire', { p_limit: 20 }),
};
