import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Announcements } from '@features/operations/ui';
import { useAuth } from '@features/auth/ui';
import { MaterialPriceBanner } from '@features/pricing/ui';
import { pricingApi } from '@features/pricing/export';
import { useStore } from '@core/state/workspace-store';
import { Button, Card, Txt, Icon, c } from '@shared/ui';

const services = [
  {
    title: 'Market rates',
    short: 'Rates',
    icon: 'trending-up',
    path: '/rates',
    bg: '#E9F3FF',
  },
  {
    title: 'Requests & quotations',
    short: 'Get a quote',
    icon: 'file-text',
    path: '/rfqs',
    bg: '#FFF0F0',
  },
  {
    title: 'Orders & dispatch',
    short: 'My orders',
    icon: 'truck',
    path: '/orders',
    bg: '#EDF5EF',
  },
  {
    title: 'Weight calculator',
    short: 'Calculator',
    icon: 'cpu',
    path: '/calculator',
    bg: '#FFF5E4',
  },
] as const;
const categories = [
  {
    title: 'Round bars',
    category: 'round-bar-as-rolled',
    image: require('../../../../assets/materials/round-bar-as-rolled.jpg'),
  },
  {
    title: 'Bright bars',
    category: 'round-bright-bar',
    image: require('../../../../assets/materials/round-bright-bar.jpg'),
  },
  {
    title: 'Sheets',
    category: 'sheet',
    image: require('../../../../assets/materials/steel-sheets.jpg'),
  },
  {
    title: 'Flat bars',
    category: 'flat',
    image: require('../../../../assets/materials/flat-bars.jpg'),
  },
  {
    title: 'Square bars',
    category: 'square',
    image: require('../../../../assets/materials/square-bars.jpg'),
  },
  {
    title: 'TMT bars',
    category: 'tmt',
    image: require('../../../../assets/materials/0.jpg'),
  },
] as const;

export function Home() {
  const { identity, session, ready, loading, error } = useAuth();
  const [search, setSearch] = useState('');
  const [marketOpen, setMarketOpen] = useState(false);
  const [width, setWidth] = useState(0);
  const market = useStore((state) => state.market);
  const setMarket = useStore((state) => state.setMarket);
  const markets = useQuery({
    queryKey: ['pricing', 'markets'],
    queryFn: pricingApi.markets,
    staleTime: 60000,
  });
  const selectedMarket = markets.data?.find((item) => item.id === market);
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
  const featureWidth = Math.min(520, Math.max(238, width * 0.85));
  function submitSearch() {
    if (search.trim())
      router.push({ pathname: '/products', params: { search: search.trim() } });
  }
  return (
    <View
      style={styles.home}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <View style={styles.header}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.services}
        >
          {services.map((item) => (
            <Pressable
              key={item.path}
              accessibilityRole="link"
              accessibilityLabel={item.title}
              onPress={() => router.push(item.path)}
              style={({ pressed }) => [
                styles.service,
                { backgroundColor: item.bg },
                pressed && styles.pressed,
              ]}
            >
              <Icon name={item.icon} size={27} color={c.ink} />
              <Txt style={styles.serviceTitle}>{item.short}</Txt>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.search}>
          <Icon name="search" size={23} color={c.ink} />
          <TextInput
            accessibilityLabel="Search materials"
            placeholder="Search materials, sizes or grades"
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
            <Icon
              name="arrow-right"
              size={21}
              color={search.trim() ? c.red : c.muted}
            />
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Select your home market"
          onPress={() => setMarketOpen(true)}
          style={styles.market}
        >
          <Icon name="map-pin" size={21} color={c.ink} />
          <Txt style={styles.marketText}>
            {selectedMarket
              ? 'Your market: ' + selectedMarket.name
              : 'Choose your market'}
          </Txt>
          <Icon name="chevron-down" size={18} color={c.ink} />
        </Pressable>
      </View>
      <View style={styles.sectionHeader}>
        <Txt accessibilityRole="header" style={styles.sectionTitle}>
          Shop by material
        </Txt>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Browse all materials"
          onPress={() => router.push('/products')}
          style={styles.seeAll}
        >
          <Txt style={styles.seeAllText}>View all</Txt>
          <Icon name="arrow-right" size={15} color={c.red} />
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categories}
      >
        {categories.map((item) => (
          <Pressable
            key={item.category}
            accessibilityRole="link"
            accessibilityLabel={'Shop ' + item.title}
            onPress={() =>
              router.push({
                pathname: '/products',
                params: { category: item.category },
              })
            }
            style={({ pressed }) => [
              styles.category,
              pressed && styles.pressed,
            ]}
          >
            <Image
              source={item.image}
              contentFit="cover"
              style={styles.categoryImage}
            />
            <Txt style={styles.categoryTitle}>{item.title}</Txt>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Shop fasteners"
          onPress={() => router.push('/fastener/hex-bolt')}
          style={styles.category}
        >
          <View style={styles.categoryIcon}>
            <Icon name="tool" size={30} color={c.ink} />
          </View>
          <Txt style={styles.categoryTitle}>Fasteners</Txt>
        </Pressable>
      </ScrollView>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={featureWidth + 14}
        decelerationRate="fast"
        contentContainerStyle={styles.features}
      >
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Browse materials"
          onPress={() => router.push('/products')}
          style={({ pressed }) => [
            styles.feature,
            { width: featureWidth },
            pressed && styles.pressed,
          ]}
        >
          <Image
            source={categories[0].image}
            contentFit="cover"
            style={styles.featureImage}
          />
          <View style={styles.featureTag}>
            <Txt style={styles.tagText}>THE FTI MATERIAL STORE</Txt>
          </View>
          <View style={styles.featureBody}>
            <Txt style={styles.featureEyebrow}>BUILT FOR YOUR NEXT PROJECT</Txt>
            <Txt style={styles.featureTitle}>
              The right steel.{'\n'}A stronger start.
            </Txt>
            <Txt style={styles.featureDescription}>
              Explore materials, compare specifications and send your
              requirement.
            </Txt>
            <View style={styles.featureCta}>
              <Txt style={styles.ctaText}>Browse materials</Txt>
              <Icon name="arrow-right" size={19} color="white" />
            </View>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Explore steel sheets"
          onPress={() =>
            router.push({
              pathname: '/products',
              params: { category: 'sheet' },
            })
          }
          style={({ pressed }) => [
            styles.feature,
            { width: featureWidth },
            pressed && styles.pressed,
          ]}
        >
          <Image
            source={categories[2].image}
            contentFit="cover"
            style={styles.featureImage}
          />
          <View style={styles.featureTag}>
            <Txt style={styles.tagText}>SHEETS & PLATES</Txt>
          </View>
          <View style={[styles.featureBody, { backgroundColor: '#9D1827' }]}>
            <Txt style={styles.featureEyebrow}>
              FROM SPECIFICATION TO SUPPLY
            </Txt>
            <Txt style={styles.featureTitle}>Find your{'\n'}perfect sheet.</Txt>
            <Txt style={styles.featureDescription}>
              Choose the size and grade for your next fabrication job.
            </Txt>
            <View style={styles.featureCta}>
              <Txt style={styles.ctaText}>Explore sheets</Txt>
              <Icon name="arrow-right" size={19} color="white" />
            </View>
          </View>
        </Pressable>
      </ScrollView>
      <View style={styles.content}>
        <View style={styles.tools}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Explore fastener dimensions"
            onPress={() => router.push('/fastener/hex-bolt')}
            style={[styles.tool, { backgroundColor: '#FFF0F0' }]}
          >
            <Icon name="tool" size={27} color={c.red} />
            <Txt style={styles.toolTitle}>Fasteners,{'\n'}made precise.</Txt>
            <Txt style={styles.description}>Check dimensions & weights</Txt>
            <Icon name="arrow-up-right" size={20} color={c.red} />
          </Pressable>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="View business stock"
            onPress={() => router.push('/business-stock')}
            style={styles.tool}
          >
            <Icon name="package" size={27} color={c.cardBorder} />
            <Txt style={styles.toolTitle}>
              More stock.{'\n'}More possibilities.
            </Txt>
            <Txt style={styles.description}>Explore business listings</Txt>
            <Icon name="arrow-up-right" size={20} color={c.cardBorder} />
          </Pressable>
        </View>
        <MaterialPriceBanner />
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
              size={24}
              color={c.red}
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
            <Icon name="chevron-right" size={20} />
          </Pressable>
        ) : null}
        <Announcements />
      </View>
      <Modal
        visible={marketOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMarketOpen(false)}
      >
        <View style={styles.backdrop}>
          <Card style={styles.modal}>
            <Txt accessibilityRole="header" style={styles.sectionTitle}>
              Choose your market
            </Txt>
            <Txt style={styles.description}>
              Use your local market for material price updates.
            </Txt>
            <ScrollView style={{ maxHeight: 320 }}>
              {markets.isPending ? (
                <Txt>Loading markets…</Txt>
              ) : markets.error ? (
                <>
                  <Txt accessibilityRole="alert">Could not load markets.</Txt>
                  <Button secondary onPress={() => void markets.refetch()}>
                    Retry markets
                  </Button>
                </>
              ) : !markets.data?.length ? (
                <Txt>No markets available yet.</Txt>
              ) : (
                markets.data.map((item) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="radio"
                    accessibilityLabel={item.name}
                    accessibilityState={{ checked: item.id === market }}
                    onPress={() => {
                      setMarket(item.id);
                      setMarketOpen(false);
                    }}
                    style={styles.marketOption}
                  >
                    <Txt>
                      {item.name} · {item.state}
                    </Txt>
                    {item.id === market ? (
                      <Icon name="check" color={c.red} />
                    ) : null}
                  </Pressable>
                ))
              )}
            </ScrollView>
            <Button secondary onPress={() => setMarketOpen(false)}>
              Close markets
            </Button>
          </Card>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  home: { minWidth: 0, backgroundColor: '#FFFFFF' },
  header: { backgroundColor: '#E7EFF9', paddingVertical: 16, gap: 14 },
  services: { paddingHorizontal: 16, gap: 10 },
  service: {
    width: 92,
    minHeight: 84,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  serviceTitle: { fontSize: 12, fontWeight: '700' },
  search: {
    marginHorizontal: 16,
    borderRadius: 28,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: c.cardBorder,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    gap: 10,
  },
  searchInput: { flex: 1, minWidth: 0, height: 54, fontSize: 14, color: c.ink },
  searchSubmit: {
    width: 44,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  market: {
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    minHeight: 44,
  },
  marketText: { flex: 1, fontSize: 14, fontWeight: '500' },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: { fontSize: 19, fontWeight: '700', lineHeight: 25 },
  seeAll: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  seeAllText: { fontSize: 12, fontWeight: '700', color: c.red },
  categories: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 22,
    gap: 16,
  },
  category: { width: 75, gap: 9, alignItems: 'center' },
  categoryImage: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 1,
    borderColor: c.cardBorder,
  },
  categoryIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#FFF0F0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: c.cardBorder,
  },
  categoryTitle: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  features: { paddingHorizontal: 16, gap: 14, paddingBottom: 18 },
  feature: {
    borderWidth: 1,
    borderColor: c.cardBorder,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#092F56',
  },
  featureImage: { width: '100%', height: 170 },
  featureTag: {
    position: 'absolute',
    top: 14,
    left: 14,
    backgroundColor: 'white',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  tagText: { fontSize: 9, fontWeight: '800', color: c.ink, letterSpacing: 0.6 },
  featureBody: { padding: 22, gap: 12, backgroundColor: '#092F56', flex: 1 },
  featureEyebrow: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#D2E5FA',
  },
  featureTitle: {
    fontSize: 31,
    lineHeight: 35,
    letterSpacing: -0.8,
    fontWeight: '800',
    color: 'white',
  },
  featureDescription: { fontSize: 13, lineHeight: 20, color: '#E2EAF4' },
  featureCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    borderTopWidth: 1,
    borderTopColor: '#FFFFFF40',
    marginTop: 5,
    paddingTop: 10,
  },
  ctaText: { color: 'white', fontWeight: '700', fontSize: 14 },
  content: { paddingHorizontal: 16, paddingBottom: 16, gap: 20 },
  tools: { flexDirection: 'row', gap: 12 },
  tool: {
    flex: 1,
    minWidth: 0,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    backgroundColor: '#EAF2FD',
    borderWidth: 1,
    borderColor: c.cardBorder,
  },
  toolTitle: {
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: -0.4,
    fontWeight: '700',
  },
  description: { fontSize: 12, lineHeight: 19, color: '#58697C' },
  account: {
    borderWidth: 1,
    borderColor: c.cardBorder,
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  accountText: { flex: 1, minWidth: 0, gap: 5 },
  accountTitle: { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  pressed: { opacity: 0.8 },
  backdrop: {
    flex: 1,
    backgroundColor: '#00000066',
    padding: 24,
    justifyContent: 'center',
  },
  modal: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: 16 },
  marketOption: {
    minHeight: 52,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
});
