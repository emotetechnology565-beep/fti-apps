import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Icon, Txt } from '@shared/ui';
import { companyCertificate } from '@shared/config/company-certificates';
import { useQuery } from '@tanstack/react-query';
import { loadHomeCatalogue } from '../data/category-images';
import { HomeCategoryImage } from './HomeCategoryImage';
import rangeImages from '../data/range-images.json';
import { drawingApi } from '@features/drawings/export';
import { HomeMarketWatch } from '@features/market-rates/HomeMarketWatch';

export function DesktopHome() {
  const [search, setSearch] = useState('');
  const catalogue = useQuery({ queryKey: ['catalog', 'home', 'categories'], queryFn: () => loadHomeCatalogue(), staleTime: 30_000 });
  const fasteners = useQuery({ queryKey: ['fastener-photos', 'public'], queryFn: drawingApi.photos, staleTime: 30_000 });
  const categoryCards = catalogue.data?.categories ?? [];
  const steelImage = categoryCards.find((item) => item.imageUrl)?.imageUrl;
  const photo = (uri: string | null | undefined, style: React.ComponentProps<typeof Image>['style']) => uri
    ? <Image source={{ uri }} contentFit="cover" style={style} />
    : <View style={[style, { backgroundColor: '#E8EDF3', alignItems: 'center', justifyContent: 'center' }]}><Icon name="image" size={22} color="#64748B" /></View>;


  const handleSearch = () => {
    if (search.trim()) {
      router.push({
        pathname: '/products',
        params: { search: search.trim() },
      });
    }
  };

  return (
    <View style={styles.container}>
      {/* 1. TOP FULL-WIDTH SEARCH BAR */}
      <View style={styles.searchBar}>
        <Icon name="search" size={20} color="#64748B" />
        <TextInput
          accessibilityLabel="Search products, sizes or grades"
          placeholder="Search products, sizes or grades"
          placeholderTextColor="#64748B"
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
          style={styles.searchInput}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search"
          onPress={handleSearch}
          style={({ pressed }) => [
            styles.searchButton,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Txt style={styles.searchButtonText}>Search</Txt>
        </Pressable>
      </View>

      {/* 2. INDUSTRIAL STEEL FACTORY HERO BANNER */}
      <View style={styles.heroBanner}>
        {photo(steelImage, styles.heroImage)}
        <View style={styles.heroOverlay} />
        <View style={styles.heroContent}>
          <Txt style={styles.heroTitle1}>Materials for your next project</Txt>
          <Txt style={styles.heroSubtitle}>
            Find the grade, size and quantity your business needs.
          </Txt>

          <View style={styles.heroActionRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Browse materials"
              onPress={() => router.push('/products')}
              style={({ pressed }) => [
                styles.heroPrimaryBtn,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Txt style={styles.heroPrimaryBtnText}>Browse materials →</Txt>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Request a quote"
              onPress={() => router.push('/rfqs')}
              style={({ pressed }) => [
                styles.heroOutlineBtn,
                pressed && { backgroundColor: 'rgba(255, 255, 255, 0.1)' },
              ]}
            >
              <Txt style={styles.heroOutlineBtnText}>Request a quote</Txt>
            </Pressable>
          </View>
        </View>
      </View>

      <HomeMarketWatch />

      {/* 4. SHOP BY CATEGORY (6-CARD GRID) */}
      <View style={styles.cardSection}>
        <View style={styles.sectionHeader}>
          <View>
            <Txt style={styles.sectionTitle}>Shop by category</Txt>
            <Txt style={styles.sectionSubtitle}>
              Browse materials for your procurement needs.
            </Txt>
          </View>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/products')}
            style={styles.viewMoreLink}
          >
            <Txt style={styles.viewMoreText}>View all categories →</Txt>
          </Pressable>
        </View>

        <View style={styles.categoryGrid}>
          {catalogue.isPending ? <Txt>Loading published categories...</Txt> : catalogue.isError ? <Pressable onPress={() => void catalogue.refetch()}><Txt>Catalogue unavailable. Tap to retry.</Txt></Pressable> : !categoryCards.length ? <Txt>No published material categories available.</Txt> : null}
          {categoryCards.map((cat) => (
            <Pressable
              key={cat.id}
              accessibilityRole="link"
              accessibilityLabel={`Shop ${cat.title}`}
              onPress={() =>
                router.push({
                  pathname: '/products',
                  params: { category: cat.category },
                })
              }
              style={({ pressed }) => [
                styles.categoryCard,
                pressed && { opacity: 0.85 },
              ]}
            >
              <HomeCategoryImage category={cat.category} title={cat.title} imageUrl={cat.imageUrl} style={styles.categoryImage} />
              <View style={styles.categoryFooter}>
                <Txt style={styles.categoryName} numberOfLines={1}>
                  {cat.title}
                </Txt>
                <Icon name="arrow-right" size={14} color="#A70101" />
              </View>
            </Pressable>
          ))}
        </View>
      </View>

      {/* 5. LOWER 3-PROMO SECTION: FASTENERS, TRACTOR PARTS, QUICK TOOLS */}
      <View style={styles.promoGrid}>
        {/* Fasteners */}
        <View style={styles.promoCard}>
          <Image source={{ uri: rangeImages.fasteners }} accessibilityLabel="Assorted bolts, nuts, washers and fasteners" contentFit="contain" style={styles.promoImage} />
          <View style={styles.promoBody}>
            <Txt style={styles.promoTitle}>Fasteners</Txt>
            <Txt style={styles.promoDesc}>
              {fasteners.isPending ? 'Loading published fasteners...' : fasteners.isError ? 'Fastener catalogue temporarily unavailable.' : `${fasteners.data?.length ?? 0} published fastener categories. Explore sizes and standards.`}
            </Txt>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: '/products',
                  params: { kind: 'fastener' },
                })
              }
              style={styles.promoOutlineBtn}
            >
              <Txt style={styles.promoOutlineBtnText}>Explore range →</Txt>
            </Pressable>
          </View>
        </View>

        {/* Tractor Parts */}
        <View style={styles.promoCard}>
          <Image source={{ uri: rangeImages['tractor-parts'] }} accessibilityLabel="Assorted tractor gears, bearing, shaft, hub and blade" contentFit="contain" style={styles.promoImage} />
          <View style={styles.promoBody}>
            <Txt style={styles.promoTitle}>Tractor parts</Txt>
            <Txt style={styles.promoDesc}>
              {catalogue.isPending ? 'Loading published tractor parts...' : catalogue.isError ? 'Tractor catalogue temporarily unavailable.' : `${catalogue.data?.tractorParts.length ?? 0} published tractor parts. View current specifications.`}
            </Txt>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: '/products',
                  params: { kind: 'tractor_part' },
                })
              }
              style={styles.promoOutlineBtn}
            >
              <Txt style={styles.promoOutlineBtnText}>Explore range →</Txt>
            </Pressable>
          </View>
        </View>

        {/* Quick Procurement Tools */}
        <View style={[styles.promoCard, { padding: 18 }]}>
          <Txt style={styles.quickToolsHeader}>Quick procurement tools</Txt>
          <View style={styles.quickToolsList}>
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push('/rfqs')}
              style={styles.quickToolRow}
            >
              <View style={styles.quickToolLeft}>
                <Icon name="file-text" size={16} color="#00409A" />
                <Txt style={styles.quickToolText}>Get a quote</Txt>
              </View>
              <Icon name="arrow-right" size={14} color="#A70101" />
            </Pressable>

            <View style={styles.quickToolDivider} />

            <Pressable
              accessibilityRole="link"
              onPress={() => router.push('/orders')}
              style={styles.quickToolRow}
            >
              <View style={styles.quickToolLeft}>
                <Icon name="truck" size={16} color="#00409A" />
                <Txt style={styles.quickToolText}>Track an order</Txt>
              </View>
              <Icon name="arrow-right" size={14} color="#A70101" />
            </Pressable>

            <View style={styles.quickToolDivider} />

            <Pressable
              accessibilityRole="link"
              onPress={() => router.push('/calculator')}
              style={styles.quickToolRow}
            >
              <View style={styles.quickToolLeft}>
                <Icon name="cpu" size={16} color="#00409A" />
                <Txt style={styles.quickToolText}>Weight calculator</Txt>
              </View>
              <Icon name="arrow-right" size={14} color="#A70101" />
            </Pressable>
          </View>
        </View>
      </View>

      {/* 6. BOTTOM TRUST FOOTER STRIP */}
      <View style={styles.trustFooterStrip}>
        <View style={styles.trustFooterCol}>
          <Icon name="shield" size={18} color="#00409A" />
          <View style={{ flex: 1 }}>
            <Txt style={styles.trustFooterTitle}>
              Company {companyCertificate.standard}
            </Txt>
            <Pressable
              accessibilityRole="link"
              onPress={() =>
                router.push({
                  pathname: '/account',
                  params: { section: 'business' },
                })
              }
            >
              <Txt style={styles.trustFooterLink}>View certificate →</Txt>
            </Pressable>
          </View>
        </View>

        <View style={styles.trustColDivider} />

        <View style={styles.trustFooterCol}>
          <Icon name="map-pin" size={18} color="#00409A" />
          <View style={{ flex: 1 }}>
            <Txt style={styles.trustFooterTitle}>Ludhiana dispatch hub</Txt>
            <Txt style={styles.trustFooterSubtitle}>
              Dispatch availability and freight confirmed with your quote.
            </Txt>
          </View>
        </View>

        <View style={styles.trustColDivider} />

        <View style={styles.trustFooterCol}>
          <Icon name="file-text" size={18} color="#00409A" />
          <View style={{ flex: 1 }}>
            <Txt style={styles.trustFooterTitle}>
              Material certificates where available
            </Txt>
            <Txt style={styles.trustFooterSubtitle}>
              Mill certificates and test reports (subject to supplier).
            </Txt>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 20,
    paddingBottom: 40,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingLeft: 14,
    paddingRight: 6,
    height: 48,
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    paddingHorizontal: 10,
  },
  searchButton: {
    backgroundColor: '#A70101',
    borderRadius: 6,
    paddingHorizontal: 22,
    paddingVertical: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  heroBanner: {
    position: 'relative',
    height: 250,
    borderRadius: 12,
    overflow: 'hidden',
    justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(11, 27, 54, 0.15)',
  },
  heroImage: {
    ...StyleSheet.absoluteFill,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(11, 27, 54, 0.84)',
  },
  heroContent: {
    paddingHorizontal: 36,
    gap: 8,
    zIndex: 2,
  },
  heroTitle1: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
    color: '#FFFFFF',
  },
  heroTitle2: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
    color: '#A70101',
    marginTop: -4,
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#E2E8F0',
    marginTop: 4,
    marginBottom: 8,
  },
  heroActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroPrimaryBtn: {
    backgroundColor: '#A70101',
    borderRadius: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  heroPrimaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  heroOutlineBtn: {
    borderWidth: 1,
    borderColor: '#FFFFFF',
    borderRadius: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'transparent',
  },
  heroOutlineBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  cardSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 16,
    boxShadow: '0 1px 4px rgba(0, 0, 0, 0.03)',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  viewMoreLink: {
    paddingVertical: 4,
  },
  viewMoreText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#00409A',
  },
  marketGrid: {
    flexDirection: 'row',
    gap: 16,
  },
  marketCard: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    height: 76,
  },
  marketImage: {
    width: 80,
    height: '100%',
  },
  marketBody: {
    flex: 1,
    paddingHorizontal: 12,
    justifyContent: 'center',
    gap: 6,
  },
  marketTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  rateRequestBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#A70101',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  rateRequestBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#A70101',
  },
  categoryGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  categoryCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  categoryImage: {
    width: '100%',
    height: 100,
  },
  categoryFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: '#FFFFFF',
  },
  categoryName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  promoGrid: {
    flexDirection: 'row',
    gap: 16,
  },
  promoCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    boxShadow: '0 1px 4px rgba(0, 0, 0, 0.03)',
  },
  promoImage: {
    width: '100%',
    height: 130,
  },
  promoBody: {
    padding: 16,
    gap: 6,
  },
  promoTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  promoDesc: {
    fontSize: 12,
    lineHeight: 17,
    color: '#64748B',
  },
  promoOutlineBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#A70101',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 6,
  },
  promoOutlineBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A70101',
  },
  quickToolsHeader: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
  },
  quickToolsList: {
    gap: 2,
  },
  quickToolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  quickToolLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  quickToolText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  quickToolDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  trustFooterStrip: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    alignItems: 'center',
  },
  trustFooterCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  trustFooterTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  trustFooterSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  trustFooterLink: {
    fontSize: 11,
    fontWeight: '700',
    color: '#00409A',
    marginTop: 2,
  },
  trustColDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 16,
  },
});
