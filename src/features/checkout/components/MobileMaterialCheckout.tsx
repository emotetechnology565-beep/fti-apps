import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Txt, Icon } from '@shared/ui';
import { router } from 'expo-router';
import type { CartLine } from '@features/cart/model/types';
import type { Product } from '@features/catalog/model/types';
import { MaterialPhoto } from '@features/catalog/components/MaterialPhoto';
import { SubscribeForPrices } from '@features/subscriptions/SubscribeForPrices';
import { FastenerRequirementSummary } from '@features/cart/components/FastenerRequirementSummary';

type Address = { id: string; line1: string; city: string; state: string; pincode: string };
type Props = {
  cart: CartLine[]; products: Product[]; prices: ({ total: number; tax: string } | null)[];
  priceAccess: boolean; loadingPrices: boolean; subtotal: number;
  buyer: string; setBuyer: (value: string) => void; business: string; setBusiness: (value: string) => void;
  phone: string; consent: boolean; setConsent: (value: boolean) => void;
  addresses: Address[]; selectedAddress: string; setAddress: (id: string) => void;
  loadingAddresses: boolean; addressError?: string;
  line1: string; setLine1: (value: string) => void; city: string; setCity: (value: string) => void;
  state: string; setState: (value: string) => void; pincode: string; setPincode: (value: string) => void;
  saveAddress: () => Promise<void>; submit: () => Promise<void>;
  attempted: boolean; busy: boolean; valid: boolean; message: string;
};

export function MobileMaterialCheckout(props: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [newAddress, setNewAddress] = useState(false);
  const [terms, setTerms] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const advance = (value: 1 | 2 | 3) => setStep(value);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [step]);
  const destination = props.addresses.find(item => item.id === props.selectedAddress);
  const needsQuote = !props.priceAccess || props.prices.some(price => !price);
  const money = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  const validAddress = props.line1.trim().length >= 5 && props.city.trim().length >= 2 && props.state.trim().length >= 2 && /^[1-9]\d{5}$/.test(props.pincode);
  const canContinue = !!destination && props.buyer.trim().length >= 2 && props.business.trim().length >= 2;
  const field = (label: string, value: string, change: (value: string) => void, numeric = false) => <View style={styles.field}><Txt style={styles.label}>{label}</Txt><TextInput accessibilityLabel={label} value={value} onChangeText={change} editable={!props.attempted && !props.busy} keyboardType={numeric ? 'number-pad' : 'default'} style={styles.input} /></View>;
  const action = (label: string, onPress: () => void, disabled = false, secondary = false) => <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.action, secondary && styles.secondary, disabled && { opacity: 0.45 }]}><Txt style={[styles.actionText, secondary && { color: '#123657' }]}>{label}</Txt></Pressable>;
  const row = (label: string, value: string, total = false) => <View key={label} style={[styles.tableRow, total && { backgroundColor: '#FFF0F1', paddingHorizontal: 8 }]}><Txt style={[styles.small, { flex: 1 }]}>{label}</Txt><Txt style={[styles.small, { textAlign: 'right', fontWeight: '700', flex: 1 }, total && { color: '#ED222B', fontSize: 17 }]}>{value}</Txt></View>;
  return <ScrollView ref={scroll} style={{ backgroundColor: '#FFFFFF' }} contentContainerStyle={{ padding: 12, gap: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
    <Txt accessibilityRole="header" style={styles.title}>{step === 1 ? 'Delivery Address' : step === 2 ? 'Delivery Options' : needsQuote ? 'Review Quotation Request' : 'Review Order'}</Txt>
    <View style={styles.steps}>{['Address', 'Delivery', 'Review'].map((label, index) => <View key={label} style={{ flex: 1, gap: 5 }}><View style={{ height: 3, backgroundColor: index + 1 <= step ? '#ED222B' : '#E7ECF2' }} /><Txt style={[styles.small, { color: index + 1 === step ? '#C31925' : '#7B8CA0' }]}>{index + 1}. {label}</Txt></View>)}</View>
    {step === 1 ? <>
      {field('Contact person *', props.buyer, props.setBuyer)}
      <View style={styles.field}><Txt style={styles.label}>Verified mobile number</Txt><Txt style={[styles.input, { paddingTop: 11, color: '#66788A' }]}>{props.phone}</Txt></View>
      {field('Company / buyer name *', props.business, props.setBusiness)}
      {props.loadingAddresses ? <Txt style={styles.small}>Loading delivery addresses…</Txt> : props.addressError ? <Txt accessibilityRole="alert" style={{ color: '#B91C1C' }}>{props.addressError}</Txt> : props.addresses.map(address => <Pressable accessibilityRole="radio" accessibilityState={{ selected: props.selectedAddress === address.id }} key={address.id} onPress={() => { if (!props.attempted) props.setAddress(address.id); }} style={[styles.option, props.selectedAddress === address.id && { borderColor: '#ED222B' }]}><Icon name={props.selectedAddress === address.id ? 'check-circle' : 'circle'} color={props.selectedAddress === address.id ? '#ED222B' : '#91A0AF'} /><View style={{ flex: 1 }}><Txt style={styles.label}>{address.line1}</Txt><Txt style={styles.small}>{address.city}, {address.state} – {address.pincode}</Txt></View></Pressable>)}
      {newAddress || !props.addresses.length ? <>
        {field('Address / industrial area *', props.line1, props.setLine1)}
        {field('City *', props.city, props.setCity)}
        <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}>{field('State *', props.state, props.setState)}</View><View style={{ flex: 1 }}>{field('Pincode *', props.pincode, props.setPincode, true)}</View></View>
        {action(props.busy ? 'Saving address…' : 'Save Delivery Address', () => void props.saveAddress(), !validAddress || props.busy || props.attempted, true)}
      </> : action('Add another address', () => setNewAddress(true), props.attempted, true)}
      <View style={styles.notice}><Icon name="info" color="#1260B6" /><Txt style={[styles.small, { flex: 1 }]}>Save the destination before continuing. Vehicle access, unloading and delivery timing will be confirmed by FTI with your quotation.</Txt></View>
      {action('Save & Continue →', () => advance(2), !canContinue || props.busy)}
    </> : step === 2 ? <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><Icon name="map-pin" color="#123657" size={16} /><Txt style={[styles.small, { flex: 1 }]}>{destination?.city}, {destination?.pincode}</Txt><Pressable accessibilityRole="button" onPress={() => advance(1)} style={{ minHeight: 44, justifyContent: 'center' }}><Txt style={{ color: '#1260B6', fontSize: 12 }}>Edit</Txt></Pressable></View>
      <View style={[styles.option, { borderColor: '#ED222B', alignItems: 'flex-start' }]}><Icon name="check-circle" color="#ED222B" /><View style={{ flex: 1, gap: 9 }}><Txt style={styles.heading}>Standard road transport</Txt><Icon name="truck" color="#123B60" size={48} /><Txt style={{ color: '#ED222B', fontWeight: '800', fontSize: 19 }}>Freight on quotation</Txt><Txt style={styles.small}>Vehicle type and delivery schedule depend on the confirmed material quantity and destination.</Txt>{row('Delivery location', `${destination?.city} ${destination?.pincode}`)}{row('Unloading / site access', 'To be agreed with buyer')}{row('Dispatch estimate', 'FTI confirmation required')}</View></View>
      <View style={[styles.option, { backgroundColor: '#F5F7FA' }]}><Icon name="clock" color="#7B8CA0" /><View style={{ flex: 1, gap: 4 }}><Txt style={styles.heading}>Urgent / split delivery</Txt><Txt style={styles.small}>Request availability from FTI. No express price or split-stock promise is assumed.</Txt></View></View>
      <View style={[styles.notice, { backgroundColor: '#FFF4DD' }]}><Icon name="alert-circle" color="#9A6500" /><Txt style={[styles.small, { flex: 1 }]}>Freight, taxes, loading, unloading and any split delivery must be agreed before payment. No delivery fee has been added at this stage.</Txt></View>
      {action('Continue to Review →', () => advance(3))}
      {action('Back to Delivery Address', () => advance(1), false, true)}
    </> : <>
      {props.cart.map((line, index) => {
        const material = line.material;
        const product = props.products.find(item => item.id === line.productId);
        const variant = product?.variants.find(item => item.id === line.variantId);
        const raw = !!material && !material.fastenerRequirement && !material.fastenerRequest;
        return <View key={material?.key ?? `${line.productId}-${line.variantId}`} style={styles.panel}>
          <Txt style={styles.heading}>Product Details</Txt>
          {raw ? <View style={{ flexDirection: 'row', gap: 12 }}><View style={{ width: 110 }}><MaterialPhoto category={product?.category ?? 'round-bright-bar'} height={110} /></View><View style={{ flex: 1, gap: 6 }}><Txt style={styles.label}>{material.name}</Txt><Txt style={styles.small}>{material.size}</Txt><Txt style={styles.small}>Grade: {material.grade || 'To confirm'}</Txt></View></View> : <Txt style={styles.label}>{material?.name ?? product?.name}</Txt>}
          {material?.fastenerRequirement ? <FastenerRequirementSummary material={material} /> : null}
          {row('Quantity', `${line.quantity} ${material?.unit ?? variant?.uom ?? ''}`)}
          {props.priceAccess ? row('Indicative material value', props.prices[index] ? money(props.prices[index]!.total) : 'Quotation required') : null}
          {props.prices[index] ? <Txt style={styles.small}>{props.prices[index]!.tax}</Txt> : null}
        </View>;
      })}
      <View style={styles.panel}><Txt style={styles.heading}>Price Summary</Txt>{props.priceAccess ? row('Indicative material subtotal', props.loadingPrices ? 'Loading…' : props.prices.some(Boolean) ? money(props.subtotal) : 'Quotation required') : <SubscribeForPrices />}{row('GST / freight / other charges', 'Confirmed in quotation')}{row('Final amount payable', 'Awaiting FTI confirmation', true)}<Txt style={styles.small}>Unpriced items are excluded from the indicative subtotal.</Txt></View>
      <View style={styles.notice}><Icon name="info" color="#1260B6" /><Txt style={[styles.small, { flex: 1 }]}>Payment is outside the app by bank transfer after FTI confirms the final amount. Accounts staff manually verify receipt. No upfront payment is requested here.</Txt></View>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: terms }} onPress={() => setTerms(!terms)} style={styles.check}><Icon name={terms ? 'check-square' : 'square'} color={terms ? '#ED222B' : '#6B7D90'} /><Txt style={[styles.small, { flex: 1 }]}>I have reviewed specifications, quantity and delivery location. FTI must confirm availability, rates and the billing weight basis.</Txt></Pressable>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: props.consent }} onPress={() => { if (!props.attempted) props.setConsent(!props.consent); }} style={styles.check}><Icon name={props.consent ? 'check-square' : 'square'} color={props.consent ? '#ED222B' : '#6B7D90'} /><Txt style={[styles.small, { flex: 1 }]}>Send WhatsApp updates for this requirement to my verified number.</Txt></Pressable>
      {action(props.busy ? 'Submitting…' : props.attempted ? 'Retry same request' : needsQuote ? 'Submit Quotation Request →' : 'Submit Order for Confirmation →', () => void props.submit(), !terms || !props.valid || props.busy)}
      {action('Edit Delivery', () => advance(1), props.attempted, true)}
      {action('Edit Cart', () => router.push('/cart'), props.busy, true)}
    </>}
    {props.message ? <Txt accessibilityRole="alert" style={{ color: '#B91C1C', fontSize: 12, lineHeight: 18 }}>{props.message}</Txt> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  title: { color: '#0B2447', fontSize: 26, lineHeight: 32, fontWeight: '800' },
  heading: { color: '#0B2447', fontSize: 16, fontWeight: '700' },
  label: { color: '#152C49', fontSize: 12, fontWeight: '600', lineHeight: 18 },
  small: { color: '#354D65', fontSize: 12, lineHeight: 18 },
  steps: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  field: { gap: 5 },
  input: { borderWidth: 1, borderColor: '#CBD8E5', backgroundColor: '#FAFCFF', borderRadius: 4, minHeight: 44, paddingHorizontal: 10, color: '#183552', fontSize: 13 },
  action: { minHeight: 46, backgroundColor: '#ED222B', borderRadius: 5, alignItems: 'center', justifyContent: 'center', padding: 10 },
  actionText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  secondary: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#ADC3D8' },
  option: { padding: 12, borderRadius: 5, borderWidth: 1, borderColor: '#DCE5EE', flexDirection: 'row', gap: 10, alignItems: 'center' },
  panel: { padding: 10, borderRadius: 5, borderWidth: 1, borderColor: '#DFE7F0', gap: 8 },
  tableRow: { flexDirection: 'row', gap: 12, borderBottomWidth: 1, borderColor: '#E6ECF3', paddingVertical: 8 },
  notice: { padding: 11, backgroundColor: '#E7F2FF', borderRadius: 5, flexDirection: 'row', gap: 9 },
  check: { minHeight: 44, flexDirection: 'row', gap: 9, alignItems: 'center' },
});
