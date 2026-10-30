import type { CartLine } from './types';

export function mergeCheckoutBasket(current: CartLine[], guest: CartLine[]) {
  const key = (line: CartLine) => line.material?.key ?? `${line.productId}:${line.variantId ?? ''}`;
  const merged = new Map(current.map(line => [key(line), line]));
  for (const line of guest) {
    if (!line.productId || !Number.isFinite(line.quantity) || line.quantity <= 0) continue;
    const material = line.material ? { ...line.material, indicativePrice: undefined } : undefined;
    // A retry replaces the staged specification; it never doubles its quantity.
    merged.set(key(line), { ...line, ...(material ? { material } : {}) });
  }
  return [...merged.values()];
}
