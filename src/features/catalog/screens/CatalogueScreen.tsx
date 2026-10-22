import { ProductCard } from '@features/catalog/components/ProductCard';
import { StockSourceDropdown } from '@features/business-stock/ui';
import { useStore } from '@core/state/workspace-store';
import { Button, Card, Chip, Empty, Heading, Icon, Row, Txt, c, s } from '@shared/ui';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useProducts } from '../hooks/use-products';
import { CatalogFilter } from '../components/CatalogFilter';
import { sharedMaterialGrades, sharedMaterialSizes } from '../model/shared-material-options';
const pageSize = 24;
export function Catalogue() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [size, setSize] = useState('');
  const [grade, setGrade] = useState('');
  const [page, setPage] = useState(0);
  const [savedOnly, setSavedOnly] = useState(false);
  const [gridWidth, setGridWidth] = useState(0);
  const columns = gridWidth >= 720 ? Math.max(3, Math.floor((gridWidth + 12) / 252)) : 2;
  const cardWidth = gridWidth > 0 ? (gridWidth - 12 * (columns - 1)) / columns : undefined;
  const savedIds = useStore((state) => state.saved);
  const query = useProducts({ search: search.trim(), category, size: size ? Number(size) : undefined, grade, limit: pageSize, offset: page * pageSize, ids: savedOnly ? savedIds : undefined });
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
      <Row style={{ marginBottom: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <CatalogFilter label="1. Category" value={category} onOpen={() => { void query.refetch(); }}
          options={[{ value: '', label: 'All categories' }, ...(query.data?.categories ?? []).map(item => ({ value: item.slug, label: item.name }))]}
          onChange={value => { setCategory(value); setSize(''); setGrade(''); setPage(0); }} />
        <CatalogFilter label="2. Size (mm)" value={size} disabled={!category}
          options={[{ value: '', label: 'All sizes' }, ...sharedMaterialSizes.map(value => ({ value: String(value), label: `${value} mm` }))]}
          onChange={value => { setSize(value); setGrade(''); setPage(0); }} />
        <CatalogFilter label="3. Grade" value={grade} disabled={!category || query.isPending || !!query.error}
          options={[{ value: '', label: 'All grades' }, ...sharedMaterialGrades.map(value => ({ value, label: value }))]}
          onChange={value => { setGrade(value); setPage(0); }} />
      </Row>
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
            <View onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {items.map((product) => <View key={product.id} style={{ width: cardWidth ?? '48%' }}><ProductCard product={product} filters={{ size, grade }} /></View>)}
            </View>
          ) : (
            <Empty title={search || category || savedOnly ? 'No matching products' : 'No products available'} description={search || category || savedOnly ? 'Try another category, size or grade, or clear the filters.' : 'Published products will appear here once FTI adds them.'} action={search || category || savedOnly ? <Button secondary onPress={() => { setSearch(''); setCategory(''); setSize(''); setGrade(''); setSavedOnly(false); setPage(0); }}>Clear filters</Button> : undefined} />
          )}
        </>
      ) : null}
    </View>
  );
}
