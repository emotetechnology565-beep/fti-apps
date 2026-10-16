import type { CatalogRepository } from './catalog-repository';
export const unconfiguredCatalogRepository: CatalogRepository = {
  scope: 'unconfigured',
  async listProducts() { return { items: [], total: 0, categories: [] }; },
  async getProduct() { return null; },
};
