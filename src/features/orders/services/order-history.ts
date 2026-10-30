import type { PaymentSummary } from '../model/order-payments';
import { supabase } from '@core/api/supabase-client';

export type HistoryOrder = {
  payment_summary?: PaymentSummary;
  id: string;
  kind: 'commerce' | 'material' | 'fastener';
  reference: string;
  status: string;
  created_at: string;
  total: string | null;
  amount_due: string | null;
  details: {
    material?: string;
    size?: string;
    grade?: string;
    quantity?: string;
    unit?: string;
    business?: string;
    location?: string;
  };
  fulfillment: {
    closure_note?: string | null;
    carrier?: string;
    tracking_number?: string;
    vehicle_number?: string;
    history?: { status: string; at: string }[];
    driver_name?: string | null;
    driver_phone?: string | null;
    confirmation_note?: string;
    delivery_note?: string;
  };
};
export async function orderHistory(
  offset: number,
  search: string,
  status: string,
) {
  if (!supabase) throw new Error('Ordering service is not configured.');
  const { data, error } = await supabase.rpc('fti_customer_orders', {
    p_offset: offset,
    p_search: search.trim(),
    p_status: status,
  });
  if (error)
    throw new Error(
      error.code === 'PGRST202'
        ? 'Order history needs the latest database update. Please contact FTI support.'
        : error.message,
    );
  return data as { orders: HistoryOrder[]; total: number };
}
