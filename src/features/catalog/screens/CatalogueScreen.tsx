import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { TextInput, View } from 'react-native';
import { StockSourceDropdown } from '@features/business-stock/ui';
import { useStore } from '@core/state/workspace-store';
import { Button, Card, Chip, Empty, Icon, Row, Txt, c, s } from '@shared/ui';
import { ProductCard } from '../components/ProductCard';
import { MaterialSelection } from '../components/MaterialSelection';
import { useProducts } from '../hooks/use-products';
import type { CatalogQuery } from '../data/catalog-repository';
import {
  FastenerCatalogueCards,
  FastenerDimensions,
} from '@features/drawings/ui';
import { productCardWidth } from '@shared/theme/product-card';

const PRODUCTS_PER_PAGE = 8;

export function Catalogue() {
  const params = useLocalSearchParams<{ search?: string; category?: string }>();
  const search = typeof params.search === 'string' ? params.search.trim() : '';
  const category = typeof params.category === 'string' ? params.category : '';
  if (search || category)
    return (
      <View style={{ gap: 18 }}>
        <Button secondary onPress={() => router.replace('/products')}>
          Browse all materials
        </Button>
        <Txt accessibilityRole="header" style={s.h2}>
          {search ? `Search results for “${search}”` : 'Material catalogue'}
        </Txt>
        <ProductsCatalogue
          key={`${category}:${search}`}
          kind={category ? 'steel' : 'all'}
          filters={category ? { category } : {}}
          initialSearch={search}
        />
      </View>
    );
  return (
    <View>
      <StockSourceDropdown source="fti" />
      <MaterialSelection
        renderAdapter={(kind) =>
          kind === 'fastener' ? (
            <View style={{ gap: 24 }}>
              <FastenerDimensions />
              <ProductsCatalogue kind={kind} />
            </View>
          ) : (
            <ProductsCatalogue key={kind} kind={kind} />
          )
        }
        renderMaterials={(filters, allCategories) =>
          allCategories ? (
            <ProductsCatalogue key="all" kind="all" />
          ) : (
            <ProductsCatalogue
              key={JSON.stringify(filters)}
              kind="steel"
              filters={filters}
            />
          )
        }
      />
    </View>
  );
}

// These categories retain their existing quotation and cart behavior.
function ProductsCatalogue({
  kind,
  filters = {},
  initialSearch = '',
}: {
  kind: 'all' | 'steel' | 'fastener' | 'tractor_part';
  filters?: Pick<CatalogQuery, 'category' | 'ids'>;
  initialSearch?: string;
}) {
  const [search, setSearch] = useState(initialSearch);
  const [savedOnly, setSavedOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [gridWidth, setGridWidth] = useState(0);
  const savedIds = useStore((state) => state.saved);
  const cardWidth = productCardWidth(gridWidth);
  const ids = savedOnly
    ? savedIds.filter((id) => !filters.ids || filters.ids.includes(id))
    : filters.ids;
  const query = useProducts({
    ...filters,
    productKind: kind === 'all' ? undefined : kind,
    search: search.trim(),
    limit: PRODUCTS_PER_PAGE,
    offset: page * PRODUCTS_PER_PAGE,
    ids,
  });
  const total = query.data?.total ?? 0;
  const items = query.data?.items ?? [];
  if (
    kind === 'fastener' &&
    query.isSuccess &&
    total === 0 &&
    !search.trim() &&
    !savedOnly &&
    page === 0
  )
    return null;
  return (
    <View style={{ gap: 16 }}>
      {kind !== 'steel' ? (
        <Row style={{ flexWrap: 'wrap' }}>
          <Row
            style={{
              flex: 1,
              minWidth: 220,
              backgroundColor: 'white',
              borderWidth: 1,
              borderColor: c.line,
              borderRadius: 7,
              paddingHorizontal: 14,
            }}
          >
            <Icon name="search" size={17} />
            <TextInput
              accessibilityLabel="Search catalogue"
              placeholder={
                kind === 'all'
                  ? 'Search all products'
                  : kind === 'fastener'
                    ? 'Search fasteners'
                    : 'Search tractor parts'
              }
              value={search}
              onChangeText={(value) => {
                setSearch(value);
                setPage(0);
              }}
              returnKeyType="search"
              style={{ height: 48, flex: 1, fontSize: 13, color: c.ink }}
            />
          </Row>
          <Chip
            selected={savedOnly}
            onPress={() => {
              setSavedOnly(!savedOnly);
              setPage(0);
            }}
          >
            Saved materials
          </Chip>
        </Row>
      ) : null}
      {kind === 'all' && !savedOnly && page === 0 ? (
        <FastenerCatalogueCards search={search.trim()} />
      ) : null}
      {query.isPending ? (
        <Card>
          <Txt style={s.muted}>Loading catalogue…</Txt>
        </Card>
      ) : query.error ? (
        <Empty
          title="Catalogue unavailable"
          description={query.error.message}
          action={
            <Button secondary onPress={() => void query.refetch()}>
              Try again
            </Button>
          }
        />
      ) : (
        <>
          <Txt style={s.muted}>{total} products</Txt>
          {items.length ? (
            <View
              onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}
              style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}
            >
              {items.map((product) => (
                <View key={product.id} style={{ width: cardWidth ?? '48%' }}>
                  <ProductCard product={product} />
                </View>
              ))}
            </View>
          ) : (
            <Empty
              title={
                kind === 'all'
                  ? 'No matching raw materials or tractor parts'
                  : 'No products available'
              }
              description={
                search || savedOnly
                  ? 'Try another search or clear your filters.'
                  : 'Published products will appear here once FTI adds them.'
              }
              action={
                search || savedOnly ? (
                  <Button
                    secondary
                    onPress={() => {
                      setSearch('');
                      setSavedOnly(false);
                      setPage(0);
                    }}
                  >
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          )}
          <Row style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button
              secondary
              disabled={!page}
              onPress={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Txt style={s.muted}>
              Page {page + 1} of{' '}
              {Math.max(1, Math.ceil(total / PRODUCTS_PER_PAGE))}
            </Txt>
            <Button
              secondary
              disabled={(page + 1) * PRODUCTS_PER_PAGE >= total}
              onPress={() => setPage(page + 1)}
            >
              Next
            </Button>
          </Row>
        </>
      )}
    </View>
  );
}
