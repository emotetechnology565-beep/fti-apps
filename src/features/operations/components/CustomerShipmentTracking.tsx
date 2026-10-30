import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Icon, Txt } from '@shared/ui';
import { usePage } from './shared';
import { PrivateDocuments } from './PrivateDocuments';
import type { Shipment } from '../services/operations-api';
import { DriverDetails } from './DriverDetails';
import { FulfillmentTimeline, type TimelineEvent } from './FulfillmentTimeline';

export function CustomerShipmentTracking({
  orderId,
  orderNo,
  status = '',
  destination = '',
  createdAt,
}: {
  orderId: string;
  orderNo?: string;
  status?: string;
  destination?: string;
  createdAt?: string;
}) {
  const list = usePage<Shipment[]>('shipments', { p_order: orderId });
  const shipments = list.data ?? [];
  const delivered =
    status === 'delivered' ||
    (shipments.length > 0 &&
      shipments.every((item) => item.status === 'delivered'));
  const dispatched =
    delivered ||
    status === 'shipped' ||
    shipments.some((item) =>
      ['shipped', 'in_transit', 'dispatched'].includes(item.status),
    );
  const stopped = ['cancelled', 'rejected', 'expired', 'refunded'].includes(
    status,
  );
  const timelineStatus = stopped
    ? status
    : delivered
      ? 'delivered'
      : dispatched
        ? 'shipped'
        : status;
  const history: TimelineEvent[] = [];
  const dispatchDate = shipments
    .map((item) => item.dispatched_at)
    .filter((date): date is string => !!date && !Number.isNaN(Date.parse(date)))
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  const deliveryDate = shipments
    .map((item) => item.delivered_at)
    .filter((date): date is string => !!date && !Number.isNaN(Date.parse(date)))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  if (dispatchDate) history.push({ status: 'shipped', at: dispatchDate });
  if (delivered && deliveryDate)
    history.push({ status: 'delivered', at: deliveryDate });
  const headline = stopped
    ? status === 'cancelled'
      ? 'Order cancelled'
      : status === 'rejected'
        ? 'Order rejected'
        : status === 'refunded'
          ? 'Order refunded'
          : 'Order expired'
    : delivered
      ? 'Your order has arrived'
      : dispatched
        ? 'Your order is on its way'
        : status === 'processing'
          ? 'Preparing your order'
          : 'Awaiting dispatch';
  const support = () =>
    router.push({ pathname: '/support', params: { order: orderId } });
  return (
    <View style={styles.page} testID="customer-shipment-tracking">
      <Card style={styles.card}>
        <View style={styles.header}>
          <View style={styles.grow}>
            <Txt style={styles.eyebrow}>ORDER & DISPATCH</Txt>
            <Txt style={styles.reference}>{orderNo ?? orderId}</Txt>
          </View>
          <Button
            secondary
            disabled={list.isFetching}
            icon="refresh-cw"
            onPress={() => void list.refetch()}
          >
            Refresh tracking
          </Button>
        </View>
        <View style={styles.summary}>
          <Txt accessibilityRole="header" style={styles.headline}>
            {headline}
          </Txt>
          <Txt style={styles.secondary}>
            {stopped
              ? 'Contact FTI for help with this order.'
              : delivered
                ? 'Check your delivery confirmation and documents below.'
                : dispatched
                  ? 'Follow the recorded milestones or call your assigned driver.'
                  : 'FTI will update this timeline as your order progresses.'}
          </Txt>
        </View>
        {destination ? (
          <View style={styles.destination}>
            <Icon name="map-pin" color="#58697C" size={17} />
            <View style={styles.grow}>
              <Txt style={styles.eyebrow}>DELIVERY TO</Txt>
              <Txt style={styles.value}>{destination}</Txt>
            </View>
          </View>
        ) : null}
        {!stopped ? (
          <View style={styles.estimate}>
            <Txt style={styles.secondary}>Estimated delivery</Txt>
            <Txt style={styles.value}>
              {delivered ? 'Delivery confirmed' : 'Awaiting carrier update'}
            </Txt>
          </View>
        ) : null}
      </Card>
      <Card style={styles.card}>
        <View style={styles.sectionHeader}>
          <Txt accessibilityRole="header" style={styles.sectionTitle}>
            Order & dispatch timeline
          </Txt>
          <Txt style={styles.secondary}>From confirmation to your doorstep</Txt>
        </View>
        {list.error ? (
          <View style={styles.notice}>
            <Txt accessibilityRole="alert">{list.error.message}</Txt>
            <Button secondary onPress={() => void list.refetch()}>
              Retry shipment details
            </Button>
          </View>
        ) : null}
        {list.isPending ? (
          <Txt style={styles.secondary}>Loading shipment details...</Txt>
        ) : null}
        <FulfillmentTimeline
          status={timelineStatus}
          createdAt={createdAt}
          history={history}
          deliveryNote={shipments
            .map((item) => item.delivery_note)
            .filter(Boolean)
            .join('; ')}
          dispatchDetails={
            shipments.length ? (
              <>
                {shipments.map((shipment) => (
                  <View key={shipment.id} style={styles.shipment}>
                    <Txt style={styles.eyebrow}>TRANSPORTER</Txt>
                    <Txt style={styles.value}>{shipment.carrier}</Txt>
                    <View style={styles.credentials}>
                      <View style={styles.credential}>
                        <Txt style={styles.secondary}>LR / tracking</Txt>
                        <Txt selectable style={styles.value}>
                          {shipment.tracking_number}
                        </Txt>
                      </View>
                      <View style={styles.credential}>
                        <Txt style={styles.secondary}>Vehicle</Txt>
                        <Txt selectable style={styles.value}>
                          {shipment.vehicle_number || 'Not provided'}
                        </Txt>
                      </View>
                    </View>
                    <DriverDetails
                      name={shipment.driver_name}
                      phone={shipment.driver_phone}
                    />
                  </View>
                ))}
              </>
            ) : undefined
          }
        />
        {!list.isPending && !list.error && !shipments.length && !stopped ? (
          <Txt style={styles.secondary}>
            No dispatch recorded. Transporter and driver details will appear
            here once assigned.
          </Txt>
        ) : null}
      </Card>
      <Card style={styles.card}>
        <Txt accessibilityRole="header" style={styles.sectionTitle}>
          Delivery documents
        </Txt>
        <Txt style={styles.secondary}>
          Certificates and proof of delivery for this order.
        </Txt>
        <PrivateDocuments
          kind="order_mtc"
          entityId={orderId}
          canUpload={false}
        />
        <PrivateDocuments
          kind="order_pod"
          entityId={orderId}
          canUpload={false}
        />
      </Card>
      <View style={styles.help}>
        <View style={styles.grow}>
          <Txt style={styles.value}>Need a delivery update?</Txt>
          <Txt style={styles.secondary}>
            Contact FTI with your order reference.
          </Txt>
        </View>
        <Button secondary icon="message-circle" onPress={support}>
          Contact logistics
        </Button>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  page: { gap: 14, backgroundColor: '#F5F7FA', padding: 12, borderRadius: 12 },
  card: {
    padding: 18,
    borderWidth: 1,
    borderColor: '#E4E8EE',
    borderRadius: 12,
    gap: 16,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  grow: { flex: 1, minWidth: 120, gap: 4 },
  eyebrow: {
    color: '#667386',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 16,
    letterSpacing: 0.8,
  },
  reference: {
    color: '#142D4E',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 23,
  },
  summary: { gap: 8, paddingVertical: 6 },
  headline: {
    color: '#142D4E',
    fontSize: 25,
    fontWeight: '700',
    lineHeight: 32,
    letterSpacing: -0.5,
  },
  secondary: { color: '#58697C', fontSize: 12, lineHeight: 19 },
  value: { color: '#142D4E', fontSize: 13, fontWeight: '600', lineHeight: 21 },
  destination: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#E4E8EE',
  },
  estimate: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 6,
  },
  sectionHeader: { gap: 4 },
  sectionTitle: {
    color: '#142D4E',
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '700',
  },
  notice: { gap: 8 },
  shipment: { gap: 8 },
  credentials: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  credential: { flex: 1, minWidth: 100, gap: 2 },
  help: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    padding: 8,
  },
});
