import { usePriceAccess } from '@shared/hooks/use-price-access';
import { SubscribeForPrices } from '@features/subscriptions/SubscribeForPrices';
import { isTmtCategory, lowestTmtPrice } from '../model/tmt';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Button, Icon, Txt } from '@shared/ui';
import { useStore } from '@core/state/workspace-store';
import type { Product } from '../model/types';
import { getCategoryImage } from './category-images';
import { rawMaterialDetails } from '../model/raw-material-details';
import { selectionPrice } from '../model/material-selection';
import { AddToCart } from './AddToCart';
import { formatTractorPrice, tractorPricing } from '../model/tractor-pricing';

export function MatrixProductCard({ product: p }: { product: Product }) {
  const priceAccess = usePriceAccess();
  const saved = useStore((state) => state.saved.includes(p.id));
  const toggle = useStore((state) => state.toggleSaved);
  const tmt = isTmtCategory(p.category);
  const first = p.variants[0];
  const tractor = p.product_kind === 'tractor_part';
  const tractorPrice =
    priceAccess && first ? tractorPricing(first) : null;
  const profile = rawMaterialDetails(p);
  const image =
    getCategoryImage(p.category) ??
    (p.images[0] ? { uri: p.images[0].url } : undefined);
  const grades = [
    ...new Set(
      p.variants.map((v) => String(v.attributes.grade ?? '')).filter(Boolean),
    ),
  ];
  const price =
    priceAccess && tmt
      ? lowestTmtPrice(p.variants)
      : priceAccess && first
        ? selectionPrice({
            id: first.id,
            product_id: p.id,
            product_name: p.name,
            grade: p.grade,
            variant_id: first.id,
            uom: first.uom,
            min_order_qty: first.min_order_qty,
            attributes: first.attributes,
          })
        : null;
  const open = () =>
    router.push({ pathname: '/product/[id]', params: { id: p.id } });
  return (
    <View
      style={styles.card}
      testID={tractor ? 'matrix-tractor-card' : 'matrix-product-card'}
    >
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`View ${p.name}`}
          onPress={open}
        >
          {image ? (
            <Image
              source={image}
              contentFit={tractor ? 'contain' : 'cover'}
              accessibilityLabel={p.name}
              style={styles.image}
            />
          ) : (
            <View
              style={[
                styles.image,
                { alignItems: 'center', justifyContent: 'center' },
              ]}
            >
              <Icon name="box" size={28} />
            </View>
          )}
        </Pressable>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Txt numberOfLines={1} style={styles.badge}>
              {tmt
                ? 'TMT BAR'
                : grades[0]
                  ? `GRADE ${grades[0]}`
                  : p.category.toUpperCase()}
            </Txt>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${saved ? 'Unsave' : 'Save'} ${p.name}`}
              accessibilityState={{ selected: saved }}
              onPress={() => toggle(p.id)}
              style={{ marginLeft: 'auto', padding: 8 }}
            >
              <Icon
                name="bookmark"
                size={16}
                color={saved ? '#af101a' : '#485f83'}
              />
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`View specifications for ${p.name}`}
            onPress={open}
          >
            <Txt style={styles.title}>{p.name}</Txt>
          </Pressable>
          <Txt numberOfLines={2} style={styles.caption}>
            {p.description || profile?.materials || p.category}
          </Txt>
        </View>
      </View>
      <View style={styles.manifest}>
        {[
          [
            tractor ? 'PART / SIZE' : 'SIZE RANGE',
            tmt
              ? 'Choose size'
              : (profile?.size ?? first?.size_label ?? 'On enquiry'),
          ],
          [
            'MIN ORDER',
            first ? `${first.min_order_qty} ${first.uom}` : 'On enquiry',
          ],
          [
            tractor ? 'VARIANTS' : tmt ? 'BRANDS' : 'GRADES',
            tractor
              ? String(p.variants.length)
              : grades.length
                ? `${grades.length} available`
                : 'On enquiry',
          ],
        ].map(([label, value]) => (
          <View
            key={label}
            style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 4 }}
          >
            <Txt style={styles.label}>{label}</Txt>
            <Txt style={styles.spec}>{value}</Txt>
          </View>
        ))}
      </View>
      <View style={styles.price}>
        {!priceAccess ? <SubscribeForPrices /> : tractor && first ? (
          <>
            <Txt style={styles.amount}>
              {tractorPrice
                ? formatTractorPrice(
                    tractorPrice.discounted ?? tractorPrice.base,
                  )
                : 'Quotation on request'}
              <Txt style={styles.caption}>
                {tractorPrice ? ` / ${first.uom}` : ''}
              </Txt>
            </Txt>
            <Txt style={styles.caption}>
              {tractorPrice?.discounted
                ? `Base price ${formatTractorPrice(tractorPrice.base)}. `
                : ''}
              GST and delivery confirmed at checkout.
            </Txt>
          </>
        ) : (
          <>
            <Txt style={styles.amount}>
              {price
                ? `From ₹${price.amount}`
                : 'Quotation on request'}
              <Txt style={styles.caption}>
                {price ? ` / ${price.unit}` : ''}
              </Txt>
            </Txt>
            <Txt style={styles.caption}>
              {tmt
                ? 'Price varies by brand and size.'
                : (price?.tax ??
                  'Select size and grade to request a quotation.')}
            </Txt>
            {tmt && price ? (
              <Txt style={styles.caption}>{price.tax}</Txt>
            ) : null}
          </>
        )}
      </View>
      <View
        style={{
          flexDirection: 'row',
          gap: 8,
          alignItems: 'center',
          marginTop: 'auto',
        }}
      >
        <View style={{ flex: 1 }}>
          {tractor && p.variants.length ? (
            <AddToCart
              compact
              product={p}
              variant={p.variants.length === 1 ? first : undefined}
            />
          ) : (
            <Button
              icon="shopping-cart"
              onPress={open}
              style={{
                minHeight: 44,
                backgroundColor: '#af101a',
                borderColor: '#af101a',
                borderRadius: 4,
              }}
            >
              {tractor
                ? 'View part details'
                : tmt
                  ? 'Select size & brand'
                  : 'Select size & grade'}
            </Button>
          )}
        </View>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Technical details for ${p.name}`}
          onPress={open}
          style={styles.details}
        >
          <Icon name="file-text" color="#485f83" size={20} />
        </Pressable>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    padding: 12,
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    boxShadow: '0 2px 8px rgba(20,45,78,0.08)',
  },
  image: { width: 96, height: 96, borderRadius: 4, backgroundColor: '#dde9ff' },
  badge: {
    flexShrink: 1,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    color: '#30476a',
    backgroundColor: '#dde9ff',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 2,
  },
  title: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: '#101c2c' },
  caption: {
    fontSize: 12,
    lineHeight: 17,
    color: '#485f83',
    fontWeight: '400',
  },
  manifest: {
    flexDirection: 'row',
    gap: 8,
    padding: 8,
    backgroundColor: '#eff4ff',
    borderRadius: 4,
  },
  label: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
    color: '#485f83',
    textAlign: 'center',
  },
  spec: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    color: '#101c2c',
    textAlign: 'center',
  },
  price: { gap: 4, backgroundColor: '#e6eeff', padding: 8, borderRadius: 4 },
  amount: { fontSize: 18, lineHeight: 24, fontWeight: '700', color: '#af101a' },
  details: {
    width: 44,
    height: 44,
    borderRadius: 4,
    backgroundColor: '#dde9ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
