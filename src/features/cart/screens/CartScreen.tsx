import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQueries } from '@tanstack/react-query';
import { useStore } from '@core/state/workspace-store';
import { supabaseCatalogRepository } from '@features/catalog/export';
import type { Product } from '@features/catalog';
import { Button, Card, Empty, Icon, Txt } from '@shared/ui';
import { cartLinePrice } from '../model/line-price';
import type { CartLine } from '../model/types';

const money = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value);
function Lot({
  line,
  product,
  loading,
  error,
}: {
  line: CartLine;
  product?: Product;
  loading: boolean;
  error?: string;
}) {
  const quantity = useStore((state) => state.quantity);
  const variant = line.variantId
    ? product?.variants.find((item) => item.id === line.variantId)
    : product?.variants[0];
  const material = line.material;
  const name =
    material?.name ??
    product?.name ??
    (loading ? 'Loading product...' : 'Product unavailable');
  const unit = material?.unit ?? variant?.uom ?? '';
  const minimum = material?.minimum ?? variant?.min_order_qty ?? 1;
  const price = cartLinePrice(line, product);
  const valid = !!material || !!variant;
  const change = (next: number) =>
    quantity(line.productId, next, line.variantId);
  return (
    <Card style={styles.card}>
      <View style={[styles.row, { alignItems: 'flex-start' }]}>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={[styles.row, { flexWrap: 'wrap' }]}>
            <Txt style={styles.chip}>
              {material?.fastenerRequest
                ? 'CONFIGURED FASTENER'
                : material
                  ? 'RAW MATERIAL'
                  : 'TRACTOR SPARE'}
            </Txt>
            {material?.grade ? (
              <Txt style={styles.chip}>{material.grade}</Txt>
            ) : null}
          </View>
          <Txt accessibilityRole="header" style={styles.lotTitle}>
            {name}
          </Txt>
          <Txt style={styles.secondary}>
            {material?.size ??
              variant?.size_label ??
              variant?.sku ??
              'Configuration unavailable'}
          </Txt>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${name}`}
          onPress={() => change(0)}
          style={styles.remove}
        >
          <Icon name="x" size={20} color="#44474e" />
        </Pressable>
      </View>
      {error ? (
        <Txt accessibilityRole="alert" style={styles.error}>
          {error}
        </Txt>
      ) : null}
      <View style={styles.specGrid}>
        <View style={{ flex: 1, gap: 4 }}>
          <Txt style={styles.label}>CONFIGURED QUANTITY</Txt>
          <Txt style={styles.value}>
            Quantity: {line.quantity} {unit}
          </Txt>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Txt style={styles.label}>INDICATIVE UNIT RATE</Txt>
          <Txt style={styles.value}>
            {price
              ? `${money(price.amount)} / ${price.unit}`
              : 'Quotation required'}
          </Txt>
        </View>
      </View>
      <View style={styles.row}>
        <Icon name="info" size={15} color="#485f83" />
        <Txt style={[styles.secondary, { flex: 1 }]}>
          {price?.tax ??
            'FTI will confirm pricing and availability for this configuration.'}
        </Txt>
      </View>
      <View
        style={[
          styles.row,
          { justifyContent: 'space-between', flexWrap: 'wrap' },
        ]}
      >
        <View style={styles.stepper}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Decrease ${name}`}
            disabled={!valid || line.quantity <= minimum}
            onPress={() => change(line.quantity - minimum)}
            style={[
              styles.stepButton,
              (!valid || line.quantity <= minimum) && { opacity: 0.35 },
            ]}
          >
            <Icon name="minus" size={16} color="#001835" />
          </Pressable>
          <Txt style={styles.quantity}>
            {line.quantity} <Txt style={styles.secondary}>{unit}</Txt>
          </Txt>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Increase ${name}`}
            disabled={!valid}
            onPress={() => change(line.quantity + minimum)}
            style={styles.stepButton}
          >
            <Icon name="plus" size={16} color="#001835" />
          </Pressable>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Txt style={styles.label}>INDICATIVE LOT TOTAL</Txt>
          <Txt style={styles.lotTotal}>
            {price ? money(price.total) : 'Awaiting quotation'}
          </Txt>
        </View>
      </View>
      {!valid && !loading ? (
        <Txt style={styles.error}>
          Remove unavailable items before proceeding to checkout.
        </Txt>
      ) : null}
    </Card>
  );
}
export function Cart() {
  const cart = useStore((state) => state.cart);
  const updateQuantity = useStore((state) => state.quantity);
  const setProducts = useStore((state) => state.setCatalogProducts);
  const ids = [
    ...new Set(
      cart.filter((line) => !line.material).map((line) => line.productId),
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
  const prices = cart.map((line) =>
    cartLinePrice(
      line,
      products.find((p) => p.id === line.productId),
    ),
  );
  const subtotal = prices.reduce((sum, price) => sum + (price?.total ?? 0), 0);
  const unpriced = prices.filter((price) => !price).length;
  const tonnes = cart.reduce(
    (sum, line) =>
      sum +
      (line.material?.unit === 'MT'
        ? line.quantity
        : line.material?.unit === 'kg'
          ? line.quantity / 1000
          : 0),
    0,
  );
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
  return (
    <View style={styles.page}>
      <View style={styles.hero}>
        <View
          style={[
            styles.row,
            { justifyContent: 'space-between', flexWrap: 'wrap' },
          ]}
        >
          <Txt style={styles.mode}>QUOTATION COMPILATION</Txt>
          <Txt style={styles.lightLabel}>STEP 1 OF 3</Txt>
        </View>
        <Txt accessibilityRole="header" style={styles.heading}>
          Your configured cart
        </Txt>
        <View style={styles.row}>
          {['1. Cart lots', '2. Buyer & delivery', '3. FTI confirmation'].map(
            (step, i) => (
              <View key={step} style={{ flex: 1, gap: 6 }}>
                <View
                  style={{
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: i === 0 ? '#da3433' : '#30476a',
                  }}
                />
                <Txt style={styles.lightLabel}>{step}</Txt>
              </View>
            ),
          )}
        </View>
        <View style={styles.policy}>
          <Icon name="info" size={18} color="#b0c8f1" />
          <Txt
            style={{ flex: 1, fontSize: 12, lineHeight: 19, color: '#ebf1ff' }}
          >
            Prices shown are indicative. FTI confirms availability, applicable
            GST, freight and final commercial terms before payment.
          </Txt>
        </View>
      </View>
      <View style={{ padding: 16, gap: 16 }}>
        <View
          style={[
            styles.row,
            { justifyContent: 'space-between', flexWrap: 'wrap' },
          ]}
        >
          <View style={styles.row}>
            <Txt accessibilityRole="header" style={styles.lotTitle}>
              Configured Lots
            </Txt>
            <Txt style={styles.chip}>{cart.length} active</Txt>
          </View>
          {cart.length ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear cart"
              onPress={() =>
                cart.forEach((line) =>
                  updateQuantity(line.productId, 0, line.variantId),
                )
              }
              style={{ paddingVertical: 8 }}
            >
              <Txt style={styles.clear}>Clear cart</Txt>
            </Pressable>
          ) : null}
        </View>
        {!cart.length ? (
          <Empty
            title="Your cart is empty"
            description="Add material sizes, configured fasteners or tractor parts to compile your order."
            action={
              <Button onPress={() => router.push('/products')}>
                Browse materials
              </Button>
            }
          />
        ) : (
          <>
            {cart.map((line) => {
              const index = ids.indexOf(line.productId);
              const query = queries[index];
              return (
                <Lot
                  key={`${line.productId}-${line.variantId ?? 'legacy'}`}
                  line={line}
                  product={products.find((p) => p.id === line.productId)}
                  loading={!line.material && !!query?.isPending}
                  error={query?.error?.message}
                />
              );
            })}
            <Button
              secondary
              icon="plus"
              onPress={() => router.push('/products')}
            >
              Add another size or product
            </Button>
            <Card style={styles.card}>
              <View style={styles.row}>
                <Icon name="truck" size={20} color="#001835" />
                <Txt accessibilityRole="header" style={styles.sectionTitle}>
                  Consignee & Delivery Route
                </Txt>
              </View>
              <View style={styles.specGrid}>
                <Txt style={styles.secondary}>
                  Enter buyer details and choose or save your delivery address
                  at checkout. FTI will confirm dispatch timing, freight and
                  unloading arrangements with you.
                </Txt>
              </View>
              <Button
                secondary
                onPress={() => router.push('/checkout')}
                disabled={blocked}
              >
                Continue to buyer & delivery details
              </Button>
            </Card>
            <Card style={styles.card}>
              <View style={styles.row}>
                <Icon name="paperclip" size={20} color="#001835" />
                <Txt accessibilityRole="header" style={styles.sectionTitle}>
                  Purchase Order & Engineering Files
                </Txt>
              </View>
              <Txt style={styles.secondary}>
                Have a purchase order or additional drawings? Share them with
                FTI support. Fastener dimensions already configured in this cart
                are retained with each lot.
              </Txt>
              <Button secondary onPress={() => router.push('/support')}>
                Share files with FTI support
              </Button>
            </Card>
            <Card style={styles.card}>
              <View
                style={[
                  styles.row,
                  { justifyContent: 'space-between', flexWrap: 'wrap' },
                ]}
              >
                <Txt accessibilityRole="header" style={styles.sectionTitle}>
                  Commercial Breakdown
                </Txt>
                {tonnes > 0 ? (
                  <Txt style={styles.chip}>
                    {tonnes.toLocaleString('en-IN', {
                      maximumFractionDigits: 3,
                    })}{' '}
                    MT materials
                  </Txt>
                ) : null}
              </View>
              <Ledger
                label="Indicative priced lots"
                value={
                  prices.some(Boolean) ? money(subtotal) : 'Awaiting quotation'
                }
              />
              {unpriced ? (
                <Ledger
                  label="Lots awaiting pricing"
                  value={String(unpriced)}
                />
              ) : null}
              <Ledger label="GST / statutory charges" value="To be confirmed" />
              <Ledger label="Freight & handling" value="To be confirmed" />
              <View style={styles.totalBox}>
                <Txt style={styles.label}>FINAL PAYABLE</Txt>
                <Txt style={styles.lotTotal}>After FTI confirmation</Txt>
                <Txt style={styles.secondary}>
                  No payment is collected at this step.
                </Txt>
              </View>
            </Card>
            <View style={styles.tray}>
              <View style={{ flex: 1, minWidth: 130, gap: 4 }}>
                <Txt style={styles.lightLabel}>
                  {cart.length} CONFIGURED LOT{cart.length === 1 ? '' : 'S'}
                </Txt>
                <Txt style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>
                  {unpriced ? 'Quotation required' : money(subtotal)}
                </Txt>
              </View>
              <Button
                icon="arrow-right"
                disabled={blocked}
                onPress={() => router.push('/checkout')}
                style={{
                  minHeight: 48,
                  backgroundColor: blocked ? '#485f83' : '#b6171e',
                  borderWidth: 0,
                  borderRadius: 8,
                }}
              >
                Proceed to checkout
              </Button>
            </View>
          </>
        )}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  page: { backgroundColor: '#f8f9ff', borderRadius: 12, overflow: 'hidden' },
  hero: { padding: 16, gap: 16, backgroundColor: '#001835' },
  heading: { fontSize: 24, lineHeight: 31, fontWeight: '700', color: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mode: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
    backgroundColor: '#142d4e',
    color: '#b0c8f1',
    padding: 6,
    borderRadius: 10,
  },
  lightLabel: {
    color: '#d7e3f9',
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '600',
  },
  policy: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#142d4e',
    borderRadius: 8,
    padding: 12,
  },
  card: {
    gap: 12,
    padding: 16,
    borderWidth: 0,
    borderRadius: 12,
    backgroundColor: '#fff',
    boxShadow: '0 1px 8px rgba(0,24,53,0.04)',
  },
  lotTitle: {
    fontSize: 19,
    lineHeight: 26,
    color: '#101c2c',
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 25,
    color: '#001835',
    fontWeight: '700',
    flexShrink: 1,
  },
  chip: {
    color: '#001835',
    backgroundColor: '#dde9ff',
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '600',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 5,
  },
  secondary: { color: '#44474e', fontSize: 12, lineHeight: 19 },
  label: {
    color: '#485f83',
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  value: { fontSize: 14, lineHeight: 21, color: '#101c2c', fontWeight: '700' },
  specGrid: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#eff4ff',
  },
  remove: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff4ff',
    padding: 4,
    borderRadius: 8,
  },
  stepButton: {
    width: 36,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 4,
  },
  quantity: {
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '700',
    color: '#001835',
  },
  lotTotal: {
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '700',
    color: '#001835',
  },
  clear: { color: '#b6171e', fontSize: 12, fontWeight: '600' },
  error: { color: '#ba1a1a', fontSize: 12, lineHeight: 19 },
  totalBox: {
    padding: 12,
    gap: 4,
    backgroundColor: '#e6eeff',
    borderRadius: 8,
  },
  tray: {
    backgroundColor: '#001835',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
  },
});
function Ledger({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={[
        styles.row,
        { justifyContent: 'space-between', flexWrap: 'wrap' },
      ]}
    >
      <Txt style={styles.secondary}>{label}</Txt>
      <Txt style={styles.value}>{value}</Txt>
    </View>
  );
}
