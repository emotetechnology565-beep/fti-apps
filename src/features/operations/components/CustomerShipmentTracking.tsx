import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Icon, Txt } from '@shared/ui';
import { usePage } from './shared';
import { PrivateDocuments } from './PrivateDocuments';
import type { Shipment } from '../services/operations-api';

const label = (value: string) =>
  value.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());
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
  const confirmed =
    dispatched || ['confirmed', 'processing', 'paid'].includes(status);
  const steps = [
    {
      title: 'Order placed',
      detail: createdAt
        ? new Date(createdAt).toLocaleString('en-IN')
        : 'Order received by FTI',
      done: true,
    },
    {
      title: 'Order confirmed',
      detail: confirmed
        ? 'Confirmation recorded'
        : 'Awaiting order confirmation',
      done: confirmed,
    },
    {
      title: 'Dispatched from yard',
      detail: dispatched
        ? 'Dispatch recorded by FTI'
        : 'Transporter and dispatch details will appear here',
      done: dispatched,
    },
    {
      title: 'Delivery confirmed',
      detail: delivered
        ? 'Delivery recorded by FTI'
        : 'Awaiting delivery confirmation',
      done: delivered,
    },
  ];
  const current = steps.findIndex((step) => !step.done);
  return (
    <View style={styles.page} testID="customer-shipment-tracking">
      <View style={styles.context}>
        <Icon name="truck" color="#b0c8f1" size={16} />
        <Txt style={styles.contextText}>DISPATCH / {orderNo ?? orderId}</Txt>
        <Button
          secondary
          disabled={list.isFetching}
          onPress={() => void list.refetch()}
          style={{
            marginLeft: 'auto',
            minHeight: 36,
            backgroundColor: '#e6eeff',
            borderWidth: 0,
          }}
        >
          Refresh tracking
        </Button>
      </View>
      <Card style={styles.card}>
        <View style={styles.row}>
          <View style={{ flex: 1, gap: 4 }}>
            <Txt style={styles.eyebrow}>CONSIGNMENT TRACKING</Txt>
            <Txt style={styles.identity}>{orderNo ?? orderId}</Txt>
            <Txt style={styles.secondary}>
              {destination || 'Delivery destination confirmed with your order'}
            </Txt>
          </View>
          <View style={styles.iconTile}>
            <Icon name="truck" size={24} color="#001835" />
          </View>
        </View>
        <View style={styles.status}>
          <View
            style={[
              styles.dot,
              { backgroundColor: delivered ? '#15803d' : '#485f83' },
            ]}
          />
          <Txt
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: '600',
              color: '#001835',
            }}
          >
            {delivered
              ? 'Delivered'
              : dispatched
                ? 'Dispatched — awaiting further updates'
                : 'Awaiting dispatch'}
          </Txt>
        </View>
        <View style={styles.eta}>
          <Txt style={styles.lightLabel}>ESTIMATED DELIVERY</Txt>
          <Txt style={styles.etaValue}>
            {delivered ? 'Delivery confirmed' : 'Awaiting carrier update'}
          </Txt>
          <Txt style={styles.lightNote}>
            {delivered
              ? 'See the delivery record and proof of delivery below.'
              : 'FTI will confirm the delivery schedule for this consignment.'}
          </Txt>
        </View>
      </Card>
      <Card style={styles.card}>
        <SectionTitle icon="briefcase" title="Fleet & Carrier Credentials" />
        {list.isPending ? (
          <Txt style={styles.secondary}>Loading shipment details…</Txt>
        ) : list.error ? (
          <View style={{ gap: 8 }}>
            <Txt accessibilityRole="alert">{list.error.message}</Txt>
            <Button secondary onPress={() => void list.refetch()}>
              Retry shipment details
            </Button>
          </View>
        ) : !shipments.length ? (
          <Txt style={styles.secondary}>
            No dispatch recorded. Carrier and vehicle details will appear after
            FTI dispatches your order.
          </Txt>
        ) : (
          shipments.map((shipment) => (
            <View key={shipment.id} style={{ gap: 8 }}>
              <View style={styles.panel}>
                <Txt style={styles.eyebrow}>FLEET OPERATOR</Txt>
                <Txt style={styles.value}>{shipment.carrier}</Txt>
                <Txt style={styles.secondary}>{label(shipment.status)}</Txt>
              </View>
              <View style={styles.metrics}>
                <Metric
                  title="VEHICLE NUMBER"
                  value={shipment.vehicle_number || 'Not provided'}
                />
                <Metric
                  title="BILTY / LR NUMBER"
                  value={shipment.tracking_number}
                />
              </View>
              {shipment.delivery_note ? (
                <View style={styles.panel}>
                  <Txt style={styles.eyebrow}>DELIVERY CONFIRMATION</Txt>
                  <Txt style={styles.value}>{shipment.delivery_note}</Txt>
                </View>
              ) : null}
            </View>
          ))
        )}
        <View style={styles.telemetry}>
          <Txt style={styles.eyebrow}>WEIGHBRIDGE RECORD</Txt>
          <View style={styles.metrics}>
            {['TARE WEIGHT', 'GROSS WEIGHT', 'NET PAYLOAD'].map((title) => (
              <Metric key={title} title={title} value="Not provided" />
            ))}
          </View>
          <Txt style={styles.secondary}>
            Weighbridge measurements have not been supplied in the tracking
            record.
          </Txt>
        </View>
      </Card>
      <Card style={styles.card}>
        <SectionTitle icon="git-commit" title="Consignment Milestones" />
        {status === 'cancelled' ? (
          <View style={styles.panel}>
            <Txt style={styles.value}>Order cancelled</Txt>
          </View>
        ) : (
          steps.map((step, index) => (
            <View key={step.title} style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ alignItems: 'center', width: 28 }}>
                <View
                  style={[
                    styles.stepCircle,
                    step.done && { backgroundColor: '#001835' },
                    index === current && { backgroundColor: '#b6171e' },
                  ]}
                >
                  <Icon
                    name={
                      step.done
                        ? 'check'
                        : index === current
                          ? 'clock'
                          : 'circle'
                    }
                    size={14}
                    color={step.done || index === current ? '#fff' : '#74777f'}
                  />
                </View>
                {index < steps.length - 1 ? (
                  <View
                    style={{
                      width: 2,
                      flex: 1,
                      minHeight: 28,
                      backgroundColor: step.done ? '#b0c8f1' : '#e6eeff',
                    }}
                  />
                ) : null}
              </View>
              <View style={{ flex: 1, paddingBottom: 16, gap: 4 }}>
                <Txt style={styles.value}>{step.title}</Txt>
                <Txt style={styles.secondary}>{step.detail}</Txt>
              </View>
            </View>
          ))
        )}
      </Card>
      <Card style={styles.card}>
        <SectionTitle icon="folder" title="Digital Document Ledger" />
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
        <Txt style={styles.secondary}>
          E-way bills and weighbridge slips are available from FTI logistics on
          request.
        </Txt>
      </Card>
      <Card style={{ ...styles.card, backgroundColor: '#dde9ff' }}>
        <SectionTitle icon="check-square" title="Consignee Receiving & POD" />
        <Txt style={styles.secondary}>
          On arrival, verify the delivered items against your order. Share any
          shortage, damage, or receiving documents with FTI support using your
          order reference.
        </Txt>
        <Button
          icon="message-circle"
          onPress={() =>
            router.push({ pathname: '/support', params: { order: orderId } })
          }
          style={styles.support}
        >
          Contact logistics / share receiving documents
        </Button>
      </Card>
      <Card style={styles.card}>
        <SectionTitle icon="map-pin" title="Location & Route Updates" />
        <View style={styles.map}>
          <Icon name="navigation" size={32} color="#485f83" />
          <Txt style={styles.value}>GPS tracking is not available</Txt>
          <Txt style={[styles.secondary, { textAlign: 'center' }]}>
            This consignment has no connected location feed. Use the recorded
            dispatch details or contact FTI for an update.
          </Txt>
        </View>
        <Button
          secondary
          icon="alert-triangle"
          onPress={() =>
            router.push({ pathname: '/support', params: { order: orderId } })
          }
        >
          Report a delivery delay or issue
        </Button>
      </Card>
      <Txt style={[styles.secondary, { textAlign: 'center' }]}>
        Fieldfast Tech · Customer logistics support
      </Txt>
    </View>
  );
}
function SectionTitle({
  icon,
  title,
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  title: string;
}) {
  return (
    <View style={styles.row}>
      <Icon name={icon} size={19} color="#001835" />
      <Txt accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Txt>
    </View>
  );
}
function Metric({ title, value }: { title: string; value: string }) {
  return (
    <View style={[styles.panel, { flex: 1, minWidth: 80 }]}>
      <Txt style={styles.eyebrow}>{title}</Txt>
      <Txt selectable style={styles.value}>
        {value}
      </Txt>
    </View>
  );
}
const styles = StyleSheet.create({
  page: { gap: 12, backgroundColor: '#f8f9ff', padding: 12, borderRadius: 12 },
  context: {
    backgroundColor: '#001835',
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  contextText: {
    color: '#ebf1ff',
    fontSize: 11,
    fontWeight: '700',
    flexShrink: 1,
  },
  card: {
    padding: 16,
    borderWidth: 0,
    borderRadius: 12,
    gap: 12,
    backgroundColor: '#fff',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: {
    color: '#485f83',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 15,
    letterSpacing: 0.5,
  },
  identity: {
    color: '#001835',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 27,
  },
  secondary: { color: '#44474e', fontSize: 12, lineHeight: 19 },
  value: { color: '#001835', fontSize: 14, fontWeight: '600', lineHeight: 21 },
  sectionTitle: {
    flex: 1,
    color: '#001835',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  iconTile: {
    width: 44,
    height: 44,
    backgroundColor: '#e6eeff',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#eff4ff',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  eta: { gap: 6, padding: 16, backgroundColor: '#001835', borderRadius: 12 },
  lightLabel: {
    fontSize: 10,
    color: '#b0c8f1',
    fontWeight: '700',
    letterSpacing: 1,
  },
  etaValue: { fontSize: 21, lineHeight: 28, color: '#fff', fontWeight: '700' },
  lightNote: { fontSize: 12, lineHeight: 19, color: '#d5e3ff' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  panel: { backgroundColor: '#eff4ff', padding: 10, borderRadius: 8, gap: 4 },
  telemetry: {
    padding: 12,
    gap: 8,
    backgroundColor: '#e6eeff',
    borderRadius: 8,
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#eff4ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  map: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    minHeight: 176,
    backgroundColor: '#eff4ff',
    borderRadius: 8,
  },
  support: {
    minHeight: 48,
    backgroundColor: '#b6171e',
    borderColor: '#b6171e',
    borderRadius: 8,
  },
});
