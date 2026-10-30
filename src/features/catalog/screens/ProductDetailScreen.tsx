import { redactPublicPrices } from '@shared/lib/price-access';
import { useProduct } from '../hooks/use-products';
import {
  Badge,
  Button,
  Card,
  Empty,
  Heading,
  Row,
  Txt,
  c,
  s,
} from '@shared/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { ProductReferenceCharts } from '../components/ProductReferenceCharts';
import { TractorPrice } from '../components/TractorPrice';
import { GradeListPrice } from '../components/GradeListPrice';
import { tractorPriceKeys } from '../model/tractor-pricing';
import { AddToCart } from '../components/AddToCart';
import { CategoryQuotationButton } from '@features/quotations/ui';
import { getCategoryImage } from '../components/category-images';
import { RawMaterialDetail } from './RawMaterialDetailScreen';
import { RawMaterialDetails } from '../components/RawMaterialDetails';
import { ProductDescription } from '../components/ProductDescription';
import { BackToCatalogue } from '../components/BackToCatalogue';
import { ProductDetailSkeleton } from '../components/ProductSkeleton';

export function ProductDetail({ id }: { id: string }) {
  const params = useLocalSearchParams<{ size?: string; grade?: string }>();
  const query = useProduct(id);
  if (query.isPending)
    return (
      <View style={{gap:16}}>
        <BackToCatalogue />
        <ProductDetailSkeleton />
      </View>
    );
  const p = query.data;
  if (query.error || !p)
    return (
      <Empty
        title="Product not found"
        description={
          query.error?.message ??
          'This product is unavailable or no longer published.'
        }
        action={
          <Button onPress={() => router.push('/products')}>
            Back to catalogue
          </Button>
        }
      />
    );
  if (p.product_kind === 'steel') return <RawMaterialDetail key={p.id} product={p} initialSize={typeof params.size === 'string' ? params.size : ''} initialGrade={typeof params.grade === 'string' ? params.grade : ''} />;
  const categoryImage = getCategoryImage(p.category);
  return (
    <View>
      <BackToCatalogue />
      <Heading
        eyebrow={p.category.toUpperCase()}
        title={p.name}
        description={
          p.description || 'Product specifications from the FTI catalogue.'
        }
      />
      {categoryImage ? (
        <Row style={{ flexWrap: 'wrap', marginBottom: 18 }}>
          <Image
            source={categoryImage}
            contentFit="cover"
            accessibilityLabel={`${p.category} category image`}
            style={{
              width: '100%',
              maxWidth: 520,
              height: 220,
              borderRadius: 8,
            }}
          />
        </Row>
      ) : p.images.length ? (
        <Row style={{ flexWrap: 'wrap', marginBottom: 18 }}>
          {p.images.map((image) => (
            <Image
              key={image.id}
              source={{ uri: image.url }}
              contentFit="cover"
              style={{ width: 170, height: 150, borderRadius: 8 }}
            />
          ))}
        </Row>
      ) : null}
      <ProductDescription product={p} />
      <RawMaterialDetails product={p} />
      <ProductReferenceCharts key={p.id} product={p} />
      <Card style={{ gap: 18 }}>
        <Row style={{ flexWrap: 'wrap' }}>
          <Badge>FTI stock</Badge>
          <Badge>{p.product_kind.replace('_', ' ').toUpperCase()}</Badge>
          <Badge tone="green">
            {p.purchase_mode === 'both'
              ? 'Quote or direct order'
              : p.purchase_mode === 'direct'
                ? 'Direct order'
                : 'Request for quotation'}
          </Badge>
        </Row>
        <Txt style={s.h2}>Available variants</Txt>
        {p.variants.map((variant) => (
          <Card
            key={variant.id}
            style={{ gap: 12, backgroundColor: '#F8FAFC' }}
          >
            <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <Txt style={{ fontWeight: '700' }}>
                {variant.size_label || variant.sku}
              </Txt>
              <Badge>{variant.sku}</Badge>
            </Row>
            {p.product_kind === 'tractor_part' ? (
              <TractorPrice variant={variant} />
            ) : null}
            <GradeListPrice variant={variant} />
            {[
              ['Unit', variant.uom],
              ['Minimum order', `${variant.min_order_qty} ${variant.uom}`],
              ...(variant.diameter_mm
                ? [['Diameter', `${variant.diameter_mm} mm`]]
                : []),
              ...(variant.length_mm
                ? [['Length', `${variant.length_mm} mm`]]
                : []),
              ...Object.entries(redactPublicPrices(variant.attributes))
                .filter(
                  ([key]) =>
                    !key.startsWith('grade_list_') &&
                    !key.startsWith('sheet_flat_') &&
                    (p.product_kind !== 'tractor_part' ||
                      !tractorPriceKeys.some((priceKey) => priceKey === key)),
                )
                .map(([key, value]) => [
                  key.replaceAll('_', ' '),
                  String(value),
                ]),
            ].map(([label, value]) => (
              <Row
                key={`${variant.id}-${label}`}
                style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}
              >
                <Txt style={s.muted}>
                  {label.charAt(0).toUpperCase() + label.slice(1)}
                </Txt>
                <Txt style={{ fontSize: 13, fontWeight: '600', color: c.ink }}>
                  {value}
                </Txt>
              </Row>
            ))}
            <AddToCart product={p} variant={variant} />
          </Card>
        ))}
        <Txt style={s.muted}>
          {p.product_kind === 'tractor_part'
            ? 'Prices are per listed unit. Ask FTI for current availability and a quotation.'
            : 'Request this category’s quotation PDF on your verified WhatsApp number. FTI staff will be notified.'}
        </Txt>
        {p.product_kind === 'fastener' ? (
          <CategoryQuotationButton key={p.id} categoryId={p.category_id} />
        ) : (
          <Button onPress={() => router.push('/rfqs')}>
            Browse quotation requests
          </Button>
        )}
      </Card>
    </View>
  );
}
