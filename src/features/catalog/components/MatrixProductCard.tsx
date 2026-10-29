import { useState, useMemo } from 'react';
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
import { Button, Icon, Txt } from '@shared/ui';
import { useStore } from '@core/state/workspace-store';
import type { Product, Variant } from '../model/types';
import { getCategoryImage } from './category-images';
import { rawMaterialDetails } from '../model/raw-material-details';
import { selectionPrice } from '../model/material-selection';
import { formatTractorPrice, tractorPricing } from '../model/tractor-pricing';
import { isTmtCategory } from '../model/tmt';
import { companyCertificate } from '@shared/config/company-certificates';

function extractIndividualSizes(variants: Variant[]): string[] {
  const set = new Set<string>();

  for (const v of variants) {
    const attrs = (v.attributes || {}) as Record<string, unknown>;
    // 1. Explicit available_sizes list: e.g. [16, 17, 18, ..., 80]
    if (Array.isArray(attrs.available_sizes) && attrs.available_sizes.length) {
      for (const item of attrs.available_sizes) {
        if (typeof item === 'number' || typeof item === 'string') {
          const s = String(item).trim();
          if (s) set.add(`${s.toUpperCase().replace(/MM$/, '')}MM`);
        }
      }
    } else if (v.diameter_mm) {
      set.add(`${v.diameter_mm}MM`);
    } else if (attrs.size_group && typeof attrs.size_group === 'string') {
      set.add(attrs.size_group.trim().toUpperCase());
    } else if (v.size_label) {
      const raw = v.size_label;
      const clean = raw.includes(' / ') ? raw.split(' / ').pop()?.trim() : raw.trim();
      if (clean) set.add(clean.toUpperCase());
    }
  }

  // Sort numerically: 16MM, 17MM, ..., 80MM
  return Array.from(set).sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
    const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
    if (numA !== numB) return numA - numB;
    return a.localeCompare(b);
  });
}

export function MatrixProductCard({ product: p }: { product: Product }) {
  const saved = useStore((state) => state.saved.includes(p.id));
  const toggle = useStore((state) => state.toggleSaved);
  const add = useStore((state) => state.add);
  const addMaterial = useStore((state) => state.addMaterial);
  const setCatalogProducts = useStore((state) => state.setCatalogProducts);
  const cart = useStore((state) => state.cart);
  const inCart = useMemo(
    () => cart.some((line) => line.productId === p.id),
    [cart, p.id],
  );

  const tmt = isTmtCategory(p.category);
  const tractor = p.product_kind === 'tractor_part';
  const profile = rawMaterialDetails(p);
  const variants = p.variants.length ? p.variants : [];

  // Extract available sizes: e.g. 16MM, 17MM, 18MM, ..., 80MM
  const availableSizes = useMemo(() => {
    const list = extractIndividualSizes(variants);
    if (!list.length && profile?.size) list.push(profile.size);
    if (!list.length) list.push('Standard Size');
    return list;
  }, [variants, profile?.size]);

  const availableBrandsOrGrades = useMemo(() => {
    const list = [
      ...new Set(
        variants
          .map((v) =>
            String(
              tmt
                ? (v.attributes?.brand ?? v.attributes?.grade ?? '')
                : (v.attributes?.grade ?? v.attributes?.brand ?? ''),
            ),
          )
          .filter(Boolean),
      ),
    ];
    if (!list.length && p.brand) list.push(p.brand);
    if (!list.length && p.grade) list.push(p.grade);
    if (!list.length) list.push(tmt ? 'Primary Mill' : 'Standard Grade');
    return list;
  }, [variants, tmt, p.brand, p.grade]);

  // Separate states for size, brand/grade, and tonnage
  const [selectedSize, setSelectedSize] = useState<string>(
    availableSizes[0] ?? 'Standard Size',
  );
  const [selectedBrandOrGrade, setSelectedBrandOrGrade] = useState<string>(
    availableBrandsOrGrades[0] ?? (tmt ? 'Primary Mill' : 'Standard Grade'),
  );
  const [tonnage, setTonnage] = useState<number>(1);

  // Modal & manual entry states
  const [sizePickerOpen, setSizePickerOpen] = useState(false);
  const [sizeTab, setSizeTab] = useState<'preset' | 'custom'>('preset');
  const [manualSizeText, setManualSizeText] = useState('');

  const [brandPickerOpen, setBrandPickerOpen] = useState(false);
  const [brandTab, setBrandTab] = useState<'preset' | 'custom'>('preset');
  const [manualBrandText, setManualBrandText] = useState('');

  const [added, setAdded] = useState(false);
  const isAdded = inCart || added;
  const [certModalOpen, setCertModalOpen] = useState(false);
  const [detailPopupOpen, setDetailPopupOpen] = useState(false);

  const isCustomSize = !availableSizes.includes(selectedSize);
  const isCustomBrand = !availableBrandsOrGrades.includes(selectedBrandOrGrade);

  // Match corresponding variant
  const selectedVariant: Variant | undefined = useMemo(() => {
    const targetNum = parseInt(selectedSize.replace(/\D/g, ''), 10);

    return (
      variants.find((v) => {
        const attrs = (v.attributes || {}) as Record<string, unknown>;
        const g = String(attrs.grade ?? attrs.brand ?? p.grade ?? '');
        if (g !== selectedBrandOrGrade) return false;

        if (Array.isArray(attrs.available_sizes) && targetNum) {
          if (attrs.available_sizes.map(Number).includes(targetNum)) return true;
        }
        if (v.diameter_mm && v.diameter_mm === targetNum) return true;
        const sGroup = String(attrs.size_group ?? '').toUpperCase();
        if (sGroup && sGroup === selectedSize.toUpperCase()) return true;
        const vClean = (v.size_label || '').split(' / ').pop()?.trim().toUpperCase();
        return vClean === selectedSize.toUpperCase();
      }) ??
      variants.find((v) => {
        const attrs = (v.attributes || {}) as Record<string, unknown>;
        const g = String(attrs.grade ?? attrs.brand ?? p.grade ?? '');
        return g === selectedBrandOrGrade;
      }) ??
      variants.find((v) => {
        const attrs = (v.attributes || {}) as Record<string, unknown>;
        if (Array.isArray(attrs.available_sizes) && targetNum) {
          if (attrs.available_sizes.map(Number).includes(targetNum)) return true;
        }
        return false;
      }) ??
      variants[0]
    );
  }, [variants, selectedSize, selectedBrandOrGrade, p.grade]);

  const image =
    getCategoryImage(p.category) ??
    (p.images[0] ? { uri: p.images[0].url } : undefined);

  const selectedPrice = selectedVariant
    ? selectionPrice({
        id: selectedVariant.id,
        product_id: p.id,
        product_name: p.name,
        grade: String(selectedVariant.attributes?.grade ?? p.grade ?? ''),
        variant_id: selectedVariant.id,
        uom: selectedVariant.uom,
        min_order_qty: selectedVariant.min_order_qty,
        attributes: selectedVariant.attributes,
      })
    : null;

  const tractorPrice =
    tractor && selectedVariant ? tractorPricing(selectedVariant) : null;

  const unitRateNumber = selectedPrice
    ? Number(selectedPrice.amount.replaceAll(',', ''))
    : null;

  const totalPrice =
    unitRateNumber && Number.isFinite(unitRateNumber)
      ? Math.round(unitRateNumber * tonnage).toLocaleString('en-IN')
      : null;

  const open = () => setDetailPopupOpen(true);

  const handleAddToCart = () => {
    setCatalogProducts([p]);
    const uom = selectedVariant?.uom ?? 'MT';
    const moq = selectedVariant?.min_order_qty ?? 1;
    const finalQty = Math.max(moq, tonnage);

    if (p.product_kind === 'steel') {
      addMaterial(p.id, finalQty, {
        key: `${p.id}-${selectedSize}-${selectedBrandOrGrade}`,
        name: p.name,
        size: selectedSize,
        grade: selectedBrandOrGrade,
        ...(tmt ? { brand: selectedBrandOrGrade } : {}),
        unit: uom,
        minimum: moq,
        ...(selectedPrice
          ? {
              indicativePrice: {
                amount: unitRateNumber ?? 0,
                unit: selectedPrice.unit,
                tax: selectedPrice.tax,
              },
            }
          : {}),
        optionId: selectedVariant?.id,
        manualRequest:
          isCustomSize || isCustomBrand
            ? {
                grade_entry: isCustomBrand ? 'manual' : 'list',
                material: p.name,
                size: selectedSize,
                grade: selectedBrandOrGrade,
                uom,
                product_id: p.id,
                expected_match: {
                  status: isCustomBrand ? 'unlisted_grade' : 'available',
                  size_status: isCustomSize ? 'exact' : 'exact',
                  category: null,
                  matched_size: null,
                  grades: [selectedBrandOrGrade],
                  option: null,
                },
              }
            : undefined,
      });
    } else {
      add(p.id, finalQty, selectedVariant?.id);
    }

    setAdded(true);
    setTimeout(() => setAdded(false), 2200);
  };

  return (
    <View style={styles.wrapper}>
      {/* PamWill Signature Header Label */}
      <Txt style={styles.sectionLabel}>
        {tractor
          ? 'TRACTOR SPARES / SPECIFICATIONS'
          : 'RAW MATERIAL / SPECIFICATIONS'}
      </Txt>

      <View
        style={styles.card}
        testID={tractor ? 'matrix-tractor-card' : 'matrix-product-card'}
      >
        {/* Top Header: ISO Badge + Company Certification + Photo + Product Info */}
        <View style={styles.topRow}>
          {/* Left Column: ISO 9001 Badge + Caption + Product Photo */}
          <View style={styles.leftCol}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View ISO 9001:2015 Registration Certificate"
              onPress={() => setCertModalOpen(true)}
              style={({ pressed }) => [
                styles.badgeTopWrap,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Image
                source={{ uri: companyCertificate.badge_cdn_url || 'https://ftis.b-cdn.net/icons/iso-9001-certified-badge.png' }}
                style={styles.badgeTopImg}
                contentFit="contain"
                accessibilityLabel="ISO 9001 Certified Badge"
              />
              <Txt style={styles.badgeTopCaption}>Company certification</Txt>
            </Pressable>

            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`View ${p.name}`}
              onPress={open}
            >
              {image ? (
                <Image
                  source={image}
                  contentFit={tractor ? 'contain' : 'cover'}
                  accessibilityLabel={p.name}
                  style={styles.image}
                />
              ) : (
                <View
                  style={[
                    styles.image,
                    { alignItems: 'center', justifyContent: 'center' },
                  ]}
                >
                  <Icon name="box" size={28} color="#64748B" />
                </View>
              )}
            </Pressable>
          </View>

          <View style={styles.headerContent}>
            <View style={styles.badgeRow}>
              <Txt numberOfLines={1} style={styles.badge}>
                {tmt
                  ? 'TMT BAR'
                  : selectedBrandOrGrade
                    ? selectedBrandOrGrade.toUpperCase()
                    : p.category.toUpperCase()}
              </Txt>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${saved ? 'Unsave' : 'Save'} ${p.name}`}
                accessibilityState={{ selected: saved }}
                onPress={() => toggle(p.id)}
                style={styles.bookmarkBtn}
              >
                <Icon
                  name="bookmark"
                  size={19}
                  color={saved ? '#00409A' : '#00409A'}
                />
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`View specifications for ${p.name}`}
              onPress={open}
            >
              <Txt style={styles.title}>{p.name}</Txt>
            </Pressable>

            <Txt numberOfLines={2} style={styles.caption}>
              {p.description ||
                profile?.materials ||
                'Choose size and brand. Add a grade if required.'}
            </Txt>
          </View>
        </View>

        {/* EXACT PAMWILL 3-COLUMN CREAM/TAUPE SPECS STRIP */}
        {/* Made directly interactive: 1. SIZE RANGE drop, 2. MIN ORDER stepper, 3. BRANDS/GRADE drop */}
        <View style={styles.specsStrip}>
          {/* Column 1: SIZE RANGE (Clickable Dropdown / Manual Entry) */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Choose Size. Current: ${selectedSize}`}
            onPress={() => {
              setSizeTab('preset');
              setSizePickerOpen(true);
            }}
            style={styles.specCol}
          >
            <Txt style={styles.specLabel}>SIZE RANGE</Txt>
            <View style={styles.specValueRow}>
              <Txt numberOfLines={1} style={styles.specValue}>
                {selectedSize}
              </Txt>
              <Icon name="chevron-down" size={12} color="#00409A" />
            </View>
          </Pressable>

          <View style={styles.colDivider} />

          {/* Column 2: MIN ORDER / TONNAGE (Interactive Stepper) */}
          <View style={styles.specCol}>
            <Txt style={styles.specLabel}>MIN ORDER</Txt>
            <View style={styles.stepperRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Decrease tons"
                onPress={() => setTonnage((prev) => Math.max(1, prev - 1))}
                style={styles.stepBtn}
              >
                <Icon name="minus" size={11} color="#00409A" />
              </Pressable>
              <Txt style={styles.specValueTonnage}>{tonnage} MT</Txt>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Increase tons"
                onPress={() => setTonnage((prev) => prev + 1)}
                style={styles.stepBtn}
              >
                <Icon name="plus" size={11} color="#00409A" />
              </Pressable>
            </View>
          </View>

          <View style={styles.colDivider} />

          {/* Column 3: BRANDS / GRADE (Clickable Dropdown / Manual Entry) */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Choose ${tmt ? 'Brand' : 'Grade'}. Current: ${selectedBrandOrGrade}`}
            onPress={() => {
              setBrandTab('preset');
              setBrandPickerOpen(true);
            }}
            style={styles.specCol}
          >
            <Txt style={styles.specLabel}>{tmt ? 'BRANDS' : 'GRADES'}</Txt>
            <View style={styles.specValueRow}>
              <Txt numberOfLines={1} style={styles.specValue}>
                {selectedBrandOrGrade}
              </Txt>
              <Icon name="chevron-down" size={12} color="#00409A" />
            </View>
          </Pressable>
        </View>

        {/* Fast Bulk Tonnage Selector Pills */}
        <View style={styles.quickBulkRow}>
          <Txt style={styles.quickBulkLabel}>Quick tons:</Txt>
          {[1, 5, 10, 25].map((tons) => (
            <Pressable
              key={tons}
              accessibilityRole="button"
              accessibilityLabel={`${tons} MT`}
              onPress={() => setTonnage(tons)}
              style={[
                styles.bulkPill,
                tonnage === tons && styles.bulkPillActive,
              ]}
            >
              <Txt
                style={[
                  styles.bulkPillText,
                  tonnage === tons && styles.bulkPillTextActive,
                ]}
              >
                {tons} MT
              </Txt>
            </Pressable>
          ))}
          {isCustomSize || isCustomBrand ? (
            <View style={styles.customBadgePill}>
              <Txt style={styles.customBadgePillText}>Custom Spec</Txt>
            </View>
          ) : null}
        </View>

        {/* PAMWILL DUAL-LAYERED PRICE CAPSULE */}
        {/* Replaces quotation barrier ("Subscribe for live prices") with live mill rate & real-time total */}
        <View style={styles.priceOuterBox}>
          <View style={styles.priceInnerCard}>
            <View style={styles.priceLeft}>
              <View style={styles.liveIndicator}>
                <View style={styles.liveDot} />
                <Txt style={styles.liveBadgeText}>LIVE BENCHMARK</Txt>
              </View>
              <Txt style={styles.unitRate}>
                {selectedPrice
                  ? `₹${selectedPrice.amount} / ${selectedPrice.unit}`
                  : tractorPrice
                    ? formatTractorPrice(
                        tractorPrice.discounted ?? tractorPrice.base,
                      )
                    : 'Direct Factory Rate'}
              </Txt>
            </View>

            <View style={styles.priceRight}>
              <Txt style={styles.estLabel}>ESTIMATED TOTAL</Txt>
              <Txt style={styles.estTotal}>
                {totalPrice
                  ? `₹${totalPrice}`
                  : `${tonnage} MT dispatch`}
              </Txt>
            </View>
          </View>
        </View>

        {/* BOTTOM ACTION: Proceed to Checkout (for added product) or Direct Add to Cart */}
        {isAdded ? (
          <View style={styles.actionRowContainer}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Add another ${tmt ? 'TMT' : tractor ? 'spare' : 'item'} (${tonnage} ${tractor ? 'units' : 'MT'})`}
              onPress={handleAddToCart}
              style={({ pressed }) => [
                styles.addMoreBtn,
                pressed && { opacity: 0.75 },
              ]}
            >
              <Icon name={added ? 'check' : 'plus'} size={14} color="#00409A" />
              <Txt style={styles.addMoreText}>
                {added
                  ? `Added! (+${tonnage} ${tractor ? 'units' : 'MT'})`
                  : `Add another ${tmt ? 'TMT' : tractor ? 'spare' : 'size'} (${tonnage} ${tractor ? 'units' : 'MT'})`}
              </Txt>
            </Pressable>
            <Button
              icon="arrow-right"
              onPress={() => router.push('/checkout')}
              style={styles.checkoutButton}
            >
              Proceed to checkout
            </Button>
          </View>
        ) : (
          <Button
            icon="shopping-cart"
            onPress={handleAddToCart}
            style={styles.actionButton}
          >
            {`Add ${tonnage} ${tractor ? 'units' : 'MT'} to cart`}
          </Button>
        )}

        {/* Company ISO 9001:2015 Strip with View Certificate Option */}
        <View style={styles.isoCardStrip}>
          <View style={styles.isoCardLeft}>
            <Icon name="shield" size={18} color="#16A34A" />
            <View style={{ gap: 1 }}>
              <Txt style={styles.isoCompanyText}>
                Company <Txt style={styles.isoStandardText}>{companyCertificate.standard}</Txt>
              </Txt>
              <Txt style={styles.isoSubText}>{companyCertificate.scope}</Txt>
            </View>
          </View>

          <View style={styles.isoDivider} />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View ISO 9001:2015 Certificate"
            onPress={() => setCertModalOpen(true)}
            style={({ pressed }) => [
              styles.viewCertBtn,
              pressed && { opacity: 0.75 },
            ]}
          >
            <Icon name="file-text" size={15} color="#00409A" />
            <Txt style={styles.viewCertText}>View certificate</Txt>
          </Pressable>
        </View>



  
      {/* Product Detail Quickview Pop-up Modal (replaces navigating to ugly page) */}
      {detailPopupOpen ? (
        <Modal
          transparent
          visible={detailPopupOpen}
          animationType="fade"
          onRequestClose={() => setDetailPopupOpen(false)}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setDetailPopupOpen(false)}
          >
            <Pressable
              style={styles.popupCard}
              onPress={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <View style={styles.popupHeader}>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Txt style={styles.badge}>
                      {tmt ? 'TMT BAR' : (p.category ? p.category.toUpperCase() : 'STEEL')}
                    </Txt>
                    <Txt style={styles.popupIsoTag}>ISO 9001:2015</Txt>
                  </View>
                  <Txt style={styles.popupTitle}>{p.name}</Txt>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  onPress={() => setDetailPopupOpen(false)}
                  style={{ padding: 6 }}
                >
                  <Icon name="x" size={22} color="#64748B" />
                </Pressable>
              </View>

              <ScrollView
                style={{ maxHeight: 440 }}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ gap: 12 }}
              >
                {/* Product Photo with Angled Ribbon */}
                <View style={styles.popupImageWrap}>
                  {image ? (
                    <Image
                      source={image}
                      contentFit="cover"
                      style={styles.popupImage}
                      accessibilityLabel={p.name}
                    />
                  ) : (
                    <View style={[styles.popupImage, { alignItems: 'center', justifyContent: 'center' }]}>
                      <Icon name="box" size={40} color="#64748B" />
                    </View>
                  )}
                  <Image
                    source={{ uri: companyCertificate.badge_cdn_url || 'https://ftis.b-cdn.net/icons/iso-9001-certified-badge.png' }}
                    style={styles.popupRibbonImg}
                    contentFit="contain"
                    accessibilityLabel="ISO 9001 Certified"
                  />
                </View>

                {/* Description & Technical Summary */}
                <View style={styles.popupDescBox}>
                  <Txt style={styles.popupDescText}>
                    {p.description || profile?.materials || 'Industrial supply specification from Fieldfast Tech International. Full Mill-Test Certificate (MTC) batch verified.'}
                  </Txt>
                  <View style={styles.popupDispatchRow}>
                    <Icon name="map-pin" size={13} color="#00409A" />
                    <Txt style={styles.popupDispatchText}>
                      Dispatched from Ludhiana Area-C Works • Pan-India Delivery
                    </Txt>
                  </View>
                </View>

                {/* Specs Selection Bar (Size, Tonnage, Grade) */}
                <View style={styles.specsStrip}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setSizeTab('preset');
                      setSizePickerOpen(true);
                    }}
                    style={styles.specCol}
                  >
                    <Txt style={styles.specLabel}>SIZE RANGE</Txt>
                    <View style={styles.specValueRow}>
                      <Txt numberOfLines={1} style={styles.specValue}>{selectedSize}</Txt>
                      <Icon name="chevron-down" size={12} color="#00409A" />
                    </View>
                  </Pressable>

                  <View style={styles.colDivider} />

                  <View style={styles.specCol}>
                    <Txt style={styles.specLabel}>MIN ORDER</Txt>
                    <View style={styles.stepperRow}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setTonnage((prev) => Math.max(1, prev - 1))}
                        style={styles.stepBtn}
                      >
                        <Icon name="minus" size={11} color="#00409A" />
                      </Pressable>
                      <Txt style={styles.specValueTonnage}>{tonnage} MT</Txt>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setTonnage((prev) => prev + 1)}
                        style={styles.stepBtn}
                      >
                        <Icon name="plus" size={11} color="#00409A" />
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.colDivider} />

                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setBrandTab('preset');
                      setBrandPickerOpen(true);
                    }}
                    style={styles.specCol}
                  >
                    <Txt style={styles.specLabel}>{tmt ? 'BRANDS' : 'GRADES'}</Txt>
                    <View style={styles.specValueRow}>
                      <Txt numberOfLines={1} style={styles.specValue}>{selectedBrandOrGrade}</Txt>
                      <Icon name="chevron-down" size={12} color="#00409A" />
                    </View>
                  </Pressable>
                </View>

                {/* Quick Bulk Tons */}
                <View style={styles.quickBulkRow}>
                  <Txt style={styles.quickBulkLabel}>Quick tons:</Txt>
                  {[1, 5, 10, 25].map((tons) => (
                    <Pressable
                      key={tons}
                      onPress={() => setTonnage(tons)}
                      style={[styles.bulkPill, tonnage === tons && styles.bulkPillActive]}
                    >
                      <Txt style={[styles.bulkPillText, tonnage === tons && styles.bulkPillTextActive]}>
                        {tons} MT
                      </Txt>
                    </Pressable>
                  ))}
                </View>

                {/* Price Box */}
                <View style={styles.priceOuterBox}>
                  <View style={styles.priceInnerCard}>
                    <View style={styles.priceLeft}>
                      <View style={styles.liveIndicator}>
                        <View style={styles.liveDot} />
                        <Txt style={styles.liveBadgeText}>LIVE BENCHMARK</Txt>
                      </View>
                      <Txt style={styles.unitRate}>
                        {selectedPrice
                          ? `₹${selectedPrice.amount} / ${selectedPrice.unit}`
                          : tractorPrice
                            ? formatTractorPrice(tractorPrice.discounted ?? tractorPrice.base)
                            : 'Direct Factory Rate'}
                      </Txt>
                    </View>

                    <View style={styles.priceRight}>
                      <Txt style={styles.estLabel}>ESTIMATED TOTAL</Txt>
                      <Txt style={styles.estTotal}>
                        {totalPrice ? `₹${totalPrice}` : `${tonnage} MT dispatch`}
                      </Txt>
                    </View>
                  </View>
                </View>
              </ScrollView>

              {/* Action Button */}
              {isAdded ? (
                <View style={styles.actionRowContainer}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Add another ${tmt ? 'TMT' : tractor ? 'spare' : 'item'} (${tonnage} ${tractor ? 'units' : 'MT'})`}
                    onPress={handleAddToCart}
                    style={({ pressed }) => [
                      styles.addMoreBtn,
                      pressed && { opacity: 0.75 },
                    ]}
                  >
                    <Icon name={added ? 'check' : 'plus'} size={14} color="#00409A" />
                    <Txt style={styles.addMoreText}>
                      {added
                        ? `Added! (+${tonnage} ${tractor ? 'units' : 'MT'})`
                        : `Add another ${tmt ? 'TMT' : tractor ? 'spare' : 'size'} (${tonnage} ${tractor ? 'units' : 'MT'})`}
                    </Txt>
                  </Pressable>
                  <Button
                    icon="arrow-right"
                    onPress={() => {
                      setDetailPopupOpen(false);
                      router.push('/checkout');
                    }}
                    style={styles.checkoutButton}
                  >
                    Proceed to checkout
                  </Button>
                </View>
              ) : (
                <Button
                  icon="shopping-cart"
                  onPress={handleAddToCart}
                  style={styles.actionButton}
                >
                  {`Add ${tonnage} ${tractor ? 'units' : 'MT'} to cart`}
                </Button>
              )}
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

            {/* Modal 1: Choose Size (Presets or Manual Custom Entry) */}
        {sizePickerOpen ? (
          <Modal
            transparent
            visible={sizePickerOpen}
            animationType="fade"
            onRequestClose={() => setSizePickerOpen(false)}
          >
            <Pressable
              style={styles.modalOverlay}
              onPress={() => setSizePickerOpen(false)}
            >
              <Pressable
                style={styles.modalCard}
                onPress={(e) => e.stopPropagation()}
              >
                <View style={styles.modalHeader}>
                  <Txt style={styles.modalTitle}>Choose or Enter Size</Txt>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setSizePickerOpen(false)}
                    style={{ padding: 4 }}
                  >
                    <Icon name="x" size={20} color="#64748B" />
                  </Pressable>
                </View>

                {/* Segmented Mode Tabs: Presets vs Manual Entry */}
                <View style={styles.modalTabRow}>
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityState={{ selected: sizeTab === 'preset' }}
                    onPress={() => setSizeTab('preset')}
                    style={[
                      styles.modalTab,
                      sizeTab === 'preset' && styles.modalTabActive,
                    ]}
                  >
                    <Txt
                      style={[
                        styles.modalTabText,
                        sizeTab === 'preset' && styles.modalTabTextActive,
                      ]}
                    >
                      Preset Sizes
                    </Txt>
                  </Pressable>
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityState={{ selected: sizeTab === 'custom' }}
                    onPress={() => setSizeTab('custom')}
                    style={[
                      styles.modalTab,
                      sizeTab === 'custom' && styles.modalTabActive,
                    ]}
                  >
                    <Txt
                      style={[
                        styles.modalTabText,
                        sizeTab === 'custom' && styles.modalTabTextActive,
                      ]}
                    >
                      + Enter Manually
                    </Txt>
                  </Pressable>
                </View>

                {sizeTab === 'preset' ? (
                  <ScrollView
                    style={{ maxHeight: 260 }}
                    showsVerticalScrollIndicator={false}
                  >
                    {availableSizes.map((size) => {
                      const isSelected = size === selectedSize;
                      return (
                        <Pressable
                          key={size}
                          accessibilityRole="button"
                          accessibilityLabel={size}
                          onPress={() => {
                            setSelectedSize(size);
                            setSizePickerOpen(false);
                          }}
                          style={[
                            styles.modalOption,
                            isSelected && styles.modalOptionActive,
                          ]}
                        >
                          <Txt
                            style={[
                              styles.modalOptionText,
                              isSelected && styles.modalOptionTextActive,
                            ]}
                          >
                            {size}
                          </Txt>
                          {isSelected ? (
                            <Icon name="check" size={18} color="#00409A" />
                          ) : null}
                        </Pressable>
                      );
                    })}
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setSizeTab('custom')}
                      style={styles.manualEntryLink}
                    >
                      <Icon name="edit-2" size={13} color="#00409A" />
                      <Txt style={styles.manualEntryLinkText}>
                        Need a custom size? Enter manually
                      </Txt>
                    </Pressable>
                  </ScrollView>
                ) : (
                  <View style={styles.manualEntryContainer}>
                    <Txt style={styles.manualEntryLabel}>
                      ENTER CUSTOM SIZE / DIAMETER
                    </Txt>
                    <TextInput
                      accessibilityLabel="Enter custom size"
                      placeholder="e.g. 14mm, 28mm, 45mm, 32 x 32"
                      placeholderTextColor="#94A3B8"
                      value={manualSizeText}
                      onChangeText={setManualSizeText}
                      style={styles.manualInput}
                      autoFocus
                    />
                    <Button
                      style={styles.applyBtn}
                      onPress={() => {
                        if (manualSizeText.trim()) {
                          setSelectedSize(manualSizeText.trim());
                          setSizePickerOpen(false);
                        }
                      }}
                    >
                      Apply Custom Size
                    </Button>
                  </View>
                )}
              </Pressable>
            </Pressable>
          </Modal>
        ) : null}


        {/* ISO Certificate Modal */}
        {certModalOpen ? (
          <Modal
            transparent
            visible={certModalOpen}
            animationType="fade"
            onRequestClose={() => setCertModalOpen(false)}
          >
            <Pressable
              style={styles.modalOverlay}
              onPress={() => setCertModalOpen(false)}
            >
              <Pressable
                style={[styles.modalCard, { maxWidth: 440 }]}
                onPress={(e) => e.stopPropagation()}
              >
                <View style={styles.modalHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Icon name="award" size={20} color="#16A34A" />
                    <View>
                      <Txt style={styles.modalTitle}>Company ISO 9001:2015</Txt>
                      <Txt style={{ fontSize: 11, color: '#64748B' }}>
                        Certificate No. {companyCertificate.certificate_number}
                      </Txt>
                    </View>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                    onPress={() => setCertModalOpen(false)}
                    style={{ padding: 4 }}
                  >
                    <Icon name="x" size={20} color="#64748B" />
                  </Pressable>
                </View>

                <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
                  <Image
                    source={{ uri: companyCertificate.cdn_url }}
                    style={styles.certImage}
                    contentFit="contain"
                    accessibilityLabel="ISO 9001:2015 Registration Certificate"
                  />

                  <View style={styles.certMetaCard}>
                    <Txt style={styles.certMetaOrg}>{companyCertificate.organization}</Txt>
                    <Txt style={styles.certMetaDetail}>
                      Accreditation: {companyCertificate.accreditation}
                    </Txt>
                    <Txt style={styles.certMetaDetail}>
                      Valid Through: March 2028 · Verified by {companyCertificate.issuer}
                    </Txt>
                  </View>
                </ScrollView>

                <Button
                  style={styles.applyBtn}
                  onPress={() => setCertModalOpen(false)}
                >
                  Done
                </Button>
              </Pressable>
            </Pressable>
          </Modal>
        ) : null}

        {/* Modal 2: Choose Brand / Grade (Presets or Manual Custom Entry) */}
        {brandPickerOpen ? (
          <Modal
            transparent
            visible={brandPickerOpen}
            animationType="fade"
            onRequestClose={() => setBrandPickerOpen(false)}
          >
            <Pressable
              style={styles.modalOverlay}
              onPress={() => setBrandPickerOpen(false)}
            >
              <Pressable
                style={styles.modalCard}
                onPress={(e) => e.stopPropagation()}
              >
                <View style={styles.modalHeader}>
                  <Txt style={styles.modalTitle}>
                    {tmt ? 'Choose or Enter Brand' : 'Choose or Enter Grade'}
                  </Txt>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setBrandPickerOpen(false)}
                    style={{ padding: 4 }}
                  >
                    <Icon name="x" size={20} color="#64748B" />
                  </Pressable>
                </View>

                {/* Segmented Mode Tabs: Presets vs Manual Entry */}
                <View style={styles.modalTabRow}>
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityState={{ selected: brandTab === 'preset' }}
                    onPress={() => setBrandTab('preset')}
                    style={[
                      styles.modalTab,
                      brandTab === 'preset' && styles.modalTabActive,
                    ]}
                  >
                    <Txt
                      style={[
                        styles.modalTabText,
                        brandTab === 'preset' && styles.modalTabTextActive,
                      ]}
                    >
                      {tmt ? 'Preset Brands' : 'Preset Grades'}
                    </Txt>
                  </Pressable>
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityState={{ selected: brandTab === 'custom' }}
                    onPress={() => setBrandTab('custom')}
                    style={[
                      styles.modalTab,
                      brandTab === 'custom' && styles.modalTabActive,
                    ]}
                  >
                    <Txt
                      style={[
                        styles.modalTabText,
                        brandTab === 'custom' && styles.modalTabTextActive,
                      ]}
                    >
                      + Enter Manually
                    </Txt>
                  </Pressable>
                </View>

                {brandTab === 'preset' ? (
                  <ScrollView
                    style={{ maxHeight: 260 }}
                    showsVerticalScrollIndicator={false}
                  >
                    {availableBrandsOrGrades.map((bg) => {
                      const isSelected = bg === selectedBrandOrGrade;
                      return (
                        <Pressable
                          key={bg}
                          accessibilityRole="button"
                          accessibilityLabel={bg}
                          onPress={() => {
                            setSelectedBrandOrGrade(bg);
                            setBrandPickerOpen(false);
                          }}
                          style={[
                            styles.modalOption,
                            isSelected && styles.modalOptionActive,
                          ]}
                        >
                          <Txt
                            style={[
                              styles.modalOptionText,
                              isSelected && styles.modalOptionTextActive,
                            ]}
                          >
                            {bg}
                          </Txt>
                          {isSelected ? (
                            <Icon name="check" size={18} color="#00409A" />
                          ) : null}
                        </Pressable>
                      );
                    })}
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setBrandTab('custom')}
                      style={styles.manualEntryLink}
                    >
                      <Icon name="edit-2" size={13} color="#00409A" />
                      <Txt style={styles.manualEntryLinkText}>
                        {tmt
                          ? 'Need another mill brand? Enter manually'
                          : 'Need a specific grade? Enter manually'}
                      </Txt>
                    </Pressable>
                  </ScrollView>
                ) : (
                  <View style={styles.manualEntryContainer}>
                    <Txt style={styles.manualEntryLabel}>
                      {tmt
                        ? 'ENTER CUSTOM BRAND / MILL'
                        : 'ENTER CUSTOM GRADE'}
                    </Txt>
                    <TextInput
                      accessibilityLabel="Enter custom grade or brand"
                      placeholder={
                        tmt
                          ? 'e.g. Tata Tiscon, JSW Neosteel, Kamdhenu'
                          : 'e.g. Fe 600, IS 2062 E350, EN24, SAE 1018'
                      }
                      placeholderTextColor="#94A3B8"
                      value={manualBrandText}
                      onChangeText={setManualBrandText}
                      style={styles.manualInput}
                      autoFocus
                    />
                    <Button
                      style={styles.applyBtn}
                      onPress={() => {
                        if (manualBrandText.trim()) {
                          setSelectedBrandOrGrade(manualBrandText.trim());
                          setBrandPickerOpen(false);
                        }
                      }}
                    >
                      {tmt ? 'Apply Custom Brand' : 'Apply Custom Grade'}
                    </Button>
                  </View>
                )}
              </Pressable>
            </Pressable>
          </Modal>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  isoCardStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginTop: 4,
  },
  isoCardLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  isoCompanyText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#16A34A',
  },
  isoStandardText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  isoSubText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#64748B',
  },
  isoDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#CBD5E1',
    marginHorizontal: 8,
  },
  viewCertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  viewCertText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#00409A',
  },
  certImage: {
    width: '100%',
    height: 280,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  certMetaCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    gap: 3,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  certMetaOrg: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  certMetaDetail: {
    fontSize: 11,
    color: '#64748B',
  },
  popupCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    gap: 14,
    boxShadow: '0 12px 30px rgba(0, 0, 0, 0.2)',
  },
  popupHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  popupIsoTag: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803D',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  popupTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  popupImageWrap: {
    position: 'relative',
    width: '100%',
    height: 170,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
  },
  popupImage: {
    width: '100%',
    height: '100%',
  },
  popupRibbonImg: {
    position: 'absolute',
    top: -4,
    left: -4,
    width: 96,
    height: 38,
    transform: [{ rotate: '-12deg' }],
  },
  popupDescBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  popupDescText: {
    fontSize: 12.5,
    lineHeight: 18,
    color: '#475569',
  },
  popupDispatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  popupDispatchText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#00409A',
  },
  wrapper: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334E68',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 2,
  },
  card: {
    flex: 1,
    minWidth: 0,
    padding: 16,
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    boxShadow: '0 2px 10px rgba(16, 24, 40, 0.04)',
  },
  topRow: {
    flexDirection: 'row',
    gap: 14,
  },
  leftCol: {
    gap: 6,
    alignItems: 'flex-start',
  },
  badgeTopWrap: {
    gap: 2,
    alignItems: 'flex-start',
  },
  badgeTopImg: {
    width: 96,
    height: 38,
  },
  badgeTopCaption: {
    fontSize: 10.5,
    fontWeight: '500',
    color: '#64748B',
    paddingLeft: 2,
  },
  image: {
    width: 92,
    height: 92,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  headerContent: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  badgeRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 'auto',
  },
  ribbonPressable: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ribbonBadgeImg: {
    width: 86,
    height: 34,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    flexShrink: 1,
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: '700',
    color: '#00409A',
    backgroundColor: '#EEF4FC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    letterSpacing: 0.4,
  },
  isoVerifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  isoVerifiedText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#A70101',
    letterSpacing: 0.3,
  },
  bookmarkBtn: {
    padding: 4,
  },
  title: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  caption: {
    fontSize: 12.5,
    lineHeight: 18,
    color: '#64748B',
    fontWeight: '400',
  },
  specsStrip: {
    backgroundColor: '#F5EFEB',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#EAE1D7',
  },
  specCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  specLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  specValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    maxWidth: '100%',
  },
  specValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  colDivider: {
    width: 1,
    height: 26,
    backgroundColor: '#DFD5CB',
    marginHorizontal: 4,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  stepBtn: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D4C9BD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  specValueTonnage: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    minWidth: 38,
    textAlign: 'center',
  },
  quickBulkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: -4,
  },
  quickBulkLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  bulkPill: {
    paddingVertical: 2.5,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  bulkPillActive: {
    backgroundColor: '#00409A',
    borderColor: '#00409A',
  },
  bulkPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  bulkPillTextActive: {
    color: '#FFFFFF',
  },
  customBadgePill: {
    marginLeft: 'auto',
    backgroundColor: '#EEF4FC',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  customBadgePillText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#00409A',
  },
  priceOuterBox: {
    backgroundColor: '#EEF4FC',
    borderRadius: 8,
    padding: 6,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  priceInnerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  priceLeft: {
    gap: 2,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
  },
  liveBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#166534',
    letterSpacing: 0.4,
  },
  unitRate: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#00409A',
  },
  priceRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  estLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.4,
  },
  estTotal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginTop: 2,
  },
  actionButton: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: '#00409A',
    borderColor: '#00409A',
  },
  checkoutButton: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: '#A70101',
    borderColor: '#A70101',
  },
  actionRowContainer: {
    gap: 8,
  },
  addMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
  },
  addMoreText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#00409A',
  },
  addedButton: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: '#15803D',
    borderColor: '#15803D',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    gap: 12,
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  modalTabRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 3,
    gap: 4,
  },
  modalTab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  modalTabActive: {
    backgroundColor: '#FFFFFF',
    boxShadow: '0 1px 3px rgba(16, 24, 40, 0.05)',
  },
  modalTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  modalTabTextActive: {
    fontWeight: '700',
    color: '#00409A',
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  modalOptionActive: {
    borderColor: '#00409A',
    backgroundColor: '#EEF4FC',
  },
  modalOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  modalOptionTextActive: {
    fontWeight: '700',
    color: '#00409A',
  },
  manualEntryLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 4,
  },
  manualEntryLinkText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#00409A',
  },
  manualEntryContainer: {
    gap: 12,
    paddingVertical: 8,
  },
  manualEntryLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: '#64748B',
  },
  manualInput: {
    height: 48,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#F8FAFC',
  },
  applyBtn: {
    backgroundColor: '#00409A',
    borderRadius: 8,
    minHeight: 44,
  },
});
