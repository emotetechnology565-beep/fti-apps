import { pricingRpc } from '@features/pricing/services/pricing-api';
import type { Category, Location } from './model';
export type SaleQuote = {
  id: string;
  sale_price: string;
  published_at: string;
  price_change: string | null;
};
export type MarketQuote = SaleQuote & {
  location_id: string;
  category: Category;
  state: string;
  district: string;
};
export type CustomerOptions = {
  locations: Location[];
  settings: { notes: string; support: string; sms: string; whatsapp: string };
};
export const customerMarketApi = {
  options: () =>
    pricingRpc<CustomerOptions>('fti_pricing_market_customer_options'),
  board: (
    category: Category,
    states: string[],
    districts: string[],
    search: string,
    offset: number,
  ) =>
    pricingRpc<{ items: MarketQuote[]; total: number }>(
      'fti_pricing_market_customer_board',
      {
        p_category: category,
        p_states: states,
        p_districts: districts,
        p_search: search,
        p_offset: offset,
      },
    ),
  history: (location: string, from: string, to: string, offset: number) =>
    pricingRpc<SaleQuote[]>('fti_pricing_market_customer_history', {
      p_location: location,
      p_from: from || null,
      p_to: to || null,
      p_offset: offset,
    }),
};
