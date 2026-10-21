import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@features/auth/ui';
import { useStore } from '@core/state/workspace-store';
import { Heading, Empty, Card, Row, Txt, Badge, Button, Field, s } from '@shared/ui';
import { ShipmentTracking } from '@features/operations/ui';
import { commerceApi } from '../services/commerce-api';
import type { OrderDetail } from '../model/commerce-types';

function OrderPanel({ order, refresh }: { order: OrderDetail; refresh: () => Promise<void> }) {
  const [now,setNow] = useState(() => Date.now());
  useEffect(() => { const timer=setInterval(()=>setNow(Date.now()),60000); return ()=>clearInterval(timer); },[]);
  const [utr, setUtr] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const activeReview = order.payments.some(p => p.status === 'review' || p.status === 'successful');
  const expiry = Math.min(...order.items.map(i => i.reservation_expires_at ? Date.parse(i.reservation_expires_at) : Infinity));
  const canSubmit = order.status === 'pending_payment' && !activeReview && expiry>now;
  const awaitingConfirmation = order.status === 'pending_confirmation';
  async function submit() {
    setBusy(true); setMessage('');
    try { await commerceApi.bankSubmit(order.id,utr); setUtr(''); setConfirm(false);
      setMessage('Transfer reference submitted for manual bank verification. This is not a payment confirmation.');
      await refresh();
    } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }
  return <View style={{ gap: 14 }}><Card style={{ gap: 9 }}><Txt style={s.h2}>{order.order_no}</Txt><Badge>{order.status.toUpperCase()}</Badge>
    <Txt>Placed {new Date(order.created_at).toLocaleString()}</Txt>
    <Txt>Deliver to: {order.delivery_address_snapshot.line1}, {order.delivery_address_snapshot.city}, {order.delivery_address_snapshot.state} {order.delivery_address_snapshot.pincode}</Txt>
    {order.items.map(item => <Txt key={item.id}>{item.sku}: {item.qty} {item.uom}{awaitingConfirmation && Number(item.unit_price) === 0 ? ' · Price awaiting confirmation' : ` × INR ${item.unit_price} = INR ${item.line_total}${awaitingConfirmation ? ' (estimate)' : ''}`}</Txt>)}
    {!awaitingConfirmation ? <Txt>Subtotal INR {order.subtotal} · Discount INR {order.discount_total}</Txt> : null}
    {awaitingConfirmation ? <Txt style={s.h2}>Awaiting admin confirmation of item prices, GST and delivery charges. No payment is due yet.</Txt> : <>
      <Txt>GST INR {order.gst_total} · Freight INR {order.freight_total} · Loading INR {order.loading_total}</Txt>
      <Txt style={s.h2}>Total INR {order.grand_total} · Due INR {order.amount_due}</Txt>
    </>}
    {Number.isFinite(expiry) && order.status==='pending_payment' && <Txt>Stock reserved until {new Date(expiry).toLocaleString()}</Txt>}
  </Card>
    {!awaitingConfirmation ? <ShipmentTracking orderId={order.id}/> : null}
    {!awaitingConfirmation ? <Card style={{ gap: 9 }}><Txt style={s.h2}>Bank transfer review</Txt>
      <Txt>Only use bank details given directly by FTI. Entering a reference does not prove that funds arrived; authorized accounts staff verify the bank statement before confirming the order.</Txt>
      {!order.payments.length && <Txt>No transfer reference submitted.</Txt>}
      {order.payments.map(p => <View key={p.id} style={{ gap: 3 }}><Badge>{p.status.toUpperCase()}</Badge>
        <Txt>Reference {p.reference} · INR {p.amount} · {new Date(p.created_at).toLocaleString()}</Txt></View>)}
      {canSubmit && <><Field label="Bank UTR / transfer reference" placeholder="e.g. HDFC123456789012" value={utr} onChangeText={setUtr} />
        {!confirm ? <Button disabled={!/^[A-Za-z0-9/-]{6,40}$/.test(utr.trim()) || busy} onPress={() => setConfirm(true)}>Review transfer reference</Button> : <>
          <Txt>Submit reference {utr.trim().toUpperCase()} for manual review?</Txt>
          <Button disabled={busy} onPress={() => void submit()}>{busy ? 'Submitting…' : 'Confirm submission'}</Button>
          <Button secondary disabled={busy} onPress={() => setConfirm(false)}>Cancel</Button></>}</>}
      {!!message && <Txt accessibilityRole="alert">{message}</Txt>}
    </Card> : null}
  </View>;
}

export function Orders({ financeOnly = false }: { financeOnly?: boolean }) {
  const auth = useAuth();
  const client = useQueryClient();
  const localOrders = useStore(state => state.orders);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['commerce','mine',auth.session?.user.id,offset], queryFn: () => commerceApi.mine(offset), retry: false });
  const detail = useQuery({ queryKey: ['commerce','detail',auth.session?.user.id,selected], queryFn: () => commerceApi.detail(selected!), enabled: !!selected, retry: false });
  async function refresh() { await client.invalidateQueries({ queryKey: ['commerce'] }); }
  return <View style={{ gap: 16 }}><Heading eyebrow={financeOnly ? 'PAYMENTS' : 'ORDERS & LOGISTICS'}
    title={financeOnly ? 'Payments & credit' : 'Orders & dispatch'}
    description={financeOnly ? 'Transfer references and verified order payments. Credit is not offered without an approved policy.' : 'Tractor cart orders, accepted quotation orders and their current status.'} />
    <Button secondary onPress={() => void refresh()}>Refresh</Button>
    {selected ? <><Button secondary onPress={() => setSelected(null)}>Back to orders</Button>
      {detail.isPending ? <Txt>Loading order…</Txt> : detail.error ? <Empty title="Order unavailable" description={detail.error.message} /> : <OrderPanel order={detail.data} refresh={refresh} />}</> : <>
      {list.isPending ? <Txt>Loading orders…</Txt> : list.error ? <Empty title="Orders unavailable" description={list.error.message} action={<Button onPress={() => void list.refetch()}>Retry</Button>} /> : <>
        {!list.data.length && <Empty title="No orders yet" description="Submit tractor parts from your cart or place an order from an accepted quotation." />}
        {list.data.map(order => <Card key={order.id} style={{ gap: 8 }}><Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <Txt style={s.h2}>{order.order_no}</Txt><Badge>{order.status.toUpperCase()}</Badge></Row>
          <Txt>{order.status === 'pending_confirmation' ? 'Item prices, GST and delivery charges awaiting admin confirmation' : `INR ${order.grand_total} · Due INR ${order.amount_due}`}</Txt>
          <Txt>{new Date(order.created_at).toLocaleString()}</Txt>
          <Button secondary onPress={() => setSelected(order.id)}>View order and payment</Button></Card>)}
        <Row><Button secondary disabled={!offset} onPress={() => setOffset(Math.max(0,offset-24))}>Previous</Button>
          <Button secondary disabled={list.data.length<24} onPress={() => setOffset(offset+24)}>Next</Button></Row>
      </>}
      {!financeOnly && !!localOrders.length && <Card style={{ gap: 8 }}><Txt style={s.h2}>Earlier device records</Txt>
        <Txt style={s.muted}>These local records are unverified and have no confirmed financial status.</Txt>
        {localOrders.map(o => <Txt key={o.id}>{o.id} · {o.status}</Txt>)}</Card>}
    </>}
  </View>;
}
