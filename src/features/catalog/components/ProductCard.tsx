import type { Product } from '@features/catalog/model/types';
import { Badge, Card, Icon, Row, s, Txt, c } from '@shared/ui';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useStore } from '@core/state/workspace-store';
export function ProductCard({ product: p }: { product: Product }) {
  const saved = useStore((state) => state.saved);
  const toggleSaved = useStore((state) => state.toggleSaved);
  const first = p.variants[0];
  return (
    <Card style={{ padding: 0, overflow: 'hidden', flex: 1, minWidth: 240 }}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`View ${p.name}`}
        onPress={() => router.push(`/product/${p.id}` as never)}
        style={{ minHeight: 150, backgroundColor: '#E5E9ED', padding: 18, justifyContent: 'flex-end' }}
      >
        {p.images[0] ? <Image source={{ uri: p.images[0].url }} contentFit="cover" style={{ width: '100%', height: 145, marginBottom: 12, borderRadius: 5 }} /> : <Icon name="box" size={24} color="#718096" />}
        <Txt style={{ fontSize: 17, fontWeight: '700', marginTop: 14 }}>{p.name}</Txt>
        <Txt style={s.muted}>{p.category}</Txt>
      </Pressable>
      <View style={{ padding: 17, gap: 10 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Badge>{p.product_kind.replace('_', ' ').toUpperCase()}</Badge>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${saved.includes(p.id) ? 'Remove saved' : 'Save'} ${p.name}`}
            onPress={() => toggleSaved(p.id)}
            style={{ padding: 8 }}
          >
            <Icon name="bookmark" size={17} color={saved.includes(p.id) ? c.red : c.muted} />
          </Pressable>
        </Row>
        <Txt style={s.muted} numberOfLines={3}>{p.description || 'Product specifications available on request.'}</Txt>
        {first ? <Txt style={{ fontSize: 12, color: c.ink }}>{first.size_label || first.sku} · MOQ {first.min_order_qty} {first.uom}</Txt> : null}
        <Txt style={{ fontSize: 11, color: c.muted }}>{p.variants.length} active variant{p.variants.length === 1 ? '' : 's'}</Txt>
      </View>
    </Card>
  );
}
