import type { WorkspaceSlice } from '@core/state/types';
import type { CartLine } from '@features/cart';
export type CartSlice = {
  cart: CartLine[];
  add: (id: string, quantity?: number) => void;
  quantity: (id: string, n: number) => void;
};
export const createCartSlice: WorkspaceSlice<CartSlice> = (set) => ({
  cart: [],
  add: (id, quantity) =>
    set((s) => {
      const p = s.catalogProducts.find((p) => p.id === id);
      if (!p) return s;
      const qty = quantity ?? p.moq;
      const old = s.cart.find((l) => l.productId === id);
      return {
        cart: old
          ? s.cart.map((l) =>
              l.productId === id
                ? { ...l, quantity: p.stock === undefined ? l.quantity + qty : Math.min(p.stock, l.quantity + qty) }
                : l,
            )
          : [
              ...s.cart,
              {
                productId: id,
                quantity: p.stock === undefined ? Math.max(p.moq, qty) : Math.min(p.stock, Math.max(p.moq, qty)),
              },
            ],
      };
    }),
  quantity: (id, n) =>
    set((s) => ({
      cart:
        n === 0
          ? s.cart.filter((l) => l.productId !== id)
          : s.cart.map((l) => {
              const p = s.catalogProducts.find((p) => p.id === id);
              return l.productId === id && p
                ? { ...l, quantity: p.stock === undefined ? Math.max(p.moq, n) : Math.min(p.stock, Math.max(p.moq, n)) }
                : l;
            }),
    })),
});
