import { PaymentFields } from './OrderPayments';
import { newPaymentDraft, paymentDraftError } from '../model/order-payments';
import { orderStepWithPayment } from '../services/order-payments-api';
import { OrderDecisions } from './OrderDecisions';
import { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@features/auth/ui';
import { hasPermission } from '@features/auth';
import { Button, Card, Field, Txt, s } from '@shared/ui';
import { commerceApi } from '../services/commerce-api';
import type { CartOrderReview as Review } from '../model/commerce-types';

function ReviewOrder({
  order,
  refresh,
}: {
  order: Review;
  refresh: () => Promise<unknown>;
}) {
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      order.items.map((item) => [
        item.id,
        Number(item.unit_price) > 0 ? Number(item.unit_price).toFixed(2) : '',
      ]),
    ),
  );
  const [payment, setPayment] = useState(newPaymentDraft);
  const [gst, setGst] = useState('');
  const [delivery, setDelivery] = useState('');
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const validAmount = (value: string, positive = false) =>
    /^\d{1,9}(\.\d{1,2})?$/.test(value) && (!positive || Number(value) > 0);
  const amountsValid =
    validAmount(gst) &&
    validAmount(delivery) &&
    order.items.every((item) => validAmount(prices[item.id] ?? '', true));
  const subtotal = order.items.reduce(
    (sum, item) =>
      sum +
      Math.round(Number(prices[item.id] || 0) * Number(item.qty) * 100) / 100,
    0,
  );
  const finalTotal = (subtotal + Number(gst) + Number(delivery)).toFixed(2);
  const valid = amountsValid && !paymentDraftError(payment, finalTotal);
  async function confirm() {
    if (busy || !valid) return;
    setBusy(true);
    setMessage('');
    try {
      await orderStepWithPayment('confirm', order.id, {
        ...payment,
        items: order.items.map((item) => ({
          id: item.id,
          unit_price: prices[item.id],
        })),
        gst,
        delivery,
      });
      setMessage(
        'Order confirmed. Any recorded payment has been deducted from the remaining amount.',
      );
      await refresh();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const address = order.delivery_address_snapshot;
  return (
    <Card style={{ gap: 12 }}>
      <Txt style={s.h2}>{order.order_no}</Txt>
      <Txt>
        {address.line1}, {address.city}, {address.state} {address.pincode}
      </Txt>
      {order.items.map((item) => (
        <View key={item.id} style={{ gap: 6 }}>
          <Txt>
            {item.name} ({item.sku}): {item.qty} {item.uom}
          </Txt>
          <Field
            label={`Final unit price for ${item.sku} (INR)`}
            placeholder="Enter price after any discount"
            numeric
            value={prices[item.id] ?? ''}
            onChangeText={(value) => {
              setPrices((current) => ({ ...current, [item.id]: value }));
              setReview(false);
            }}
          />
        </View>
      ))}
      <Field
        label="GST amount (INR)"
        placeholder="Enter GST, or 0"
        numeric
        value={gst}
        onChangeText={(value) => {
          setGst(value);
          setReview(false);
        }}
      />
      <Field
        label="Delivery charge (INR)"
        placeholder="Enter delivery charge, or 0"
        numeric
        value={delivery}
        onChangeText={(value) => {
          setDelivery(value);
          setReview(false);
        }}
      />
      {valid ? (
        <Txt style={s.h2}>
          Final total INR{' '}
          {(subtotal + Number(gst) + Number(delivery)).toFixed(2)}
        </Txt>
      ) : null}
      <PaymentFields
        draft={payment}
        remaining={finalTotal}
        onChange={(value) => {
          setPayment(value);
          setReview(false);
        }}
      />
      <Txt style={s.muted}>
        Confirmation reserves available stock and makes this amount payable. It
        does not mark payment as received.
      </Txt>
      {!review ? (
        <Button disabled={busy || !valid} onPress={() => setReview(true)}>
          Review final total
        </Button>
      ) : (
        <>
          <Button disabled={busy || !valid} onPress={() => void confirm()}>
            {busy ? 'Confirming…' : 'Confirm charges and order'}
          </Button>
          <Button secondary disabled={busy} onPress={() => setReview(false)}>
            Cancel
          </Button>
        </>
      )}
      {message ? <Txt accessibilityRole="alert">{message}</Txt> : null}
    </Card>
  );
}

export function CartOrderQueue() {
  const auth = useAuth();
  const client = useQueryClient();
  const permitted = hasPermission(auth.identity, 'order.manage');
  const query = useQuery({
    queryKey: ['commerce', 'cart-queue', auth.session?.user.id],
    queryFn: commerceApi.cartQueue,
    enabled: permitted,
    retry: false,
  });
  if (!permitted) return null;
  return (
    <View style={{ gap: 14 }}>
      <OrderDecisions />
      <Txt style={s.h2}>Tractor orders awaiting confirmation</Txt>
      <Button secondary onPress={() => void query.refetch()}>
        Refresh orders
      </Button>
      {query.isPending ? (
        <Txt>Loading orders…</Txt>
      ) : query.error ? (
        <Txt accessibilityRole="alert">{query.error.message}</Txt>
      ) : (
        <>
          {!query.data.length ? (
            <Txt>No tractor orders awaiting confirmation.</Txt>
          ) : null}
          {query.data.map((order) => (
            <ReviewOrder
              key={order.id}
              order={order}
              refresh={() =>
                client.invalidateQueries({ queryKey: ['commerce'] })
              }
            />
          ))}
        </>
      )}
    </View>
  );
}
