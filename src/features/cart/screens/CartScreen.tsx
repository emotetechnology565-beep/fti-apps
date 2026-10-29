import { usePriceAccess } from '@shared/hooks/use-price-access';
import { SubscribeForPrices } from '@features/subscriptions/SubscribeForPrices';
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
  const priceAccess = usePriceAccess();
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
  const price = priceAccess ? cartLinePrice(line, product) : null;
  const valid = !!material || !!variant;
  const change = (next: number) =>
    quantity(line.productId, next, line.variantId);
  return (
    <Card style={styles.card}>
      <View style={[styles.row, { alignItems: 'flex-start' }]}>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={[styles.row, { flexWrap: 'wrap', gap: 6 }]}>
            <Txt style={styles.kindChip}>
              {material?.fastenerRequest
                ? 'CONFIGURED FASTENER'
                : material
                  ? 'RAW MATERIAL'
                  : 'TRACTOR SPARE'}
            </Txt>
            {material?.brand ? (
              <Txt style={styles.brandChip}>Brand: {material.brand}</Txt>
            ) : null}
            {material?.grade && material.grade !== material.brand ? (
              <Txt style={styles.gradeChip}>Grade: {material.grade}</Txt>
            ) : null}
          </View>
          <Txt accessibilityRole="header" style={styles.lotTitle}>
            {name}
          </Txt>
          <View style={styles.sizeRow}>
            <Icon name="tag" size={13} color="#00409A" />
            <Txt style={styles.sizeText}>
              Spec:{' '}
              <Txt style={styles.sizeTextBold}>
                {material?.size ??
                  variant?.size_label ??
                  variant?.sku ??
                  'Standard'}
              </Txt>
            </Txt>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${name}`}
          onPress={() => change(0)}
          style={styles.remove}
        >
          <Icon name="x" size={19} color="#64748B" />
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
            {line.quantity} {unit}
          </Txt>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Txt style={styles.label}>INDICATIVE UNIT RATE</Txt>
          {!priceAccess ? (
            <SubscribeForPrices />
          ) : (
            <Txt style={styles.value}>
              {price
                ? `${money(price.amount)} / ${price.unit}`
                : 'Quotation required'}
            </Txt>
          )}
        </View>
      </View>
      <View style={styles.taxNoticeRow}>
        <Icon name="info" size={14} color="#00409A" />
        <Txt style={styles.taxNoticeText}>
          {price?.tax ??
            'GST and freight are excluded. Both will be added during order confirmation.'}
        </Txt>
      </View>
      <View
        style={[
          styles.row,
          { justifyContent: 'space-between', flexWrap: 'wrap', paddingTop: 2 },
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
            <Icon name="minus" size={15} color="#0F172A" />
          </Pressable>
          <Txt style={styles.quantity}>
            {line.quantity} <Txt style={styles.quantityUnit}>{unit}</Txt>
          </Txt>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Increase ${name}`}
            disabled={!valid}
            onPress={() => change(line.quantity + minimum)}
            style={styles.stepButton}
          >
            <Icon name="plus" size={15} color="#0F172A" />
          </Pressable>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
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
  const priceAccess = usePriceAccess();
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
    !priceAccess
      ? null
      : cartLinePrice(
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add another size or product"
              onPress={() => router.push('/products')}
              style={({ pressed }) => [
                styles.addAnotherBtn,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Icon name="plus" size={16} color="#00409A" />
              <Txt style={styles.addAnotherText}>Add another size or product</Txt>
            </Pressable>
            <Card style={styles.card}>
              <View style={styles.row}>
                <Icon name="truck" size={20} color="#111827" />
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
                <Icon name="paperclip" size={20} color="#111827" />
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

            {/* ISO 9001 Quality Assurance Banner */}
            <View style={styles.isoTrustStrip}>
              <View style={styles.isoBadgeRow}>
                <Icon name="award" size={15} color="#A70101" />
                <Txt style={styles.isoBadgeTitle}>ISO 9001:2015 CERTIFIED SUPPLY</Txt>
              </View>
              <Txt style={styles.isoBadgeDesc}>
                Fieldfast Tech International • Ludhiana Industrial Area-C Works • MTC & Batch Traceability Assured
              </Txt>
            </View>

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
                  backgroundColor: blocked ? '#64748B' : '#A70101',
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
  hero: { padding: 16, gap: 16, backgroundColor: '#0B1B36' },
  heading: { fontSize: 24, lineHeight: 31, fontWeight: '700', color: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mode: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
    backgroundColor: '#00409A',
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
    backgroundColor: '#00409A',
    borderRadius: 8,
    padding: 12,
  },
  isoTrustStrip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    boxShadow: '0 2px 8px rgba(16, 24, 40, 0.04)',
  },
  isoBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  isoBadgeTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#A70101',
    letterSpacing: 0.6,
  },
  isoBadgeDesc: {
    fontSize: 11.5,
    lineHeight: 17,
    color: '#475569',
  },
  card: {
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    boxShadow: '0 2px 8px rgba(0, 24, 53, 0.04)',
  },
  lotTitle: {
    fontSize: 18,
    lineHeight: 24,
    color: '#0F172A',
    fontWeight: '800',
  },
  sizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 1,
  },
  sizeText: {
    fontSize: 12.5,
    color: '#64748B',
  },
  sizeTextBold: {
    fontWeight: '700',
    color: '#0F172A',
  },
  sectionTitle: {
    fontSize: 17,
    lineHeight: 24,
    color: '#0F172A',
    fontWeight: '700',
    flexShrink: 1,
  },
  kindChip: {
    color: '#00409A',
    backgroundColor: '#EEF4FC',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 5,
  },
  brandChip: {
    color: '#15803D',
    backgroundColor: '#ECFDF5',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 5,
  },
  gradeChip: {
    color: '#0F172A',
    backgroundColor: '#F1F5F9',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 5,
  },
  chip: {
    color: '#111827',
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
    color: '#64748B',
    fontSize: 9.5,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  value: { fontSize: 14, lineHeight: 20, color: '#0F172A', fontWeight: '800' },
  specGrid: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#EEF4FC',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  taxNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  taxNoticeText: {
    flex: 1,
    fontSize: 11,
    color: '#475569',
  },
  remove: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    padding: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  stepButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  quantity: {
    paddingHorizontal: 12,
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  quantityUnit: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  lotTotal: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '800',
    color: '#00409A',
  },
  addAnotherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#00409A',
    backgroundColor: '#FFFFFF',
  },
  addAnotherText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#00409A',
  },
  clear: { color: '#A70101', fontSize: 12, fontWeight: '600' },
  error: { color: '#ba1a1a', fontSize: 12, lineHeight: 19 },
  totalBox: {
    padding: 12,
    gap: 4,
    backgroundColor: '#e6eeff',
    borderRadius: 8,
  },
  tray: {
    backgroundColor: '#0B1B36',
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
