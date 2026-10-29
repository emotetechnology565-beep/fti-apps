import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Image, type ImageProps } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Announcements } from '@features/operations/ui';
import { useAuth } from '@features/auth/ui';
import { drawingApi } from '@features/drawings/export';
import { HomeActivity } from '../components/HomeActivity';
import { loadHomeCatalogue } from '../data/category-images';
import materialImageFallbacks from '../data/material-image-fallbacks.json';
import { Button, Txt, Icon, c } from '@shared/ui';

const services = [
  {
    title: 'Market rates',
    short: 'Rates',
    icon: 'trending-up',
    path: '/rates',
    bg: c.brandRedLight,
    iconColor: c.brandRed,
  },
  {
    title: 'Requests & quotations',
    short: 'Get a quote',
    icon: 'file-text',
    path: '/rfqs',
    bg: c.brandBlueLight,
    iconColor: c.brandBlue,
  },
  {
    title: 'Orders & dispatch',
    short: 'My orders',
    icon: 'truck',
    path: '/orders',
    bg: c.greenBg,
    iconColor: c.green,
  },
  {
    title: 'Weight calculator',
    short: 'Calculator',
    icon: 'cpu',
    path: '/calculator',
    bg: c.bgSubtle,
    iconColor: c.brandBlue,
  },
] as const;
const quickFilters = [
  { label: 'Round Bars', search: 'Round Bar' },
  { label: 'Hex Bolts', search: 'Hex Bolt' },
  { label: 'SS 304', search: 'SS 304' },
  { label: 'Grade 8.8', search: '8.8' },
  { label: 'Steel Sheets', search: 'Sheet' },
  { label: 'TMT Bars', search: 'TMT' },
  { label: 'Tractor Spares', search: 'Tractor' },
];

const categories = [
  {
    title: 'Round bars',
    category: 'round-bar-as-rolled',
  },
  {
    title: 'Bright bars',
    category: 'round-bright-bar',
  },
  {
    title: 'Sheets',
    category: 'sheet',
  },
  {
    title: 'Flat bars',
    category: 'flat',
  },
  {
    title: 'Square bars',
    category: 'square',
  },
  {
    title: 'TMT bars',
    category: 'tmt',
  },
] as const;

function ProductPhoto({
  uri,
  label,
  style,
  contentFit = 'contain',
}: {
  uri?: string;
  label: string;
  style: ImageProps['style'];
  contentFit?: ImageProps['contentFit'];
}) {
  const [failedUrl, setFailedUrl] = useState<string>();
  return uri && failedUrl !== uri ? (
    <Image
      source={{ uri }}
      accessibilityLabel={label}
      contentFit={contentFit}
      style={style}
      onError={() => setFailedUrl(uri)}
    />
  ) : (
    <View
      accessibilityLabel={`${label}: photo unavailable`}
      style={[style, styles.photoPlaceholder]}
    >
      <Icon name="image" size={24} color={c.muted} />
    </View>
  );
}

type CategoryTile = {
  id: string;
  title: string;
  imageUrl?: string;
  href: Href;
  contentFit?: ImageProps['contentFit'];
  subtitle?: string;
};

function CategoryRow({
  title,
  href,
  items,
  loading,
  error,
  retry,
  grid = false,
}: {
  title: string;
  href: Href;
  items: CategoryTile[];
  loading?: boolean;
  error?: boolean;
  retry?: () => void;
  grid?: boolean;
}) {
  const Container = grid ? View : ScrollView;
  return (
    <View>
      <View style={styles.categoryRowHeader}>
        <Txt accessibilityRole="header" style={styles.categoryRowTitle}>
          {title}
        </Txt>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`View all ${title.toLowerCase()}`}
          onPress={() => router.push(href)}
          style={styles.seeAll}
        >
          <Txt style={styles.seeAllText}>View all</Txt>
          <Icon name="arrow-right" size={15} color={c.brandBlue} />
        </Pressable>
      </View>
      {items.length ? (
        <Container
          {...(grid
            ? { style: styles.productGrid }
            : {
                horizontal: true,
                showsHorizontalScrollIndicator: false,
                contentContainerStyle: styles.categories,
              })}
        >
          {(grid ? items.slice(0, 3) : items).map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="link"
              accessibilityLabel={`Shop ${item.title}`}
              onPress={() => router.push(item.href)}
              style={({ pressed }) => [
                styles.category,
                grid && styles.gridTile,
                pressed && styles.pressed,
              ]}
            >
              <ProductPhoto
                uri={item.imageUrl}
                label={`${item.title} product photo`}
                contentFit={item.contentFit}
                style={[styles.categoryImage, grid && styles.gridImage]}
              />
              <Txt
                numberOfLines={1}
                style={[
                  styles.categoryTitle,
                  grid && { textAlign: 'center', fontSize: 12 },
                ]}
              >
                {item.title}
              </Txt>
              {item.subtitle ? (
                <Txt numberOfLines={1} style={styles.categorySubtitle}>
                  {item.subtitle}
                </Txt>
              ) : null}
            </Pressable>
          ))}
        </Container>
      ) : (
        <View style={styles.categoryStatus}>
          <Txt style={styles.description}>
            {loading
              ? `Loading ${title.toLowerCase()}…`
              : error
                ? `Could not load ${title.toLowerCase()}.`
                : `No ${title.toLowerCase()} available yet.`}
          </Txt>
          {error && retry ? (
            <Button secondary onPress={retry}>
              Retry {title.toLowerCase()}
            </Button>
          ) : null}
        </View>
      )}
    </View>
  );
}

export function Home() {
  const photos = useQuery({
    queryKey: ['catalog', 'home', 'categories'],
    queryFn: () => loadHomeCatalogue(),
    staleTime: 30000,
  });
  const fastenerPhotos = useQuery({
    queryKey: ['fastener-photos', 'public'],
    queryFn: drawingApi.photos,
    staleTime: 30000,
    retry: false,
  });
  const { identity, session, ready, loading, error } = useAuth();
  const [search, setSearch] = useState('');
  const business =
    identity?.businesses.find(
      (item) => item.verification_status === 'verified',
    ) ?? identity?.businesses[0];
  const accountResolved = ready && !loading && !error && !!identity;
  const accountTitle = business?.legal_name ?? 'Set up your business';
  const accountDescription = business
    ? business.verification_status === 'verified'
      ? 'Verified business · View profile'
      : business.verification_status === 'pending'
        ? 'Application under review · View details'
        : 'Application needs changes · Review feedback'
    : 'Add your business details to get verified.';
  function submitSearch() {
    if (search.trim())
      router.push({ pathname: '/products', params: { search: search.trim() } });
  }
  return (
    <View style={styles.home}>
      <View style={styles.header}>
        <View style={styles.search}>
          <Icon name="search" size={23} color={c.ink} />
          <TextInput
            accessibilityLabel="Search products"
            placeholder="Search products, sizes or grades"
            placeholderTextColor="#58697C"
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={submitSearch}
            returnKeyType="search"
            style={styles.searchInput}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search catalogue"
            disabled={!search.trim()}
            onPress={submitSearch}
            style={styles.searchSubmit}
          >
            <Icon name="arrow-right" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickFilters}
        >
          {quickFilters.map((qf) => (
            <Pressable
              key={qf.label}
              accessibilityRole="button"
              accessibilityLabel={`Filter by ${qf.label}`}
              onPress={() => router.push({ pathname: '/products', params: { search: qf.search } })}
              style={({ pressed }) => [
                styles.filterChip,
                pressed && styles.pressed,
              ]}
            >
              <Icon name="tag" size={11} color={c.brandBlue} />
              <Txt style={styles.filterChipText}>{qf.label}</Txt>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.services}>
          {services.map((item) => (
            <Pressable
              key={item.path}
              accessibilityRole="link"
              accessibilityLabel={item.title}
              onPress={() => router.push(item.path)}
              style={({ pressed }) => [
                styles.service,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.serviceIcon, { backgroundColor: item.bg }]}>
                <Icon
                  name={item.icon}
                  size={20}
                  color={item.iconColor}
                />
              </View>
              <Txt style={styles.serviceTitle}>{item.short}</Txt>
            </Pressable>
          ))}
        </View>
      </View>
      <HomeActivity />
      <CategoryRow
        title="Raw materials"
        href="/products"
        items={categories.map((item) => ({
          id: item.category,
          title: item.title,
          imageUrl:
            photos.data?.images[item.category] ??
            materialImageFallbacks[item.category],
          href: { pathname: '/products', params: { category: item.category } },
          contentFit: 'cover',
        }))}
      />
      <CategoryRow
        grid
        title="Fasteners"
        href="/products?kind=fastener"
        loading={fastenerPhotos.isPending}
        error={fastenerPhotos.isError}
        retry={() => void fastenerPhotos.refetch()}
        items={(fastenerPhotos.data ?? []).map((item) => ({
          id: item.slug,
          title: item.label,
          imageUrl: item.image_url ?? undefined,
          href: { pathname: '/fastener/[slug]', params: { slug: item.slug } },
        }))}
      />
      <CategoryRow
        grid
        title="Tractor parts"
        href="/products?kind=tractor_part"
        loading={photos.isPending}
        error={photos.isError}
        retry={() => void photos.refetch()}
        items={(photos.data?.tractorParts ?? []).map((item) => ({
          ...item,
          href: { pathname: '/product/[id]', params: { id: item.id } },
        }))}
      />
      <View style={styles.content}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Browse materials"
          onPress={() => router.push('/products')}
          style={styles.promotion}
        >
          <View style={styles.promotionBody}>
            <Txt style={styles.featureEyebrow}>THE FTI MATERIAL STORE</Txt>
            <Txt style={styles.promotionTitle}>
              Materials for your next project.
            </Txt>
            <Txt style={styles.featureDescription}>
              Find the size and grade you need. Send your requirement to FTI.
            </Txt>
            <View style={styles.promotionCta}>
              <Txt style={styles.ctaText}>Browse materials</Txt>
              <Icon name="arrow-right" size={16} color="#FFFFFF" />
            </View>
          </View>
          <ProductPhoto
            uri={
              photos.data?.images['round-bar-as-rolled'] ??
              materialImageFallbacks['round-bar-as-rolled']
            }
            label="Raw materials product photo"
            contentFit="cover"
            style={styles.promotionImage}
          />
        </Pressable>
      </View>
      <View style={styles.content}>
        <View style={styles.tools}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Explore fastener dimensions"
            onPress={() => router.push('/fastener/hex-bolt')}
            style={[styles.tool, { backgroundColor: c.goldLight, borderColor: 'rgba(198, 165, 103, 0.35)', borderWidth: 1 }]}
          >
            <View style={[styles.toolIcon, { backgroundColor: 'rgba(198, 165, 103, 0.2)' }]}>
              <Icon name="tool" size={18} color={c.brandBlue} />
            </View>
            <Txt style={styles.toolTitle}>Fastener dimensions</Txt>
            <Txt style={styles.description}>Check dimensions & weights</Txt>
            <Icon name="arrow-up-right" size={18} color={c.brandBlue} />
          </Pressable>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="View business stock"
            onPress={() => router.push('/business-stock')}
            style={styles.tool}
          >
            <View style={styles.toolIcon}>
              <Icon name="package" size={18} color={c.ink} />
            </View>
            <Txt style={styles.toolTitle}>Business stock</Txt>
            <Txt style={styles.description}>Explore business listings</Txt>
            <Icon name="arrow-up-right" size={18} color={c.muted} />
          </Pressable>
        </View>
        {accountResolved || (!session && ready) ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={
              accountResolved
                ? accountTitle + '. ' + accountDescription
                : 'Sign in to your FTI account'
            }
            onPress={() =>
              router.push(
                accountResolved
                  ? {
                      pathname: '/account',
                      params: { section: business ? 'profile' : 'business' },
                    }
                  : '/login',
              )
            }
            style={styles.account}
          >
            <Icon
              name={accountResolved ? 'briefcase' : 'user'}
              size={22}
              color={c.brandBlue}
            />
            <View style={styles.accountText}>
              <Txt style={styles.accountTitle}>
                {accountResolved ? accountTitle : 'Your business starts here'}
              </Txt>
              <Txt style={styles.description}>
                {accountResolved
                  ? accountDescription
                  : 'Sign in to manage your business and orders.'}
              </Txt>
            </View>
            <Icon name="chevron-right" size={18} color={c.muted} />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Get help with your order"
          onPress={() => router.push('/support')}
          style={styles.account}
        >
          <Icon name="help-circle" color={c.brandBlue} size={22} />
          <View style={styles.accountText}>
            <Txt style={styles.accountTitle}>Need help with your order?</Txt>
            <Txt style={styles.description}>
              Get support for orders, claims and certificates.
            </Txt>
          </View>
          <Icon name="chevron-right" size={18} color={c.muted} />
        </Pressable>
        <Announcements />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  home: { minWidth: 0, backgroundColor: c.bg, gap: 16 },
  quickFilters: {
    paddingHorizontal: 16,
    gap: 8,
    paddingTop: 2,
    paddingBottom: 4,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: c.paper,
    borderWidth: 1,
    borderColor: c.cardBorder,
    boxShadow: '0 1px 4px rgba(16, 24, 40, 0.03)',
  },
  filterChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: c.ink,
  },
  trustStripContainer: {
    paddingHorizontal: 16,
  },
  trustStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: c.paper,
    borderWidth: 1,
    borderColor: c.cardBorder,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    boxShadow: '0 2px 8px rgba(16, 24, 40, 0.03)',
    gap: 8,
  },
  trustItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trustIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trustTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: c.ink,
  },
  trustDesc: {
    fontSize: 9.5,
    color: c.muted,
  },
  trustDivider: {
    width: 1,
    height: 24,
    backgroundColor: c.line,
  },

  header: { backgroundColor: c.bg, paddingTop: 8, gap: 10 },
  serviceIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  services: { paddingHorizontal: 16, gap: 8, flexDirection: 'row' },
  service: {
    flex: 1,
    minWidth: 0,
    minHeight: 84,
    borderRadius: 14,
    backgroundColor: c.paper,
    borderWidth: 1,
    borderColor: c.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    boxShadow: '0 2px 8px rgba(31, 27, 22, 0.04)',
  },
  serviceTitle: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    color: c.ink,
  },
  search: {
    marginHorizontal: 16,
    borderRadius: 12,
    backgroundColor: c.paper,
    borderWidth: 1,
    borderColor: c.cardBorder,
    boxShadow: '0 2px 10px rgba(31, 27, 22, 0.04)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 6,
    gap: 8,
  },
  searchInput: { flex: 1, minWidth: 0, height: 50, fontSize: 14, color: c.ink },
  searchSubmit: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: c.brandBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: 26,
    color: c.ink,
  },
  seeAll: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 6 },
  seeAllText: { fontSize: 13, fontWeight: '700', color: c.brandBlue },
  categories: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 2,
    gap: 10,
  },
  categoryRowHeader: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  categoryRowTitle: { fontSize: 19, fontWeight: '700', letterSpacing: -0.4, color: c.ink },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
  },
  gridTile: { flex: 1, minWidth: 0, padding: 10, gap: 8 },
  gridImage: {
    width: '100%',
    height: 96,
    backgroundColor: c.bgSubtle,
    borderRadius: 10,
    borderWidth: 0,
  },
  categoryStatus: { paddingHorizontal: 16, paddingBottom: 18, gap: 8 },
  category: {
    width: 144,
    gap: 8,
    backgroundColor: c.paper,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.cardBorder,
    boxShadow: '0 2px 8px rgba(31, 27, 22, 0.03)',
  },
  categoryImage: {
    width: 124,
    height: 112,
    borderRadius: 10,
    borderWidth: 0,
    backgroundColor: c.bgSubtle,
  },
  categoryTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    textAlign: 'left',
    color: c.ink,
  },
  categorySubtitle: { fontSize: 11, color: c.muted },
  photoPlaceholder: {
    backgroundColor: c.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promotion: {
    backgroundColor: c.brandBlue,
    borderRadius: 16,
    overflow: 'hidden',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: 'rgba(198, 165, 103, 0.35)',
    boxShadow: '0 4px 16px rgba(22, 19, 16, 0.12)',
  },
  promotionBody: { flex: 1, padding: 18, gap: 8 },
  promotionImage: { width: '33%', minHeight: 180 },
  promotionTitle: {
    color: '#FAF8F5',
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  promotionCta: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    minHeight: 38,
    backgroundColor: c.brandRed,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  featureEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: '#FCA5A5',
    textTransform: 'uppercase',
  },
  featureDescription: { fontSize: 13, lineHeight: 20, color: '#D9D1C5' },
  ctaText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  content: { paddingHorizontal: 16, paddingBottom: 0, gap: 10 },
  tools: { flexDirection: 'row', gap: 8 },
  tool: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    padding: 16,
    gap: 6,
    minHeight: 144,
    backgroundColor: c.paper,
    borderWidth: 1,
    borderColor: c.cardBorder,
    boxShadow: '0 2px 8px rgba(31, 27, 22, 0.03)',
  },
  toolIcon: {
    width: 36,
    height: 36,
    backgroundColor: c.bgSubtle,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolTitle: {
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.3,
    fontWeight: '700',
    color: c.ink,
  },
  description: { fontSize: 12, lineHeight: 19, color: c.muted },
  account: {
    borderWidth: 1,
    borderColor: c.cardBorder,
    backgroundColor: c.paper,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    boxShadow: '0 2px 8px rgba(31, 27, 22, 0.03)',
  },
  accountText: { flex: 1, minWidth: 0, gap: 5 },
  accountTitle: { fontSize: 14, fontWeight: '700', lineHeight: 22, color: c.ink },
  pressed: { opacity: 0.8 },
});
