import type { Product } from '@features/catalog/model/types';
import { selectionPrice } from '@features/catalog/model/material-selection';
import { tractorPricing } from '@features/catalog/model/tractor-pricing';

export function homeProductSpecs(product: Product): [string, string][] {
  const variant = product.variants[0];
  const attrs = variant?.attributes ?? {};
  const text = (...keys: string[]) => keys.map(key => attrs[key]).find(value => typeof value === 'string' && value.trim()) as string | undefined;
  if (product.product_kind === 'tractor_part') return [
    ['Part number', text('part_number', 'part_no', 'oem_part_number') ?? variant?.sku ?? 'Not specified'],
    ['Compatible model', text('compatible_model', 'tractor_model', 'model', 'compatibility') ?? 'Confirm with FTI'],
    ['Unit', variant?.uom ?? product.unit],
  ];
  return [
    [product.product_kind === 'steel' ? 'Form' : 'Size', product.product_kind === 'steel' ? product.category.replaceAll('-', ' ') : (variant?.size_label ?? product.size) || 'Select specification'],
    ...(product.product_kind === 'steel' ? [['Size', (variant?.size_label ?? product.size) || 'Select size'] as [string, string]] : []),
    ['Grade', (text('grade', 'property_class') ?? product.grade) || 'Select grade'],
    ['Unit', variant?.uom ?? product.unit],
  ];
}

export function homeProductPrice(product: Product) {
  const variant = product.variants[0];
  if (!variant || variant.attributes.quote_only === true) return null;
  if (product.product_kind === 'tractor_part') {
    const price = tractorPricing(variant);
    return price ? { amount: (price.discounted ?? price.base).toLocaleString('en-IN', { maximumFractionDigits: 2 }), unit: variant.uom } : null;
  }
  const price = selectionPrice({ id: variant.id, product_id: product.id, product_name: product.name, grade: product.grade, uom: variant.uom, min_order_qty: variant.min_order_qty, variant_id: variant.id, attributes: variant.attributes });
  return price ? { amount: price.amount, unit: price.unit === 'PMT' ? 'MT' : price.unit } : null;
}
