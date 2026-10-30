import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Icon, Txt } from '@shared/ui';
import { mobileCommerce as m } from '@shared/ui/MobileCommerce';
import type { Product } from '../model/types';
import { isTmtCategory } from '../model/tmt';
import { MaterialPhoto } from '../components/MaterialPhoto';
import { MaterialSelection } from '../components/MaterialSelection';
import { RawMaterialDetails } from '../components/RawMaterialDetails';
import { ProductDescription } from '../components/ProductDescription';
import { ProductReferenceCharts } from '../components/ProductReferenceCharts';

const tabs = ['Select material', 'Specifications', 'Documents'] as const;

export function RawMaterialDetail({ product, initialSize = '', initialGrade = '' }: { product: Product; initialSize?: string; initialGrade?: string }) {
  const [tab, setTab] = useState<(typeof tabs)[number]>('Select material');
  return <View style={[m.page, { backgroundColor: '#FFFFFF', paddingTop: 12 }]}>
    <View style={[m.body, { width: '100%', maxWidth: 1180, alignSelf: 'center' }]}>
      <Txt accessibilityRole="header" style={{ color: '#0B2447', fontSize: 26, fontWeight: '800', lineHeight: 32 }}>{product.name}</Txt>
      <MaterialPhoto category={product.category} height={170} />
      <View accessibilityRole="tablist" style={styles.tabs}>
        {tabs.map((value) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} style={[styles.tab, tab === value && styles.selectedTab]}>
          <Txt style={[styles.tabText, tab === value && { color: '#ED222B' }]}>{value}</Txt>
        </Pressable>)}
      </View>
      {/* Keep the form mounted so tab changes preserve the requirement. */}
      <View style={{ display: tab === 'Select material' ? 'flex' : 'none', gap: 12 }}>
        <Txt style={m.muted}>Select size, grade and quantity. Subscribers can view indicative rates; quotation requests are available without a subscription.</Txt>
        <MaterialSelection productId={product.id} tmtCategory={isTmtCategory(product.category) ? product.category : undefined} initialSize={initialSize} initialGrade={initialGrade} />
      </View>
      {tab === 'Specifications' ? <View style={m.card}>
        <Txt style={m.heading}>Material specifications</Txt>
        <RawMaterialDetails product={product} />
        <ProductDescription product={product} />
        <ProductDescription product={product} applications />
        <Txt style={m.muted}>Advertised size ranges describe supply capabilities. Select a size and grade to check current supply options; unlisted requirements can be submitted for quotation.</Txt>
      </View> : null}
      {tab === 'Documents' ? <View style={m.card}>
        <Txt style={m.heading}>Reference charts & material documents</Txt>
        <ProductReferenceCharts product={product} />
        <Txt style={m.muted}>Mill test certificates, grade documentation and dispatch weight slips are provided where available for the supplied material. Ask FTI to confirm document requirements with your quotation.</Txt>
        <Button secondary onPress={() => setTab('Select material')}>Select material for quotation</Button>
      </View> : null}
      <View style={styles.notice}><Icon name="info" size={18} color="#1260B6" /><View style={{ flex: 1, gap: 4 }}><Txt style={m.heading}>Confirmation before payment</Txt><Txt style={m.muted}>Review final rates, GST, freight and weight basis with FTI. Payment is by bank transfer, manually verified by accounts staff before release under the agreed terms.</Txt></View></View>
      <View style={[m.row, { flexWrap: 'wrap' }]}><Button secondary onPress={() => router.push('/cart')}>Requirement basket</Button><Button secondary onPress={() => router.push('/orders')}>Orders & dispatch</Button></View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#DFE7F0', backgroundColor: '#FFFFFF' },
  tab: { flex: 1, paddingVertical: 14, paddingHorizontal: 4, alignItems: 'center', borderBottomWidth: 2, borderColor: 'transparent', minHeight: 48 },
  selectedTab: { borderColor: '#ED222B' },
  tabText: { color: '#123657', fontSize: 12, fontWeight: '700' },
  notice: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: '#EAF3FC', padding: 14, borderRadius: 6 },
});
