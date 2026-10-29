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
      <View style={{ flexDirection: 'row', gap: 12 }}>
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
              <Icon name="box" size={28} color="#64748B" />
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
              style={{ marginLeft: 'auto', padding: 6 }}
            >
              <Icon
                name="bookmark"
                size={18}
                color={saved ? '#00409A' : '#00409A'}
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
            style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 3 }}
          >
            <Txt style={styles.label}>{label}</Txt>
            <Txt style={styles.spec}>{value}</Txt>
          </View>
        ))}
      </View>
      <View style={styles.price}>
        {!priceAccess ? (
          <SubscribeForPrices />
        ) : tractor && first ? (
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
              Indicative catalogue price
            </Txt>
          </>
        ) : price ? (
          <>
            <Txt style={styles.amount}>
              {price.amount}
              <Txt style={styles.caption}>
                {tmt ? ` / piece (${price.tax})` : ` / ${first?.uom ?? 'unit'}`}
              </Txt>
            </Txt>
            <Txt style={styles.caption}>
              {tmt
                ? 'Indicative single-piece TMT retail benchmark'
                : 'Indicative base rate excl. loading, logistics & taxes'}
            </Txt>
          </>
        ) : (
          <Txt style={styles.amount}>Rate on enquiry</Txt>
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
                backgroundColor: '#00409A',
                borderColor: '#00409A',
                borderRadius: 8,
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
          <Icon name="file-text" color="#00409A" size={20} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    padding: 16,
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    boxShadow: '0 2px 8px rgba(16, 24, 40, 0.04)',
  },
  image: {
    width: 96,
    height: 96,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  badge: {
    flexShrink: 1,
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: '700',
    color: '#00409A',
    backgroundColor: '#EEF4FC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    letterSpacing: 0.4,
  },
  title: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: '#111827',
  },
  caption: {
    fontSize: 12.5,
    lineHeight: 18,
    color: '#64748B',
    fontWeight: '400',
  },
  manifest: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#F5EFEB',
    borderRadius: 8,
  },
  label: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  spec: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  price: {
    gap: 6,
    backgroundColor: '#EEF4FC',
    padding: 10,
    borderRadius: 8,
  },
  amount: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    color: '#00409A',
  },
  details: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#EEF4FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
