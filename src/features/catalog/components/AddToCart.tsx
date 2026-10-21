import { useStore } from '@core/state/workspace-store';
import { Button, Txt, c } from '@shared/ui';
import { router } from 'expo-router';
import { View } from 'react-native';
import type { Product, Variant } from '../model/types';

export function AddToCart({ product, variant }: { product: Product; variant?: Variant }) {
  const add = useStore(state => state.add);
  const setProducts = useStore(state => state.setCatalogProducts);
  const count = useStore(state => state.cart.find(line => line.productId === product.id && line.variantId === variant?.id)?.quantity ?? 0);
  if (product.product_kind !== 'tractor_part' || product.status !== 'published' || !product.variants.length) return null;
  if (!variant) return <Button secondary onPress={() => router.push(`/product/${product.id}` as never)}>Choose variant</Button>;
  return (
    <View style={{ gap: 8 }}>
      <Button icon="shopping-cart" onPress={() => { setProducts([product]); add(product.id, variant.min_order_qty, variant.id); }}>Add to cart</Button>
      {count > 0 ? <>
        <Txt accessibilityLiveRegion="polite" style={{ fontSize: 12, color: c.muted }}>{count} {variant.uom} in cart</Txt>
        <Button secondary onPress={() => router.push('/cart')}>View cart</Button>
      </> : null}
    </View>
  );
}
