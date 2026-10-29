import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Icon, Txt } from '@shared/ui';
import { mobileCommerce as m } from '@shared/ui/MobileCommerce';
import { useStore } from '@core/state/workspace-store';
import { pricingApi } from '@features/pricing/export';
import { usePriceAccess } from '@shared/hooks/use-price-access';
import { SubscribeForPrices } from '@features/subscriptions/SubscribeForPrices';
import { companyCertificate } from '@shared/config/company-certificates';
import { loadHomeCatalogue } from '../data/category-images';
import { HomeCategoryImage } from './HomeCategoryImage';
import rangeImages from '../data/range-images.json';
import materialImageFallbacks from '../data/material-image-fallbacks.json';

export function MobileHome() {
  const [search, setSearch] = useState('');
  const selectedMarket = useStore((state) => state.market);
  const priceAccess = usePriceAccess();
  const catalogue = useQuery({ queryKey: ['catalog', 'home', 'categories'], queryFn: () => loadHomeCatalogue(), staleTime: 30_000 });
  const markets = useQuery({ queryKey: ['pricing', 'markets'], queryFn: pricingApi.markets, staleTime: 30_000 });
  const market = markets.data?.find((entry) => entry.id === selectedMarket || entry.code === selectedMarket) ?? markets.data?.[0];
  const rates = useQuery({ queryKey: ['pricing', 'rates', 'home', market?.id], queryFn: () => pricingApi.rates(market!.id, '', 0), enabled: !!market && priceAccess, staleTime: 30_000 });
  const categories = (catalogue.data?.categories ?? []).map((entry) => ({ ...entry, imageUrl: entry.imageUrl ?? (materialImageFallbacks as Record<string, string>)[entry.category] }));
  const hero = categories.find((entry) => /tmt/.test(entry.category) && entry.imageUrl)?.imageUrl ?? categories.find((entry) => entry.imageUrl)?.imageUrl;
  const searchCatalogue = () => router.push({ pathname: '/products', params: { search: search.trim() } });
  return <View style={m.page}>
    <View style={{ paddingHorizontal: 12 }}><View style={[m.row, m.input]}><Icon name="search" color="#123657" size={18} /><TextInput accessibilityLabel="Search materials, products or brands" placeholder="Search materials, products or brands..." value={search} onChangeText={setSearch} onSubmitEditing={searchCatalogue} returnKeyType="search" style={{ flex: 1, minWidth: 0, minHeight: 42, color: '#123657', fontSize: 12 }} /><Pressable accessibilityRole="button" accessibilityLabel="Search catalogue" onPress={searchCatalogue}><Icon name="arrow-right" size={18} color="#123657" /></Pressable></View></View>
    <View style={h.hero}>
      {hero ? <Image source={{ uri: hero }} contentFit="cover" style={StyleSheet.absoluteFill} /> : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(7,34,57,0.64)' }]} />
      <View style={{ padding: 17, gap: 9, maxWidth: '80%' }}><Txt style={{ color: '#FFFFFF', fontSize: 25, lineHeight: 28, fontWeight: '800' }}>Materials for{ '\n' }your next project</Txt><Txt style={{ color: '#E6EEF6', fontSize: 12, lineHeight: 16 }}>Find the grade, size and quantity your business needs.</Txt><Pressable accessibilityRole="button" onPress={() => router.push('/products')} style={[m.action, { alignSelf: 'flex-start', minHeight: 40 }]}><Txt style={m.actionText}>Browse materials</Txt><Icon name="arrow-right" color="#FFFFFF" size={16} /></Pressable></View>
    </View>
    <View style={m.body}>
      <Section title="Market watch" action="View all" onPress={() => router.push('/rates')} />
      {!priceAccess ? <View style={m.card}><Txt style={m.muted}>Subscribe to view current published rates.</Txt><SubscribeForPrices /></View> : rates.isError || markets.isError ? <Pressable onPress={() => { void markets.refetch(); if (market) void rates.refetch(); }}><Txt style={m.muted}>Rates unavailable. Tap to retry.</Txt></Pressable> : rates.isFetching || markets.isPending ? <Txt style={m.muted}>Loading market rates...</Txt> : !rates.data?.items.length ? <Txt style={m.muted}>No published rates available for this market.</Txt> : <View style={m.row}>{rates.data.items.slice(0, 2).map((rate) => <Pressable key={rate.id} onPress={() => router.push('/rates')} style={[m.card, { flex: 1 }]}><Txt style={m.heading} numberOfLines={1}>{rate.name}</Txt><Txt style={{ color: '#ED222B', fontWeight: '700', fontSize: 12 }}>₹{Number(rate.amount).toLocaleString('en-IN')} / {rate.uom}</Txt></Pressable>)}</View>}
      <Section title="Shop by category" action="View all" onPress={() => router.push('/products')} />
      {catalogue.isPending ? <Txt style={m.muted}>Loading materials...</Txt> : catalogue.isError ? <Pressable onPress={() => void catalogue.refetch()}><Txt style={m.muted}>Could not load materials. Tap to retry.</Txt></Pressable> : !categories.length ? <Txt style={m.muted}>No published materials yet.</Txt> : <View style={h.grid}>{categories.map((category) => <Pressable key={category.id} accessibilityRole="link" accessibilityLabel={`Browse ${category.title}`} onPress={() => router.push({ pathname: '/products', params: { category: category.category } })} style={h.category}>
        <HomeCategoryImage category={category.category} title={category.title} imageUrl={category.imageUrl} style={h.categoryImage} />
        <Txt style={{ color: '#123657', fontWeight: '700', fontSize: 11, padding: 6 }} numberOfLines={2}>{category.title}</Txt>
      </Pressable>)}</View>}
      <View style={m.row}>{[{ kind: 'fastener', label: 'Fasteners', image: rangeImages.fasteners }, { kind: 'tractor_part', label: 'Tractor parts', image: rangeImages['tractor-parts'] }].map((entry) => <Pressable key={entry.kind} onPress={() => router.push({ pathname: '/products', params: { kind: entry.kind } })} style={[m.card, m.row, { flex: 1, gap: 6, padding: 8 }]}><Image source={{ uri: entry.image }} accessibilityLabel={entry.label} style={{ width: 34, height: 34 }} contentFit="contain" /><Txt style={{ flex: 1, color: '#123657', fontWeight: '700', fontSize: 11 }}>{entry.label}</Txt><Icon name="chevron-right" size={14} color="#123657" /></Pressable>)}</View>
      <Pressable onPress={() => router.push('/account?section=business')} style={[m.card, m.row, { backgroundColor: '#EDF3FC' }]}><Icon name="award" size={26} color="#123657" /><View style={{ flex: 1 }}><Txt style={{ color: '#123657', fontWeight: '700', fontSize: 11 }}>Our company is {companyCertificate.standard} certified</Txt><Txt style={{ color: '#65788F', fontSize: 10 }}>View company certification</Txt></View><Icon name="chevron-right" size={16} color="#123657" /></Pressable>
    </View>
  </View>;
}
function Section({ title, action, onPress }: { title: string; action: string; onPress: () => void }) { return <View style={[m.row, { justifyContent: 'space-between' }]}><Txt style={m.heading}>{title}</Txt><Pressable accessibilityRole="link" onPress={onPress}><Txt style={{ color: '#1260B6', fontSize: 11 }}>{action}</Txt></Pressable></View>; }
const h = StyleSheet.create({ hero: { minHeight: 200, overflow: 'hidden', backgroundColor: '#123657', marginHorizontal: 12, borderRadius: 6 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, category: { width: '31.5%', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E7ECF2', borderRadius: 5, overflow: 'hidden' }, categoryImage: { width: '100%', height: 76 } });
