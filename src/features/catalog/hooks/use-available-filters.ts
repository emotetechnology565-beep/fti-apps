import { useQuery } from '@tanstack/react-query';
import { catalogApi } from '../data/catalog-repository';
import type { CatalogPage } from '../model/types';
import { availableCatalogFilters } from '../model/available-filters';

export function useAvailableFilters(category: string, size?: number) {
  const query = useQuery({
    queryKey: ['catalog', 'available-filters', category],
    enabled: !!category,
    staleTime: 60_000,
    queryFn: async () => {
      // Fetch every product in the category: options must not depend on the
      // current results page, selected grade, search text or saved-only toggle.
      const variants: CatalogPage['items'][number]['variants'] = [];
      let offset = 0;
      while (true) {
        const page = await catalogApi.rpc<CatalogPage>('fti_catalog_filtered_list', {
          p_category: category, p_limit: 50, p_offset: offset,
        });
        variants.push(...page.items.filter(item => item.product_kind === 'steel').flatMap(item => item.variants));
        offset += page.items.length;
        if (offset >= page.total || !page.items.length) break;
      }
      return variants;
    },
  });
  return { ...query, options: availableCatalogFilters(query.data ?? [], size) };
}
