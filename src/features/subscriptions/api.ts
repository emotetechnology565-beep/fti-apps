import { supabase } from '@core/api/supabase-client';
export type SubscriptionStatus = {
  amount_paise: number;
  revision: number;
  currency: 'INR';
  active: boolean;
  expires_at: string | null;
  purchases: {
    id: string;
    amount_paise: number;
    status: 'created' | 'paid';
    created_at: string;
    expires_at: string | null;
  }[];
};
export async function subscriptionRpc<T>(
  operation: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!supabase) throw new Error('Subscription service is not configured.');
  const { data, error } = await supabase.rpc(operation, args);
  if (error)
    throw new Error(
      error.code === 'PGRST202'
        ? 'Subscriptions are not available yet. Please try again later.'
        : error.message,
    );
  return data as T;
}
export const loadSubscription = () =>
  subscriptionRpc<SubscriptionStatus>('fti_subscription_status');
export async function paymentRequest<T>(
  body: Record<string, unknown>,
): Promise<T> {
  if (!supabase) throw new Error('Subscription service is not configured.');
  const { data, error } = await supabase.functions.invoke('subscriptions', {
    body,
  });
  if (error) {
    let message = 'Payment could not be completed. Please try again.';
    if (error.context instanceof Response) {
      try {
        message = (await error.context.json()).message ?? message;
      } catch {
        /* retain safe fallback */
      }
    }
    throw new Error(message);
  }
  return data.data as T;
}
