import { useStore } from '@core/state/workspace-store';
import { useAuth } from '@features/auth/ui';
import { Button, Txt, c } from '@shared/ui';
import { router } from 'expo-router';
import { View } from 'react-native';
import type { Product, Variant } from '../model/types';

export function AddToCart({
  product,
  variant,
  compact = false,
}: {
  product: Product;
  variant?: Variant;
  compact?: boolean;
}) {
  const auth = useAuth();
  const actionStyle = compact
    ? {
        minHeight: 44,
        backgroundColor: '#00409A',
        borderColor: '#00409A',
        borderRadius: 8,
      }
    : undefined;
  const checkoutStyle = {
    minHeight: 44,
    backgroundColor: '#A70101',
    borderColor: '#A70101',
    borderRadius: 8,
  };
  const add = useStore((state) => state.add);
  const setProducts = useStore((state) => state.setCatalogProducts);
  const count = useStore(
    (state) =>
      state.cart.find(
        (line) =>
          line.productId === product.id && line.variantId === variant?.id,
      )?.quantity ?? 0,
  );
  if (
    product.product_kind !== 'tractor_part' ||
    product.status !== 'published' ||
    !product.variants.length
  )
    return null;
  if (!variant)
    return (
      <Button
        style={actionStyle}
        secondary={!compact}
        onPress={() => router.push(`/product/${product.id}` as never)}
      >
        Choose variant
      </Button>
    );
  if (!auth.session)
    return (
      <Button
        style={actionStyle}
        icon="shopping-cart"
        disabled={!auth.ready}
        onPress={() => router.push('/login')}
      >
        Sign in to add to cart
      </Button>
    );
  return (
    <View style={{ gap: 8 }}>
      {count > 0 ? (
        <>
          {!compact ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Txt
                accessibilityLiveRegion="polite"
                style={{ fontSize: 12, color: c.muted }}
              >
                {count} {variant.uom} in cart
              </Txt>
              <Button
                secondary
                style={{ minHeight: 36, paddingVertical: 4 }}
                onPress={() => {
                  setProducts([product]);
                  add(product.id, variant.min_order_qty, variant.id);
                }}
              >
                + Add more
              </Button>
            </View>
          ) : null}
          <Button
            style={checkoutStyle}
            icon="arrow-right"
            onPress={() => router.push('/checkout')}
          >
            Proceed to checkout
          </Button>
        </>
      ) : (
        <Button
          style={actionStyle}
          icon="shopping-cart"
          onPress={() => {
            setProducts([product]);
            add(product.id, variant.min_order_qty, variant.id);
          }}
        >
          Add to cart
        </Button>
      )}
    </View>
  );
}
