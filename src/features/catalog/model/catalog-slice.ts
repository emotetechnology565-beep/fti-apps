import type { WorkspaceSlice } from '@core/state/types';
import type { Product } from './types';
export type CatalogSlice = {
  catalogProducts: Product[];
  setCatalogProducts: (products: Product[]) => void;
  saved: string[];
  toggleSaved: (id: string) => void;
};
export const createCatalogSlice: WorkspaceSlice<CatalogSlice> = (set) => ({
  catalogProducts: [],
  setCatalogProducts: (products) => set((state) => ({
    catalogProducts: [...state.catalogProducts.filter(product => !products.some(item => item.id === product.id)), ...products],
  })),
  saved: [],
  toggleSaved: (id) =>
    set((s) => ({
      saved: s.saved.includes(id)
        ? s.saved.filter((x) => x !== id)
        : [...s.saved, id],
    })),
});
