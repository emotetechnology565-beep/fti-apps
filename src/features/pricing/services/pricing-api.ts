import { supabase } from '@core/api/supabase-client';
import type { Market, PricingAdmin, RateHistory, RatesPage } from '../model/types';
export async function pricingRpc<T>(operation: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new Error('Pricing service is not configured.');
  const { data, error } = await supabase.functions.invoke('pricing', { body: { operation, arguments: args } });
  if (error) {
    let message = 'Pricing service is unavailable. Please try again.';
    if (error.context instanceof Response) {
      try { const body = await error.context.json(); if (typeof body.message === 'string') message = body.message; }
      catch { /* Gateway response was not JSON. */ }
    }
    throw new Error(message);
  }
  return data.data as T;
}
export const pricingApi = {
  markets: () => pricingRpc<Market[]>('fti_pricing_markets'),
  rates: (market: string, search: string, offset: number) => pricingRpc<RatesPage>('fti_pricing_rates', { p_market: market, p_search: search, p_offset: offset }),
  history: (market: string, variant: string, offset: number) => pricingRpc<RateHistory[]>('fti_pricing_history', { p_market: market, p_variant: variant, p_offset: offset }),
  admin: (offset: number) => pricingRpc<PricingAdmin>('fti_pricing_admin', { p_offset: offset }),
};
