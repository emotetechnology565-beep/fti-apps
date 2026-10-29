import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Button, Icon, Txt } from '@shared/ui';
import type { DrawingDefinition } from '../model/types';
import { subcategoryLabel } from '../model/subcategories';
import { usePriceAccess } from '@shared/hooks/use-price-access';
import { SubscribeForPrices } from '@features/subscriptions/SubscribeForPrices';

export function MatrixFastenerCard({
  slug,
  imageUrl,
  drawings,
  onSelect,
}: {
  slug: string;
  imageUrl: string | null;
  drawings: DrawingDefinition[];
  onSelect: () => void;
}) {
  const name = subcategoryLabel(slug);
  const priceAccess = usePriceAccess();
  const diameters = drawings
    .map((row) => row.dimensions.diameter)
    .filter((value) => Number.isFinite(value) && value > 0);
  const size =
    slug === 'hex-bolt'
      ? '5–56 mm'
      : diameters.length
        ? `${Math.min(...diameters)}–${Math.max(...diameters)} mm`
        : 'On enquiry';
  const standards = [
    ...new Set(drawings.map((row) => `${row.standard}:${row.edition}`)),
  ];
  return (
    <View style={styles.card} testID="matrix-fastener-card">
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`View ${name}`}
          onPress={onSelect}
        >
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              contentFit="contain"
              accessibilityLabel={`${name} product photo`}
              style={styles.image}
            />
          ) : (
            <View style={styles.image}>
              <Icon name="tool" />
            </View>
          )}
        </Pressable>
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <Txt style={styles.badge}>
            FASTENER / {standards[0] ?? 'FTI CATALOGUE'}
          </Txt>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`View specifications for ${name}`}
            onPress={onSelect}
          >
            <Txt style={styles.title}>{name}</Txt>
          </Pressable>
          <Txt style={styles.caption}>
            {slug === 'hex-bolt'
              ? 'LC / MS / CHQ · EN-8D + more'
              : 'Select standard, size and grade'}
          </Txt>
        </View>
      </View>
      <View style={styles.manifest}>
        {[
          ['SIZE RANGE', size],
          [
            'STANDARDS',
            standards.length ? String(standards.length) : 'On enquiry',
          ],
          ['ORDER UNIT', 'Pieces'],
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
        {priceAccess ? (
          <Txt style={styles.amount}>Select size and grade for live prices</Txt>
        ) : <SubscribeForPrices />}
        <Txt style={styles.caption}>
          Select size and grade for weight and pricing.
        </Txt>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 'auto' }}>
        <Button
          icon="shopping-cart"
          onPress={onSelect}
          style={{
            flex: 1,
            minHeight: 44,
            backgroundColor: '#00409A',
            borderColor: '#00409A',
            borderRadius: 8,
          }}
        >
          Select size & grade
        </Button>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Technical details for ${name}`}
          onPress={onSelect}
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
    borderRadius: 14,
    borderWidth: 1, borderColor: '#E2E8F0', boxShadow: '0 2px 8px rgba(16,24,40,0.04)',
  },
  image: {
    width: 96,
    height: 96,
    borderRadius: 8,
    backgroundColor: '#F5EFEB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    alignSelf: 'flex-start',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    color: '#00409A',
    backgroundColor: '#EEF4FC',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 2,
  },
  title: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: '#111827' },
  caption: { fontSize: 12, lineHeight: 17, color: '#64748B' },
  manifest: {
    flexDirection: 'row',
    gap: 8,
    padding: 8,
    backgroundColor: '#F5EFEB',
    borderRadius: 8,
  },
  label: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
  },
  spec: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  price: { gap: 4, backgroundColor: '#EEF4FC', padding: 8, borderRadius: 8 },
  amount: { fontSize: 18, lineHeight: 24, fontWeight: '700', color: '#00409A' },
  details: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#EEF4FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
