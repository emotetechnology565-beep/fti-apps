import { useQueries } from '@tanstack/react-query';
import { useAuth } from '@features/auth/ui';
import { catalogApi } from '@features/catalog/data/catalog-repository';
import { selectionPrice } from '@features/catalog/model/material-selection';
import type { Product } from '@features/catalog/model/types';
import { usePriceAccess } from '@shared/hooks/use-price-access';
import { cartLinePrice } from '../model/line-price';
import type { CartLine } from '../model/types';

// Cart and checkout resolve the same current rates. Persisted basket estimates
// are never a source of customer price access or current commercial terms.
export function useBasketPricing(cart: CartLine[], products: Product[]) {
  const priceAccess = usePriceAccess();
  const auth = useAuth();
  const queries = useQueries({
    queries: cart.map((line) => ({
      queryKey: ['catalog', 'basket-price', auth.session?.user.id ?? 'guest', priceAccess, line.productId, line.material?.optionId ?? '', line.material?.size ?? ''],
      enabled: priceAccess && !!line.material?.optionId && !line.material?.fastenerRequirement,
      queryFn: async () => {
        const sizes = await catalogApi.selectionOptions(undefined, undefined, line.productId);
        const normalize = (value: string) => value.toUpperCase().replace(/\s+/g, '');
        const size = sizes.sizes.find((entry) => normalize(entry.label) === normalize(line.material!.size));
        if (!size) return null;
        const available = await catalogApi.selectionOptions(undefined, size.id, line.productId);
        const option = available.options.find((entry) => entry.id === line.material!.optionId && entry.uom === line.material!.unit);
        const price = option ? selectionPrice(option) : null;
        return price ? { amount: Number(price.amount.replaceAll(',', '')), unit: price.unit, tax: price.tax } : null;
      },
      staleTime: 0,
      retry: false,
    })),
  });
  const prices = cart.map((line, index) => {
    if (!priceAccess || line.material?.fastenerRequirement) return null;
    if (line.material) {
      return cartLinePrice({ ...line, material: { ...line.material, indicativePrice: queries[index].isError ? undefined : queries[index].data ?? undefined } });
    }
    return cartLinePrice(line, products.find((product) => product.id === line.productId));
  });
  return {
    priceAccess, prices,
    loading: queries.some((query) => query.isFetching),
    subtotal: prices.reduce((sum, price) => sum + (price?.total ?? 0), 0),
    unpriced: prices.filter((price) => !price).length,
  };
}
