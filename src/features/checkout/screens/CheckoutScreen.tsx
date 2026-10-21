import { useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useStore } from '@core/state/workspace-store';
import { useAuth } from '@features/auth/ui';
import { commerceApi } from '@features/orders';
import { Heading, Empty, Button, Card, Chip, Field, Row, Txt, s } from '@shared/ui';

const newRequest = () => globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
  const n = Math.floor(Math.random() * 16); return (ch === 'x' ? n : (n & 3) | 8).toString(16);
});
export function Checkout() {
  const auth = useAuth();
  const client = useQueryClient();
  const cart = useStore(state => state.cart);
  const quantity = useStore(state => state.quantity);
  const [address, setAddress] = useState('');
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const request = useRef({ fingerprint: '', id: newRequest() });
  const addresses = useQuery({ queryKey: ['commerce', 'addresses', auth.session?.user.id], queryFn: commerceApi.addresses, retry: false });
  const available = addresses.data?.filter(item => !item.business_id) ?? [];
  async function saveAddress() {
    setBusy(true); setMessage('');
    try {
      const id = await commerceApi.saveAddress(line1, city, state, pincode);
      setAddress(id); setLine1(''); setCity(''); setState(''); setPincode('');
      await client.invalidateQueries({ queryKey: ['commerce', 'addresses'] });
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function submit() {
    if (busy || !address || !cart.length || cart.some(line => !line.variantId)) return;
    const lines = cart.map(line => ({ variant_id: line.variantId!, qty: String(line.quantity) }));
    const fingerprint = JSON.stringify({ address, lines });
    if (request.current.fingerprint !== fingerprint) request.current = { fingerprint, id: newRequest() };
    setBusy(true); setMessage('');
    try {
      await commerceApi.placeCart(request.current.id, address, lines);
      for (const line of cart) quantity(line.productId, 0, line.variantId);
      setSubmitted(true);
      await client.invalidateQueries({ queryKey: ['commerce'] });
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  if (submitted) return <Empty title="Order submitted" description="Your tractor parts are awaiting admin confirmation. FTI will add GST and delivery charges and confirm the final total before payment." action={<Button onPress={() => router.push('/orders')}>View orders</Button>} />;
  if (!cart.length) return <Empty title="Your cart is empty" description="Add tractor parts before checkout." action={<Button onPress={() => router.push('/products')}>Browse tractor parts</Button>} />;
  return <View style={{ gap: 16 }}>
    <Heading eyebrow="REVIEW & SUBMIT" title="Checkout" description="Admin will confirm the final item prices, GST and delivery charges. No payment is due until confirmation." />
    <Card style={{ gap: 12 }}>
      <Txt style={s.h2}>Delivery address</Txt>
      {addresses.isPending ? <Txt>Loading addresses...</Txt> : addresses.error ? <Txt accessibilityRole="alert">{addresses.error.message}</Txt> : <Row style={{ flexWrap: 'wrap' }}>
        {available.map(item => <Chip key={item.id} selected={item.id === address} onPress={() => setAddress(item.id)}>{item.line1}, {item.city} {item.pincode}</Chip>)}
      </Row>}
      <Field label="Street address" placeholder="Building and street" value={line1} onChangeText={setLine1} />
      <Field label="City" placeholder="City" value={city} onChangeText={setCity} />
      <Field label="State" placeholder="State" value={state} onChangeText={setState} />
      <Field label="Indian PIN code" placeholder="6-digit PIN code" numeric value={pincode} onChangeText={setPincode} />
      <Button secondary disabled={busy || line1.trim().length < 5 || city.trim().length < 2 || state.trim().length < 2 || !/^[1-9][0-9]{5}$/.test(pincode)} onPress={() => void saveAddress()}>Save delivery address</Button>
    </Card>
    <Txt style={s.muted}>{cart.length} cart item{cart.length === 1 ? '' : 's'}. GST and delivery charges: awaiting admin confirmation.</Txt>
    {cart.some(line => !line.variantId) ? <Txt>Some saved items need a variant. Remove and re-add them from the catalogue.</Txt> : null}
    <Button disabled={busy || !available.some(item => item.id === address) || cart.some(line => !line.variantId)} onPress={() => void submit()}>{busy ? 'Submitting...' : 'Submit order for confirmation'}</Button>
    <Button secondary disabled={busy} onPress={() => router.push('/cart')}>Back to cart</Button>
    {message ? <Txt accessibilityRole="alert">{message}</Txt> : null}
  </View>;
}
