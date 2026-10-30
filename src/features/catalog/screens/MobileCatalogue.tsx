import { useState } from 'react';
import { Modal, Pressable, TextInput, View } from 'react-native';
import { Icon, Txt } from '@shared/ui';
import { mobileCommerce as m, MobileCommerceHeader } from '@shared/ui/MobileCommerce';
import { FastenerCatalogueCards } from '@features/drawings/ui';
import { DesktopProductCard } from '../components/DesktopCatalogue';
import { CatalogFilter } from '../components/CatalogFilter';
import { useProducts } from '../hooks/use-products';
import { useAvailableFilters } from '../hooks/use-available-filters';
import { isTmtCategory } from '../model/tmt';
import type { Product } from '../model/types';
import { ProductGridSkeleton } from '../components/ProductSkeleton';

export function MobileCatalogue({ initialKind, initialSearch, initialCategory }: { initialKind: 'steel' | 'fastener' | 'tractor_part'; initialSearch: string; initialCategory: string }) {
  const [kind, setKind] = useState<Product['product_kind']>(initialKind);
  const [search, setSearch] = useState(initialSearch);
  const [category, setCategory] = useState(initialCategory);
  const [grade, setGrade] = useState('');
  const [page, setPage] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sort, setSort] = useState<'relevance' | 'name'>('relevance');
  const query = useProducts({ productKind: kind, category: category || undefined, grade: grade || undefined, search: search.trim(), limit: 12, offset: page * 12 });
  const filters = useAvailableFilters(category, undefined, kind);
  // Keep sort local to a page; the default order stays the published catalogue order.
  const items = sort === 'name' ? [...(query.data?.items ?? [])].sort((a, b) => a.name.localeCompare(b.name)) : query.data?.items ?? [];
  return <View style={m.page}>
    <MobileCommerceHeader title="Raw Material Catalogue"><View style={[m.row, m.input]}><Icon name="search" color="#123657" size={18} /><TextInput accessibilityLabel="Search materials, grades or brands" placeholder="Search materials, grades or brands..." value={search} onChangeText={(value) => { setSearch(value); setPage(0); }} style={{ flex: 1, minWidth: 0, minHeight: 40, color: '#123657', fontSize: 12 }} /></View></MobileCommerceHeader>
    <View style={[m.row, { backgroundColor: '#FFFFFF', gap: 0 }]}>{[{ value: 'steel', label: 'Raw materials' }, { value: 'fastener', label: 'Fasteners' }, { value: 'tractor_part', label: 'Tractor parts' }].map((tab) => <Pressable accessibilityRole="tab" accessibilityState={{ selected: kind === tab.value }} key={tab.value} onPress={() => { setKind(tab.value as Product['product_kind']); setCategory(''); setGrade(''); setPage(0); }} style={{ flex: 1, alignItems: 'center', paddingVertical: 13, borderBottomWidth: 2, borderColor: kind === tab.value ? '#ED222B' : '#FFFFFF' }}><Txt style={{ color: kind === tab.value ? '#ED222B' : '#123657', fontSize: 12, fontWeight: '700' }}>{tab.label}</Txt></Pressable>)}</View>
    <View style={m.body}>
      <View style={m.row}><Pressable accessibilityRole="button" onPress={() => setFiltersOpen(true)} style={[m.input, m.row, { flex: 1 }]}><Icon name="filter" color="#123657" size={17} /><Txt style={{ color: '#123657', fontWeight: '700', fontSize: 12 }}>Filters{category || grade ? ' •' : ''}</Txt></Pressable><Pressable accessibilityRole="button" onPress={() => setSort(sort === 'relevance' ? 'name' : 'relevance')} style={[m.input, m.row, { flex: 1.5 }]}><Icon name="sliders" color="#123657" size={15} /><Txt style={{ color: '#123657', fontSize: 12 }}>Sort: {sort === 'relevance' ? 'Relevance' : 'Name (this page)'}</Txt></Pressable></View>
      {kind === 'fastener' ? <FastenerCatalogueCards search={search} desktop /> : <>
        {!query.isPending ? <Txt style={m.muted}>{`${query.data?.total ?? 0} products`}</Txt> : null}
        {query.isPending ? <ProductGridSkeleton count={3}/> : query.isError ? <Pressable onPress={() => void query.refetch()}><Txt>Catalogue unavailable. Tap to retry.</Txt></Pressable> : !items.length ? <Txt style={m.muted}>No matching products. Try another category or clear your filters.</Txt> : items.map((product) => <DesktopProductCard key={product.id} product={product} />)}
        {(query.data?.total ?? 0) > 12 ? <View style={[m.row, { justifyContent: 'space-between' }]}><Pressable disabled={!page} onPress={() => setPage(page - 1)} style={m.input}><Txt>Previous</Txt></Pressable><Txt style={m.muted}>Page {page + 1}</Txt><Pressable disabled={(page + 1) * 12 >= (query.data?.total ?? 0)} onPress={() => setPage(page + 1)} style={m.input}><Txt>Next</Txt></Pressable></View> : null}
      </>}
    </View>
    <Modal visible={filtersOpen} transparent animationType="slide" onRequestClose={() => setFiltersOpen(false)}><View style={{ flex: 1, backgroundColor: 'rgba(7,25,45,0.4)', justifyContent: 'flex-end' }}><View style={[m.card, { padding: 22, gap: 20, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }]}><Txt style={m.heading}>Filter catalogue</Txt><CatalogFilter label="Category" value={category} options={[{ value: '', label: 'All categories' }, ...(query.data?.categories ?? []).map((entry) => ({ value: entry.slug, label: entry.name }))]} onChange={(value) => { setCategory(value); setGrade(''); setPage(0); }} /><CatalogFilter label={isTmtCategory(category) ? 'Brand' : 'Grade'} value={grade} options={[{ value: '', label: 'All' }, ...filters.options.grades.map((value) => ({ value, label: value }))]} disabled={filters.isFetching || filters.isError} onChange={(value) => { setGrade(value); setPage(0); }} /><Pressable onPress={() => { setCategory(''); setGrade(''); setPage(0); }}><Txt style={{ color: '#1260B6' }}>Reset filters</Txt></Pressable><Pressable onPress={() => setFiltersOpen(false)} style={m.action}><Txt style={m.actionText}>Show results</Txt></Pressable></View></View></Modal>
  </View>;
}
