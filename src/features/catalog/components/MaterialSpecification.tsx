import { isTmtCategory } from '../model/tmt';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Card, Icon, Txt } from '@shared/ui';
import type { Product } from '../model/types';
import { getCategoryImage } from './category-images';
import { CatalogFilter } from './CatalogFilter';
import type { ComponentProps } from 'react';

export function MaterialSpecificationHeader({
  product,
  fastener = false,
}: {
  product: Pick<Product, 'images' | 'category' | 'name' | 'description'>;
  fastener?: boolean;
}) {
  const image = getCategoryImage(product.category) ?? (product.images[0]?.url
    ? { uri: product.images[0].url }
    : undefined);
  return (
    <View style={{ gap: 12, marginBottom: 16 }}>
      <View style={styles.toolbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to catalogue"
          onPress={() =>
            router.push(fastener ? '/products?kind=fastener' : '/products')
          }
          style={styles.back}
        >
          <Icon name="arrow-left" color="#101c2c" />
        </Pressable>
        <Txt accessibilityRole="header" style={styles.title}>
          Product Specification Detail
        </Txt>
      </View>
      <View style={styles.strip}>
        <Txt style={styles.stripText}>
          {fastener
            ? 'FASTENER / INDUSTRIAL SUPPLY'
            : 'RAW MATERIALS / INDUSTRIAL SUPPLY'}
        </Txt>
        <Icon name="layers" size={16} color="#b0c8f1" />
      </View>
      <Card style={{ padding: 12, borderWidth: 0, gap: 8, borderRadius: 8 }}>
        <View style={styles.toolbar}>
          <View style={{ flex: 1, gap: 6 }}>
            <Txt style={styles.eyebrow}>
              {'FTI Catalogue / ' + product.category}
            </Txt>
            <Txt accessibilityRole="header" style={styles.name}>
              {product.name}
            </Txt>
            <Txt style={styles.description}>
              {product.description ||
                'Select your required size, grade and consignment quantity.'}
            </Txt>
          </View>
          <View style={styles.logo}>
            <Txt style={styles.logoText}>FTI</Txt>
          </View>
        </View>
        {image ? (
          <Image
            source={image}
            contentFit="cover"
            accessibilityLabel={product.name}
            style={{
              width: '100%',
              height: 176,
              borderRadius: 8,
              backgroundColor: '#eff4ff',
            }}
          />
        ) : null}
        <View style={styles.toolbar}>
          <View style={styles.info}>
            <Icon name="grid" color="#485f83" />
            <Txt style={styles.infoText}>
              {isTmtCategory(product.category)
                ? 'Size & brand selection'
                : 'Size & grade selection'}
            </Txt>
          </View>
          <View style={styles.info}>
            <Icon name="file-text" color="#A70101" />
            <Txt style={styles.infoText}>Quotation on request</Txt>
          </View>
          <View style={styles.info}>
            <Icon name="truck" color="#485f83" />
            <Txt style={styles.infoText}>Delivery enquiry</Txt>
          </View>
        </View>
      </Card>
    </View>
  );
}

export function MaterialSpecFilter(
  props: ComponentProps<typeof CatalogFilter>,
) {
  return (
    <CatalogFilter
      {...props}
      label={props.label === 'Grade' ? 'Steel Grade' : props.label}
    />
  );
}

export function MaterialSectionTitle({
  number,
  title,
}: {
  number: number;
  title: string;
}) {
  return (
    <View style={[styles.toolbar, { marginTop: number > 1 ? 12 : 0 }]}>
      <Txt accessibilityRole="header" style={styles.title}>
        {number}. {title}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e6eeff',
    borderRadius: 8,
  },
  title: {
    flex: 1,
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '600',
    color: '#111827',
  },
  strip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#253142',
    padding: 12,
    borderRadius: 4,
  },
  stripText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#ebf1ff',
  },
  eyebrow: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  name: { fontSize: 18, lineHeight: 24, fontWeight: '700', color: '#111827' },
  description: { fontSize: 12, lineHeight: 19, color: '#4f5961' },
  logo: {
    width: 44,
    height: 44,
    backgroundColor: '#101c2c',
    borderRadius: 8,
    borderBottomWidth: 3,
    borderBottomColor: '#00409A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  info: {
    flex: 1,
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: 6,
    padding: 8,
    backgroundColor: '#eff4ff',
    borderRadius: 4,
  },
  infoText: {
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '600',
    textAlign: 'center',
    color: '#30476a',
  },
  number: {
    width: 30,
    height: 30,
    backgroundColor: '#ffdad6',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export function MaterialQuantity({
  value,
  onChange,
  unit,
  minimum,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  unit: string;
  minimum?: number;
  disabled: boolean;
}) {
  const step = unit === 'MT' ? 0.5 : 1;
  return (
    <View style={{ gap: 8 }}>
      <View
        style={{
          backgroundColor: '#e6eeff',
          padding: 4,
          borderRadius: 6,
          flexDirection: 'row',
        }}
      >
        <View
          style={{
            backgroundColor: '#253142',
            borderRadius: 4,
            padding: 8,
            flex: 1,
          }}
        >
          <Txt
            style={{
              color: '#ebf1ff',
              fontSize: 12,
              textAlign: 'center',
              fontWeight: '600',
            }}
          >
            {unit === 'MT' ? 'Metric Ton (MT)' : unit}
          </Txt>
        </View>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: '#eff4ff',
          borderRadius: 8,
          padding: 12,
          justifyContent: 'center',
          gap: 12,
        }}
      >
        <Pressable
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Decrease quantity"
          style={quantityButton}
          onPress={() =>
            onChange(
              String(Math.max(minimum ?? step, (Number(value) || 0) - step)),
            )
          }
        >
          <Icon name="minus" color="#101c2c" />
        </Pressable>
        <View
          style={{ width: 160, flexShrink: 1, alignItems: 'center', gap: 2 }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'baseline',
              gap: 4,
            }}
          >
            <TextInput
              accessibilityLabel={`Quantity in ${unit}`}
              editable={!disabled}
              keyboardType="decimal-pad"
              value={value}
              onChangeText={onChange}
              placeholder="0.00"
              style={{
                fontSize: 26,
                fontWeight: '700',
                color: '#111827',
                textAlign: 'center',
                minWidth: 80,
                maxWidth: 140,
                padding: 0,
              }}
            />
            <Txt style={{ color: '#64748B', fontWeight: '600' }}>{unit}</Txt>
          </View>
          <Txt style={{ fontSize: 12, color: '#4f5961' }}>
            {minimum
              ? `FTI Batch MOQ: ${minimum} ${unit}`
              : 'Enter required quantity'}
          </Txt>
        </View>
        <Pressable
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Increase quantity"
          style={quantityButton}
          onPress={() => onChange(String((Number(value) || 0) + step))}
        >
          <Icon name="plus" color="#101c2c" />
        </Pressable>
      </View>
    </View>
  );
}
const quantityButton = {
  flexShrink: 0,
  width: 48,
  height: 48,
  borderRadius: 4,
  backgroundColor: '#ffffff',
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};
