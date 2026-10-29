import { redactPublicPrices } from '@shared/lib/price-access';
import { isTmtCategory } from '../model/tmt';
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
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useState } from 'react';
import { DesktopProductCard } from '../components/DesktopCatalogue';
import { MobileCommerceHeader, mobileCommerce as m } from '@shared/ui/MobileCommerce';
import { Image } from 'expo-image';
import { ProductReferenceCharts } from '../components/ProductReferenceCharts';
import { TractorPrice } from '../components/TractorPrice';
import { GradeListPrice } from '../components/GradeListPrice';
import { tractorPriceKeys } from '../model/tractor-pricing';
import { AddToCart } from '../components/AddToCart';
import { CategoryQuotationButton } from '@features/quotations/ui';
import { getCategoryImage } from '../components/category-images';
import { MaterialSelection } from '../components/MaterialSelection';
import { MaterialSpecificationHeader } from '../components/MaterialSpecification';
import { RawMaterialDetails } from '../components/RawMaterialDetails';
import { ProductDescription } from '../components/ProductDescription';
import { BackToCatalogue } from '../components/BackToCatalogue';

export function ProductDetail({ id }: { id: string }) {
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState('Specifications');
  const [specificationsOpen, setSpecificationsOpen] = useState(true);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const params = useLocalSearchParams<{ size?: string; grade?: string }>();
  const query = useProduct(id);
  if (query.isPending)
    return (
      <Card>
        <BackToCatalogue />
        <Txt style={s.muted}>Loading product…</Txt>
      </Card>
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
  if (p.product_kind === 'steel' && width < 1000) return <View style={m.page}>
    <MobileCommerceHeader title={p.name} back />
    <DesktopProductCard product={p} detail />
    <View style={[m.card, { marginHorizontal: 12, gap: 12 }]}>
      <Txt style={m.heading}>Description</Txt>
      <ProductDescription product={p} />
    </View>
    <View style={[m.card, { marginHorizontal: 12 }]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: specificationsOpen }} onPress={() => setSpecificationsOpen(!specificationsOpen)}><Txt style={m.heading}>Specifications {specificationsOpen ? '⌃' : '⌄'}</Txt></Pressable>
      {specificationsOpen ? <><RawMaterialDetails product={p} />{[['Material', p.name], ['Unit', p.unit], ['Availability', 'To be confirmed in quote']].map(([label, value]) => <View key={label} style={[m.row, { backgroundColor: '#F6F8FB', padding: 9 }]}><Txt style={[m.muted, { flex: 1 }]}>{label}</Txt><Txt style={{ flex: 1, color: '#123657', fontSize: 12 }}>{value}</Txt></View>)}</> : null}
    </View>
    <View style={[m.card, { marginHorizontal: 12, gap: 12 }]}>
      <Txt style={m.heading}>Suitable applications</Txt>
      <ProductDescription product={p} applications />
    </View>
    <View style={[m.card, { marginHorizontal: 12 }]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: documentsOpen }} onPress={() => setDocumentsOpen(!documentsOpen)}><Txt style={m.heading}>Material documents {documentsOpen ? '⌃' : '⌄'}</Txt></Pressable>
      <Txt style={m.muted}>Mill test certificate, product datasheet and other documents on request. Availability to be confirmed.</Txt>
      {documentsOpen ? <ProductReferenceCharts product={p} /> : null}
    </View>
  </View>;
  if (p.product_kind === 'steel' && width >= 1000) return (
    <View style={{ gap: 16 }}>
      <BackToCatalogue />
      <DesktopProductCard product={p} detail />
      <View style={{ borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', borderRadius: 8, padding: 18, gap: 16 }}>
        <View style={{ flexDirection: 'row', gap: 24, borderBottomWidth: 1, borderColor: '#E2E8F0' }}>
          {['Specifications', 'Description'].map((label) => <Pressable key={label} accessibilityRole="tab" accessibilityState={{ selected: tab === label }} onPress={() => setTab(label)} style={{ paddingVertical: 12, borderBottomWidth: tab === label ? 2 : 0, borderColor: '#E51B23' }}><Txt style={{ color: tab === label ? '#E51B23' : '#64748B', fontWeight: '600' }}>{label}</Txt></Pressable>)}
        </View>
        {tab === 'Specifications' ? <View style={{ gap: 12 }}><RawMaterialDetails product={p} />{[['Material type', p.name], ['Category', p.category], ['Order unit', p.unit], ['Availability', 'Availability to be confirmed']].map(([label, value]) => <View key={label} style={{ flexDirection: 'row', gap: 24, borderBottomWidth: 1, borderColor: '#F1F5F9', paddingBottom: 10 }}><Txt style={{ width: 180, color: '#64748B' }}>{label}</Txt><Txt>{value}</Txt></View>)}</View> : <ProductDescription product={p} />}
      </View>
    </View>
  );
  if (p.product_kind === 'steel')
    return (
      <View
        style={{
          backgroundColor: '#f8f9ff',
          padding: 16,
          paddingBottom: 24,
          borderRadius: 0,
        }}
      >
        <MaterialSpecificationHeader
          product={
            isTmtCategory(p.category)
              ? {
                  ...p,
                  name: 'TMT Bar',
                  description:
                    'Choose size and brand. Add a grade if required.',
                }
              : p
          }
        />
        <MaterialSelection
          productId={p.id}
          tmtCategory={isTmtCategory(p.category) ? p.category : undefined}
          initialSize={typeof params.size === 'string' ? params.size : ''}
          initialGrade={typeof params.grade === 'string' ? params.grade : ''}
        />
        <View style={{ marginTop: 18 }}>
          <ProductReferenceCharts key={p.id} product={p} />
        </View>
      </View>
    );
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
