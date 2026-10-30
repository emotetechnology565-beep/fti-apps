import type { CartLine } from './types';
import type { Product } from '@features/catalog/model/types';

export function basketQuantitySummary(cart: CartLine[], products: Product[] = []) {
  let tonnes = 0;
  const otherUnits: Record<string, number> = {};
  for (const line of cart) {
    const product = products.find((item) => item.id === line.productId);
    const variant = line.variantId ? product?.variants.find((item) => item.id === line.variantId) : product?.variants[0];
    const unit = line.material?.unit ?? variant?.uom;
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) continue;
    if (unit === 'MT') tonnes += line.quantity;
    else if (unit === 'kg') tonnes += line.quantity / 1000;
    else if (unit) otherUnits[unit] = (otherUnits[unit] ?? 0) + line.quantity;
  }
  return { tonnes, otherUnits };
}
