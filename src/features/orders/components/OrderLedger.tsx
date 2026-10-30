import { useCallback, useEffect, useState, type ComponentType } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@features/auth/ui';
import { Button, Empty, Icon, Txt } from '@shared/ui';
import { orderHistory, type HistoryOrder } from '../services/order-history';
import { commerceApi } from '../services/commerce-api';
import type { OrderDetail } from '../model/commerce-types';
import { FulfillmentTimeline } from '@features/operations/components/FulfillmentTimeline';
import { DriverDetails } from '@features/operations/components/DriverDetails';

const filters = [
  ['all', 'All Orders'],
  ['active', 'Active'],
  ['shipped', 'In Transit'],
  ['delivered', 'Delivered'],
] as const;
const statusLabel = (status: string) =>
  status === 'shipped' ? 'In transit' : status.replaceAll('_', ' ');
const money = (value: string) =>
  `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function LedgerCard({
  order,
  onOpen,
}: {
  order: HistoryOrder;
  onOpen: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { details: d, fulfillment: f } = order;
  return (
    <View style={styles.card}>
      <View style={styles.body}>
        <View style={styles.row}>
          <View style={styles.grow}>
            <Txt style={styles.reference}>{order.reference}</Txt>
            <Txt style={styles.small}>
              Booked:{' '}
              {new Date(order.created_at).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </Txt>
          </View>
          <View
            style={[styles.badge, order.status === 'shipped' && styles.live]}
          >
            <Txt style={styles.status}>{statusLabel(order.status)}</Txt>
          </View>
        </View>
        {d.business || d.location ? (
          <View style={styles.inset}>
            <Icon name="map-pin" color="#A70101" size={18} />
            <View style={styles.grow}>
              {d.business ? (
                <Txt style={styles.strong}>{d.business}</Txt>
              ) : null}
              <Txt style={styles.small}>{d.location}</Txt>
            </View>
          </View>
        ) : null}
        <View style={styles.row}>
          <Icon
            name={order.kind === 'fastener' ? 'tool' : 'package'}
            color="#00409A"
          />
          <Txt style={[styles.strong, styles.grow]}>
            {d.material || 'Order request'}
          </Txt>
          {d.quantity ? <Txt style={styles.strong}>{d.quantity}</Txt> : null}
        </View>
        <View style={styles.tags}>
          {[d.size, d.grade].filter(Boolean).map((text, i) => (
            <View style={styles.tag} key={i}>
              <Txt style={styles.small}>{text}</Txt>
            </View>
          ))}
        </View>
        <View style={styles.financial}>
          <View style={styles.grow}>
            <Txt style={styles.small}>
              {order.total && order.status !== 'pending_confirmation'
                ? 'Confirmed order value'
                : 'Order value'}
            </Txt>
            <Txt style={styles.value}>
              {order.total && order.status !== 'pending_confirmation'
                ? money(order.total)
                : 'Awaiting confirmation'}
            </Txt>
          </View>
          {order.kind === 'commerce' &&
          order.status !== 'pending_confirmation' &&
          order.amount_due ? (
            <Txt style={styles.small}>Due {money(order.amount_due)}</Txt>
          ) : null}
        </View>
        <View style={styles.timelineSection}>
          <Txt style={styles.strong}>Order & dispatch timeline</Txt>
          <FulfillmentTimeline
            status={order.status}
            createdAt={order.created_at}
            history={f.history}
            compact={!expanded}
            confirmationNote={f.confirmation_note}
            deliveryNote={f.delivery_note}
            dispatchDetails={
              f.carrier ? (
                <>
                  <Txt style={styles.strong}>{f.carrier}</Txt>
                  <Txt style={styles.small}>
                    LR / tracking: {f.tracking_number || 'Not provided'}
                  </Txt>
                  {f.vehicle_number ? (
                    <Txt style={styles.small}>Vehicle: {f.vehicle_number}</Txt>
                  ) : null}
                  <DriverDetails name={f.driver_name} phone={f.driver_phone} />
                </>
              ) : undefined
            }
          />
        </View>
        <Button
          icon={order.kind === 'commerce' ? 'truck' : 'file-text'}
          onPress={
            order.kind === 'commerce' ? onOpen : () => setExpanded(!expanded)
          }
          style={styles.action}
        >
          {order.kind === 'commerce'
            ? 'Track dispatch & view order'
            : expanded
              ? 'Hide order details'
              : 'View order & dispatch details'}
        </Button>
        {expanded ? (
          <View style={styles.notes}>
            <Txt style={styles.strong}>Fulfillment updates</Txt>
            <Txt style={styles.small}>
              {f.confirmation_note ||
                'FTI will confirm availability, pricing and delivery before payment.'}
            </Txt>
            {f.delivery_note ? (
              <Txt style={styles.small}>Delivery: {f.delivery_note}</Txt>
            ) : null}
            {!f.carrier ? (
              <Txt style={styles.small}>
                Transporter and tracking details will appear after dispatch.
              </Txt>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function OrderLedger({
  Panel,
}: {
  Panel: ComponentType<{ order: OrderDetail; refresh: () => Promise<void> }>;
}) {
  const auth = useAuth();
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('all');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search);
      setOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const list = useQuery({
    queryKey: [
      'commerce',
      'history',
      auth.session?.user.id,
      offset,
      term,
      status,
    ],
    queryFn: () => orderHistory(offset, term, status),
    enabled: !!auth.session,
    retry: false,
  });
  const detail = useQuery({
    queryKey: ['commerce', 'detail', auth.session?.user.id, selected],
    queryFn: () => commerceApi.detail(selected!),
    enabled: !!auth.session && !!selected,
    retry: false,
  });
  const refresh = useCallback(async () => {
    await client.invalidateQueries({ queryKey: ['commerce'] });
  }, [client]);
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  return (
    <View style={styles.page}>
      <View style={styles.row}>
        <View style={styles.grow}>
          <Txt style={styles.eyebrow}>CONSIGNMENT LEDGER</Txt>
          <Txt accessibilityRole="header" style={styles.title}>
            My Orders & Consignments
          </Txt>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh orders"
          onPress={() => void refresh()}
          style={styles.refresh}
        >
          <Icon name="refresh-cw" color="#00409A" size={18} />
        </Pressable>
      </View>
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
              action={
                <Button onPress={() => void detail.refetch()}>Retry</Button>
              }
            />
          ) : (
            <Panel order={detail.data} refresh={refresh} />
          )}
        </>
      ) : (
        <>
          <View style={styles.search}>
            <Icon name="search" size={19} />
            <TextInput
              accessibilityLabel="Search orders"
              placeholder="Search Order ID, material, grade, LR No."
              placeholderTextColor="#74777f"
              value={search}
              onChangeText={setSearch}
              style={styles.input}
            />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filters}
          >
            {filters.map(([key, label]) => (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityState={{ selected: status === key }}
                onPress={() => {
                  setStatus(key);
                  setOffset(0);
                }}
                style={[styles.filter, status === key && styles.selected]}
              >
                <Txt
                  style={[
                    styles.filterText,
                    status === key && styles.selectedText,
                  ]}
                >
                  {label}
                </Txt>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.row}>
            <Txt style={[styles.small, styles.grow]}>
              {list.data ? `${list.data.total} orders` : 'Orders'} · All dates
            </Txt>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setSearch('');
                setTerm('');
                setStatus('all');
                setOffset(0);
              }}
              style={styles.reset}
            >
              <Txt style={styles.resetText}>Reset Filters</Txt>
            </Pressable>
          </View>
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
              {!list.data.orders.length ? (
                <Empty
                  title={
                    term || status !== 'all'
                      ? 'No matching orders'
                      : 'No orders yet'
                  }
                  description={
                    term || status !== 'all'
                      ? 'Try another search or reset the filters.'
                      : 'Your submitted materials, fasteners and parts will appear here.'
                  }
                />
              ) : null}
              {list.data.orders.map((order) => (
                <LedgerCard
                  key={`${order.kind}:${order.id}`}
                  order={order}
                  onOpen={() => setSelected(order.id)}
                />
              ))}
              {list.data.total > 24 || offset > 0 ? (
                <View style={styles.row}>
                  <Button
                    secondary
                    disabled={!offset}
                    onPress={() => setOffset(Math.max(0, offset - 24))}
                  >
                    Previous
                  </Button>
                  <Txt style={styles.small}>
                    {offset + 1}–{Math.min(offset + 24, list.data.total)} of{' '}
                    {list.data.total}
                  </Txt>
                  <Button
                    secondary
                    disabled={offset + 24 >= list.data.total}
                    onPress={() => setOffset(offset + 24)}
                  >
                    Next
                  </Button>
                </View>
              ) : null}
            </>
          )}
        </>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  page: { backgroundColor: '#f8f9ff', padding: 16, gap: 14, borderRadius: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  grow: { flex: 1, minWidth: 100 },
  eyebrow: {
    color: '#A70101',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
    marginBottom: 5,
  },
  title: {
    color: '#111827',
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  refresh: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#e6eeff',
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  input: { flex: 1, minWidth: 0, height: 46, color: '#101c2c', fontSize: 13 },
  filters: { gap: 8 },
  filter: {
    borderRadius: 24,
    backgroundColor: '#eff4ff',
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  selected: { backgroundColor: '#00409A' },
  filterText: { color: '#142d4e', fontSize: 12, fontWeight: '700' },
  selectedText: { color: '#fff' },
  reset: { minHeight: 44, justifyContent: 'center' },
  resetText: { fontSize: 11, fontWeight: '700', color: '#A70101' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    borderColor: '#e6eeff',
    borderWidth: 1,
  },
  timelineSection: {
    gap: 12,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#E4E8EE',
  },
  body: { padding: 16, gap: 12 },
  reference: { color: '#111827', fontSize: 17, fontWeight: '700' },
  small: { color: '#44474e', fontSize: 12, lineHeight: 18 },
  strong: { color: '#142d4e', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#e6eeff',
    borderRadius: 20,
  },
  live: { backgroundColor: '#ffdad6' },
  status: {
    color: '#142d4e',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  inset: {
    backgroundColor: '#eff4ff',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    backgroundColor: '#e6eeff',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  financial: {
    backgroundColor: '#dde9ff',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  value: { color: '#111827', fontSize: 17, lineHeight: 25, fontWeight: '700' },
  action: {
    backgroundColor: '#A70101',
    borderWidth: 0,
    borderRadius: 10,
    minHeight: 44,
  },
  notes: { gap: 8, paddingTop: 4 },
});
