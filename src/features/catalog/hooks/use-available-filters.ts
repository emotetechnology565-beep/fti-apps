import { useQuery } from '@tanstack/react-query';
import { catalogApi } from '../data/catalog-repository';
import type { CatalogPage, Product } from '../model/types';
import { availableCatalogFilters } from '../model/available-filters';
import { loadFilterVariants } from '../data/available-filter-options';

export function useAvailableFilters(
  category: string,
  size?: number,
  productKind: Product['product_kind'] = 'steel',
) {
  const query = useQuery({
    queryKey: ['catalog', 'available-filters', category, productKind],
    staleTime: 60_000,
    queryFn: () => {
      // Fetch every product in the category: options must not depend on the
      // current results page, selected grade, search text or saved-only toggle.
      return loadFilterVariants(
        (args) => catalogApi.rpc<CatalogPage>('fti_catalog_filtered_list', args),
        category,
        productKind,
      );
    },
  });
  return { ...query, options: availableCatalogFilters(query.data ?? [], size) };
}
