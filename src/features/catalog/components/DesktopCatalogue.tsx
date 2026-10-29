import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { catalogApi, supabaseCatalogRepository } from '../data/catalog-repository';
import { Image } from 'expo-image';
import { getCategoryImage } from './category-images';
import { isTmtCategory } from '../model/tmt';
import { selectionPrice } from '../model/material-selection';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import { router } from 'expo-router';
import { Icon, Txt } from '@shared/ui';
import { useStore } from '@core/state/workspace-store';
import type { Product } from '../model/types';
import { mobileCommerce as m } from '@shared/ui/MobileCommerce';
import { companyCertificate } from '@shared/config/company-certificates';
import { FastenerCatalogueCards } from '@features/drawings/ui';
import { usePriceAccess } from '@shared/hooks/use-price-access';
import { SubscribeForPrices } from '@features/subscriptions/SubscribeForPrices';

type DesktopCatalogueProps = {
  products: Product[];
  total: number;
  initialSearch?: string;
  initialCategory?: string;
  initialKind?: string;
};

export function DesktopCatalogue({
  initialSearch = '',
  initialCategory = '',
  initialKind = 'steel',
}: DesktopCatalogueProps) {
  const [search, setSearch] = useState(initialSearch);
  const [activeTab, setActiveTab] = useState<'steel' | 'fastener' | 'tractor_part'>(
    initialKind === 'fastener' ? 'fastener' : initialKind === 'tractor_part' ? 'tractor_part' : 'steel'
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    initialCategory ? [initialCategory] : []
  );
  const [selectedGrade, setSelectedGrade] = useState<string>('All Grades');
  const [selectedBrand, setSelectedBrand] = useState<string>('All Brands');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState('Recommended');

  // Accordion toggle states
  const [catOpen, setCatOpen] = useState(true);
  const [gradeOpen, setGradeOpen] = useState(true);
  const [brandOpen, setBrandOpen] = useState(true);

  // Dropdown modal states
  const [gradeDropdownOpen, setGradeDropdownOpen] = useState(false);
  const [brandDropdownOpen, setBrandDropdownOpen] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);

  // Store
  const cart = useStore((state) => state.cart);

  // Toggle category checkbox
  const toggleCategory = (key: string) => {
    setSelectedGrade('All Grades');
    setSelectedBrand('All Brands');
    setSelectedCategories((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  // Reset filters
  const resetFilters = () => {
    setSearch('');
    setSelectedCategories([]);
    setSelectedGrade('All Grades');
    setSelectedBrand('All Brands');
  };

  const catalogue = useQuery({
    enabled: activeTab !== 'fastener',
    queryKey: ['catalog', 'desktop', activeTab, selectedCategories],
    queryFn: async () => {
      const items: Product[] = [];
      const categories = new Map<string, { key: string; label: string }>();
      for (const category of selectedCategories.length ? selectedCategories : ['']) {
        let offset = 0;
        while (true) {
          const page = await supabaseCatalogRepository.listProducts({ productKind: activeTab, category: category || undefined, limit: 50, offset });
          items.push(...page.items);
          page.categories.forEach((entry) => categories.set(entry.slug, { key: entry.slug, label: entry.name }));
          offset += page.items.length;
          if (!page.items.length || offset >= page.total) break;
        }
      }
      return { items: [...new Map(items.map((item) => [item.id, item])).values()], categories: [...categories.values()] };
    },
    staleTime: 30_000,
  });
  const sourceProducts = catalogue.data?.items ?? [];
  const filterCategories = catalogue.data?.categories ?? [];
  const grades = (product: Product) => product.variants.map((variant) => String(variant.attributes.grade ?? '').trim()).filter(Boolean);
  const brands = (product: Product) => product.variants.map((variant) => String(variant.attributes.brand ?? '').trim()).filter(Boolean);
  const availableGradesList = ['All Grades', ...new Set(sourceProducts.flatMap(grades))];
  const availableBrandsList = ['All Brands', ...new Set(sourceProducts.flatMap(brands))];
  const filteredProducts = sourceProducts.filter((product) =>
    (!search.trim() || [product.name, product.category, ...grades(product)].join(' ').toLowerCase().includes(search.trim().toLowerCase())) &&
    (selectedGrade === 'All Grades' || grades(product).includes(selectedGrade)) &&
    (selectedBrand === 'All Brands' || brands(product).includes(selectedBrand))
  );

  return (
    <View style={styles.container}>
      {/* 1. HERO TITLE BANNER (NAVY BLUE) */}
      <View style={styles.heroBanner}>
        <View style={styles.heroBannerLeft}>
          <Txt style={styles.heroTitle}>RAW MATERIAL CATALOGUE</Txt>
          <Txt style={styles.heroSubtitle}>
            Compare specifications. Build your requirement.
          </Txt>
        </View>

        <View style={styles.heroBannerRight}>
          <View style={styles.materialFamiliesBadge}>
            <Txt style={styles.familiesNumber}>
              {filteredProducts.length}
            </Txt>
            <View>
              <Txt style={styles.familiesLabel}>material</Txt>
              <Txt style={styles.familiesLabel}>families</Txt>
            </View>
          </View>
        </View>
      </View>

      {/* 2. FILTER & CATEGORY NAVIGATION BAR */}
      <View style={styles.navBar}>
        {/* Search Input */}
        <View style={styles.searchBox}>
          <Icon name="search" size={17} color="#64748B" />
          <TextInput
            accessibilityLabel="Search material, grade or size"
            placeholder="Search material, grade or size"
            placeholderTextColor="#64748B"
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
          />
        </View>

        {/* Center Tabs: Raw Material, Fasteners, Tractor Spares */}
        <View style={styles.centerTabs}>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'steel' }}
            onPress={() => setActiveTab('steel')}
            style={[styles.tabBtn, activeTab === 'steel' && styles.tabBtnActive]}
          >
            <Txt
              style={[
                styles.tabBtnText,
                activeTab === 'steel' && styles.tabBtnTextActive,
              ]}
            >
              Raw Material
            </Txt>
            {activeTab === 'steel' ? <View style={styles.tabIndicator} /> : null}
          </Pressable>

          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'fastener' }}
            onPress={() => setActiveTab('fastener')}
            style={[
              styles.tabBtn,
              activeTab === 'fastener' && styles.tabBtnActive,
            ]}
          >
            <Txt
              style={[
                styles.tabBtnText,
                activeTab === 'fastener' && styles.tabBtnTextActive,
              ]}
            >
              Fasteners
            </Txt>
            {activeTab === 'fastener' ? (
              <View style={styles.tabIndicator} />
            ) : null}
          </Pressable>

          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'tractor_part' }}
            onPress={() => setActiveTab('tractor_part')}
            style={[
              styles.tabBtn,
              activeTab === 'tractor_part' && styles.tabBtnActive,
            ]}
          >
            <Txt
              style={[
                styles.tabBtnText,
                activeTab === 'tractor_part' && styles.tabBtnTextActive,
              ]}
            >
              Tractor Spares
            </Txt>
            {activeTab === 'tractor_part' ? (
              <View style={styles.tabIndicator} />
            ) : null}
          </Pressable>
        </View>

        {/* Right Utility Actions */}
        <View style={styles.utilityActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/cart')}
            style={styles.utilityBtn}
          >
            <Icon name="shopping-cart" size={14} color="#64748B" />
            <Txt style={styles.utilityBtnText}>Cart</Txt>
            {cart.length > 0 ? (
              <View style={styles.cartCountBadge}>
                <Txt style={styles.cartCountText}>{cart.length}</Txt>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      {/* 3. MAIN 2-COLUMN BODY LAYOUT */}
      <View style={styles.mainLayout}>
        {/* LEFT COLUMN: FILTERS SIDEBAR */}
        <View style={[styles.filterSidebar, Platform.OS === 'web' && styles.stickyFilters]}>
          <Txt style={styles.filterSidebarTitle}>FILTERS</Txt>

          {/* Category Filter */}
          <View style={styles.filterBlock}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setCatOpen(!catOpen)}
              style={styles.filterHeaderRow}
            >
              <Txt style={styles.filterHeaderLabel}>Category</Txt>
              <Icon
                name={catOpen ? 'chevron-up' : 'chevron-down'}
                size={14}
                color="#64748B"
              />
            </Pressable>
            {catOpen ? (
              <View style={styles.filterOptionsList}>
                {filterCategories.map((fc) => {
                  const isChecked = selectedCategories.includes(fc.key);
                  return (
                    <Pressable
                      key={fc.key}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isChecked }}
                      onPress={() => toggleCategory(fc.key)}
                      style={styles.checkboxRow}
                    >
                      <View
                        style={[
                          styles.checkboxBox,
                          isChecked && styles.checkboxBoxActive,
                        ]}
                      >
                        {isChecked ? (
                          <Icon name="check" size={11} color="#FFFFFF" />
                        ) : null}
                      </View>
                      <Txt style={styles.checkboxLabel}>{fc.label}</Txt>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>

          {/* Grade Filter Dropdown */}
          <View style={styles.filterBlock}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setGradeOpen(!gradeOpen)}
              style={styles.filterHeaderRow}
            >
              <Txt style={styles.filterHeaderLabel}>Grade</Txt>
              <Icon
                name={gradeOpen ? 'chevron-up' : 'chevron-down'}
                size={14}
                color="#64748B"
              />
            </Pressable>
            {gradeOpen ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setGradeDropdownOpen(true)}
                style={styles.selectDropdownBtn}
              >
                <Txt style={styles.selectDropdownText} numberOfLines={1}>
                  {selectedGrade === 'All Grades' ? 'Select grade' : selectedGrade}
                </Txt>
                <Icon name="chevron-down" size={13} color="#64748B" />
              </Pressable>
            ) : null}
          </View>

          {/* Brand Filter Dropdown */}
          <View style={styles.filterBlock}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setBrandOpen(!brandOpen)}
              style={styles.filterHeaderRow}
            >
              <Txt style={styles.filterHeaderLabel}>Brand</Txt>
              <Icon
                name={brandOpen ? 'chevron-up' : 'chevron-down'}
                size={14}
                color="#64748B"
              />
            </Pressable>
            {brandOpen ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setBrandDropdownOpen(true)}
                style={styles.selectDropdownBtn}
              >
                <Txt style={styles.selectDropdownText} numberOfLines={1}>
                  {selectedBrand === 'All Brands' ? 'Select brand' : selectedBrand}
                </Txt>
                <Icon name="chevron-down" size={13} color="#64748B" />
              </Pressable>
            ) : null}
          </View>

          {/* Reset Filters Link */}
          <Pressable
            accessibilityRole="button"
            onPress={resetFilters}
            style={styles.resetFiltersBtn}
          >
            <Icon name="rotate-ccw" size={13} color="#00409A" />
            <Txt style={styles.resetFiltersText}>Reset filters</Txt>
          </Pressable>
        </View>

        {/* RIGHT COLUMN: PRODUCTS LISTING */}
        <View style={styles.productsArea}>
          {/* Top Control Bar */}
          <View style={styles.productsTopBar}>
            <Txt style={styles.materialsCount}>
              {activeTab === 'fastener' ? 'Fastener catalogue' : `${filteredProducts.length} materials`}
            </Txt>

            <View style={styles.topBarRightControls}>
              {/* Grid / List Toggle */}
              <View style={styles.viewToggleGroup}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setViewMode('grid')}
                  style={[
                    styles.viewToggleBtn,
                    viewMode === 'grid' && styles.viewToggleBtnActive,
                  ]}
                >
                  <Icon
                    name="grid"
                    size={13}
                    color={viewMode === 'grid' ? '#FFFFFF' : '#64748B'}
                  />
                  <Txt
                    style={[
                      styles.viewToggleText,
                      viewMode === 'grid' && styles.viewToggleTextActive,
                    ]}
                  >
                    Grid
                  </Txt>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => setViewMode('list')}
                  style={[
                    styles.viewToggleBtn,
                    viewMode === 'list' && styles.viewToggleBtnActive,
                  ]}
                >
                  <Icon
                    name="list"
                    size={13}
                    color={viewMode === 'list' ? '#FFFFFF' : '#64748B'}
                  />
                  <Txt
                    style={[
                      styles.viewToggleText,
                      viewMode === 'list' && styles.viewToggleTextActive,
                    ]}
                  >
                    List
                  </Txt>
                </Pressable>
              </View>

              {/* Sort Dropdown */}
              <Pressable
                accessibilityRole="button"
                onPress={() => setSortDropdownOpen(true)}
                style={styles.sortDropdown}
              >
                <Txt style={styles.sortDropdownText}>Sort: {sortBy}</Txt>
                <Icon name="chevron-down" size={12} color="#64748B" />
              </Pressable>
            </View>
          </View>

          {activeTab === 'fastener' ? <FastenerCatalogueCards search={search.trim()} desktop /> : <>
          {catalogue.isPending ? <Txt>Loading catalogue...</Txt> : null}
          {catalogue.isError ? <Txt onPress={() => void catalogue.refetch()}>Could not load catalogue. Tap to retry.</Txt> : null}
          {!catalogue.isPending && !catalogue.isError && !filteredProducts.length ? <Txt>No products match these filters.</Txt> : null}
          {/* 2-Column Desktop Grid of Cards */}
          <View style={styles.desktopCardGrid}>
            {filteredProducts.map((product) => (
              <DesktopProductCard
                key={product.id}
                product={product}
              />
            ))}
          </View>
          </>}

          {/* Bottom ISO Certificate Strip */}
          <View style={styles.bottomIsoStrip}>
            <Icon name="shield" size={15} color="#00409A" />
            <Txt style={styles.bottomIsoText}>
              Company {companyCertificate.standard} •{' '}
              <Txt
                onPress={() =>
                  router.push({
                    pathname: '/account',
                    params: { section: 'business' },
                  })
                }
                style={styles.bottomIsoLink}
              >
                View certificate
              </Txt>
            </Txt>
          </View>
        </View>
      </View>

      {/* 4. BOTTOM STICKY QUOTE BASKET BAR */}
      <View style={[styles.quoteBasketBar, Platform.OS === 'web' && styles.stickyQuoteBasket]}>
        <View style={styles.quoteBasketLeft}>
          <Icon name="shopping-cart" size={18} color="#FFFFFF" />
          <Txt style={styles.quoteBasketText}>
            Quote basket •{' '}
            <Txt style={{ fontWeight: '700', color: '#FFFFFF' }}>
              {cart.length > 0
                ? `${cart.length} material${cart.length === 1 ? '' : 's'} added`
                : 'No materials added'}
            </Txt>
          </Txt>
        </View>

        <View style={styles.quoteBasketRight}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Review quote"
            onPress={() => router.push('/cart')}
            style={({ pressed }) => [
              styles.reviewQuoteBtn,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Txt style={styles.reviewQuoteBtnText}>Review quote</Txt>
          </Pressable>
          <Txt style={styles.quoteDisclaimerText}>
            GST and freight calculated separately.
          </Txt>
        </View>
      </View>

      {/* Grade Selector Modal */}
      {gradeDropdownOpen ? (
        <Modal
          transparent
          visible={gradeDropdownOpen}
          animationType="fade"
          onRequestClose={() => setGradeDropdownOpen(false)}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setGradeDropdownOpen(false)}
          >
            <View style={styles.modalBox}>
              <Txt style={styles.modalTitle}>Select Grade</Txt>
              <ScrollView style={{ maxHeight: 280 }}>
                {availableGradesList.map((g) => (
                  <Pressable
                    key={g}
                    onPress={() => {
                      setSelectedGrade(g);
                      setGradeDropdownOpen(false);
                    }}
                    style={[
                      styles.modalOption,
                      selectedGrade === g && styles.modalOptionActive,
                    ]}
                  >
                    <Txt
                      style={[
                        styles.modalOptionText,
                        selectedGrade === g && styles.modalOptionTextActive,
                      ]}
                    >
                      {g}
                    </Txt>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </Pressable>
        </Modal>
      ) : null}

      {/* Brand Selector Modal */}
      {brandDropdownOpen ? (
        <Modal
          transparent
          visible={brandDropdownOpen}
          animationType="fade"
          onRequestClose={() => setBrandDropdownOpen(false)}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setBrandDropdownOpen(false)}
          >
            <View style={styles.modalBox}>
              <Txt style={styles.modalTitle}>Select Brand</Txt>
              <ScrollView style={{ maxHeight: 280 }}>
                {availableBrandsList.map((b) => (
                  <Pressable
                    key={b}
                    onPress={() => {
                      setSelectedBrand(b);
                      setBrandDropdownOpen(false);
                    }}
                    style={[
                      styles.modalOption,
                      selectedBrand === b && styles.modalOptionActive,
                    ]}
                  >
                    <Txt
                      style={[
                        styles.modalOptionText,
                        selectedBrand === b && styles.modalOptionTextActive,
                      ]}
                    >
                      {b}
                    </Txt>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </Pressable>
        </Modal>
      ) : null}

      {/* Sort Selector Modal */}
      {sortDropdownOpen ? (
        <Modal
          transparent
          visible={sortDropdownOpen}
          animationType="fade"
          onRequestClose={() => setSortDropdownOpen(false)}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setSortDropdownOpen(false)}
          >
            <View style={styles.modalBox}>
              <Txt style={styles.modalTitle}>Sort By</Txt>
              {['Recommended', 'Name A-Z', 'MOQ Low to High'].map((s) => (
                <Pressable
                  key={s}
                  onPress={() => {
                    setSortBy(s);
                    setSortDropdownOpen(false);
                  }}
                  style={[
                    styles.modalOption,
                    sortBy === s && styles.modalOptionActive,
                  ]}
                >
                  <Txt
                    style={[
                      styles.modalOptionText,
                      sortBy === s && styles.modalOptionTextActive,
                    ]}
                  >
                    {s}
                  </Txt>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

// -------------------------------------------------------------
// INDIVIDUAL DESKTOP PRODUCT CARD (EXACT MOCKUP)
// -------------------------------------------------------------
export function DesktopProductCard({ product: p, detail = false }: { product: Product; detail?: boolean }) {
  const { width } = useWindowDimensions();
  const mobile = width < 1000;
  const priceAccess = usePriceAccess();
  const saved = useStore((state) => state.saved.includes(p.id));
  const toggleSaved = useStore((state) => state.toggleSaved);
  const [sizeChoice, setSize] = useState('');
  const [manualSize, setManualSize] = useState(false);
  const [gradeChoice, setGrade] = useState('');
  const [buyerGrade, setBuyerGrade] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [picker, setPicker] = useState<'size' | 'grade' | 'buyerGrade' | null>(null);
  const [customText, setCustomText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const tmt = isTmtCategory(p.category);
  const steel = p.product_kind === 'steel';
  const sizes = useQuery({
    queryKey: ['catalog', 'selection-options', '', '', p.id],
    queryFn: () => catalogApi.selectionOptions(undefined, undefined, p.id),
    enabled: steel,
    staleTime: 30_000,
  });
  const size = sizeChoice || sizes.data?.sizes[0]?.label || '';
  const sizeId = sizes.data?.sizes.find((entry) => entry.label === size)?.id;
  const options = useQuery({
    queryKey: ['catalog', 'selection-options', '', sizeId ?? '', p.id],
    queryFn: () => catalogApi.selectionOptions(undefined, sizeId, p.id),
    enabled: steel && !!sizeId && !manualSize,
    staleTime: 30_000,
  });
  const gradeOptions = [...new Set((manualSize ? p.variants.map((v) => String(v.attributes.grade ?? '')) : (options.data?.options ?? []).map((o) => o.grade)).filter(Boolean))];
  const grade = gradeOptions.includes(gradeChoice) ? gradeChoice : gradeOptions[0] ?? '';
  const option = !manualSize ? options.data?.options.find((o) => o.grade === grade) : undefined;
  const unit = option?.uom ?? p.variants[0]?.uom ?? 'MT';
  const minimum = Number(option?.min_order_qty ?? p.moq ?? 1);
  const price = option ? selectionPrice(option) : null;
  const image = getCategoryImage(p.category) ?? (p.images[0] ? { uri: p.images[0].url } : undefined);

  async function addToQuote() {
    if (busy) return;
    setMessage('');
    if (!steel) { router.push(`/product/${p.id}`); return; }
    if (!size.trim() || !grade.trim()) { setMessage('Choose a size and grade first.'); return; }
    if (!Number.isFinite(quantity) || quantity < minimum) { setMessage(`Minimum order: ${minimum} ${unit}.`); return; }
    setBusy(true);
    try {
      const store = useStore.getState();
      if (manualSize) {
        const preview = await catalogApi.manualPreview(p.name, size, grade, p.id);
        if (preview.status === 'dimensions_required') throw new Error('Enter all dimensions in the required order.');
        store.addMaterial(p.id, quantity, {
          key: JSON.stringify([p.id, size, grade, 'manual']), name: p.name, size, grade, unit, minimum,
          manualRequest: { material: p.name, size, grade, uom: unit, product_id: p.id,
            grade_entry: preview.grades.includes(grade.toUpperCase()) ? 'list' : 'manual', expected_match: preview },
        });
      } else {
        const current = await catalogApi.selectionOptions(undefined, sizeId, p.id);
        const match = current.options.find((o) => o.id === option?.id && o.grade === grade);
        if (!match) throw new Error('Availability changed. Choose the size and grade again.');
        const currentPrice = priceAccess ? selectionPrice(match) : null;
        store.addMaterial(p.id, quantity, {
          key: JSON.stringify([match.id, tmt ? buyerGrade : '']), name: p.name, size,
          grade: tmt ? buyerGrade : grade, ...(tmt ? { brand: grade } : {}),
          unit: match.uom, minimum: Number(match.min_order_qty), optionId: match.id,
          ...(currentPrice ? { indicativePrice: { amount: Number(currentPrice.amount.replaceAll(',', '')), unit: currentPrice.unit, tax: currentPrice.tax } } : {}),
        });
      }
      setMessage('Added to quote');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to add material. Please retry.'); }
    finally { setBusy(false); }
  }

  const row = (label: string, value: string, target: 'size' | 'grade' | 'buyerGrade') => (
    <View style={styles.specLineRow}>
      <Txt style={styles.specLabel}>{label}</Txt>
      <Pressable accessibilityRole="button" accessibilityLabel={`Choose ${label.toLowerCase()} for ${p.name}`} style={styles.specDropdownPill} onPress={() => { setCustomText(''); setPicker(target); }}>
        <Txt style={styles.specDropdownText}>{value || `Select ${label.toLowerCase()}`}</Txt><Icon name="chevron-down" size={11} color="#64748B" />
      </Pressable>
    </View>
  );
  const pickerModal = (
    <Modal visible={picker !== null} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
      <View style={styles.modalOverlay}><View style={styles.modalBox}>
        <Txt style={styles.modalTitle}>{picker === 'size' ? 'Select size' : picker === 'buyerGrade' ? 'Optional grade' : tmt ? 'Select brand' : 'Select grade'}</Txt>
        <ScrollView style={{ maxHeight: 300 }}>
          {(picker === 'size' ? sizes.data?.sizes.map((s) => s.label) ?? [] : picker === 'grade' ? gradeOptions : []).map((value) => <Pressable key={value} style={styles.modalOption} onPress={() => {
            if (picker === 'size') { setSize(value); setManualSize(false); setGrade(''); } else { setGrade(value); }
            setPicker(null); setMessage('');
          }}><Txt style={styles.modalOptionText}>{value}</Txt></Pressable>)}
          {(picker === 'size' && sizes.isPending) || (picker === 'grade' && !manualSize && options.isPending) ? <Txt>Loading available choices...</Txt> : null}
          {(picker === 'size' && sizes.isError) || (picker === 'grade' && options.isError) ? <Pressable onPress={() => void (picker === 'size' ? sizes.refetch() : options.refetch())}><Txt>Could not load choices. Retry</Txt></Pressable> : null}
        </ScrollView>
        {picker === 'size' || picker === 'buyerGrade' ? <>
          <TextInput accessibilityLabel={picker === 'size' ? 'Enter size manually' : 'Enter optional grade'} placeholder={picker === 'size' ? 'Enter size manually (include units)' : 'Enter optional grade'} value={customText} maxLength={80} onChangeText={setCustomText} style={styles.specDropdownPill} />
          <Pressable style={styles.modalOption} onPress={() => { if (!customText.trim()) return; if (picker === 'size') { setSize(customText.trim()); setManualSize(true); setGrade(''); } else setBuyerGrade(customText.trim()); setPicker(null); }}><Txt>Use entered value</Txt></Pressable>
        </> : null}
        <Pressable style={styles.modalOption} onPress={() => setPicker(null)}><Txt>Close</Txt></Pressable>
      </View></View>
    </Modal>
  );
  const quantityControl = <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Decrease quantity for ${p.name}`} onPress={() => setQuantity(Math.max(minimum, quantity - 1))} style={{ width: 36, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F8FC', borderWidth: 1, borderColor: '#DFE7F0', borderRadius: 5 }}><Icon name="minus" size={16} color="#123657" /></Pressable>
    <TextInput accessibilityLabel={`Order quantity for ${p.name}`} keyboardType="decimal-pad" value={String(quantity)} onChangeText={(value) => { const next = Number(value); if (Number.isFinite(next) && next >= 0) setQuantity(next); }} onEndEditing={() => setQuantity(Math.max(minimum, quantity))} style={[m.input, { width: 72, minHeight: 40, paddingHorizontal: 5, textAlign: 'center', fontWeight: '700' }]} />
    <Pressable accessibilityRole="button" accessibilityLabel={`Increase quantity for ${p.name}`} onPress={() => setQuantity(Math.max(minimum, quantity + 1))} style={{ width: 36, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F8FC', borderWidth: 1, borderColor: '#DFE7F0', borderRadius: 5 }}><Icon name="plus" size={16} color="#123657" /></Pressable>
  </View>;
  const mobileChoice = (label: string, value: string, target: 'size' | 'grade' | 'buyerGrade') => <View style={{ flex: 1, minWidth: 0, gap: 5 }}><Txt style={{ color: '#123657', fontSize: 11 }}>{label}</Txt><Pressable accessibilityRole="button" accessibilityLabel={`Choose ${label.toLowerCase()} for ${p.name}`} onPress={() => { setCustomText(''); setPicker(target); }} style={[m.input, { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, minHeight: 40 }]}><Txt style={{ flex: 1, color: '#123657', fontSize: 11 }} numberOfLines={1}>{value || `Select ${label.toLowerCase()}`}</Txt><Icon name="chevron-down" size={12} color="#65788F" /></Pressable></View>;
  if (mobile) return <View style={detail ? { backgroundColor: '#FFFFFF' } : m.card}>
    {detail ? image ? <Image source={image} contentFit="cover" style={{ width: '100%', height: 240 }} /> : <View style={{ height: 200, backgroundColor: '#E8EDF3', alignItems: 'center', justifyContent: 'center' }}><Icon name="image" color="#65788F" /></View> : null}
    <View style={detail ? { padding: 14, gap: 14 } : { gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {!detail ? <Pressable accessibilityRole="link" accessibilityLabel={`View ${p.name}`} onPress={() => router.push(`/product/${p.id}`)}>{image ? <Image source={image} contentFit="cover" style={{ width: 100, height: 112, borderRadius: 5 }} /> : <View style={{ width: 100, height: 112, backgroundColor: '#EDF2F7' }} />}</Pressable> : null}
        <View style={{ flex: 1, gap: 8, minWidth: 0 }}>
          <Pressable accessibilityRole="link" onPress={() => { if (!detail) router.push(`/product/${p.id}`); }}><Txt style={[m.heading, detail && { fontSize: 24 }]}>{p.name}</Txt></Pressable>
          {p.description ? <Txt numberOfLines={detail ? undefined : 2} style={[m.muted, { fontSize: 11 }]}>{p.description}</Txt> : null}
          {!detail ? <View style={m.row}>{mobileChoice('Size', size, 'size')}{mobileChoice(tmt ? 'Brand' : 'Grade', grade, 'grade')}</View> : null}
        </View>
      </View>
      {detail ? <View style={m.row}>{mobileChoice('Size', size, 'size')}{mobileChoice(tmt ? 'Brand' : 'Grade', grade, 'grade')}{tmt ? mobileChoice('Grade', buyerGrade, 'buyerGrade') : null}</View> : null}
      <View style={[m.row, { justifyContent: 'space-between' }]}>
        <View style={{ gap: 5 }}><Txt style={{ color: '#123657', fontSize: 11 }}>MOQ</Txt><Txt style={{ color: '#123657', fontWeight: '700', fontSize: 13 }}>{minimum} {unit}</Txt><Txt style={{ color: '#65788F', fontSize: 10 }}>Minimum order</Txt></View>
        <View style={{ gap: 5 }}><Txt style={{ color: '#123657', fontSize: 11 }}>Quantity ({unit})</Txt>{quantityControl}</View>
      </View>
      <View style={[m.row, { justifyContent: 'space-between', flexWrap: 'wrap' }]}>
        {priceAccess ? <Txt style={{ color: '#ED222B', fontSize: 16, fontWeight: '800' }}>{price ? `₹${price.amount} / ${price.unit}` : 'Rate on request'}</Txt> : <Pressable onPress={() => router.push('/account?section=subscription')}><Txt style={{ color: '#ED222B', fontSize: 12, fontWeight: '700' }}>Subscribe for prices</Txt></Pressable>}
        <Pressable accessibilityRole="button" disabled={busy} accessibilityLabel={`Add ${p.name} to quote`} onPress={() => void addToQuote()} style={[m.action, detail && { width: '100%' }]}><Icon name="shopping-cart" color="#FFFFFF" size={19} /><Txt style={m.actionText}>{busy ? 'Adding...' : 'Add to quote'}</Txt></Pressable>
      </View>
      {message ? <View style={{ gap: 6 }}><Txt accessibilityLiveRegion="polite" style={m.muted}>{message}</Txt>{message === 'Added to quote' ? <Pressable onPress={() => router.push('/cart')}><Txt style={{ color: '#1260B6', fontWeight: '700' }}>Review requirement basket →</Txt></Pressable> : null}</View> : null}
    </View>
    {pickerModal}
  </View>;
  return <View style={[styles.card, detail && { width: '100%', padding: 20 }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Bookmark ${p.name}`} onPress={() => toggleSaved(p.id)} style={styles.cardBookmark}><Icon name="bookmark" size={16} color={saved ? '#00409A' : '#64748B'} /></Pressable>
    <View style={styles.cardTopContent}>
      <Pressable accessibilityRole="link" onPress={() => router.push(`/product/${p.id}`)} style={[styles.cardPhotoWrap, detail && { width: '38%', height: 260 }]}>
        {image ? <Image source={image} contentFit="cover" style={styles.cardPhoto} /> : <Icon name="box" size={32} />}
      </Pressable>
      <View style={styles.cardSpecsCol}>
        <Txt style={[styles.cardProductTitle, detail && { fontSize: 28 }]}>{p.name}</Txt>
        {detail && p.description ? <Txt style={{ color: '#64748B', fontSize: 13, marginBottom: 12 }}>{p.description}</Txt> : null}
        {row('Size', size, 'size')}
        {row(tmt ? 'Brand' : 'Grade', grade, 'grade')}
        {tmt ? row('Grade', buyerGrade, 'buyerGrade') : null}
        <View style={styles.cardDivider} />
        <Txt style={styles.moqNote}>Minimum order: {minimum} {unit}</Txt>
        <View style={styles.stepperLineRow}><Txt style={styles.specLabel}>Order quantity</Txt>
          <View style={styles.qtyStepperBox}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Decrease quantity for ${p.name}`} onPress={() => setQuantity(Math.max(minimum, quantity - 1))} style={styles.qtyStepBtn}><Icon name="minus" size={12} /></Pressable>
            <Txt style={styles.qtyValueText}>{quantity} {unit}</Txt>
            <Pressable accessibilityRole="button" accessibilityLabel={`Increase quantity for ${p.name}`} onPress={() => setQuantity(quantity + 1)} style={styles.qtyStepBtn}><Icon name="plus" size={12} /></Pressable>
          </View>
        </View>
      </View>
    </View>
    <View style={styles.cardDivider} />
    <View style={styles.cardBottomRow}>
      <View style={styles.cardBottomLeft}>{priceAccess ? <Txt style={styles.rateOnRequestText}>{price ? `₹${price.amount} / ${price.unit}` : 'Rate on request'}</Txt> : <SubscribeForPrices />}<Txt style={styles.rateSubText}>Final rate confirmed with your quote</Txt></View>
      <View style={styles.cardBottomRight}>
        <Pressable onPress={() => router.push(`/product/${p.id}`)} style={styles.specLink}><Txt style={styles.specLinkText}>Specifications</Txt></Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void addToQuote()} style={styles.addToQuoteBtn}><Icon name="shopping-cart" size={14} color="#FFFFFF" /><Txt style={styles.addToQuoteBtnText}>{busy ? 'Adding...' : 'Add to quote'}</Txt></Pressable>
      </View>
    </View>
    {message ? <Txt accessibilityLiveRegion="polite">{message}</Txt> : null}
    {pickerModal}
  </View>;
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
    paddingBottom: 90,
  },
  heroBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 28,
    paddingVertical: 22,
    boxShadow: 'none',
  },
  heroBannerLeft: {
    gap: 4,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0B1B36',
    letterSpacing: 0.5,
  },
  heroSubtitle: {
    fontSize: 13,
    color: '#64748B',
  },
  heroBannerRight: {
    alignItems: 'flex-end',
  },
  materialFamiliesBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255, 255, 255, 0.2)',
    paddingLeft: 20,
  },
  familiesNumber: {
    fontSize: 36,
    fontWeight: '900',
    color: '#0B1B36',
    lineHeight: 40,
  },
  familiesLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    lineHeight: 14,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    height: 48,
    gap: 16,
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
  },
  searchBox: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
  },
  centerTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    height: '100%',
  },
  tabBtn: {
    height: '100%',
    justifyContent: 'center',
    position: 'relative',
    paddingHorizontal: 4,
  },
  tabBtnActive: {},
  tabBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabBtnTextActive: {
    color: '#A70101',
    fontWeight: '700',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2.5,
    backgroundColor: '#A70101',
  },
  utilityActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderLeftWidth: 1,
    borderLeftColor: '#E2E8F0',
    paddingLeft: 16,
  },
  utilityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    position: 'relative',
  },
  utilityBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  cartCountBadge: {
    backgroundColor: '#A70101',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 2,
  },
  cartCountText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  mainLayout: {
    flexDirection: 'row',
    gap: 18,
    alignItems: 'flex-start',
  },
  filterSidebar: {
    width: 220,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    gap: 14,
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
  },
  // Pin to the shell's content scroll area. Keep lower controls reachable on
  // short desktop windows without moving the product column.
  stickyFilters: {
    position: 'sticky',
    top: 16,
    maxHeight: 'calc(100vh - 192px)',
    overflowY: 'auto',
  } as unknown as ViewStyle,
  filterSidebarTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  filterBlock: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 12,
    gap: 10,
  },
  filterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterHeaderLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  filterOptionsList: {
    gap: 8,
    marginTop: 2,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkboxBox: {
    width: 16,
    height: 16,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxBoxActive: {
    backgroundColor: '#00409A',
    borderColor: '#00409A',
  },
  checkboxLabel: {
    fontSize: 12,
    color: '#475569',
  },
  selectDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  selectDropdownText: {
    fontSize: 12,
    color: '#475569',
    flex: 1,
  },
  resetFiltersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 6,
  },
  resetFiltersText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#00409A',
  },
  productsArea: {
    flex: 1,
    gap: 14,
  },
  productsTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  materialsCount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  topBarRightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  viewToggleGroup: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 2,
  },
  viewToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 4,
  },
  viewToggleBtnActive: {
    backgroundColor: '#0B1B36',
  },
  viewToggleText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  viewToggleTextActive: {
    color: '#FFFFFF',
  },
  sortDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sortDropdownText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  desktopCardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  card: {
    width: '48.8%',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    position: 'relative',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
  },
  cardBookmark: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 3,
    padding: 4,
  },
  cardTopContent: {
    flexDirection: 'row',
    gap: 12,
    flex: 1,
    minHeight: 178,
  },
  cardPhotoWrap: {
    width: 106,
    height: 106,
    borderRadius: 6,
    overflow: 'hidden',
  },
  cardPhoto: {
    width: '100%',
    height: '100%',
  },
  cardSpecsCol: {
    flex: 1,
    minWidth: 0,
    gap: 5,
    paddingRight: 16,
  },
  cardProductTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  specLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  specLabel: {
    fontSize: 11,
    color: '#64748B',
    minWidth: 40,
  },
  specDropdownPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  specDropdownText: {
    fontSize: 11,
    color: '#0F172A',
    fontWeight: '600',
  },
  moqNote: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  stepperLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  qtyStepperBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 4,
  },
  qtyStepBtn: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValueText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
    paddingHorizontal: 6,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 10,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  cardBottomLeft: {
    gap: 2,
  },
  rateOnRequestText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#A70101',
  },
  rateSubText: {
    fontSize: 9.5,
    color: '#64748B',
  },
  cardBottomRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  specLink: {
    paddingVertical: 4,
  },
  specLinkText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#00409A',
  },
  addToQuoteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#A70101',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  addToQuoteBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  bottomIsoStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  bottomIsoText: {
    fontSize: 11.5,
    color: '#475569',
  },
  bottomIsoLink: {
    fontWeight: '700',
    color: '#00409A',
  },
  stickyQuoteBasket: {
    position: 'sticky',
    bottom: 16,
    zIndex: 10,
  } as unknown as ViewStyle,
  quoteBasketBar: {
    backgroundColor: '#0B1B36',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.15)',
    zIndex: 99,
  },
  quoteBasketLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quoteBasketText: {
    fontSize: 13,
    color: '#FFFFFF',
  },
  quoteBasketRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flexWrap: 'wrap',
    minWidth: 0,
  },
  reviewQuoteBtn: {
    backgroundColor: '#A70101',
    borderRadius: 6,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  reviewQuoteBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  quoteDisclaimerText: {
    fontSize: 10.5,
    color: '#94A3B8',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBox: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  modalOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  modalOptionActive: {
    backgroundColor: '#EEF4FC',
  },
  modalOptionText: {
    fontSize: 13,
    color: '#0F172A',
  },
  modalOptionTextActive: {
    fontWeight: '700',
    color: '#00409A',
  },
});
