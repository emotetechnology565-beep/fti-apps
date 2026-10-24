import { useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@features/auth/ui';
import { Button, Card, Chip, Field, Txt, s } from '@shared/ui';
import { catalogApi } from '../data/catalog-repository';
import { CatalogFilter } from './CatalogFilter';
import { availableCatalogFilters, matchesCatalogSize } from '../model/available-filters';
import type { Product } from '../model/types';
import { GradeListPrice } from './GradeListPrice';

const newId = () => globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
  const value = Math.floor(Math.random() * 16); return (ch === 'x' ? value : (value & 3) | 8).toString(16);
});

export function RawMaterialOrder({ product, initialSize = '', initialGrade = '' }: { product: Product; initialSize?: string; initialGrade?: string }) {
  const auth = useAuth();
  const [size, setSize] = useState(initialSize);
  const [grade, setGrade] = useState(initialGrade);
  const [quantity, setQuantity] = useState('');
  const [name, setName] = useState(auth.identity?.profile.full_name ?? '');
  const [business, setBusiness] = useState(auth.identity?.businesses[0]?.legal_name ?? '');
  const [location, setLocation] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const request = useRef<{ id: string; payload: string } | null>(null);
  const options = availableCatalogFilters(product.variants, size ? Number(size) : undefined);
  const variant = product.variants.find(v => size && matchesCatalogSize(v, Number(size)) && String(v.attributes.grade ?? '').trim().toUpperCase() === grade);
  async function submit() {
    if (busy || sent) return;
    if (!auth.session) { router.push('/login'); return; }
    if (!variant || !/^\d{1,12}(\.\d{1,3})?$/.test(quantity) || Number(quantity) <= 0 || Number(quantity) < variant.min_order_qty || name.trim().length < 2 || name.trim().length > 80 || !business.trim() || business.trim().length > 80 || location.trim().length < 5 || location.trim().length > 100 || !consent) {
      setMessage('Select an available size and grade, enter the minimum quantity and buyer details, and agree to WhatsApp updates.'); return;
    }
    const payload = { p_variant: variant.id, p_size: Number(size), p_quantity: quantity,
      p_buyer: { name: name.trim(), business: business.trim(), location: location.trim(), whatsapp_consent: consent } };
    const serialized = JSON.stringify(payload);
    if (!request.current) request.current = { id: newId(), payload: serialized };
    if (request.current.payload !== serialized) { setMessage('A submission was already attempted. Retry with the same details to avoid a duplicate order.'); return; }
    setBusy(true); setMessage('');
    try {
      const result = await catalogApi.rpc<{ reference: string }>('fti_catalog_raw_order_submit', { ...payload, p_id: request.current.id });
      setSent(true); setMessage(`Order request received: ${result.reference}. FTI will contact you to confirm availability, pricing and delivery. WhatsApp acknowledgment queued.`);
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  if (sent) return <Card><Txt accessibilityLiveRegion="polite">{message}</Txt></Card>;
  if (!auth.session) return <Button disabled={!auth.ready} onPress={() => router.push('/login')}>Sign in to order raw material</Button>;
  return <Card style={{ gap: 12 }}><Txt style={s.h2}>Order raw material</Txt>
    <CatalogFilter label="Order size (mm)" value={size} options={[{ value: '', label: 'Choose size' }, ...options.sizes.map(n => ({ value: String(n), label: `${n} mm` }))]}
      onChange={value => { setSize(value); setGrade(''); }} disabled={busy} />
    <CatalogFilter label="Order grade" value={grade} options={[{ value: '', label: 'Choose grade' }, ...options.grades.map(value => ({ value, label: value }))]}
      onChange={setGrade} disabled={busy || !size} />
    {variant ? <GradeListPrice variant={variant} /> : null}
    <Field label={`Quantity${variant ? ` (${variant.uom}, minimum ${variant.min_order_qty})` : ''}`} value={quantity} onChangeText={setQuantity} numeric placeholder="Enter quantity" />
    <Field label="Buyer name" value={name} onChangeText={setName} placeholder="Full name" />
    <Field label="Business / buyer type" value={business} onChangeText={setBusiness} placeholder="Business name or Individual" />
    <Txt>Verified WhatsApp: {auth.identity?.profile.phone ?? auth.session.user.phone}</Txt>
    <Field label="Delivery location (up to 100 characters)" value={location} onChangeText={setLocation} placeholder="Address, city, state and PIN code" multiline />
    <View><Chip selected={consent} onPress={() => setConsent(!consent)}>Send me WhatsApp updates for this order request</Chip></View>
    <Txt style={s.muted}>Your order and buyer details will be shared with FTI’s configured order-notification recipients. FTI will confirm availability, pricing and delivery.</Txt>
    <Button disabled={busy} onPress={() => void submit()}>{busy ? 'Submitting...' : 'Submit order request'}</Button>
    {message ? <Txt accessibilityRole="alert">{message}</Txt> : null}
  </Card>;
}
