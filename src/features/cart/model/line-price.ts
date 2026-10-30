import type { Product } from '@features/catalog';
import type { CartLine } from './types';

export function cartLinePrice(line: CartLine, product?: Product) {
  if (!Number.isFinite(line.quantity) || line.quantity <= 0) return null;
  if (line.material) {
    const price = line.material.indicativePrice;
    if (!price || !Number.isFinite(price.amount) || price.amount <= 0)
      return null;
    const rateUnit = price.unit === 'PMT' ? 'MT' : price.unit;
    const quantityUnit = line.material.unit;
    const factor = rateUnit === quantityUnit ? 1
      : rateUnit === 'MT' && quantityUnit === 'kg' ? 0.001
      : rateUnit === 'kg' && quantityUnit === 'MT' ? 1000
      : null;
    // A per-weight rate cannot price pieces without an explicit weight basis.
    if (factor === null) return null;
    return {
      amount: price.amount,
      unit: price.unit,
      total: price.amount * line.quantity * factor,
      tax: price.tax,
    };
  }
  const variant = line.variantId
    ? product?.variants.find((v) => v.id === line.variantId)
    : product?.variants[0];
  if (!variant || product?.product_kind !== 'tractor_part') return null;
  const base = Number(variant.attributes.base_price);
  const discounted = Number(variant.attributes.discounted_price);
  if (!Number.isFinite(base) || base <= 0) return null;
  const amount =
    Number.isFinite(discounted) && discounted > 0 && discounted < base
      ? discounted
      : base;
  return {
    amount,
    unit: variant.uom,
    total: amount * line.quantity,
    tax: 'GST and delivery subject to confirmation',
  };
}
