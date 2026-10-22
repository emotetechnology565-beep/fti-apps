import type { Product } from '@features/catalog/model/types';
import { Badge, Card, Icon, Row, s, Txt, c } from '@shared/ui';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useStore } from '@core/state/workspace-store';
import { TractorPrice } from './TractorPrice';
import { AddToCart } from './AddToCart';
import { getCategoryImage } from './category-images';
export function ProductCard({ product: p, filters }: { product: Product; filters?: { size: string; grade: string } }) {
  const saved = useStore((state) => state.saved);
  const toggleSaved = useStore((state) => state.toggleSaved);
  const first = p.variants[0];
  const categoryImage = getCategoryImage(p.category);
  const productImage = p.images[0] ? { uri: p.images[0].url } : undefined;
  return (
    <Card
      style={{
        padding: 0,
        overflow: 'hidden',
        flex: 1,
        minWidth: 0,
        borderWidth: 0,
        borderRadius: 12,
        backgroundColor: '#FFF0F0',
        boxShadow: '0px 2px 8px rgba(7, 82, 153, 0.08)',
      }}
    >
      <View pointerEvents="none" style={{ height: 4, flexDirection: 'row' }}>
        <View style={{ flex: 2, backgroundColor: c.red }} />
        <View style={{ flex: 3, backgroundColor: '#075299' }} />
      </View>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`View ${p.name}`}
        onPress={() => router.push({ pathname: '/product/[id]', params: { id: p.id, ...(filters?.size ? { size: filters.size } : {}), ...(filters?.grade ? { grade: filters.grade } : {}) } })}
        style={{
          minHeight: 150,
          backgroundColor: '#E7F2FF',
          padding: 12,
          justifyContent: 'flex-end',
        }}
      >
        {categoryImage || productImage ? (
          <Image
            source={categoryImage ?? productImage!}
            contentFit="cover"
            accessibilityLabel={`${p.category} category image`}
            style={{
              width: '100%',
              height: 145,
              marginBottom: 12,
              borderRadius: 5,
            }}
          />
        ) : (
          <Icon name="box" size={24} color="#075299" />
        )}
        <Txt
          numberOfLines={2}
          style={{
            fontSize: 17,
            fontWeight: '700',
            marginTop: 14,
            color: '#075299',
          }}
        >
          {p.name}
        </Txt>
        <Txt style={{ fontSize: 13, color: '#526277' }}>{p.category}</Txt>
      </Pressable>
      <View style={{ padding: 12, gap: 10, backgroundColor: '#FFF0F0' }}>
        <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <Badge>FTI stock</Badge>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${saved.includes(p.id) ? 'Remove saved' : 'Save'} ${p.name}`}
            onPress={() => toggleSaved(p.id)}
            style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon
              name="bookmark"
              size={17}
              color={saved.includes(p.id) ? c.red : c.muted}
            />
          </Pressable>
        </Row>
        {p.product_kind !== 'steel' ? <Txt style={{ fontSize: 11, color: c.red, fontWeight: '700' }}>
          {p.product_kind.replace('_', ' ').toUpperCase()}
        </Txt> : null}
        {p.product_kind === 'tractor_part' && first ? <TractorPrice variant={first} /> : null}
        <Txt style={s.muted} numberOfLines={3}>
          {p.description || 'Product specifications available on request.'}
        </Txt>
        {first ? (
          <Txt style={{ fontSize: 12, color: c.ink }}>
            {first.size_label || first.sku} · MOQ {first.min_order_qty}{' '}
            {first.uom}
          </Txt>
        ) : null}
        <Txt style={{ fontSize: 11, color: c.muted }}>
          {p.variants.length} active variant{p.variants.length === 1 ? '' : 's'}
        </Txt>
        <AddToCart product={p} variant={p.variants.length === 1 ? first : undefined} />
      </View>
    </Card>
  );
}
