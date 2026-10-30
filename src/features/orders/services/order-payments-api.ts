import { supabase } from '@core/api/supabase-client';
import type { OrderKind } from '../model/order-actions';
import type { PaymentDraft, PaymentSummary } from '../model/order-payments';

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Order payments are not configured.');
  const { data, error } = await supabase.rpc(name, args);
  if (error)
    throw new Error(
      error.code === 'PGRST202'
        ? 'Payment tracking needs the latest database update.'
        : error.message,
    );
  return data as T;
}
export const orderPayments = (kind: OrderKind, id: string) =>
  rpc<PaymentSummary>('fti_order_payments', { p_kind: kind, p_id: id });
export const recordOrderPayment = (
  kind: OrderKind,
  id: string,
  draft: PaymentDraft,
) =>
  rpc<PaymentSummary>('fti_order_receipt_record', {
    p_kind: kind,
    p_id: id,
    p_details: draft,
  });
export const orderStepWithPayment = (
  action: 'confirm' | 'dispatch' | 'deliver',
  id: string,
  details: Record<string, unknown>,
) =>
  rpc<PaymentSummary>('fti_order_step_with_payment', {
    p_action: action,
    p_order: id,
    p_details: details,
  });
