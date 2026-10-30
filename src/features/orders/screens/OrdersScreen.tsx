import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@features/auth/ui';
import { useStore } from '@core/state/workspace-store';
import {
  Heading,
  Empty,
  Card,
  Row,
  Txt,
  Badge,
  Button,
  Field,
  s,
} from '@shared/ui';
import { ShipmentTracking } from '@features/operations/ui';
import { commerceApi } from '../services/commerce-api';
import type { OrderDetail } from '../model/commerce-types';
import { OrderOverview, OrderStatus } from '../components/OrderOverview';
import { OrderPayments } from '../components/OrderPayments';
import { OrderClosure } from '../components/OrderClosure';
import { OrderLedger } from '../components/OrderLedger';

function OrderPanel({
  order,
  refresh,
}: {
  order: OrderDetail;
  refresh: () => Promise<void>;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const [utr, setUtr] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const activeReview = order.payments.some(
    (p) => p.status === 'review' || p.status === 'successful',
  );
  const expiry = Math.min(
    ...order.items.map((i) =>
      i.reservation_expires_at
        ? Date.parse(i.reservation_expires_at)
        : Infinity,
    ),
  );
  const canSubmit =
    order.status === 'pending_payment' && !activeReview && expiry > now;
  const awaitingConfirmation = order.status === 'pending_confirmation';
  async function submit() {
    setBusy(true);
    setMessage('');
    try {
      await commerceApi.bankSubmit(order.id, utr);
      setUtr('');
      setConfirm(false);
      setMessage(
        'Transfer reference submitted for manual bank verification. This is not a payment confirmation.',
      );
      await refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 18 }}>
      <OrderOverview order={order} />
      <OrderPayments kind="commerce" id={order.id} />
      <OrderClosure
        kind="commerce"
        id={order.id}
        status={order.status}
        onClosed={refresh}
      />
      {Number.isFinite(expiry) && order.status === 'pending_payment' ? (
        <Txt style={s.muted}>
          Stock reserved until {new Date(expiry).toLocaleString()}
        </Txt>
      ) : null}
      <ShipmentTracking
        orderId={order.id}
        orderNo={order.order_no}
        status={order.status}
        createdAt={order.created_at}
        destination={[
          order.delivery_address_snapshot.line1,
          order.delivery_address_snapshot.city,
          order.delivery_address_snapshot.state,
          order.delivery_address_snapshot.pincode,
        ]
          .filter(Boolean)
          .join(', ')}
      />
      {!awaitingConfirmation ? (
        <Card style={{ gap: 9 }}>
          <Txt style={s.h2}>Bank transfer review</Txt>
          <Txt>
            Only use bank details given directly by FTI. Entering a reference
            does not prove that funds arrived; authorized accounts staff verify
            the bank statement before confirming the order.
          </Txt>
          {!order.payments.length && (
            <Txt>No transfer reference submitted.</Txt>
          )}
          {order.payments.map((p) => (
            <View key={p.id} style={{ gap: 3 }}>
              <Badge>{p.status.toUpperCase()}</Badge>
              <Txt>
                Reference {p.reference} · INR {p.amount} ·{' '}
                {new Date(p.created_at).toLocaleString()}
              </Txt>
            </View>
          ))}
          {canSubmit && (
            <>
              <Field
                label="Bank UTR / transfer reference"
                placeholder="e.g. HDFC123456789012"
                value={utr}
                onChangeText={setUtr}
              />
              {!confirm ? (
                <Button
                  disabled={!/^[A-Za-z0-9/-]{6,40}$/.test(utr.trim()) || busy}
                  onPress={() => setConfirm(true)}
                >
                  Review transfer reference
                </Button>
              ) : (
                <>
                  <Txt>
                    Submit reference {utr.trim().toUpperCase()} for the
                    remaining INR {order.amount_due} for manual review?
                  </Txt>
                  <Button disabled={busy} onPress={() => void submit()}>
                    {busy ? 'Submitting…' : 'Confirm submission'}
                  </Button>
                  <Button
                    secondary
                    disabled={busy}
                    onPress={() => setConfirm(false)}
                  >
                    Cancel
                  </Button>
                </>
              )}
            </>
          )}
          {!!message && <Txt accessibilityRole="alert">{message}</Txt>}
        </Card>
      ) : null}
    </View>
  );
}

export function Orders({ financeOnly = false }: { financeOnly?: boolean }) {
  return financeOnly ? (
    <CommerceOrders financeOnly />
  ) : (
    <OrderLedger Panel={OrderPanel} />
  );
}

function CommerceOrders({ financeOnly = false }: { financeOnly?: boolean }) {
  const auth = useAuth();
  const client = useQueryClient();
  const localOrders = useStore((state) => state.orders);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ['commerce', 'mine', auth.session?.user.id, offset],
    queryFn: () => commerceApi.mine(offset),
    retry: false,
  });
  const detail = useQuery({
    queryKey: ['commerce', 'detail', auth.session?.user.id, selected],
    queryFn: () => commerceApi.detail(selected!),
    enabled: !!selected,
    retry: false,
  });
  async function refresh() {
    await client.invalidateQueries({ queryKey: ['commerce'] });
  }
  return (
    <View
      style={{
        gap: 16,
        ...(!financeOnly
          ? { backgroundColor: '#f8f9ff', padding: 12, borderRadius: 12 }
          : {}),
      }}
    >
      {!financeOnly ? (
        <View
          style={{
            backgroundColor: '#001835',
            borderRadius: 12,
            padding: 16,
            gap: 6,
          }}
        >
          <Txt
            style={{
              color: '#b0c8f1',
              fontSize: 10,
              fontWeight: '700',
              letterSpacing: 1,
            }}
          >
            YOUR LOGISTICS DESK
          </Txt>
          <Txt
            accessibilityRole="header"
            style={{
              color: '#fff',
              fontSize: 22,
              lineHeight: 29,
              fontWeight: '700',
            }}
          >
            Orders, dispatch & tracking
          </Txt>
          <Txt style={{ color: '#d5e3ff', fontSize: 12, lineHeight: 19 }}>
            Follow your consignment, view carrier details and access delivery
            documents.
          </Txt>
        </View>
      ) : null}
      {financeOnly ? (
        <Heading
          eyebrow={financeOnly ? 'PAYMENTS' : 'ORDERS & LOGISTICS'}
          title={financeOnly ? 'Payments & credit' : 'Orders & dispatch'}
          description={
            financeOnly
              ? 'Transfer references and verified order payments. Credit is not offered without an approved policy.'
              : 'Tractor cart orders, accepted quotation orders and their current status.'
          }
        />
      ) : null}
      <Button secondary onPress={() => void refresh()}>
        Refresh
      </Button>
      {selected ? (
        <>
          <Button secondary onPress={() => setSelected(null)}>
            Back to orders
          </Button>
          {detail.isPending ? (
            <Txt>Loading order…</Txt>
          ) : detail.error ? (
            <Empty
              title="Order unavailable"
              description={detail.error.message}
            />
          ) : (
            <OrderPanel order={detail.data} refresh={refresh} />
          )}
        </>
      ) : (
        <>
          {list.isPending ? (
            <Txt>Loading orders…</Txt>
          ) : list.error ? (
            <Empty
              title="Orders unavailable"
              description={list.error.message}
              action={
                <Button onPress={() => void list.refetch()}>Retry</Button>
              }
            />
          ) : (
            <>
              {!list.data.length && (
                <Empty
                  title="No orders yet"
                  description="Place an order from your cart or an accepted quotation to see dispatch and tracking updates here."
                />
              )}
              {list.data.map((order) => (
                <Card
                  key={order.id}
                  style={{
                    gap: 12,
                    borderWidth: 0,
                    borderRadius: 12,
                    padding: 16,
                    backgroundColor: '#fff',
                  }}
                >
                  <Row
                    style={{
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                    }}
                  >
                    <Txt style={s.h2}>{order.order_no}</Txt>
                    <OrderStatus status={order.status} />
                  </Row>
                  <Txt>
                    {order.status === 'pending_confirmation'
                      ? 'Item prices, GST and delivery charges awaiting admin confirmation'
                      : `INR ${order.grand_total} · Due INR ${order.amount_due}`}
                  </Txt>
                  <Txt>{new Date(order.created_at).toLocaleString()}</Txt>
                  <Button secondary onPress={() => setSelected(order.id)}>
                    {financeOnly
                      ? 'View order and payment'
                      : 'Track dispatch & view order'}
                  </Button>
                </Card>
              ))}
              <Row>
                <Button
                  secondary
                  disabled={!offset}
                  onPress={() => setOffset(Math.max(0, offset - 24))}
                >
                  Previous
                </Button>
                <Button
                  secondary
                  disabled={list.data.length < 24}
                  onPress={() => setOffset(offset + 24)}
                >
                  Next
                </Button>
              </Row>
            </>
          )}
          {!financeOnly && !!localOrders.length && (
            <Card style={{ gap: 8 }}>
              <Txt style={s.h2}>Earlier device records</Txt>
              <Txt style={s.muted}>
                These local records are unverified and have no confirmed
                financial status.
              </Txt>
              {localOrders.map((o) => (
                <Txt key={o.id}>
                  {o.id} · {o.status}
                </Txt>
              ))}
            </Card>
          )}
        </>
      )}
    </View>
  );
}
