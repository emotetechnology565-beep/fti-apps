import { CatalogFilter } from '../components/CatalogFilter';
import { isTmtCategory } from '../model/tmt';
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { StockSourceDropdown } from '@features/business-stock/ui';
import { useStore } from '@core/state/workspace-store';
import { Button, Card, Empty, Icon, Row, Txt } from '@shared/ui';
import { MatrixProductCard } from '../components/MatrixProductCard';
import { MaterialSelection } from '../components/MaterialSelection';
import { useProducts } from '../hooks/use-products';
import { useAvailableFilters } from '../hooks/use-available-filters';
import {
  catalogueCategoryLabel,
  isFastenerCategory,
} from '../model/category-navigation';
import {
  FastenerCatalogueCards,
  FastenerDimensions,
} from '@features/drawings/ui';

const tabs = [
  { value: 'steel', label: 'Raw Material', icon: 'layers' },
  { value: 'fastener', label: 'Fastener', icon: 'tool' },
  { value: 'tractor_part', label: 'Tractor Spares', icon: 'truck' },
] as const;
const limit = 8;
export function Catalogue() {
  const params = useLocalSearchParams<{
    search?: string;
    category?: string;
    kind?: string;
  }>();
  return (
    <CatalogueMatrix
      key={JSON.stringify(params)}
      initialKind={
        isFastenerCategory(params.category ?? '')
          ? 'fastener'
          : params.kind === 'fastener' || params.kind === 'tractor_part'
            ? params.kind
            : 'steel'
      }
      initialSearch={typeof params.search === 'string' ? params.search : ''}
      initialCategory={
        typeof params.category === 'string' &&
        !isFastenerCategory(params.category)
          ? params.category
          : ''
      }
    />
  );
}
function CatalogueMatrix({
  initialKind,
  initialSearch,
  initialCategory,
}: {
  initialKind: (typeof tabs)[number]['value'];
  initialSearch: string;
  initialCategory: string;
}) {
  const viewport = useWindowDimensions();
  const [selectionIds, setSelectionIds] = useState<string[] | undefined>();
  const [kind, setKind] = useState(initialKind);
  const [search, setSearch] = useState(initialSearch);
  const [category, setCategory] = useState(initialCategory);
  const [grade, setGrade] = useState('');
  const [savedOnly, setSavedOnly] = useState(false);
  const [specs, setSpecs] = useState(false);
  const [page, setPage] = useState(0);
  const [width, setWidth] = useState(0);
  const saved = useStore((state) => state.saved);
  const availableFilters = useAvailableFilters(category, undefined, kind);
  const query = useProducts({
    productKind: kind,
    groupTmt: true,
    search: search.trim(),
    category: category || undefined,
    grade: grade || undefined,
    ids: savedOnly
      ? saved.filter((id) => !selectionIds || selectionIds.includes(id))
      : selectionIds,
    limit,
    offset: page * limit,
  });
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const columns = width >= 920 ? 3 : width >= 630 ? 2 : 1;
  const cardWidth = width ? (width - 12 * (columns - 1)) / columns : '100%';
  const activeFilters =
    Number(!!category) + Number(!!grade) + Number(savedOnly);
  const reset = () => {
    setSearch('');
    setCategory('');
    setSelectionIds(undefined);
    setGrade('');
    setSavedOnly(false);
    setPage(0);
  };
  return (
    <View
      style={[
        styles.page,
        viewport.width < 600 && { marginHorizontal: -18, borderRadius: 0 },
      ]}
    >
      <View style={styles.ticker}>
        <View style={styles.inline}>
          <View style={styles.dot} />
          <Txt style={styles.tickerText}>FTI INDUSTRIAL SUPPLY</Txt>
        </View>
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/rates')}
        >
          <Txt style={styles.tickerLink}>Market rates ↗</Txt>
        </Pressable>
      </View>
      <View style={styles.hero}>
        <View style={styles.inline}>
          <Txt style={styles.badge}>B2B MATERIAL CATALOGUE</Txt>
          <Icon name="layers" size={16} color="#485f83" />
        </View>
        <View
          style={[
            styles.inline,
            { justifyContent: 'space-between', alignItems: 'flex-start' },
          ]}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <Txt accessibilityRole="header" style={styles.heading}>
              Industrial Spec Matrix
            </Txt>
            <Txt style={styles.caption}>
              Raw materials, fasteners & tractor spares
            </Txt>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Txt style={styles.label}>CATALOGUE</Txt>
            <Txt accessibilityLiveRegion="polite" style={styles.total}>
              {query.isPending ? '—' : total} products
            </Txt>
          </View>
        </View>
      </View>
      <View style={styles.controls}>
        <View style={styles.inline}>
          <View style={styles.search}>
            <Icon name="search" size={18} color="#485f83" />
            <TextInput
              accessibilityLabel="Search catalogue"
              placeholder="Search specs, grade, size or product..."
              value={search}
              onChangeText={(value) => {
                setSearch(value);
                setPage(0);
              }}
              returnKeyType="search"
              style={{
                flex: 1,
                minWidth: 0,
                height: 44,
                fontSize: 12,
                color: '#101c2c',
              }}
            />
            {search ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                onPress={() => {
                  setSearch('');
                  setPage(0);
                }}
                style={{ padding: 8 }}
              >
                <Icon name="x" size={16} />
              </Pressable>
            ) : null}
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6 }}
        >
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: savedOnly }}
            onPress={() => {
              setSavedOnly(!savedOnly);
              setPage(0);
            }}
            style={[styles.pill, savedOnly && styles.activePill]}
          >
            <Icon
              name="bookmark"
              size={14}
              color={savedOnly ? '#fff' : '#485f83'}
            />
            <Txt style={[styles.pillText, savedOnly && styles.white]}>
              Saved materials
            </Txt>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/calculator')}
            style={styles.pill}
          >
            <Icon name="cpu" size={14} color="#00409A" />
            <Txt style={styles.pillText}>Weight calculator</Txt>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/cart')}
            style={styles.pill}
          >
            <Icon name="shopping-cart" size={14} color="#485f83" />
            <Txt style={styles.pillText}>Staged cart</Txt>
          </Pressable>
        </ScrollView>
        <View style={styles.tabs}>
          {tabs.map((tab) => (
            <Pressable
              key={tab.value}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: kind === tab.value }}
              onPress={() => {
                setKind(tab.value);
                setCategory('');
                setSelectionIds(undefined);
                setGrade('');
                setPage(0);
              }}
              style={[
                styles.tab,
                kind === tab.value && { backgroundColor: '#FFFFFF', boxShadow: '0 1px 4px rgba(16, 24, 40, 0.06)' },
              ]}
            >
              <Icon
                name={tab.icon}
                size={18}
                color={kind === tab.value ? '#00409A' : '#64748B'}
              />
              <Txt
                style={[
                  styles.tabText,
                  kind === tab.value && { color: '#00409A' },
                ]}
              >
                {tab.label}
              </Txt>
            </Pressable>
          ))}
        </View>
        {kind === 'steel' ? (
          <View
            style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}
          >
            <CatalogFilter
              compact
              label="Category"
              value={category}
              options={[
                { value: '', label: 'All categories' },
                ...(query.data?.categories ?? []).map((item) => ({
                  value: item.slug,
                  label: catalogueCategoryLabel(item.name),
                })),
              ]}
              onChange={(value) => {
                setSelectionIds(undefined);
                setGrade('');
                if (isFastenerCategory(value)) {
                  setKind('fastener');
                  setCategory('');
                } else {
                  setCategory(value);
                }
                setPage(0);
              }}
            />
            <CatalogFilter
              compact
              label={
                isTmtCategory(category)
                  ? 'Brand'
                  : category
                    ? 'Grade'
                    : 'Grade / Brand'
              }
              value={grade}
              options={[
                {
                  value: '',
                  label: isTmtCategory(category)
                    ? 'All brands'
                    : category
                      ? 'All grades'
                      : 'All grades / brands',
                },
                ...availableFilters.options.grades.map((value) => ({
                  value,
                  label: value,
                })),
              ]}
              disabled={availableFilters.isFetching || availableFilters.isError}
              onChange={(value) => {
                setGrade(value);
                setPage(0);
              }}
            />
          </View>
        ) : null}
      </View>
      <View style={{ padding: 16, gap: 12 }}>
        {kind === 'fastener' ? (
          <FastenerCatalogueCards search={search.trim()} />
        ) : null}
        <View style={[styles.inline, { justifyContent: 'space-between' }]}>
          <Txt style={styles.label}>
            {tabs.find((tab) => tab.value === kind)?.label.toUpperCase()} /
            SPECIFICATIONS
          </Txt>
          {activeFilters || search ? (
            <Pressable accessibilityRole="button" onPress={reset}>
              <Txt style={styles.clear}>Clear filters</Txt>
            </Pressable>
          ) : null}
        </View>
        {query.isPending ? (
          <Card>
            <Txt style={styles.caption}>Loading catalogue...</Txt>
          </Card>
        ) : query.error ? (
          <Empty
            title="Catalogue unavailable"
            description={query.error.message}
            action={
              <Button onPress={() => void query.refetch()}>Try again</Button>
            }
          />
        ) : items.length ? (
          <View
            onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}
          >
            {items.map((product) => (
              <View key={product.id} style={{ width: cardWidth }}>
                <MatrixProductCard product={product} />
              </View>
            ))}
          </View>
        ) : kind !== 'fastener' ? (
          <Empty
            title="No matching products"
            description="Try another search or clear the filters."
            action={
              <Button secondary onPress={reset}>
                Clear filters
              </Button>
            }
          />
        ) : null}
        {kind !== 'fastener' || items.length ? (
          <Row style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button
              secondary
              disabled={!page}
              onPress={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Txt style={styles.caption}>
              Page {page + 1} of {Math.max(1, Math.ceil(total / limit))}
            </Txt>
            <Button
              secondary
              disabled={(page + 1) * limit >= total}
              onPress={() => setPage(page + 1)}
            >
              Next
            </Button>
          </Row>
        ) : null}
      </View>
      <Modal
        visible={specs}
        transparent
        animationType="slide"
        onRequestClose={() => setSpecs(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.inline}>
              <Txt
                accessibilityRole="header"
                style={[styles.heading, { flex: 1 }]}
              >
                Specification filters
              </Txt>
              <Button secondary onPress={() => setSpecs(false)}>
                Close
              </Button>
            </View>
            <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 16 }}>
              <StockSourceDropdown source="fti" />
              <MaterialSelection
                renderAdapter={(adapter) =>
                  adapter === 'fastener' ? (
                    <FastenerDimensions />
                  ) : (
                    <Button
                      onPress={() => {
                        setKind('tractor_part');
                        setSpecs(false);
                      }}
                    >
                      Browse tractor spares
                    </Button>
                  )
                }
                renderMaterials={(filters) => (
                  <Button
                    onPress={() => {
                      setSelectionIds(filters.ids);
                      setCategory(filters.category ?? '');
                      setGrade('');
                      setKind('steel');
                      setPage(0);
                      setSpecs(false);
                    }}
                  >
                    Apply size & grade filters
                  </Button>
                )}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  page: { backgroundColor: '#f8f9ff', borderRadius: 8, overflow: 'hidden' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ticker: {
    backgroundColor: '#253142',
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#d32f2f' },
  tickerText: {
    color: '#ebf1ff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  tickerLink: { color: '#b0c8f1', fontSize: 11, fontWeight: '600' },
  hero: { backgroundColor: '#eff4ff', padding: 16, gap: 10 },
  badge: {
    backgroundColor: '#d7e3f9',
    color: '#334E68',
    paddingHorizontal: 6,
    paddingVertical: 3,
    fontSize: 10,
    fontWeight: '700',
    borderRadius: 4,
  },
  heading: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    color: '#101c2c',
  },
  caption: { fontSize: 12, lineHeight: 18, color: '#334E68' },
  label: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    color: '#334E68',
    letterSpacing: 0.4,
  },
  total: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: '#A70101' },
  controls: { padding: 16, paddingBottom: 8, gap: 8 },
  search: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingLeft: 12,
    boxShadow: '0 1px 4px rgba(16, 24, 40, 0.04)',
  },
  specs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#EEF4FC',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    boxShadow: '0 1px 3px rgba(16, 24, 40, 0.03)',
  },
  activePill: { backgroundColor: '#00409A', borderColor: '#00409A' },
  pillText: {
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '600',
    color: '#111827',
  },
  white: { color: '#FFFFFF' },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 4,
    gap: 6,
    borderRadius: 12,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: 6,
  },
  tabText: {
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '700',
    textAlign: 'center',
    color: '#64748B',
  },
  clear: { fontSize: 12, color: '#A70101', fontWeight: '600' },
  overlay: {
    flex: 1,
    backgroundColor: '#101c2c66',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '90%',
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    backgroundColor: '#f8f9ff',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    padding: 16,
    gap: 16,
  },
});
