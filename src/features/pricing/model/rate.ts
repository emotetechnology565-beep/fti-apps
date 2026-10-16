import type { Product } from '@features/catalog';
export function rateFor(product: Product, market: string) {
  if (product.market && product.market !== market)
    throw new Error('No price supplied for the selected market.');
  if (product.rate === undefined)
    throw new Error('No published price is available for this product.');
  return product.rate;
}
