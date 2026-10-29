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
  desktop = false,
}: {
  slug: string;
  imageUrl: string | null;
  drawings: DrawingDefinition[];
  onSelect: () => void;
  desktop?: boolean;
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
  if (desktop) return (
    <View style={compact.card} testID="desktop-fastener-card">
      <View style={compact.top}>
        <Pressable accessibilityRole="link" accessibilityLabel={`View ${name}`} onPress={onSelect}>
          {imageUrl ? <Image source={{ uri: imageUrl }} contentFit="contain" style={compact.image} /> : <View style={compact.image}><Icon name="tool" /></View>}
        </Pressable>
        <View style={compact.specs}>
          <Txt style={compact.title}>{name}</Txt>
          {[
            ['Size', diameters.length ? size : 'Select size'],
            ['Standard', standards[0] ?? 'Select standard'],
            ['Grade', 'Select grade'],
          ].map(([label, value]) => <View key={label} style={compact.row}>
            <Txt style={compact.label}>{label}</Txt>
            <Pressable accessibilityRole="button" accessibilityLabel={`Choose ${label.toLowerCase()} for ${name}`} onPress={onSelect} style={compact.choice}>
              <Txt style={compact.value} numberOfLines={1}>{value}</Txt><Icon name="chevron-down" size={11} color="#64748B" />
            </Pressable>
          </View>)}
          <View style={compact.divider} />
          <Txt style={compact.note}>Select specifications to confirm minimum order</Txt>
          <Txt style={compact.note}>Order unit: Pieces</Txt>
        </View>
      </View>
      <View style={compact.divider} />
      <View style={compact.bottom}>
        <View><Txt style={compact.rate}>Rate on request</Txt><Txt style={compact.note}>Final rate confirmed with your quote</Txt></View>
        <View style={compact.actions}>
          <Pressable accessibilityRole="link" onPress={onSelect}><Txt style={compact.link}>Specifications</Txt></Pressable>
          <Pressable accessibilityRole="button" onPress={onSelect} style={compact.button}><Icon name="shopping-cart" size={14} color="#FFFFFF" /><Txt style={compact.buttonText}>Configure quote</Txt></Pressable>
        </View>
      </View>
    </View>
  );
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
const compact = StyleSheet.create({
  card: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  top: { flexDirection: 'row', gap: 12, flex: 1, minHeight: 178 },
  image: { width: 106, height: 106, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  specs: { flex: 1, minWidth: 0, gap: 5 },
  title: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 11, color: '#64748B', minWidth: 40 },
  choice: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'space-between', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  value: { flex: 1, fontSize: 11, fontWeight: '600', color: '#0F172A' },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 10 },
  note: { fontSize: 10.5, color: '#64748B' },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 },
  rate: { fontSize: 12.5, fontWeight: '800', color: '#A70101' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  link: { fontSize: 11.5, fontWeight: '600', color: '#00409A' },
  button: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#A70101', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 7 },
  buttonText: { fontSize: 11.5, fontWeight: '700', color: '#FFFFFF' },
});
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
