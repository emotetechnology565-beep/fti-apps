import { useQuery } from '@tanstack/react-query';
import { catalogApi } from '../data/catalog-repository';

export function useMaterialSelectionOptions(category?: string, sizeId?: string, productId?: string) {
  return useQuery({
    queryKey: ['catalog', 'selection-options', category ?? '', sizeId ?? '', productId ?? ''],
    queryFn: () => catalogApi.selectionOptions(category, sizeId, productId),
    staleTime: 30_000,
    retry: false,
  });
}
