import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, Txt } from '@shared/ui';

const stages = [
  {
    status: 'placed',
    title: 'Order placed',
    detail: 'Your requirements have been received.',
  },
  {
    status: 'confirmed',
    title: 'Order confirmed',
    detail: 'Availability and order terms confirmed.',
  },
  {
    status: 'processing',
    title: 'Preparing your order',
    detail: 'Material is being prepared for dispatch.',
  },
  {
    status: 'shipped',
    title: 'Dispatched',
    detail: 'Your consignment has left with the transporter.',
  },
  {
    status: 'delivered',
    title: 'Delivered',
    detail: 'Delivery has been confirmed by FTI.',
  },
];

export type TimelineEvent = { status: string; at: string };
export function FulfillmentTimeline({
  status,
  createdAt,
  history = [],
  dispatchDetails,
  confirmationNote,
  deliveryNote,
  compact = false,
}: {
  status: string;
  createdAt?: string;
  history?: TimelineEvent[];
  dispatchDetails?: ReactNode;
  confirmationNote?: string | null;
  deliveryNote?: string | null;
  compact?: boolean;
}) {
  const normalized = ['dispatched', 'in_transit'].includes(status)
    ? 'shipped'
    : status === 'paid'
      ? 'confirmed'
      : status;
  const stopped = ['cancelled', 'rejected', 'expired', 'refunded'].includes(
    normalized,
  );
  const active = Math.max(
    0,
    stages.findIndex((stage) => stage.status === normalized),
  );
  const visible = stopped
    ? [
        stages[0],
        {
          status: normalized,
          title:
            normalized === 'cancelled'
              ? 'Order cancelled'
              : normalized === 'rejected'
                ? 'Order rejected'
                : normalized === 'refunded'
                  ? 'Order refunded'
                  : 'Order expired',
          detail: 'Contact FTI if you need help with this order.',
        },
      ]
    : stages;
  return (
    <View
      accessibilityLabel="Order and dispatch timeline"
      testID="fulfillment-timeline"
      style={styles.timeline}
    >
      {visible.map((stage, index) => {
        const current = stopped ? index === 1 : index === active;
        const done = stopped ? index === 0 : index < active;
        const pending = !current && !done;
        const timestamp =
          stage.status === 'placed'
            ? createdAt
            : history.find((event) => event.status === stage.status)?.at;
        const date =
          timestamp && !Number.isNaN(Date.parse(timestamp))
            ? new Date(timestamp).toLocaleString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : null;
        return (
          <View key={stage.status} style={styles.step}>
            <View style={styles.rail}>
              <View
                style={[
                  styles.marker,
                  done && styles.doneMarker,
                  current && styles.currentMarker,
                  current && stage.status === 'delivered' && styles.doneMarker,
                ]}
              >
                <Icon
                  name={
                    done
                      ? 'check'
                      : current
                        ? stopped
                          ? 'x'
                          : stage.status === 'delivered'
                            ? 'check'
                            : 'clock'
                        : 'circle'
                  }
                  size={13}
                  color={done || current ? '#fff' : '#8792A2'}
                />
              </View>
              {index < visible.length - 1 ? (
                <View
                  style={[styles.connector, done && styles.doneConnector]}
                />
              ) : null}
            </View>
            <View
              style={[
                styles.content,
                compact && styles.compactContent,
                index === visible.length - 1 && styles.lastContent,
              ]}
            >
              <View style={styles.heading}>
                <Txt style={[styles.title, pending && styles.pendingTitle]}>
                  {stage.title}
                </Txt>
                {current ? (
                  <Txt
                    style={[
                      styles.currentLabel,
                      stopped && styles.stoppedLabel,
                      stage.status === 'delivered' && styles.completeLabel,
                    ]}
                  >
                    {stopped
                      ? 'CLOSED'
                      : stage.status === 'delivered'
                        ? 'COMPLETE'
                        : 'CURRENT'}
                  </Txt>
                ) : null}
              </View>
              {date && !pending ? <Txt style={styles.date}>{date}</Txt> : null}
              {!compact || current ? (
                <Txt style={styles.detail}>
                  {pending
                    ? 'Upcoming'
                    : stage.status === 'confirmed' && confirmationNote
                      ? confirmationNote
                      : stage.status === 'delivered' && deliveryNote
                        ? deliveryNote
                        : stage.detail}
                </Txt>
              ) : null}
              {stage.status === 'shipped' && !pending && dispatchDetails ? (
                <View style={styles.dispatch}>{dispatchDetails}</View>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  timeline: { paddingTop: 4 },
  step: { flexDirection: 'row', gap: 12 },
  rail: { width: 26, alignItems: 'center' },
  marker: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#DCE1E8',
    backgroundColor: '#F4F6F8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneMarker: { backgroundColor: '#26734D', borderColor: '#26734D' },
  currentMarker: { backgroundColor: '#A70101', borderColor: '#A70101' },
  connector: {
    width: 2,
    flex: 1,
    minHeight: 18,
    backgroundColor: '#E4E8EE',
    marginVertical: 4,
  },
  doneConnector: { backgroundColor: '#9FC4AF' },
  content: { flex: 1, minWidth: 0, gap: 5, paddingTop: 2, paddingBottom: 24 },
  compactContent: { paddingBottom: 16 },
  lastContent: { paddingBottom: 0 },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  title: {
    color: '#142D4E',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
    flexShrink: 1,
  },
  pendingTitle: { color: '#667386', fontWeight: '500' },
  currentLabel: {
    fontSize: 9,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: '#A70101',
  },
  stoppedLabel: { color: '#667386' },
  completeLabel: { color: '#26734D' },
  date: { color: '#667386', fontSize: 11, lineHeight: 17 },
  detail: { color: '#58697C', fontSize: 12, lineHeight: 19 },
  dispatch: {
    gap: 8,
    marginTop: 6,
    padding: 12,
    backgroundColor: '#F4F6F8',
    borderRadius: 8,
  },
});
