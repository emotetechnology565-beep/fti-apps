import { ProductCard } from '@features/catalog/components/ProductCard';
import { StockSourceDropdown } from '@features/business-stock/ui';
import { useStore } from '@core/state/workspace-store';
import { Button, Card, Chip, Empty, Heading, Icon, Row, Txt, c, s } from '@shared/ui';
import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useProducts } from '../hooks/use-products';
const pageSize = 24;
export function Catalogue() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(0);
  const [savedOnly, setSavedOnly] = useState(false);
  const savedIds = useStore((state) => state.saved);
  const query = useProducts({ search: search.trim(), category, limit: pageSize, offset: page * pageSize, ids: savedOnly ? savedIds : undefined });
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  return (
    <View>
      <StockSourceDropdown source="fti"/>
      <Heading
        eyebrow="SOURCED RIGHT. SUPPLIED RIGHT."
        title="Material catalogue"
        description="Browse steel, fasteners, and agricultural parts from the FTI catalogue."
      />
      <Row style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        <Row style={{ flex: 1, minWidth: 220, backgroundColor: 'white', borderWidth: 1, borderColor: c.line, borderRadius: 7, paddingHorizontal: 14 }}>
          <Icon name="search" size={17} />
          <TextInput
            accessibilityLabel="Search catalogue"
            placeholder="e.g. M12 bolts or HEX-M12-50"
            value={search}
            onChangeText={(value) => { setSearch(value); setPage(0); }}
            returnKeyType="search"
            style={{ height: 48, flex: 1, fontSize: 13, color: c.ink }}
          />
        </Row>
        <Chip selected={savedOnly} onPress={() => { setSavedOnly(!savedOnly); setPage(0); }}>
          Saved materials
        </Chip>
      </Row>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }} contentContainerStyle={{ gap: 8 }}>
        <Chip selected={!category} onPress={() => { setCategory(''); setPage(0); }}>All categories</Chip>
        {(query.data?.categories ?? []).map((item) => (
          <Chip key={item.id} selected={category === item.slug} onPress={() => { setCategory(item.slug); setPage(0); }}>
            {item.name}
          </Chip>
        ))}
      </ScrollView>
      {query.isPending ? <Card><Txt style={s.muted}>Loading catalogue…</Txt></Card> : null}
      {query.error ? (
        <Empty title="Catalogue unavailable" description={query.error.message} action={<Button secondary onPress={() => void query.refetch()}>Try again</Button>} />
      ) : null}
      {!query.isPending && !query.error ? (
        <>
          <Row style={{ justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap' }}>
            <Txt style={s.muted}>{total} products · Request current pricing from FTI</Txt>
            <Row>
              <Button secondary disabled={page === 0} onPress={() => setPage(Math.max(0, page - 1))}>Previous</Button>
              <Txt style={s.muted}>Page {page + 1} of {Math.max(1, Math.ceil(total / pageSize))}</Txt>
              <Button secondary disabled={(page + 1) * pageSize >= total} onPress={() => setPage(page + 1)}>Next</Button>
            </Row>
          </Row>
          {items.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18 }}>
              {items.map((product) => <View key={product.id} style={{ flexGrow: 1, flexBasis: 260, maxWidth: 400 }}><ProductCard product={product} /></View>)}
            </View>
          ) : (
            <Empty title={total ? 'No saved items on this page' : 'No products available'} description={total ? 'Save a product or change the filter.' : 'Published products will appear here once FTI adds them. The catalogue contains no demo records.'} action={search || category || savedOnly ? <Button secondary onPress={() => { setSearch(''); setCategory(''); setSavedOnly(false); setPage(0); }}>Clear filters</Button> : undefined} />
          )}
        </>
      ) : null}
    </View>
  );
}
