import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Icon, Txt } from '@shared/ui';
import { useAuth } from '@features/auth/ui';
import { usePriceAccess } from '@shared/hooks/use-price-access';
import { drawingApi } from '@features/drawings/services/drawing-api';
import { drawingSubcategory } from '@features/drawings/model/subcategories';
import type { Product } from '@features/catalog/model/types';
import { pickSalesAttachment, stageRequirementUpload } from '@features/quotations/data/requirement-upload';
import { loadHomeCatalogue } from '../data/category-images';
import { homeProductPrice, homeProductSpecs } from '../data/home-products';
import { homeDivisions, homeSearchKind, normalizeCategory, rawHomeCategories, type HomeKind } from '../data/home-navigation';
import { MobileHomeActivity } from './MobileHomeActivity';
import { HomeMarketWatch } from '@features/market-rates/HomeMarketWatch';
import { HomeButton, HomeNotice, HomePhoto, HomeSection, homeColors as c, homeFont, u } from './MobileHomeUI';
import ranges from '../data/range-images.json';
import materials from '../data/material-image-fallbacks.json';

// Public UI preference only; survives route remounts without persisting prices
// or customer data, and does not change the desktop home.
let lastHomeKind: HomeKind = 'steel';

function ProductRate({ price }: { price: ReturnType<typeof homeProductPrice> }) {
  const access = usePriceAccess();
  if (!access) return <Pressable accessibilityRole="link" onPress={() => router.push('/account?section=subscription')} style={h.priceAction}><Icon name="lock" size={14} color={c.red} /><Txt style={h.lock}>Subscribe to View Prices</Txt></Pressable>;
  return <Txt style={h.price}>{price ? `₹${price.amount} / ${price.unit} · indicative` : 'Request Quotation'}</Txt>;
}
type Highlight = { key: string; name: string; image?: string | null; specs: string; unit?: string; price: ReturnType<typeof homeProductPrice>; open: () => void; quote: () => void };
function CatalogueHighlight({ item }: { item: Highlight }) {
  return <View style={h.highlight}>
    <View style={{ width: 77 }}><HomePhoto key={item.image} uri={item.image} label={item.name} height={91} /></View>
    <View style={{ flex: 1, minWidth: 0, gap: 3 }}><Txt style={h.productName}>{item.name}</Txt><Txt style={u.small}>{item.specs}</Txt><Txt style={u.small}>Selling unit: {item.unit || 'Select specification'}</Txt><ProductRate price={item.price} /><Pressable accessibilityRole="link" accessibilityLabel={`Request quotation for ${item.name}`} onPress={item.quote} style={{ flexDirection: 'row', gap: 4, alignItems: 'center', minHeight: 44 }}><Icon name="file-text" size={14} color={c.text} /><Txt style={h.quoteText}>Request Quotation</Txt></Pressable></View>
    <Pressable accessibilityRole="link" accessibilityLabel={`View details for ${item.name}`} onPress={item.open} style={h.detailLink}><Txt style={h.detailText}>View{ '\n' }Details</Txt><Icon name="chevron-right" size={16} color="#1260E8" /></Pressable>
  </View>;
}
type BrowseTile = { key: string; label: string; image?: string | null; open: () => void };
function BrowseGrid({ tiles }: { tiles: BrowseTile[] }) {
  return <View style={h.grid}>{tiles.map(tile => <Pressable key={tile.key} accessibilityRole="link" accessibilityLabel={`Browse ${tile.label}`} onPress={tile.open} style={h.gridTile}><HomePhoto key={tile.image} uri={tile.image} label={tile.label} height={79} /><Txt style={h.tileLabel}>{tile.label}</Txt></Pressable>)}</View>;
}

export function ProcurementMobileHome() {
  const auth = useAuth();
  const [kind, setKind] = useState<HomeKind>(lastHomeKind);
  useEffect(() => { lastHomeKind = kind; }, [kind]);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const catalogue = useQuery({ queryKey: ['catalog', 'home', 'categories'], queryFn: () => loadHomeCatalogue(), staleTime: 30_000, retry: false });
  const photos = useQuery({ queryKey: ['fastener-photos', 'public'], queryFn: drawingApi.photos, staleTime: 30_000, retry: false });
  const drawings = useQuery({ queryKey: ['fastener-dimensions', 'public'], queryFn: drawingApi.list, enabled: kind === 'fastener', staleTime: 30_000, retry: false });
  const products = catalogue.data?.products ?? [];
  const fasteners = photos.data ?? [];
  const divisionProducts = products.filter(product => product.product_kind === kind);
  const productImage = (product: Product) => product.images[0]?.url ?? (product.product_kind === 'steel' ? (materials as Record<string, string>)[normalizeCategory(product.category)] : undefined);
  const rawPhoto = (slug: string) => catalogue.data?.categories.find(entry => normalizeCategory(entry.category) === slug)?.imageUrl ?? (materials as Record<string, string>)[slug];
  const divisionPhoto = (value: HomeKind) => value === 'steel' ? rawPhoto('round-bright-bar') : value === 'fastener' ? ranges.fasteners : ranges['tractor-parts'];
  const catalogueLink = (value: HomeKind, category?: string, search?: string) => router.push({ pathname: '/products', params: { kind: value, ...(category ? { category } : {}), ...(search ? { search } : {}) } });
  const choose = (value: HomeKind) => setKind(value);
  const searchCatalogue = () => catalogueLink(homeSearchKind(search, kind, products, fasteners.map(photo => photo.label)), undefined, search.trim());
  const createRequirement = () => router.push('/rfqs?create=1');
  async function uploadList() {
    if (uploading) return;
    setUploadMessage(''); setUploading(true);
    try {
      const file = await pickSalesAttachment(auth.session?.user.id ?? null);
      if (!file) return;
      await stageRequirementUpload(file);
      setUploadMessage(`${file.name} selected. Create the requirement, then confirm its attachment.`);
      router.push('/rfqs?create=1&attachments=1');
    } catch (error) { setUploadMessage((error as Error).message); }
    finally { setUploading(false); }
  }
  let tiles: BrowseTile[];
  if (kind === 'steel') {
    tiles = rawHomeCategories.map(tile => {
      const published = catalogue.data?.categories.find(entry => tile.aliases.includes(normalizeCategory(entry.category)));
      return { key: tile.slug, label: tile.label, image: published?.imageUrl ?? rawPhoto(tile.slug), open: () => catalogueLink('steel', published?.category ?? tile.slug) };
    });
    tiles.push({ key: 'all', label: 'All Materials ›', image: divisionPhoto('steel'), open: () => catalogueLink('steel') });
  } else if (kind === 'fastener') {
    tiles = [{ label: 'Hex Bolts', slug: 'hex-bolt', search: 'hex bolt' }, { label: 'Hex Nuts', slug: 'hex-nut', search: 'hex nut' }, { label: 'Screws', slug: 'coach-screw', search: 'screw' }, { label: 'Plain Washers', slug: 'plain-washer', search: 'plain washer' }, { label: 'Spring Washers', slug: 'spring-washer', search: 'spring washer' }].map(tile => ({ key: tile.slug, label: tile.label, image: fasteners.find(photo => photo.slug === tile.slug)?.image_url, open: () => catalogueLink('fastener', undefined, tile.search) }));
    tiles.push({ key: 'custom', label: 'Custom Fasteners', image: ranges.fasteners, open: createRequirement });
  } else {
    tiles = divisionProducts.slice(0, 5).map(product => ({ key: product.id, label: product.name, image: productImage(product), open: () => router.push({ pathname: '/product/[id]', params: { id: product.id } }) }));
    if (tiles.length) tiles.push({ key: 'all', label: 'All Tractor Parts ›', image: ranges['tractor-parts'], open: () => catalogueLink('tractor_part') });
  }
  let highlights: Highlight[] = divisionProducts.slice(0, 2).map(product => {
    const open = () => router.push({ pathname: '/product/[id]', params: { id: product.id } });
    return { key: product.id, name: product.name, image: productImage(product), specs: homeProductSpecs(product).filter(([label]) => label !== 'Unit').map(([, value]) => value).join(' · '), unit: product.variants[0]?.uom ?? product.unit, price: homeProductPrice(product), open, quote: open };
  });
  if (kind === 'fastener' && fasteners.length) highlights = fasteners.slice(0, 2).map(photo => {
    const definition = drawings.data?.find(entry => drawingSubcategory(entry) === photo.slug);
    const product = divisionProducts.find(entry => entry.slug === photo.slug);
    return { key: photo.slug, name: photo.label, image: photo.image_url, specs: [definition?.standard, definition?.size].filter(Boolean).join(' · ') || 'Select size, grade and quantity', unit: product?.variants[0]?.uom, price: product ? homeProductPrice(product) : null, open: () => router.push({ pathname: '/fastener/[slug]', params: { slug: photo.slug } }), quote: () => router.push({ pathname: '/fastener/[slug]', params: { slug: photo.slug, configure: '1' } }) };
  });
  const loading = kind === 'fastener' ? photos.isPending : catalogue.isPending;
  const failed = kind === 'fastener' ? photos.isError : catalogue.isError;
  return <View style={h.page}>
    <View style={h.search}><Icon name="search" color={c.text} size={21} /><TextInput accessibilityLabel="Search material, size, grade or part number" placeholder="Search material, size, grade or part number" placeholderTextColor="#7A879D" value={search} onChangeText={setSearch} onSubmitEditing={searchCatalogue} returnKeyType="search" style={h.searchInput} /><Pressable accessibilityRole="button" accessibilityLabel="Search catalogue" onPress={searchCatalogue} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="arrow-right" color={c.text} size={17} /></Pressable></View>
    <View style={h.banner}>
      <Image source={{ uri: ranges.fasteners }} contentFit="cover" accessibilityLabel="Industrial fasteners from the FTI range" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '48%' }} />
      <View style={h.bannerCopy}><Txt accessibilityRole="header" style={h.bannerTitle}>Industrial supplies{ '\n' }for your business</Txt><Txt style={h.bannerSubtitle}>Materials, fasteners & tractor parts</Txt><Pressable accessibilityRole="button" onPress={createRequirement} style={h.bannerAction}><Txt style={h.bannerActionText}>Create Requirement</Txt><Icon name="arrow-right" color="#FFFFFF" size={18} /></Pressable></View>
    </View>
    <View style={h.divisions}>{homeDivisions.map(division => <Pressable key={division.kind} accessibilityRole="link" accessibilityLabel={`Explore ${division.name}`} onPress={() => catalogueLink(division.kind)} style={h.divisionTile}><HomePhoto key={divisionPhoto(division.kind)} uri={divisionPhoto(division.kind)} label={division.name} height={82} /><Txt style={h.tileLabel}>{division.name}</Txt></Pressable>)}</View>
    <HomeMarketWatch />
    <HomeSection title="Browse by category" />
    <View accessibilityRole="tablist" style={h.tabs}>{homeDivisions.map(division => <Pressable key={division.kind} accessibilityRole="tab" accessibilityLabel={division.name} accessibilityState={{ selected: kind === division.kind }} onPress={() => choose(division.kind)} style={[h.tab, kind === division.kind && h.activeTab]}><Txt style={[h.tabText, kind === division.kind && { color: '#FFFFFF' }]}>{division.name}</Txt></Pressable>)}</View>
    {loading ? <Txt style={u.small}>Loading uploaded catalogue…</Txt> : failed ? <Pressable accessibilityRole="button" onPress={() => { void catalogue.refetch(); void photos.refetch(); }} style={{ minHeight: 44, justifyContent: 'center' }}><HomeNotice>Catalogue could not be loaded. Tap to retry.</HomeNotice></Pressable> : tiles.length ? <BrowseGrid tiles={tiles} /> : <HomeNotice>No published tractor parts yet. Contact FTI for your requirement.</HomeNotice>}
    <HomeSection title="Catalogue highlights" action="View all" onPress={() => catalogueLink(kind)} />
    <HomeNotice>Request quotations without a subscription.</HomeNotice>
    {!loading && !failed ? highlights.length ? <View style={{ gap: 8 }}>{highlights.map(item => <CatalogueHighlight key={item.key} item={item} />)}</View> : <Txt style={u.small}>No published products available in this selection.</Txt> : null}
    <View style={h.requirement}><Txt style={h.requirementTitle}>Need multiple items or custom sizes?</Txt><Txt style={u.small}>Submit materials, fasteners and tractor parts together.</Txt><View style={{ flexDirection: 'row', gap: 8 }}><HomeButton onPress={createRequirement}>Create Requirement</HomeButton><HomeButton secondary disabled={uploading} onPress={() => void uploadList()}>{uploading ? 'Reading file…' : 'Upload List'}</HomeButton></View>{uploadMessage ? <Txt accessibilityLiveRegion="polite" style={u.small}>{uploadMessage}</Txt> : null}</View>
    <MobileHomeActivity products={products} />
    <HomeNotice>An active subscription unlocks indicative catalogue prices. Final terms require FTI confirmation.</HomeNotice>
  </View>;
}

const h = StyleSheet.create({
  page: { backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingTop: 4, paddingBottom: 24, gap: 10 },
  search: { minHeight: 46, borderWidth: 1, borderColor: '#C8D2E0', borderRadius: 8, paddingLeft: 10, flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#FCFCFD' },
  searchInput: { flex: 1, minWidth: 0, minHeight: 44, fontSize: 12, color: c.text, fontFamily: homeFont },
  banner: { minHeight: 126, borderRadius: 5, backgroundColor: '#0D2C4C', overflow: 'hidden' },
  bannerCopy: { width: '70%', padding: 10, gap: 7, backgroundColor: '#0D2C4C' },
  bannerTitle: { color: '#FFFFFF', fontSize: 21, lineHeight: 24, fontWeight: '800', fontFamily: homeFont, letterSpacing: -0.3 },
  bannerSubtitle: { color: '#FFFFFF', fontSize: 11, lineHeight: 16, fontFamily: homeFont },
  bannerAction: { alignSelf: 'flex-start', minHeight: 44, backgroundColor: c.red, borderRadius: 5, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7 },
  bannerActionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', fontFamily: homeFont },
  divisions: { flexDirection: 'row', gap: 7 },
  divisionTile: { flex: 1, minWidth: 0, padding: 3, borderWidth: 1, borderColor: c.border, borderRadius: 4, backgroundColor: '#FFFFFF', gap: 2 },
  tileLabel: { color: c.text, fontSize: 13, lineHeight: 17, fontWeight: '700', fontFamily: homeFont, textAlign: 'center', paddingHorizontal: 2, paddingVertical: 5 },
  tabs: { flexDirection: 'row', borderWidth: 1, borderColor: '#C8D5E3', borderRadius: 5, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  activeTab: { backgroundColor: c.red, borderRadius: 5 },
  tabText: { fontSize: 12, color: c.text, fontWeight: '600', fontFamily: homeFont },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  gridTile: { width: '31.9%', flexGrow: 1, flexBasis: '30%', maxWidth: '33.34%', borderWidth: 1, borderColor: c.border, borderRadius: 4, padding: 3, gap: 2 },
  highlight: { flexDirection: 'row', gap: 8, padding: 8, borderWidth: 1, borderColor: c.border, borderRadius: 5, alignItems: 'center' },
  productName: { color: c.text, fontSize: 14, fontWeight: '800', lineHeight: 19, fontFamily: homeFont },
  priceAction: { flexDirection: 'row', gap: 5, alignItems: 'center', minHeight: 44 },
  lock: { color: c.red, fontSize: 11, lineHeight: 16, fontFamily: homeFont, flexShrink: 1 },
  price: { color: c.red, fontSize: 12, lineHeight: 17, fontWeight: '700', fontFamily: homeFont },
  quoteText: { color: c.text, fontSize: 11, lineHeight: 16, fontFamily: homeFont, flexShrink: 1 },
  detailLink: { borderLeftWidth: 1, borderColor: c.border, width: 51, minHeight: 100, justifyContent: 'center', alignItems: 'center', paddingLeft: 5 },
  detailText: { color: '#1260E8', fontSize: 12, lineHeight: 16, fontFamily: homeFont, textAlign: 'center' },
  requirement: { borderWidth: 1, borderColor: c.border, borderRadius: 5, padding: 10, gap: 7 },
  requirementTitle: { color: c.text, fontSize: 16, lineHeight: 21, fontWeight: '800', fontFamily: homeFont },
});
