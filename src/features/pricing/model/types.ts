export type Market = { id: string; code: string; name: string; state: string };
export type RateHistory = { id: string; amount: string; uom: string; effective_at: string; expires_at: string };
export type PublishedRate = RateHistory & {
  variant_id: string; name: string; sku: string; size_label: string | null;
  currency_code: string; revision: number; previous_amount: string | null;
  previous_effective_at: string | null;
};
export type RatesPage = { items: PublishedRate[]; total: number; server_time: string; disclosure: string };
export type DraftItem = { variant_id: string; amount: string; sku: string; uom: string };
export type PriceDraft = { id: string; title: string; market_id: string; expires_at: string; revision: number; items: DraftItem[] };
export type PricingAdmin = { markets: Market[]; drafts: PriceDraft[] };
