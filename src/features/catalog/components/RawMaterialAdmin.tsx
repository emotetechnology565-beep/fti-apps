import {
  RequestFulfillment,
  type RequestFulfillmentState,
} from '@features/operations/ui';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@features/auth/ui';
import {
  Button,
  Card,
  Field,
  Row,
  Txt,
  RequestSummary,
  OrderStatusFilters,
  Badge,
  s,
} from '@shared/ui';
import { catalogApi } from '../data/catalog-repository';
import { parseNotificationPhones } from '../model/notification-recipients';

type Recipient = { phone: string; label: string; enabled: boolean };
type Delivery = {
  id: string;
  phone: string;
  template: string;
  status: string;
  error: string | null;
};
type Request = {
  id: string;
  created_at: string;
  details: Record<string, unknown>;
  deliveries: Delivery[];
  fulfillment?: RequestFulfillmentState;
};
export function RawMaterialAdmin({
  section = 'all',
}: {
  section?: 'all' | 'orders' | 'recipients';
}) {
  const auth = useAuth();
  const currentPhone =
    auth.identity?.profile.phone ?? auth.session?.user.phone ?? '';
  const [phone, setPhone] = useState(
    currentPhone && !currentPhone.startsWith('+')
      ? '+' + currentPhone
      : currentPhone,
  );
  const [label, setLabel] = useState(
    auth.identity?.profile.full_name || 'Signed-in admin',
  );
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState('all');
  const [replay, setReplay] = useState<string | null>(null);
  const recipients = useQuery({
    queryKey: ['raw-recipients', auth.session?.user.id],
    queryFn: () => catalogApi.rpc<Recipient[]>('fti_catalog_raw_recipients'),
    retry: false,
    enabled: section !== 'orders',
  });
  const orders = useQuery({
    queryKey: ['raw-orders', auth.session?.user.id, offset, status],
    queryFn: () =>
      catalogApi.rpc<Request[]>('fti_catalog_raw_orders', {
        p_offset: offset,
        p_status: status,
      }),
    retry: false,
    enabled: section !== 'recipients',
  });
  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await action();
      await Promise.all([
        ...(section !== 'orders' ? [recipients.refetch()] : []),
        ...(section !== 'recipients' ? [orders.refetch()] : []),
      ]);
      setMessage('Saved.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const save = (value: Recipient) =>
    catalogApi.rpc('fti_catalog_raw_recipient_save', {
      p_phone: value.phone,
      p_label: value.label,
      p_enabled: value.enabled,
    });
  async function addRecipients() {
    if (busy) return;
    let phones: string[];
    try {
      phones = parseNotificationPhones(phone);
      if (!label.trim() || label.trim().length > 80)
        throw new Error('Enter a recipient name of up to 80 characters.');
    } catch (error) {
      setMessage((error as Error).message);
      return;
    }
    setBusy(true);
    setMessage('');
    let saved = 0;
    try {
      for (const value of phones) {
        await save({ phone: value, label: label.trim(), enabled: true });
        saved++;
      }
      setMessage(
        `Saved ${saved} notification number${saved === 1 ? '' : 's'}.`,
      );
    } catch (error) {
      setMessage(
        `${saved ? `Saved ${saved} of ${phones.length} numbers. ` : ''}${(error as Error).message}`,
      );
    } finally {
      await recipients.refetch();
      setBusy(false);
    }
  }
  return (
    <Card style={{ gap: 16 }}>
      {section !== 'orders' ? (
        <>
          <Txt style={s.h2}>Order notification recipients</Txt>
          <Txt>
            Add one or more authorized FTI recipients. Each enabled number
            receives buyer and order details for new requests.
          </Txt>
          <Button
            secondary
            onPress={() => {
              const value =
                auth.identity?.profile.phone ?? auth.session?.user.phone ?? '';
              setPhone(value.startsWith('+') ? value : '+' + value);
              setLabel(auth.identity?.profile.full_name || 'Signed-in admin');
            }}
          >
            Use my signed-in number
          </Button>
          <Field
            label="Recipient name"
            value={label}
            onChangeText={setLabel}
            placeholder="e.g. Sales desk"
          />
          <Field
            label="WhatsApp number with country code"
            value={phone}
            onChangeText={setPhone}
            placeholder="+919876543210"
          />
          <Txt style={s.muted}>
            For multiple numbers, separate them with commas. Each number is
            saved as an individual recipient.
          </Txt>
          <Button
            disabled={busy || !phone || !label}
            onPress={() => void addRecipients()}
          >
            {busy ? 'Saving...' : 'Add notification number'}
          </Button>
          {recipients.isPending ? <Txt>Loading recipients...</Txt> : null}
          {recipients.error ? (
            <Txt accessibilityRole="alert">{recipients.error.message}</Txt>
          ) : null}
          {recipients.data?.length === 0 ? (
            <Txt>
              No recipients configured. Add a number to enable admin WhatsApp
              notifications.
            </Txt>
          ) : null}
          {recipients.data?.map((r) => (
            <Card key={r.phone} style={{ gap: 8 }}>
              <Txt>
                {r.label}: {r.phone} â€” {r.enabled ? 'Enabled' : 'Disabled'}
              </Txt>
              <Row style={{ flexWrap: 'wrap' }}>
                <Button
                  secondary
                  disabled={busy}
                  onPress={() =>
                    void run(() => save({ ...r, enabled: !r.enabled }))
                  }
                >
                  {r.enabled ? 'Disable' : 'Enable'}
                </Button>
                <Button
                  secondary
                  disabled={busy}
                  onPress={() =>
                    void run(() =>
                      catalogApi.rpc('fti_catalog_raw_recipient_remove', {
                        p_phone: r.phone,
                      }),
                    )
                  }
                >
                  Remove {r.label}
                </Button>
              </Row>
            </Card>
          ))}
        </>
      ) : null}
      {section !== 'recipients' ? (
        <>
          <Txt style={s.h2}>Raw-material order requests</Txt>
          <Button
            secondary
            onPress={() =>
              void Promise.all([
                orders.refetch(),
                ...(section === 'all' ? [recipients.refetch()] : []),
              ])
            }
          >
            Refresh material requests
          </Button>
          <OrderStatusFilters
            value={status}
            onChange={(value) => {
              setStatus(value);
              setOffset(0);
            }}
          />
          {orders.isPending ? <Txt>Loading requests...</Txt> : null}
          {orders.error ? (
            <Txt accessibilityRole="alert">{orders.error.message}</Txt>
          ) : null}
          {orders.data?.length === 0 ? (
            <Txt>No order requests match this filter.</Txt>
          ) : null}
          {orders.data?.map((order) => (
            <RequestSummary
              key={order.id}
              details={order.details}
              createdAt={order.created_at}
              status={order.fulfillment?.status}
              fulfillment={
                <RequestFulfillment
                  kind="material"
                  requestId={order.id}
                  initial={order.fulfillment}
                />
              }
            >
              <Txt style={s.h2}>WhatsApp delivery</Txt>
              {!order.deliveries?.length ? (
                <Txt>No notification deliveries recorded.</Txt>
              ) : null}
              {(order.deliveries ?? []).map((delivery) => (
                <Card key={delivery.id} style={{ gap: 8 }}>
                  <Row
                    style={{
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    <Txt selectable>{delivery.phone}</Txt>
                    <Badge
                      tone={
                        ['failed', 'manual_review'].includes(delivery.status)
                          ? 'red'
                          : delivery.status === 'sent'
                            ? 'green'
                            : 'gray'
                      }
                    >
                      {delivery.status.replaceAll('_', ' ')}
                    </Badge>
                  </Row>
                  <Txt style={s.muted}>
                    {delivery.template.includes('admin')
                      ? 'Admin notification'
                      : 'Buyer acknowledgment'}
                  </Txt>
                  {delivery.error ? <Txt>{delivery.error}</Txt> : null}
                  {['failed', 'manual_review'].includes(delivery.status) ? (
                    replay === delivery.id ? (
                      <>
                        <Txt>
                          Check Meta delivery logs first. Only retry if this
                          message was not delivered.
                        </Txt>
                        <Button
                          disabled={busy}
                          onPress={() =>
                            void run(async () => {
                              await catalogApi.rpc(
                                'fti_catalog_raw_delivery_replay',
                                { p_id: delivery.id },
                              );
                              setReplay(null);
                            })
                          }
                        >
                          Confirm not delivered and retry
                        </Button>
                        <Button secondary onPress={() => setReplay(null)}>
                          Cancel retry
                        </Button>
                      </>
                    ) : (
                      <Button secondary onPress={() => setReplay(delivery.id)}>
                        Review failed delivery
                      </Button>
                    )
                  ) : null}
                </Card>
              ))}
            </RequestSummary>
          ))}
          <Row style={{ flexWrap: 'wrap' }}>
            <Button
              secondary
              disabled={offset === 0}
              onPress={() => setOffset(Math.max(0, offset - 25))}
            >
              Previous
            </Button>
            <Button
              secondary
              disabled={!orders.data || orders.data.length < 25}
              onPress={() => setOffset(offset + 25)}
            >
              Next
            </Button>
          </Row>
        </>
      ) : null}
      {message ? <Txt accessibilityRole="alert">{message}</Txt> : null}
    </Card>
  );
}
