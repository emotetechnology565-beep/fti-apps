import { supabase } from '@core/api/supabase-client';
import { useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useStore } from '@core/state/workspace-store';
import { useAuth } from '@features/auth/ui';
import { catalogApi } from '@features/catalog/export';
import { commerceApi } from '@features/orders';
import { Button, Icon, Txt } from '@shared/ui';
import { companyCertificate } from '@shared/config/company-certificates';
import { FastenerRequirementSummary } from '@features/cart/components/FastenerRequirementSummary';
import type { MaterialCartSelection } from '@features/cart/model/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useBasketPricing } from '@features/cart/hooks/use-basket-pricing';
import { basketQuantitySummary } from '@features/cart/model/quantity-summary';
import { SubscribeForPrices } from '@features/subscriptions/SubscribeForPrices';
import { MobileMaterialCheckout } from '../components/MobileMaterialCheckout';

type GuidedSubmission = {
  id: string;
  fingerprint: string;
  productId: string;
  variantId?: string;
  material: MaterialCartSelection;
  quantity: number;
  acknowledged: boolean;
  reference?: string;
};

const newRequest = () =>
  globalThis.crypto?.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const n = Math.floor(Math.random() * 16);
    return (ch === 'x' ? n : (n & 3) | 8).toString(16);
  });

export function Checkout() {
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ pincode?: string; notes?: string }>();
  const auth = useAuth();
  const client = useQueryClient();
  const cart = useStore((state) => state.cart);
  const catalogProducts = useStore((state) => state.catalogProducts);
  const quantity = useStore((state) => state.quantity);
  const hasMaterials = cart.some((line) => line.material);
  const [fastenerCheckout, setFastenerCheckout] = useState(false);
  const hasFastenerRequirements = fastenerCheckout || cart.some(line => line.material?.fastenerRequirement);

  const [buyer, setBuyer] = useState(auth.identity?.profile.full_name ?? '');
  const [business, setBusiness] = useState(
    auth.identity?.businesses[0]?.legal_name ?? '',
  );
  const [consent, setConsent] = useState(true);
  const [attempted, setAttempted] = useState(false);
  const [addressChoice, setAddress] = useState('');
  const [addAddressOpen, setShowAddAddress] = useState(false);

  // New address form fields
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState(typeof params.pincode === 'string' && /^[1-9]\d{5}$/.test(params.pincode) ? params.pincode : '');

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [references, setReferences] = useState<string[]>([]);
  const request = useRef({ fingerprint: '', id: newRequest() });

  const addresses = useQuery({
    queryKey: ['commerce', 'addresses', auth.session?.user.id],
    queryFn: commerceApi.addresses,
    retry: false,
  });

  const available = addresses.data?.filter((item) => !item.business_id) ?? [];

  const address = available.some(item => item.id === addressChoice)
    ? addressChoice
    : available[0]?.id ?? '';
  const showAddAddress = addAddressOpen || (!addresses.isPending && available.length === 0);

  const { prices, subtotal: estimatedTotal, priceAccess, loading: pricesLoading, unpriced } = useBasketPricing(cart, catalogProducts);
  const { tonnes: totalTonnes, otherUnits } = basketQuantitySummary(cart, catalogProducts);

  async function saveAddress() {
    setBusy(true);
    setMessage('');
    try {
      const id = await commerceApi.saveAddress(line1, city, state, pincode);
      setAddress(id);
      setLine1('');
      setCity('');
      setState('');
      setPincode('');
      setShowAddAddress(false);
      await client.invalidateQueries({ queryKey: ['commerce', 'addresses'] });
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (
      busy ||
      !address ||
      !cart.length ||
      cart.some((line) => !line.material && !line.variantId)
    )
      return;

    const lines = cart
      .filter((line) => !line.material)
      .map((line) => ({
        variant_id: line.variantId!,
        qty: String(line.quantity),
      }));

    const destination = available.find((item) => item.id === address);
    if (!destination) {
      setMessage('Please select a delivery address.');
      return;
    }

    if (
      hasMaterials &&
      (buyer.trim().length < 2 ||
        buyer.trim().length > 80 ||
        !business.trim() ||
        business.trim().length > 80 ||
        !consent)
    ) {
      setMessage(
        'Please enter buyer name and business name, and agree to WhatsApp updates.',
      );
      return;
    }

    const location = [
      destination.line1,
      destination.city,
      destination.pincode,
    ].join(', ');

    if (hasMaterials && location.length > 100) {
      setMessage(
        'Use a delivery address of up to 100 characters for raw material requests.',
      );
      return;
    }

    const fingerprint = JSON.stringify({
      address,
      lines,
      materials: cart.filter((line) => line.material),
      buyer,
      business,
      consent,
    });

    if (request.current.fingerprint !== fingerprint)
      request.current = { fingerprint, id: newRequest() };

    setBusy(true);
    setAttempted(true);
    if (hasFastenerRequirements) setFastenerCheckout(true);
    setMessage('');

    try {
      // Save each guided request ID before the network call. A timeout may mean
      // the server committed, so a retry must use the identical ID and payload,
      // including after navigating back to the basket or reloading the page.
      const submissionStorageKey = `fti-fastener-submissions-${auth.session?.user.id ?? 'guest'}`;
      const savedSubmissions = await AsyncStorage.getItem(submissionStorageKey);
      const saved: GuidedSubmission[] = savedSubmissions ? JSON.parse(savedSubmissions) : [];
      if (!Array.isArray(saved) || saved.some(entry => !entry?.id || !entry.fingerprint || !entry.material?.key)) {
        throw new Error('Saved quotation submission status is unavailable. Contact FTI before submitting again.');
      }
      const guidedSubmissions = new Map(saved.map(entry => [entry.material.key, entry]));
      const persistSubmissions = () => AsyncStorage.setItem(submissionStorageKey, JSON.stringify([...guidedSubmissions.values()]));
      for (const pending of guidedSubmissions.values()) {
        if (!pending.acknowledged && !cart.some(line => line.material?.key === pending.material.key)) {
          throw new Error(`${pending.material.name}: a previous request for ${pending.quantity} ${pending.material.unit} is awaiting confirmation. Restore the original requirement in your basket or contact FTI with request ID ${pending.id} before submitting a changed requirement.`);
        }
      }
      const submittedReferences = [...guidedSubmissions.values()].filter(entry => entry.acknowledged && entry.reference).map(entry => entry.reference!);
      for (const line of cart.filter((line) => line.material)) {
        const item = line.material!;
        const details = {
          name: buyer.trim(),
          business: business.trim(),
          location,
          whatsapp_consent: consent,
        };
        let id = '';
        let materialResult: { reference?: string } | undefined;
        if (!item.fastenerRequirement) {
          const { indicativePrice: _displayPrice, ...specification } = item;
          void _displayPrice;
          const fingerprint = JSON.stringify({ item: specification, quantity: line.quantity, buyer: details });
          let attempt = guidedSubmissions.get(item.key);
          if (attempt && attempt.fingerprint !== fingerprint) {
            throw new Error(`${item.name}: restore the original quantity and buyer details before retrying the saved request ${attempt.id}. Contact FTI before changing an unconfirmed request.`);
          }
          if (attempt?.acknowledged) {
            quantity(line.productId, 0, line.variantId);
            continue;
          }
          if (!attempt) {
            attempt = { id: newRequest(), fingerprint, productId: line.productId, variantId: line.variantId, material: item, quantity: line.quantity, acknowledged: false };
            guidedSubmissions.set(item.key, attempt);
            await persistSubmissions();
          }
          id = attempt.id;
        }

        if (item.fastenerRequirement) {
          if (!supabase) throw new Error('Ordering service is not configured.');
          const payloadFingerprint = JSON.stringify({ requirement: item.fastenerRequirement, quantity: line.quantity, buyer: details });
          let submission = guidedSubmissions.get(item.key);
          if (submission && submission.fingerprint !== payloadFingerprint) {
            throw new Error(submission.acknowledged
              ? `${item.name}: quotation ${submission.reference ?? submission.id} was already received for ${submission.quantity} pieces. Contact FTI to change that request rather than submitting it again.`
              : `${item.name}: the earlier submission for ${submission.quantity} pieces has an unconfirmed outcome. Restore the original quantity and buyer details before retrying; the same request ID will be reused. Contact FTI with request ID ${submission.id} for changes.`);
          }
          if (submission?.acknowledged) {
            quantity(line.productId, 0, line.variantId);
            continue;
          }
          if (!submission) {
            submission = { id: newRequest(), fingerprint: payloadFingerprint, productId: line.productId, variantId: line.variantId, material: item, quantity: line.quantity, acknowledged: false };
            guidedSubmissions.set(item.key, submission);
            await persistSubmissions();
          }
          const { data, error } = await supabase.rpc(
            'fti_catalog_fastener_requirement_submit',
            { p_id: submission.id, p_requirement: item.fastenerRequirement, p_quantity: line.quantity, p_buyer: details },
          );
          if (error) {
            // These are explicit server rejections, so the transaction did not
            // commit and the buyer may correct the requirement before retrying.
            // Transport errors keep the saved ID and immutable fingerprint.
            if (['22023', '42501', 'P0001', 'P0002', 'PGRST202'].includes(error.code ?? '')) {
              guidedSubmissions.delete(item.key);
              await persistSubmissions();
            }
            throw new Error(error.code === 'PGRST202'
              ? 'Fastener quotation requests need the latest database update. Contact FTI to complete this request.'
              : error.message);
          }
          submission.acknowledged = true;
          if (typeof data?.reference === 'string') {
            submission.reference = data.reference;
            submittedReferences.push(data.reference);
          }
          await persistSubmissions();
          // Remove only acknowledged lines immediately. If a later item fails,
          // returning to the basket cannot submit the successful item twice.
          quantity(line.productId, 0, line.variantId);
        } else if (item.fastenerRequest) {
          if (!supabase) throw new Error('Ordering service is not configured.');
          const fastener = item.fastenerRequest;
          const { error } = await supabase.rpc(
            'fti_catalog_fastener_order_submit',
            {
              p_id: id,
              p_definition: fastener.definition,
              p_revision: fastener.revision,
              p_input: fastener.input,
              p_grade: fastener.grade,
              p_quantity: line.quantity,
              p_with_nut: fastener.withNut,
              p_buyer: details,
            },
          );
          if (error) throw new Error(error.message);
        } else if (item.manualRequest) {
          materialResult = await catalogApi.submitManual(
            id,
            item.manualRequest,
            String(line.quantity),
            details,
          );
        } else if (item.catalogVariantId || (item.optionId && item.key.startsWith(`${line.productId}-`))) {
          // Matrix cards historically stored a variant UUID as an option UUID.
          // Resolve the exact size/grade through current server availability.
          const catalogue = await catalogApi.selectionOptions(undefined, undefined, line.productId);
          const normalize = (value: string) => value.toUpperCase().replace(/\s+/g, '');
          const size = catalogue.sizes.find((entry) => normalize(entry.label) === normalize(item.size));
          if (!size) throw new Error(`${item.name}: ${item.size} is unavailable. Remove this item and select an available size from the catalogue.`);
          const availableOptions = await catalogApi.selectionOptions(undefined, size.id, line.productId);
          const matches = availableOptions.options.filter((entry) =>
            normalize(entry.grade) === normalize(item.brand ?? item.grade) && entry.uom === item.unit,
          );
          if (matches.length !== 1) throw new Error(`${item.name}: select this size and grade again from the catalogue before ordering.`);
          materialResult = await catalogApi.submitSelection(id, matches[0].id, String(line.quantity), details);
        } else if (item.optionId) {
          materialResult = await catalogApi.submitSelection(
            id,
            item.optionId,
            String(line.quantity),
            {
              ...details,
              ...(item.brand ? { requested_grade: item.grade } : {}),
            },
          );
        } else {
          throw new Error(
            'Remove the unavailable material and add it again from the catalogue.',
          );
        }
        if (!item.fastenerRequirement) {
          const receipt = guidedSubmissions.get(item.key)!;
          receipt.acknowledged = true;
          receipt.reference = materialResult?.reference ?? receipt.id;
          submittedReferences.push(receipt.reference);
          await persistSubmissions();
          quantity(line.productId, 0, line.variantId);
        }
      }

      if (lines.length)
        await commerceApi.placeCart(request.current.id, address, lines);

      setReferences([...new Set(submittedReferences)]);
      for (const line of cart) quantity(line.productId, 0, line.variantId);
      setSubmitted(true);
      await AsyncStorage.removeItem(submissionStorageKey);
      await client.invalidateQueries({ queryKey: ['commerce'] });
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (submitted)
    return (
      <View style={styles.resultContainer}>
        <View style={styles.successCard}>
          <View style={styles.successIconWrap}>
            <Icon name="check" size={32} color="#15803D" />
          </View>
          <Txt style={styles.successTitle}>{references.length ? 'Quotation request submitted' : 'Order Submitted Successfully!'}</Txt>
          <Txt style={styles.successDesc}>
            {references.length ? 'FTI has received your requirements and will confirm specifications, availability and pricing before you place an order.' : <>Your requisition has been dispatched to FTI Ludhiana Central Works.
            Our engineers will verify heat batch certificates, road freight, and
            confirm the final invoice before requesting any payment.</>}
          </Txt>
          {references.length ? <View style={{ gap: 8 }}>
            <Txt style={{ fontWeight: '700', color: '#0B1B36' }}>Request reference{references.length === 1 ? '' : 's'}</Txt>
            {references.map(reference => <Txt key={reference} selectable style={{ color: '#00409A', fontSize: 12 }}>{reference}</Txt>)}
          </View> : null}
          <View style={styles.successNoticeBox}>
            <Icon name="message-circle" size={18} color="#15803D" />
            <Txt style={styles.successNoticeText}>
              {references.length ? 'FTI will send request updates to your verified WhatsApp number.' : 'Updates & Mill Test Certificate (MTC) will be dispatched directly to your WhatsApp.'}
            </Txt>
          </View>
          <Button
            icon="file-text"
            onPress={() => router.push('/orders')}
            style={styles.ordersBtn}
          >
            View orders & dispatch status
          </Button>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/products')}
            style={styles.continueLink}
          >
            <Txt style={styles.continueLinkText}>Browse more materials</Txt>
          </Pressable>
        </View>
      </View>
    );

  if (!cart.length)
    return (
      <View style={styles.resultContainer}>
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconWrap}>
            <Icon name="shopping-cart" size={32} color="#64748B" />
          </View>
          <Txt style={styles.emptyTitle}>Your cart is empty</Txt>
          <Txt style={styles.emptyDesc}>
            Add TMT bars, steel sections, tractor components, or customized
            industrial fasteners before proceeding to checkout.
          </Txt>
          <Button
            icon="arrow-right"
            onPress={() => router.push('/products')}
            style={styles.browseBtn}
          >
            Browse Materials Catalogue
          </Button>
        </View>
      </View>
    );

  const isFormValid =
    (!hasMaterials ||
      (consent && buyer.trim().length >= 2 && business.trim().length >= 2)) &&
    available.some((item) => item.id === address) &&
    !cart.some((line) => !line.material && !line.variantId);

  if (width < 1000) return <MobileMaterialCheckout
    cart={cart} products={catalogProducts} prices={prices} priceAccess={priceAccess} loadingPrices={pricesLoading} subtotal={estimatedTotal}
    buyer={buyer} setBuyer={setBuyer} business={business} setBusiness={setBusiness}
    phone={auth.identity?.profile.phone ?? auth.session?.user.phone ?? ''} consent={consent} setConsent={setConsent}
    addresses={available} selectedAddress={address} setAddress={setAddress} loadingAddresses={addresses.isPending} addressError={addresses.error?.message}
    line1={line1} setLine1={setLine1} city={city} setCity={setCity} state={state} setState={setState} pincode={pincode} setPincode={setPincode}
    saveAddress={saveAddress} submit={submit} attempted={attempted} busy={busy} valid={isFormValid} message={message}
  />;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. LUXURY PAMWILL SIGNATURE HEADER & STEP PROGRESS */}
      <View style={styles.header}>
        <View style={styles.headerBadgeRow}>
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Txt style={styles.liveText}>FTI INDUSTRIAL CHECKOUT</Txt>
          </View>
          <Txt style={styles.stepCounterText}>STEP 2 OF 3</Txt>
        </View>

        <Txt style={styles.title}>{hasFastenerRequirements ? 'Review quotation request' : 'Review & Dispatch Requisition'}</Txt>
        <Txt style={styles.subtitle}>
          {hasFastenerRequirements ? 'Confirm your fastener requirements, buyer details and delivery address. FTI will review specifications, availability, pricing, GST and freight before confirming your quotation.' : 'Admin confirms live mill rates, GST, and freight charges. No upfront payment is required until final batch confirmation.'}
        </Txt>

        {/* 3-Step Stepper Bar */}
        <View style={styles.stepperRow}>
          <View style={styles.stepItem}>
            <View style={[styles.stepBar, styles.stepBarDone]} />
            <Txt style={styles.stepDoneLabel}>1. Cart Lots ✓</Txt>
          </View>
          <View style={styles.stepItem}>
            <View style={[styles.stepBar, styles.stepBarActive]} />
            <Txt style={styles.stepActiveLabel}>2. Buyer & Delivery</Txt>
          </View>
          <View style={styles.stepItem}>
            <View style={styles.stepBar} />
            <Txt style={styles.stepPendingLabel}>{hasFastenerRequirements ? '3. Quotation confirmation' : '3. Dispatch Confirmation'}</Txt>
          </View>
        </View>
      </View>

      {/* 2. ORDER SUMMARY CARD: Show exact items added to cart */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleWrap}>
            <Icon name="package" size={18} color="#00409A" />
            <Txt style={styles.cardTitle}>
              Configured Items ({cart.length})
            </Txt>
          </View>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/cart')}
            style={styles.editCartLink}
          >
            <Txt style={styles.editCartText}>Edit Cart</Txt>
          </Pressable>
        </View>

        <View style={styles.itemsList}>
          {cart.map((line, idx) => {
            const mat = line.material;
            const p = catalogProducts.find((item) => item.id === line.productId);
            const variant = line.variantId
              ? p?.variants.find((v) => v.id === line.variantId)
              : p?.variants[0];

            const name = mat?.name ?? p?.name ?? 'Industrial Supply Item';
            const size =
              mat?.size ?? variant?.size_label ?? variant?.sku ?? 'Standard';
            const grade = mat?.grade ?? mat?.brand ?? p?.grade ?? 'Primary Mill';
            const unit = mat?.unit ?? variant?.uom ?? 'MT';
            const linePrice = prices[idx]?.total.toLocaleString('en-IN', { maximumFractionDigits: 2 }) ?? null;

            return (
              <View
                key={mat?.key ?? `${line.productId}-${line.variantId}-${idx}`}
                style={[
                  styles.itemRow,
                  idx === cart.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                <View style={styles.itemLeft}>
                  <View style={styles.itemBadgeRow}>
                    <Txt style={styles.itemKindBadge}>
                      {mat?.fastenerRequest || mat?.fastenerRequirement
                        ? 'FASTENER'
                        : mat
                          ? 'RAW MATERIAL'
                          : 'TRACTOR SPARE'}
                    </Txt>
                    {mat?.brand ? (
                      <Txt style={styles.itemBrandBadge}>{mat.brand}</Txt>
                    ) : null}
                  </View>
                  <Txt style={styles.itemName} numberOfLines={1}>
                    {name}
                  </Txt>
                  <Txt style={styles.itemSpecText}>
                    Spec: <Txt style={styles.itemSpecBold}>{size}</Txt> • Grade:{' '}
                    <Txt style={styles.itemSpecBold}>{grade}</Txt>
                  </Txt>
                  {mat?.fastenerRequirement ? <FastenerRequirementSummary material={mat} editable /> : null}
                </View>

                <View style={styles.itemRight}>
                  <Txt style={styles.itemQtyText}>
                    {line.quantity} {unit}
                  </Txt>
                  <Txt style={styles.itemPriceText}>
                    {linePrice ? `₹${linePrice}` : 'Rate on invoice'}
                  </Txt>
                </View>
              </View>
            );
          })}
        </View>

        {/* Totals & Dispatch Strip */}
        <View style={styles.summaryStrip}>
          <View style={styles.summaryMetric}>
            <Txt style={styles.metricLabel}>TOTAL TONNAGE</Txt>
            <Txt style={styles.metricValue}>
              {totalTonnes > 0 ? `${totalTonnes.toLocaleString('en-IN', { maximumFractionDigits: 3 })} MT` : `${cart.length} Lots`}
            </Txt>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryMetric}>
            <Txt style={styles.metricLabel}>ESTIMATED MATERIAL</Txt>
            <Txt style={styles.metricValue}>
              {priceAccess && estimatedTotal > 0
                ? `₹${Math.round(estimatedTotal).toLocaleString('en-IN')}`
                : priceAccess ? (pricesLoading ? 'Loading current rates?' : 'Quotation required') : 'Subscription required'}
            </Txt>
          </View>
        </View>
      </View>

      {Object.keys(otherUnits).length ? <Txt style={styles.subtitle}>{Object.entries(otherUnits).map(([unit, qty]) => `${qty} ${unit}`).join(' ? ')} listed separately from tonnage.</Txt> : null}
      {!priceAccess ? <SubscribeForPrices /> : unpriced > 0 ? <Txt style={styles.subtitle}>{unpriced} item(s) require quotation. Subtotal includes priced items only.</Txt> : null}
      <View style={styles.card}>
        <Txt style={styles.cardTitle}>Payment by bank transfer</Txt>
        <Txt style={styles.subtitle}>FTI will confirm availability, the final amount and bank instructions before payment. Transfer outside the app by NEFT / RTGS. Accounts staff manually verify receipt; submitting a reference does not confirm payment.</Txt>
      </View>

      {/* 3. BUYER DETAILS CARD */}
      {hasMaterials ? (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleWrap}>
              <Icon name="user" size={18} color="#00409A" />
              <Txt style={styles.cardTitle}>Buyer & Company Details</Txt>
            </View>
          </View>

          <View style={styles.formGroup}>
            <Txt style={styles.fieldLabel}>FULL NAME *</Txt>
            <TextInput
              accessibilityLabel="Buyer name"
              value={buyer}
              onChangeText={setBuyer}
              editable={!attempted}
              placeholder="e.g. Rahul Sharma"
              placeholderTextColor="#94A3B8"
              style={styles.input}
            />
          </View>

          <View style={styles.formGroup}>
            <Txt style={styles.fieldLabel}>COMPANY / LEGAL ENTITY NAME *</Txt>
            <TextInput
              accessibilityLabel="Company name"
              value={business}
              onChangeText={setBusiness}
              editable={!attempted}
              placeholder="e.g. Sharma Precision Engineering Pvt Ltd"
              placeholderTextColor="#94A3B8"
              style={styles.input}
            />
          </View>

          {/* WhatsApp Notification Agreement Box */}
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: consent }}
            onPress={() => {
              if (!attempted) setConsent(!consent);
            }}
            style={[
              styles.whatsappBox,
              consent && styles.whatsappBoxActive,
            ]}
          >
            <View
              style={[
                styles.checkbox,
                consent && styles.checkboxActive,
              ]}
            >
              {consent ? <Icon name="check" size={13} color="#FFFFFF" /> : null}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="message-circle" size={15} color="#15803D" />
                <Txt style={styles.whatsappTitle}>
                  {hasFastenerRequirements ? 'WhatsApp quotation updates' : 'WhatsApp Dispatch & MTC Updates'}
                </Txt>
              </View>
              <Txt style={styles.whatsappDesc}>
                {hasFastenerRequirements ? 'Receive updates about your quotation request and specification confirmation on WhatsApp.' : <>Receive certified Mill Test Certificates (MTC), dispatch photos,
                and weight-bridge slips on your WhatsApp.</>}
              </Txt>
            </View>
          </Pressable>
        </View>
      ) : null}

      {/* 4. DELIVERY ADDRESS CARD */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleWrap}>
            <Icon name="map-pin" size={18} color="#00409A" />
            <Txt style={styles.cardTitle}>Delivery Destination</Txt>
          </View>
          {available.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowAddAddress(!showAddAddress)}
              style={styles.toggleAddressBtn}
            >
              <Icon
                name={showAddAddress ? 'x' : 'plus'}
                size={13}
                color="#00409A"
              />
              <Txt style={styles.toggleAddressText}>
                {showAddAddress ? 'Cancel' : 'New Address'}
              </Txt>
            </Pressable>
          ) : null}
        </View>

        {addresses.isPending ? (
          <View style={{ paddingVertical: 14, alignItems: 'center' }}>
            <Txt style={{ color: '#64748B', fontSize: 13 }}>
              Loading saved addresses...
            </Txt>
          </View>
        ) : addresses.error ? (
          <Txt style={styles.errorText}>{addresses.error.message}</Txt>
        ) : available.length > 0 ? (
          <View style={{ gap: 8 }}>
            {available.map((item) => {
              const isSelected = item.id === address;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => {
                    if (!attempted) setAddress(item.id);
                  }}
                  style={[
                    styles.addressCard,
                    isSelected && styles.addressCardActive,
                  ]}
                >
                  <View
                    style={[
                      styles.radioCircle,
                      isSelected && styles.radioCircleActive,
                    ]}
                  >
                    {isSelected ? <View style={styles.radioDot} /> : null}
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt style={styles.addressLine1}>{item.line1}</Txt>
                    <Txt style={styles.addressLine2}>
                      {item.city}, {item.state ? `${item.state} - ` : ''}
                      {item.pincode}
                    </Txt>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {/* Inline Add Address Form */}
        {showAddAddress || available.length === 0 ? (
          <View style={styles.newAddressForm}>
            <Txt style={styles.newAddressHeader}>Add New Delivery Address</Txt>

            <View style={styles.formGroup}>
              <Txt style={styles.fieldLabel}>STREET / INDUSTRIAL AREA *</Txt>
              <TextInput
                accessibilityLabel="Street address"
                placeholder="Plot / Shed no., Street, Industrial Estate"
                placeholderTextColor="#94A3B8"
                value={line1}
                onChangeText={setLine1}
                style={styles.input}
              />
            </View>

            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Txt style={styles.fieldLabel}>CITY *</Txt>
                <TextInput
                  accessibilityLabel="City"
                  placeholder="e.g. Ludhiana"
                  placeholderTextColor="#94A3B8"
                  value={city}
                  onChangeText={setCity}
                  style={styles.input}
                />
              </View>

              <View style={[styles.formGroup, { flex: 1 }]}>
                <Txt style={styles.fieldLabel}>STATE *</Txt>
                <TextInput
                  accessibilityLabel="State"
                  placeholder="e.g. Punjab"
                  placeholderTextColor="#94A3B8"
                  value={state}
                  onChangeText={setState}
                  style={styles.input}
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Txt style={styles.fieldLabel}>INDIAN PIN CODE (6 DIGITS) *</Txt>
              <TextInput
                accessibilityLabel="PIN code"
                placeholder="e.g. 141003"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                maxLength={6}
                value={pincode}
                onChangeText={setPincode}
                style={styles.input}
              />
            </View>

            <Button
              secondary
              disabled={
                attempted ||
                busy ||
                line1.trim().length < 5 ||
                city.trim().length < 2 ||
                state.trim().length < 2 ||
                !/^[1-9][0-9]{5}$/.test(pincode)
              }
              onPress={() => void saveAddress()}
              style={styles.saveAddressBtn}
            >
              Save Delivery Address
            </Button>
          </View>
        ) : null}
      </View>

      {/* 5. ISO & ASSURANCE TRUST BADGE */}
      <View style={styles.trustStrip}>
        <Icon name="shield" size={18} color="#16A34A" />
        <View style={{ flex: 1, gap: 1 }}>
          <Txt style={styles.trustTitle}>
            {companyCertificate.organization} • {companyCertificate.standard}
          </Txt>
          <Txt style={styles.trustDesc}>
            Mill batch verified. Pan-India flat-bed trailer logistics with live
            weight-bridge slip.
          </Txt>
        </View>
      </View>

      {/* Validation Message Box */}
      {message ? (
        <View style={styles.errorAlert}>
          <Icon name="alert-triangle" size={16} color="#B91C1C" />
          <Txt style={styles.errorAlertText}>{message}</Txt>
        </View>
      ) : null}

      {/* 6. PRIMARY ACTIONS */}
      <View style={styles.actionContainer}>
        <Button
          icon="arrow-right"
          disabled={busy || !isFormValid}
          onPress={() => void submit()}
          style={styles.submitBtn}
        >
          {hasFastenerRequirements ? (busy ? 'Submitting quotation…' : 'Request quotation') : (busy ? 'Submitting Order...' : 'Submit Order for Confirmation')}
        </Button>

        <Button
          secondary
          disabled={busy}
          onPress={() => router.push('/cart')}
          style={styles.backBtn}
        >
          Back to cart
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  container: {
    padding: 16,
    paddingBottom: 48,
    gap: 16,
  },
  header: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.04)',
  },
  headerBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EEF4FC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00409A',
  },
  liveText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#00409A',
    letterSpacing: 0.5,
  },
  stepCounterText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12.5,
    lineHeight: 18,
    color: '#475569',
  },
  stepperRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  stepItem: {
    flex: 1,
    gap: 5,
  },
  stepBar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
  },
  stepBarDone: {
    backgroundColor: '#15803D',
  },
  stepBarActive: {
    backgroundColor: '#A70101',
  },
  stepDoneLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803D',
  },
  stepActiveLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#A70101',
  },
  stepPendingLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.04)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  cardTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  editCartLink: {
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  editCartText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#00409A',
  },
  itemsList: {
    gap: 8,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  itemLeft: {
    flex: 1,
    gap: 3,
    paddingRight: 10,
  },
  itemBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemKindBadge: {
    fontSize: 9,
    fontWeight: '700',
    color: '#00409A',
    backgroundColor: '#EEF4FC',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  itemBrandBadge: {
    fontSize: 9,
    fontWeight: '700',
    color: '#15803D',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  itemName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  itemSpecText: {
    fontSize: 11.5,
    color: '#64748B',
  },
  itemSpecBold: {
    fontWeight: '700',
    color: '#0F172A',
  },
  itemRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
  },
  itemQtyText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#00409A',
  },
  itemPriceText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  summaryStrip: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryMetric: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#E2E8F0',
  },
  metricLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.4,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  formGroup: {
    gap: 5,
  },
  formRow: {
    flexDirection: 'row',
    gap: 10,
  },
  fieldLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.4,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13.5,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  whatsappBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    padding: 12,
    marginTop: 4,
  },
  whatsappBoxActive: {
    borderColor: '#16A34A',
    backgroundColor: '#ECFDF5',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    backgroundColor: '#FFFFFF',
  },
  checkboxActive: {
    backgroundColor: '#16A34A',
    borderColor: '#16A34A',
  },
  whatsappTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
  },
  whatsappDesc: {
    fontSize: 11,
    lineHeight: 16,
    color: '#15803D',
  },
  toggleAddressBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#EEF4FC',
  },
  toggleAddressText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#00409A',
  },
  addressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  addressCardActive: {
    borderColor: '#00409A',
    backgroundColor: '#EEF4FC',
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: '#00409A',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#00409A',
  },
  addressLine1: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  addressLine2: {
    fontSize: 11.5,
    color: '#64748B',
  },
  newAddressForm: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 6,
  },
  newAddressHeader: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  saveAddressBtn: {
    minHeight: 40,
    marginTop: 4,
  },
  trustStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  trustTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#166534',
  },
  trustDesc: {
    fontSize: 10.5,
    color: '#475569',
  },
  errorAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 12,
  },
  errorAlertText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#B91C1C',
  },
  actionContainer: {
    gap: 10,
    marginTop: 4,
  },
  submitBtn: {
    minHeight: 48,
    backgroundColor: '#A70101',
    borderColor: '#A70101',
    borderRadius: 8,
  },
  backBtn: {
    minHeight: 44,
    borderRadius: 8,
  },
  resultContainer: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  successCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    boxShadow: '0 8px 24px rgba(22, 101, 52, 0.08)',
  },
  successIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#14532D',
    textAlign: 'center',
  },
  successDesc: {
    fontSize: 12.5,
    lineHeight: 18,
    color: '#475569',
    textAlign: 'center',
  },
  successNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  successNoticeText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: '#15803D',
  },
  ordersBtn: {
    width: '100%',
    minHeight: 46,
    backgroundColor: '#00409A',
    borderColor: '#00409A',
    borderRadius: 8,
    marginTop: 6,
  },
  continueLink: {
    paddingVertical: 6,
  },
  continueLinkText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#00409A',
  },
  emptyCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptyDesc: {
    fontSize: 12.5,
    lineHeight: 18,
    color: '#64748B',
    textAlign: 'center',
  },
  browseBtn: {
    width: '100%',
    minHeight: 46,
    backgroundColor: '#00409A',
    borderColor: '#00409A',
    borderRadius: 8,
    marginTop: 8,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 12,
  },
});
