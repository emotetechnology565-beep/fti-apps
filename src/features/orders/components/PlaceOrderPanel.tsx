import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@features/auth/ui';
import { Badge, Button, Card, Chip, Field, Row, Txt, s } from '@shared/ui';
import { commerceApi } from '../services/commerce-api';

const requestId = () => globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
  const n = Math.floor(Math.random() * 16); return (ch === 'x' ? n : (n & 3) | 8).toString(16);
});
export function PlaceOrderPanel({ quoteId, businessId }: { quoteId: string; businessId: string | null }) {
  const auth = useAuth();
  const client = useQueryClient();
  const id = useRef(requestId());
  const [selected, setSelected] = useState<string | null>(null);
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const addresses = useQuery({ queryKey: ['commerce','addresses',auth.session?.user.id], queryFn: commerceApi.addresses, retry: false });
  const available = addresses.data?.filter(a => !a.business_id || a.business_id === businessId) ?? [];
  async function save() {
    setBusy(true); setMessage('');
    try { const address = await commerceApi.saveAddress(line1,city,state,pincode);
      setSelected(address); setLine1(''); setCity(''); setState(''); setPincode('');
      await client.invalidateQueries({ queryKey: ['commerce','addresses',auth.session?.user.id] });
    } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }
  async function place() {
    if (!selected) return;
    setBusy(true); setMessage('');
    try { const result = await commerceApi.placeQuote(id.current,quoteId,selected);
      id.current=requestId(); setConfirm(false);
      setMessage(`Order ${result.replayed ? 'already placed' : 'placed'} successfully. Open Orders to review payment and reservation details.`);
      await client.invalidateQueries({ queryKey: ['commerce'] });
      await client.invalidateQueries({ queryKey: ['sales'] });
    } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }
  return <Card style={{ gap: 12 }}><Txt style={s.h2}>Place order from accepted quotation</Txt>
    <Txt>The approved quote supplies the prices and tax amounts. An order reserves tracked stock only while its approved reservation period lasts. No payment is taken here.</Txt>
    {addresses.isPending ? <Txt>Loading delivery addresses…</Txt> : addresses.error ? <Txt accessibilityRole="alert">{addresses.error.message}</Txt> : <>
      <Row style={{ flexWrap: 'wrap' }}>{available.map(a => <Chip key={a.id} selected={selected===a.id} onPress={() => { setSelected(a.id); setConfirm(false); }}>
        {a.line1}, {a.city} {a.pincode}</Chip>)}</Row>
      {!available.length && <Txt>No delivery address yet. Add one below.</Txt>}
    </>}
    <Txt style={s.h2}>Add personal delivery address</Txt>
    <Field label="Street address" placeholder="e.g. 123 Industrial Road, Phase 1" value={line1} onChangeText={setLine1} />
    <Field label="City" placeholder="e.g. Delhi" value={city} onChangeText={setCity} />
    <Field label="State" placeholder="e.g. Delhi" value={state} onChangeText={setState} />
    <Field label="Indian PIN code" placeholder="e.g. 110001" value={pincode} onChangeText={setPincode} numeric />
    <Button secondary disabled={busy || line1.trim().length<5 || city.trim().length<2 || state.trim().length<2 || !/^[1-9][0-9]{5}$/.test(pincode)} onPress={() => void save()}>Save address</Button>
    {!confirm ? <Button disabled={busy || !selected} onPress={() => setConfirm(true)}>Review order placement</Button> : <View style={{ gap: 8 }}>
      <Badge>CONFIRM ORDER</Badge><Txt>Place this accepted quotation as an order using the selected address? Stock availability and reservation policy will be checked by the server.</Txt>
      <Button disabled={busy} onPress={() => void place()}>{busy ? 'Placing…' : 'Confirm and place order'}</Button>
      <Button secondary disabled={busy} onPress={() => setConfirm(false)}>Cancel</Button>
    </View>}
    {!!message && <Txt accessibilityRole="alert">{message}</Txt>}
  </Card>;
}
