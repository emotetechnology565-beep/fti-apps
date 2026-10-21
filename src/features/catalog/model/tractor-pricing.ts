import type { Variant } from './types';

export const tractorPriceKeys = ['base_price', 'discounted_price'] as const;

function amount(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const result = Number(text);
  return Number.isFinite(result) && result > 0 && result <= 999999999.99 ? result : null;
}

export function tractorPricingError(base: string, discounted: string): string | null {
  if (!base.trim() && !discounted.trim()) return null;
  const baseAmount = amount(base);
  if (baseAmount === null) return 'Enter a positive base price with up to two decimal places.';
  if (discounted.trim()) {
    const saleAmount = amount(discounted);
    if (saleAmount === null || saleAmount >= baseAmount) return 'Discounted price must be positive and lower than the base price, with up to two decimal places.';
  }
  return null;
}

export function tractorPricing(variant: Pick<Variant, 'attributes'>) {
  const base = amount(variant.attributes.base_price);
  if (base === null) return null;
  const discounted = amount(variant.attributes.discounted_price);
  return { base, discounted: discounted !== null && discounted < base ? discounted : null };
}

const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
export const formatTractorPrice = (value: number) => rupees.format(value);
