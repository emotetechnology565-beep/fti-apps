import { pricingRpc } from '@features/pricing/services/pricing-api';
import type { Category, MarketAdmin, MarketSettings, Rate } from './model';
export const marketRatesApi = {
  current: (locations: string[]) =>
    pricingRpc<{ location_id: string; latest: Rate | null }[]>(
      'fti_pricing_market_rates_current',
      { p_locations: locations },
    ),
  bulkPublish: (
    items: {
      location_id: string;
      previous: string | null;
      base: string;
      increase: string;
    }[],
  ) =>
    pricingRpc<number>('fti_pricing_market_rates_bulk_publish', {
      p_items: items,
    }),
  admin: () => pricingRpc<MarketAdmin>('fti_pricing_market_rates_admin'),
  location: (category: Category, state: string, district: string) =>
    pricingRpc<string>('fti_pricing_market_rates_location', {
      p_category: category,
      p_state: state,
      p_district: district,
    }),
  history: (
    location: string,
    from: string,
    to: string,
    offset: number,
    limit = 20,
  ) =>
    pricingRpc<Rate[]>('fti_pricing_market_rates_history', {
      p_location: location,
      p_from: from || null,
      p_to: to || null,
      p_offset: offset,
      p_limit: limit,
    }),
  publish: (
    location: string,
    previous: string | null,
    base: string,
    increase: string,
  ) =>
    pricingRpc<string>('fti_pricing_market_rates_publish', {
      p_location: location,
      p_previous: previous,
      p_base: base,
      p_increase: increase,
    }),
  settings: (settings: MarketSettings) =>
    pricingRpc<number>('fti_pricing_market_rates_settings', {
      p_revision: settings.revision,
      p_notes: settings.notes,
      p_support: settings.support,
      p_sms: settings.sms,
      p_whatsapp: settings.whatsapp,
    }),
};
