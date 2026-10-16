import type { Product } from '@features/catalog';
import type { CartLine } from './types';
export function totals(
  lines: CartLine[],
  market: string,
  products: readonly Product[],
  taxRate?: number,
) {
  let subtotal = 0;
  for (const line of lines) {
    const p = products.find((p) => p.id === line.productId);
    if (
      !p ||
      !Number.isFinite(p.rate) ||
      (p.rate ?? -1) < 0 ||
      !Number.isFinite(line.quantity) ||
      line.quantity <= 0 ||
      (p.market && p.market !== market)
    )
      return { subtotal: null, gst: null, total: null };
    subtotal += (p.rate ?? 0) * line.quantity;
  }
  subtotal = Math.round(subtotal * 100) / 100;
  if (taxRate === undefined || !Number.isFinite(taxRate) || taxRate < 0)
    return { subtotal, gst: null, total: null };
  const gst = Math.round(subtotal * taxRate * 100) / 100;
  return { subtotal, gst, total: Math.round((subtotal + gst) * 100) / 100 };
}
