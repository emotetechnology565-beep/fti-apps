import { SubscribeForPrices } from '@features/subscriptions/SubscribeForPrices';
import { useEffect } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useQueries } from '@tanstack/react-query';
import { useStore } from '@core/state/workspace-store';
import { supabaseCatalogRepository } from '@features/catalog/export';
import type { Product } from '@features/catalog';
import { Button, Txt } from '@shared/ui';
import { useBasketPricing } from '../hooks/use-basket-pricing';
import { basketQuantitySummary } from '../model/quantity-summary';
import { MobileBasket } from '../components/MobileBasket';
import { FastenerRequirementSummary } from '../components/FastenerRequirementSummary';

const money = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value);
export function Cart() {
  const { width } = useWindowDimensions();
  const cart = useStore((state) => state.cart);
  const updateQuantity = useStore((state) => state.quantity);
  const setProducts = useStore((state) => state.setCatalogProducts);
  const ids = [
    ...new Set(
      cart.filter(line => !line.material?.fastenerRequirement).map((line) => line.productId),
    ),
  ];
  const queries = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['catalog', 'cart-product', id],
      queryFn: () => supabaseCatalogRepository.getProduct(id),
      retry: false,
    })),
  });
  const products = queries
    .map((query) => query.data)
    .filter((product): product is Product => !!product);
  const productsKey = JSON.stringify(products);
  useEffect(() => {
    if (products.length) setProducts(products);
  }, [productsKey, setProducts]); // eslint-disable-line react-hooks/exhaustive-deps
  const { prices, subtotal, unpriced, loading, priceAccess } = useBasketPricing(cart, products);
  const { tonnes } = basketQuantitySummary(cart, products);
  const blocked = cart.some((line) => {
    if (line.material) return false;
    const p = products.find((p) => p.id === line.productId);
    return (
      !p ||
      !(line.variantId
        ? p.variants.some((v) => v.id === line.variantId)
        : p.variants.length)
    );
  });
  if (width >= 1000) return <View style={{ gap: 18 }}>
    <View><Txt style={{ fontSize: 28, fontWeight: '800', color: '#0B1B36' }}>Your requirement basket</Txt><Txt style={{ color: '#64748B', marginTop: 6 }}>Review your selected materials and request a quotation from FTI.</Txt></View>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 20 }}>
      <View style={{ flex: 1, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', borderRadius: 8, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', backgroundColor: '#F1F5F9', padding: 16, gap: 12 }}><Txt style={{ flex: 2, fontWeight: '700' }}>Material</Txt><Txt style={{ flex: 2, fontWeight: '700' }}>Specifications</Txt><Txt style={{ flex: 1, fontWeight: '700' }}>Quantity</Txt><Txt style={{ width: 65, fontWeight: '700' }}>Action</Txt></View>
        {!cart.length ? <View style={{ padding: 24, gap: 12 }}><Txt>Your requirement basket is empty.</Txt><Button onPress={() => router.push('/products')}>Browse materials</Button></View> : cart.map((line, index) => {
          const product = products.find((p) => p.id === line.productId);
          const material = line.material;
          const variant = product?.variants.find((v) => v.id === line.variantId);
          return <View key={`${line.productId}-${line.variantId ?? material?.key}`} style={{ flexDirection: 'row', padding: 16, gap: 12, borderBottomWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' }}>
            <View style={{ flex: 2 }}><Txt style={{ fontWeight: '700', color: '#0B1B36' }}>{material?.name ?? product?.name ?? 'Loading material...'}</Txt></View>
            <View style={{ flex: 2, gap: 5 }}>{material?.fastenerRequirement ? <FastenerRequirementSummary material={material} editable /> : <><Txt>Size: {material?.size ?? variant?.size_label ?? 'To confirm'}</Txt><Txt>Grade: {material?.grade || 'To confirm'}</Txt>{material?.brand ? <Txt>Brand: {material.brand}</Txt> : null}</>}</View>
            <View style={{ flex: 1, gap: 6 }}><Txt style={{ fontWeight: '700' }}>{line.quantity} {material?.unit ?? variant?.uom ?? ''}</Txt>{priceAccess ? <Txt style={{ color: '#64748B', fontSize: 11 }}>{prices[index] ? money(prices[index]!.total) : loading ? 'Loading price...' : 'Quote required'}</Txt> : null}</View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${material?.name ?? product?.name ?? 'material'}`} onPress={() => updateQuantity(line.productId, 0, line.variantId)} style={{ width: 65 }}><Txt style={{ color: '#E51B23', fontSize: 12 }}>Remove</Txt></Pressable>
          </View>;
        })}
      </View>
      <View style={{ width: 300, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, backgroundColor: '#F8FAFC', padding: 18, gap: 18 }}>
        <Txt style={{ fontSize: 18, fontWeight: '800', color: '#0B1B36' }}>Quotation summary</Txt>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt>Total weight</Txt><Txt style={{ fontWeight: '800' }}>{tonnes.toLocaleString('en-IN')} MT</Txt></View>
        {priceAccess ? <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}><Txt>Material subtotal</Txt><Txt style={{ fontWeight: '700' }}>{loading ? 'Loading...' : prices.some(Boolean) ? money(subtotal) : 'Quote required'}</Txt></View>
          {unpriced > 0 ? <Txt style={{ color: '#64748B', fontSize: 11 }}>{unpriced} item(s) awaiting a published price. Subtotal includes priced items only.</Txt> : null}
        </> : <SubscribeForPrices />}
        {['GST', 'Freight', 'Final total'].map((label) => <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}><Txt>{label}</Txt><Txt style={{ color: '#64748B', fontSize: 11 }}>To be confirmed in quote</Txt></View>)}
        <Txt style={{ color: '#64748B', fontSize: 12, lineHeight: 18 }}>Choose your delivery address and confirm buyer details in the next step. FTI will confirm availability and final commercial terms.</Txt>
        <Button disabled={!cart.length || blocked} onPress={() => router.push('/checkout')}>Request quotation</Button>
      </View>
    </View>
  </View>;
  return <MobileBasket cart={cart} products={products} prices={prices} tonnes={tonnes} subtotal={subtotal} priceAccess={priceAccess} blocked={blocked} loading={loading} />;
}
