import type { Product } from '../model/types';
import { Badge, Card, Icon, Txt, c } from '@shared/ui';
import { productCard } from '@shared/theme/product-card';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useStore } from '@core/state/workspace-store';
import { TractorPrice } from './TractorPrice';
import { AddToCart } from './AddToCart';
import { getCategoryImage } from './category-images';
import { availableCatalogFilters } from '../model/available-filters';
import { RawMaterialDetails } from './RawMaterialDetails';

export function ProductCard({
  product: p,
  filters,
}: {
  product: Product;
  filters?: { size: string; grade: string };
}) {
  const saved = useStore((state) => state.saved);
  const toggleSaved = useStore((state) => state.toggleSaved);
  const first = p.variants[0];
  const categoryImage = getCategoryImage(p.category);
  const image =
    categoryImage ?? (p.images[0] ? { uri: p.images[0].url } : undefined);
  const options =
    p.product_kind === 'steel' ? availableCatalogFilters(p.variants) : null;
  const openProduct = () =>
    router.push({
      pathname: '/product/[id]',
      params: {
        id: p.id,
        ...(filters?.size ? { size: filters.size } : {}),
        ...(filters?.grade ? { grade: filters.grade } : {}),
      },
    });
  return (
    <Card
      style={{
        padding: 0,
        overflow: 'hidden',
        flex: 1,
        minWidth: 0,
        minHeight: productCard.minHeight,
        borderRadius: productCard.radius,
      }}
    >
      <View pointerEvents="none" style={{ height: 4, flexDirection: 'row' }}>
        <View style={{ flex: 1, backgroundColor: c.red }} />
        <View style={{ flex: 2, backgroundColor: c.cardBorder }} />
      </View>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`View ${p.name}`}
        onPress={openProduct}
      >
        {image ? (
          <Image
            source={image}
            contentFit="cover"
            accessibilityLabel={`${p.category} category image`}
            style={{ width: '100%', height: productCard.imageHeight }}
          />
        ) : (
          <View
            style={{
              height: productCard.imageHeight,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.bg,
            }}
          >
            <Icon name="box" size={36} color={c.muted} />
          </View>
        )}
        <Txt
          numberOfLines={2}
          style={{
            padding: 12,
            minHeight: productCard.titleHeight,
            fontSize: 14,
            lineHeight: 20,
            fontWeight: '700',
            color: '#075299',
            backgroundColor: '#e6f2ff',
          }}
        >
          {p.name}
        </Txt>
      </Pressable>
      <View style={{ position: 'absolute', top: 10, left: 8 }}>
        <Badge>FTI stock</Badge>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${saved.includes(p.id) ? 'Remove saved' : 'Save'} ${p.name}`}
        onPress={() => toggleSaved(p.id)}
        style={{
          position: 'absolute',
          top: 8,
          right: 6,
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: '#FFFFFFE6',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon
          name="bookmark"
          size={17}
          color={saved.includes(p.id) ? c.red : c.muted}
        />
      </Pressable>
      <View style={{ padding: 12, gap: 8, flex: 1 }}>
        {p.product_kind === 'tractor_part' && first ? (
          <TractorPrice variant={first} />
        ) : null}
        {p.product_kind === 'steel' ? (
          <RawMaterialDetails product={p} compact />
        ) : (
          <Txt
            numberOfLines={2}
            style={{ fontSize: 12, lineHeight: 18, color: c.muted }}
          >
            {p.description || 'Product specifications available on request.'}
          </Txt>
        )}
        {first && !options ? (
          <Txt style={{ fontSize: 12, lineHeight: 18, color: c.ink }}>
            {first.size_label || first.sku} · MOQ {first.min_order_qty}{' '}
            {first.uom}
          </Txt>
        ) : null}
        <Txt style={{ fontSize: 11, lineHeight: 17, color: c.muted }}>
          {options
            ? `${options.sizes.length} sizes · ${options.grades.length} grades`
            : `${p.variants.length} active variant${p.variants.length === 1 ? '' : 's'}`}
        </Txt>
        <View style={{ marginTop: 'auto', gap: 6 }}>
          <AddToCart
            product={p}
            variant={p.variants.length === 1 ? first : undefined}
          />
          {p.product_kind === 'steel' ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`View specifications for ${p.name}`}
              onPress={openProduct}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Txt
                style={{
                  fontSize: 11,
                  lineHeight: 18,
                  fontWeight: '700',
                  color: c.red,
                }}
              >
                View specifications →
              </Txt>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Card>
  );
}
