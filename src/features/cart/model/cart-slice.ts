import type { WorkspaceSlice } from '@core/state/types';
import type { CartLine } from '@features/cart';

export type CartSlice = {
  cart: CartLine[];
  add: (id: string, quantity?: number, variantId?: string) => void;
  quantity: (id: string, n: number, variantId?: string) => void;
};
export const createCartSlice: WorkspaceSlice<CartSlice> = (set) => ({
  cart: [],
  add: (id, quantity, variantId) => set((state) => {
    const product = state.catalogProducts.find(product => product.id === id);
    if (!product) return state;
    const variant = variantId ? product.variants.find(variant => variant.id === variantId) : product.variants[0];
    if (variantId && !variant) return state;
    const minimum = variant?.min_order_qty ?? product.moq;
    const qty = quantity ?? minimum;
    if (!Number.isFinite(qty) || qty <= 0) return state;
    if (product.stock !== undefined && product.stock < minimum) return state;
    const existing = state.cart.find(line => line.productId === id && line.variantId === variantId);
    const next = Math.round(Math.max(minimum, (existing?.quantity ?? 0) + qty) * 1000) / 1000;
    const line: CartLine = {
      productId: id,
      ...(variantId ? { variantId } : {}),
      quantity: product.stock === undefined ? next : Math.min(product.stock, next),
    };
    return { cart: existing ? state.cart.map(item => item === existing ? line : item) : [...state.cart, line] };
  }),
  quantity: (id, n, variantId) => set((state) => {
    const matches = (line: CartLine) => line.productId === id && line.variantId === variantId;
    if (n === 0) return { cart: state.cart.filter(line => !matches(line)) };
    if (!Number.isFinite(n) || n <= 0) return state;
    const product = state.catalogProducts.find(product => product.id === id);
    if (!product) return state;
    const variant = variantId ? product.variants.find(variant => variant.id === variantId) : product.variants[0];
    if (variantId && !variant) return state;
    const minimum = variant?.min_order_qty ?? product.moq;
    if (product.stock !== undefined && product.stock < minimum) return state;
    const requested = Math.round(Math.max(minimum, n) * 1000) / 1000;
    const qty = product.stock === undefined ? requested : Math.min(product.stock, requested);
    return { cart: state.cart.map(line => matches(line) ? { ...line, quantity: qty } : line) };
  }),
});
