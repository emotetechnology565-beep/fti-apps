import { useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { BackToCatalogue } from '@features/catalog/ui';
import { Button, Card, Empty, Icon, Txt, c, s } from '@shared/ui';
import { drawingApi } from '../services/drawing-api';
import { loadFastenerDetail } from '../services/fastener-requirement-api';
import { drawingSubcategory, subcategoryShapes } from '../model/subcategories';
import { FastenerRequirementWizard } from '../components/FastenerRequirementWizard';
import { ProductDetailSkeleton } from '@features/catalog/components/ProductSkeleton';

export function FastenerDetail({ subcategory }: { subcategory: string }) {
  const { width } = useWindowDimensions();
  const desktop = width >= 1000;
  const { configure, editKey } = useLocalSearchParams<{ configure?: string; editKey?: string }>();
  const [tab, setTab] = useState<'Specifications' | 'Description'>('Specifications');
  const detail = useQuery({ queryKey: ['fastener-detail', subcategory], queryFn: () => loadFastenerDetail(subcategory), staleTime: 30000, retry: false });
  const drawings = useQuery({ queryKey: ['fastener-dimensions', 'public'], queryFn: drawingApi.list, staleTime: 30000, retry: false });
  const photos = useQuery({ queryKey: ['fastener-photos', 'public'], queryFn: drawingApi.photos, staleTime: 30000, retry: false });
  const imageUrl = photos.data?.find(photo => photo.slug === subcategory)?.image_url;
  const typed = (drawings.data ?? []).filter(row => drawingSubcategory(row) === subcategory && subcategoryShapes(subcategory).includes(row.shape));
  const standards = [...new Set(typed.map(row => `${row.standard}:${row.edition}`))];
  if (detail.isPending) return <View style={{ gap: 16 }}><BackToCatalogue fastener /><ProductDetailSkeleton /></View>;
  if (detail.isError) return <View style={{ gap: 16 }}><BackToCatalogue fastener /><Empty title="Fastener details unavailable" description={detail.error.message} action={<Button onPress={() => void detail.refetch()}>Retry details</Button>} /></View>;
  const product = detail.data;
  if (configure === '1') return <FastenerRequirementWizard key={`${subcategory}:${editKey ?? 'new'}`} detail={product} drawings={typed} imageUrl={imageUrl} editKey={editKey}
    onClose={() => router.setParams({ configure: '', editKey: '' })} />;
  return <View style={{ gap: 20 }}>
    <BackToCatalogue fastener />
    <View style={{ flexDirection: desktop ? 'row' : 'column', gap: 24, alignItems: 'stretch' }}>
      <Card style={{ width: desktop ? '42%' : '100%', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        {imageUrl ? <Image source={{ uri: imageUrl }} accessibilityLabel={`${product.title} product photo`} contentFit="contain" style={{ width: '100%', height: desktop ? 320 : 220 }} />
          : <View style={{ height: desktop ? 320 : 220, alignItems: 'center', justifyContent: 'center' }}><Icon name="tool" size={64} color={c.brandBlue} /></View>}
        {photos.isError ? <Button secondary onPress={() => void photos.refetch()}>Retry product photo</Button> : null}
      </Card>
      <Card style={{ flex: desktop ? 1 : undefined, gap: 18, padding: 24 }}>
        <Txt style={{ color: c.muted, fontSize: 11, fontWeight: '700' }}>FASTENERS</Txt>
        <Txt accessibilityRole="header" style={{ fontSize: 28, lineHeight: 35, fontWeight: '700', color: c.ink }}>{product.title}</Txt>
        <Txt style={{ fontSize: 14, lineHeight: 23, color: c.muted }}>{product.description}</Txt>
        <View style={{ borderTopWidth: 1, borderColor: c.line, paddingTop: 16, gap: 8 }}>
          <Txt style={{ color: c.brandRed, fontWeight: '700', fontSize: 18 }}>Quotation on request</Txt>
          <Txt style={s.muted}>Choose your standard, dimensions, material and finish. FTI will confirm the final specification, price and availability.</Txt>
        </View>
        <Button icon="sliders" disabled={drawings.isPending || drawings.isError} onPress={() => router.setParams({ configure: '1' })}>Configure requirement</Button>
        {drawings.isError ? <><Txt accessibilityRole="alert">Published standards could not be loaded.</Txt><Button secondary onPress={() => void drawings.refetch()}>Retry standards</Button></> : null}
        <Txt style={s.muted}>Not sure of the standard? Choose “Custom requirement” in the next step.</Txt>
      </Card>
    </View>
    <Card style={{ gap: 18 }}>
      <View style={{ flexDirection: 'row', gap: 24, borderBottomWidth: 1, borderColor: c.line }}>
        {(['Specifications', 'Description'] as const).map(label => <Pressable key={label} accessibilityRole="tab" accessibilityState={{ selected: tab === label }} onPress={() => setTab(label)}
          style={{ paddingVertical: 12, borderBottomWidth: tab === label ? 2 : 0, borderColor: c.brandRed }}>
          <Txt style={{ color: tab === label ? c.brandRed : c.muted, fontWeight: '600' }}>{label}</Txt>
        </Pressable>)}
      </View>
      {tab === 'Specifications' ? <View style={{ gap: 16 }}>
        {product.specifications.map(({ label, value }) => <View key={label} style={{ gap: 5, borderBottomWidth: 1, borderColor: c.line, paddingBottom: 12 }}><Txt style={{ fontSize: 12, fontWeight: '700', color: c.ink }}>{label}</Txt><Txt style={{ fontSize: 13, lineHeight: 21, color: c.muted }}>{value}</Txt></View>)}
        <View style={{ gap: 6 }}><Txt style={{ fontWeight: '700' }}>Published drawing standards</Txt><Txt style={s.muted}>{standards.length ? standards.join(' · ') : drawings.isPending ? 'Loading standards…' : 'Custom requirements available on enquiry'}</Txt></View>
        <Txt style={s.muted}>Advertised capabilities describe the product family. Confirm the required size, grade, thread and finish combination with FTI.</Txt>
      </View> : <View style={{ gap: 12 }}><Txt style={{ lineHeight: 23 }}>{product.description}</Txt>{[...new Set(typed.map(row => row.notes?.trim()).filter(Boolean))].map(note => <Txt key={note} style={s.muted}>{note}</Txt>)}</View>}
    </Card>
  </View>;
}
