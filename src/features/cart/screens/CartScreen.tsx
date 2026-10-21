import { useEffect } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '@core/state/workspace-store';
import { supabaseCatalogRepository } from '@features/catalog/export';
import { TractorPrice } from '@features/catalog/ui';
import { Heading, Empty, Button, Card, Row, Txt, s } from '@shared/ui';
import type { CartLine } from '../model/types';

function CartItem({ line }: { line: CartLine }) {
  const quantity = useStore(state => state.quantity);
  const setProducts = useStore(state => state.setCatalogProducts);
  const query = useQuery({ queryKey: ['catalog', 'cart-product', line.productId], queryFn: () => supabaseCatalogRepository.getProduct(line.productId), retry: false });
  const product = query.data;
  useEffect(() => { if (product) setProducts([product]); }, [product, setProducts]);
  const variant = line.variantId ? product?.variants.find(item => item.id === line.variantId) : product?.variants[0];
  return <Card style={{ gap: 12 }}>
    <Txt style={s.h2}>{product?.name ?? (query.isPending ? 'Loading product...' : 'Product unavailable')}</Txt>
    {query.error ? <Txt accessibilityRole="alert">{query.error.message}</Txt> : null}
    {variant ? <>
      <Txt>{variant.size_label || variant.sku}</Txt>
      {product?.product_kind === 'tractor_part' ? <TractorPrice variant={variant} /> : null}
      <Txt>Quantity: {line.quantity} {variant.uom}</Txt>
      <Row style={{ flexWrap: 'wrap' }}>
        <Button secondary disabled={line.quantity <= variant.min_order_qty} onPress={() => quantity(line.productId, line.quantity - variant.min_order_qty, line.variantId)}>Decrease</Button>
        <Button secondary onPress={() => quantity(line.productId, line.quantity + variant.min_order_qty, line.variantId)}>Increase</Button>
      </Row>
    </> : <Txt style={s.muted}>Saved quantity: {line.quantity}. Remove unavailable items before checkout.</Txt>}
    <Button secondary onPress={() => quantity(line.productId, 0, line.variantId)}>Remove</Button>
  </Card>;
}
export function Cart() {
  const cart = useStore(state => state.cart);
  return <View>
    <Heading eyebrow="YOUR PROCUREMENT LIST" title="Your cart" description="Choose quantities and submit your tractor parts for admin confirmation." />
    {!cart.length ? <Empty title="Your cart is empty" description="Add tractor parts from the catalogue to get started." action={<Button onPress={() => router.push('/products')}>Browse materials</Button>} /> : <View style={{ gap: 16 }}>
      {cart.map(line => <CartItem key={`${line.productId}-${line.variantId ?? 'legacy'}`} line={line} />)}
      <Txt style={s.muted}>Admin will confirm item prices, GST and delivery charges before payment is requested.</Txt>
      <Button onPress={() => router.push('/checkout')}>Proceed to checkout</Button>
    </View>}
  </View>;
}
