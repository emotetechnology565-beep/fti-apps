import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { StockSourceDropdown } from '@features/business-stock/ui';
import { useStore } from '@core/state/workspace-store';
import { Button, Card, Chip, Empty, Icon, Row, Txt, c, s } from '@shared/ui';
import { ProductCard } from '../components/ProductCard';
import { MaterialSelection } from '../components/MaterialSelection';
import { useProducts } from '../hooks/use-products';
import type { CatalogQuery } from '../data/catalog-repository';

export function Catalogue() {
  return <View>
    <StockSourceDropdown source="fti" />
    <MaterialSelection
      renderAdapter={kind => <ProductsCatalogue key={kind} kind={kind} />}
      renderMaterials={filters => <ProductsCatalogue key={JSON.stringify(filters)} kind="steel" filters={filters} />}
    />
  </View>;
}

// These categories retain their existing quotation and cart behavior.
function ProductsCatalogue({ kind, filters = {} }: {
  kind: 'steel' | 'fastener' | 'tractor_part';
  filters?: Pick<CatalogQuery, 'category' | 'ids'>;
}) {
  const [search, setSearch] = useState('');
  const [savedOnly, setSavedOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [gridWidth, setGridWidth] = useState(0);
  const savedIds = useStore(state => state.saved);
  const columns = gridWidth >= 720 ? Math.max(3, Math.floor((gridWidth + 12) / 252)) : 2;
  const cardWidth = gridWidth > 0 ? (gridWidth - 12 * (columns - 1)) / columns : undefined;
  const ids = savedOnly ? savedIds.filter(id => !filters.ids || filters.ids.includes(id)) : filters.ids;
  const query = useProducts({ ...filters, productKind: kind, search: search.trim(), limit: 24, offset: page * 24, ids });
  const total = query.data?.total ?? 0;
  const items = query.data?.items ?? [];
  return <View style={{ gap: 16 }}>
    {kind !== 'steel' ? <Row style={{ flexWrap: 'wrap' }}>
      <Row style={{ flex: 1, minWidth: 220, backgroundColor: 'white', borderWidth: 1, borderColor: c.line, borderRadius: 7, paddingHorizontal: 14 }}>
        <Icon name="search" size={17} />
        <TextInput accessibilityLabel="Search catalogue" placeholder={kind === 'fastener' ? 'Search fasteners' : 'Search tractor parts'}
          value={search} onChangeText={value => { setSearch(value); setPage(0); }} returnKeyType="search" style={{ height: 48, flex: 1, fontSize: 13, color: c.ink }} />
      </Row>
      <Chip selected={savedOnly} onPress={() => { setSavedOnly(!savedOnly); setPage(0); }}>Saved materials</Chip>
    </Row> : null}
    {query.isPending ? <Card><Txt style={s.muted}>Loading catalogue…</Txt></Card> : query.error ?
      <Empty title="Catalogue unavailable" description={query.error.message} action={<Button secondary onPress={() => void query.refetch()}>Try again</Button>} /> : <>
        <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}><Txt style={s.muted}>{total} products</Txt>
          <Row><Button secondary disabled={!page} onPress={() => setPage(page - 1)}>Previous</Button>
            <Txt style={s.muted}>Page {page + 1} of {Math.max(1, Math.ceil(total / 24))}</Txt>
            <Button secondary disabled={(page + 1) * 24 >= total} onPress={() => setPage(page + 1)}>Next</Button></Row>
        </Row>
        {items.length ? <View onLayout={event => setGridWidth(event.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {items.map(product => <View key={product.id} style={{ width: cardWidth ?? '48%' }}><ProductCard product={product} /></View>)}
        </View> : <Empty title="No products available" description={search || savedOnly ? 'Try another search or clear your filters.' : 'Published products will appear here once FTI adds them.'}
          action={search || savedOnly ? <Button secondary onPress={() => { setSearch(''); setSavedOnly(false); setPage(0); }}>Clear filters</Button> : undefined} />}
      </>}
  </View>;
}
