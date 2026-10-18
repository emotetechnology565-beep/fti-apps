export type Market = { id: string; code: string; name: string; state: string };
export type RateHistory = { id: string; amount: string; uom: string; effective_at: string; expires_at?: string | null };
export type PublishedRate = RateHistory & {
  variant_id: string; name: string; sku: string; size_label: string | null;
  currency_code: string; revision: number; previous_amount: string | null;
  previous_effective_at: string | null;
};
export type RatesPage = { items: PublishedRate[]; total: number; server_time: string; disclosure: string };
export type DraftItem = { variant_id: string; amount: string; sku: string; uom: string;
  base_price?: string; increased_price?: string; rolling_price?: string; profit_percent?: string; grade_code?: string | null };
export type PriceDraft = { id: string; title: string; market_id: string; updated_at?: string; revision: number; items: DraftItem[] };
export type StaffRate = DraftItem & { id: string; name: string; market_id: string; effective_at: string; revision: number };
export type GradeBase = { id: string; market_id: string; grade_code: 'MS' | 'EN8'; uom: string; base_price: string; revision: number; updated_at: string };
export type PricingAdmin = { markets: Market[]; drafts: PriceDraft[]; current_rates?: StaffRate[]; grade_bases?: GradeBase[] };
