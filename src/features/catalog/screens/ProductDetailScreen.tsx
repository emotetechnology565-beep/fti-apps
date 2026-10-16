import { useProduct } from '../hooks/use-products';
import { Badge, Button, Card, Empty, Heading, Row, Txt, c, s } from '@shared/ui';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Image } from 'expo-image';
const go = (path: string) => router.push(path as never);
export function ProductDetail({ id }: { id: string }) {
  const query = useProduct(id);
  if (query.isPending) return <Card><Txt style={s.muted}>Loading product…</Txt></Card>;
  const p = query.data;
  if (query.error || !p)
    return <Empty title="Product not found" description={query.error?.message ?? 'This product is unavailable or no longer published.'} action={<Button onPress={() => go('/products')}>Back to catalogue</Button>} />;
  return (
    <View>
      <Heading eyebrow={p.category.toUpperCase()} title={p.name} description={p.description || 'Product specifications from the FTI catalogue.'} />
      {!!p.images.length && <Row style={{ flexWrap: 'wrap', marginBottom: 18 }}>{p.images.map(image => <Image key={image.id} source={{ uri: image.url }} contentFit="cover" style={{ width: 170, height: 150, borderRadius: 8 }} />)}</Row>}
      <Card style={{ gap: 18 }}>
        <Row style={{ flexWrap: 'wrap' }}>
          <Badge>{p.product_kind.replace('_', ' ').toUpperCase()}</Badge>
          <Badge tone="green">{p.purchase_mode === 'both' ? 'Quote or direct order' : p.purchase_mode === 'direct' ? 'Direct order' : 'Request for quotation'}</Badge>
        </Row>
        <Txt style={s.h2}>Available variants</Txt>
        {p.variants.map((variant) => (
          <Card key={variant.id} style={{ gap: 12, backgroundColor: '#F8FAFC' }}>
            <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <Txt style={{ fontWeight: '700' }}>{variant.size_label || variant.sku}</Txt>
              <Badge>{variant.sku}</Badge>
            </Row>
            {[
              ['Unit', variant.uom],
              ['Minimum order', `${variant.min_order_qty} ${variant.uom}`],
              ...(variant.diameter_mm ? [['Diameter', `${variant.diameter_mm} mm`]] : []),
              ...(variant.length_mm ? [['Length', `${variant.length_mm} mm`]] : []),
              ...Object.entries(variant.attributes).map(([key, value]) => [key.replaceAll('_', ' '), String(value)]),
            ].map(([label, value]) => (
              <Row key={`${variant.id}-${label}`} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <Txt style={s.muted}>{label}</Txt>
                <Txt style={{ fontSize: 13, fontWeight: '600', color: c.ink }}>{value}</Txt>
              </Row>
            ))}
          </Card>
        ))}
        <Txt style={s.muted}>Prices and stock are not shown until those services are configured. Ask FTI for current availability and pricing.</Txt>
        <Button onPress={() => go('/rfqs')}>Browse quotation requests</Button>
      </Card>
    </View>
  );
}
