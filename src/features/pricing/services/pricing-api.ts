import { supabase } from '@core/api/supabase-client';
import type { Market, PricingAdmin, RateHistory, RatesPage } from '../model/types';
import { requestPricing } from './pricing-request';
export async function pricingRpc<T>(operation: string, args: Record<string, unknown> = {}): Promise<T> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabase || !url || !key) throw new Error('Pricing service is not configured.');
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error('Your pricing session could not be restored. Sign in again and complete authenticator verification.');
  return requestPricing<T>({ url, key, accessToken: data.session?.access_token }, operation, args);
}
export const pricingApi = {
  markets: () => pricingRpc<Market[]>('fti_pricing_markets'),
  rates: (market: string, search: string, offset: number) => pricingRpc<RatesPage>('fti_pricing_rates', { p_market: market, p_search: search, p_offset: offset }),
  history: (market: string, variant: string, offset: number) => pricingRpc<RateHistory[]>('fti_pricing_history', { p_market: market, p_variant: variant, p_offset: offset }),
  admin: (offset: number) => pricingRpc<PricingAdmin>('fti_pricing_admin', { p_offset: offset }),
};
