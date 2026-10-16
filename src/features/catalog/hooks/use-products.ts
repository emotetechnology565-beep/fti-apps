import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useStore } from '@core/state/workspace-store';
import {
  supabaseCatalogRepository,
  type CatalogQuery,
  type CatalogRepository,
} from '../data/catalog-repository';

export const catalogKeys = {
  products: (scope: string, query: CatalogQuery) =>
    ['catalog', scope, 'products', query] as const,
  product: (scope: string, id: string) => ['catalog', scope, 'product', id] as const,
};

export function useProducts(
  filters: CatalogQuery = {},
  repository: CatalogRepository = supabaseCatalogRepository,
) {
  const setProducts = useStore((state) => state.setCatalogProducts);
  const result = useQuery({
    queryKey: catalogKeys.products(repository.scope, filters),
    queryFn: () => repository.listProducts(filters),
    staleTime: 60_000,
  });
  useEffect(() => {
    if (result.data) setProducts([...result.data.items]);
  }, [result.data, setProducts]);
  return result;
}

export function useProduct(id: string, repository: CatalogRepository = supabaseCatalogRepository) {
  return useQuery({
    queryKey: catalogKeys.product(repository.scope, id),
    queryFn: () => repository.getProduct(id),
    enabled: !!id,
    staleTime: 60_000,
  });
}
