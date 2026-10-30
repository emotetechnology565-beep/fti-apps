import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { hasPermission } from '@features/auth';
import { useAuth } from '@features/auth/ui';
import { RequestFulfillment } from '@features/operations/ui';
import {
  OrderPayments,
  PaymentTotals,
} from '@features/orders/components/OrderPayments';
import { OrderOverview } from '@features/orders/components/OrderOverview';
import { OrderClosure } from '@features/orders/components/OrderClosure';
import { commerceApi } from '@features/orders/services/commerce-api';
import { Badge, Button, Card, Empty, Field, Txt } from '@shared/ui';
import { fetchAdminOrders } from '../services/admin-orders-api';
import { exportOrders } from '../services/export-orders';
import {
  emptyOrderFilters,
  orderDateRange,
  orderFilterError,
  orderKinds,
  orderKindLabel,
  orderStates,
  orderStateLabel,
  type AdminOrder,
  type OrderFilters,
  type OrderSummary,
} from '../model/admin-orders';

const currency = (value: string) =>
  `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const dateLabel = (value: string) =>
  new Date(value).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

function Choices({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly (readonly [string, string])[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={label}
      contentContainerStyle={styles.choices}
    >
      {options.map(([key, text]) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${text}`}
          accessibilityState={{ selected: value === key }}
          onPress={() => onChange(key)}
          style={[styles.choice, value === key && styles.chosen]}
        >
          <Txt style={[styles.choiceText, value === key && styles.chosenText]}>
            {text}
          </Txt>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function PartsDetail({ order }: { order: AdminOrder }) {
  const auth = useAuth();
  const detail = useQuery({
    queryKey: ['commerce', 'detail', auth.session?.user.id, order.id],
    queryFn: () => commerceApi.detail(order.id),
    retry: false,
  });
  if (detail.isPending) return <Txt>Loading order details…</Txt>;
  if (detail.error)
    return (
      <Empty
        title="Order details unavailable"
        description={detail.error.message}
        action={
          <Button secondary onPress={() => void detail.refetch()}>
            Retry details
          </Button>
        }
      />
    );
  return (
    <>
      <OrderOverview order={detail.data} />
      <OrderPayments kind="commerce" id={order.id} editable />
      <OrderClosure
        kind="commerce"
        id={order.id}
        status={detail.data.status}
        admin
      />
      {detail.data.status === 'pending_confirmation' ? (
        <Button
          secondary
          onPress={() => router.setParams({ section: 'tractor-orders' })}
        >
          Open order confirmation
        </Button>
      ) : null}
    </>
  );
}

function OrderCard({
  order,
  expanded,
  onToggle,
}: {
  order: AdminOrder;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Card style={styles.order}>
      <View style={styles.orderTop}>
        <View style={styles.grow}>
          <Txt selectable style={styles.reference}>
            {order.reference}
          </Txt>
          <Txt style={styles.muted}>
            {orderKindLabel(order.kind)} · {dateLabel(order.created_at)} IST
          </Txt>
        </View>
        <Badge
          tone={
            order.status === 'delivered'
              ? 'green'
              : ['cancelled', 'rejected'].includes(order.status)
                ? 'gray'
                : 'blue'
          }
        >
          {orderStateLabel(order.status)}
        </Badge>
      </View>
      <Txt style={styles.customer}>
        {order.business || order.buyer_name || 'Customer'}
      </Txt>
      <Txt>
        {[order.material, order.size, order.grade].filter(Boolean).join(' · ')}
      </Txt>
      <View style={styles.orderTop}>
        <Txt style={styles.muted}>
          {order.quantity || 'Quantity in order details'}
        </Txt>
        <Txt style={styles.customer}>
          {order.total && order.status !== 'pending_confirmation'
            ? currency(order.total)
            : 'Value awaiting confirmation'}
        </Txt>
      </View>
      {order.payment_summary ? (
        <PaymentTotals summary={order.payment_summary} />
      ) : null}
      <Button
        secondary
        onPress={onToggle}
      >{`${expanded ? 'Hide' : 'View'} order ${order.reference}`}</Button>
      {expanded ? (
        <View style={styles.details}>
          <Txt style={styles.customer}>Buyer & delivery</Txt>
          <Txt selectable>
            {[order.buyer_name, order.phone].filter(Boolean).join(' · ')}
          </Txt>
          <Txt>{order.location || 'No delivery location supplied'}</Txt>
          {order.closure_note ? <Txt>Reason: {order.closure_note}</Txt> : null}
          {order.kind === 'commerce' ? (
            <PartsDetail order={order} />
          ) : (
            <RequestFulfillment
              kind={order.kind}
              requestId={order.id}
              initial={order.fulfillment}
            />
          )}
        </View>
      ) : null}
    </Card>
  );
}

function OrderMetrics({ summary }: { summary: OrderSummary }) {
  return (
    <>
      <View style={styles.metrics}>
        {(
          [
            ['Matching orders', summary.total],
            ['Awaiting action', summary.awaiting],
            ['Processing', summary.processing],
            ['Dispatched', summary.shipped],
            ['Delivered', summary.delivered],
            ['Cancelled / rejected', summary.cancelled + summary.rejected],
          ] as const
        ).map(([label, value]) => (
          <View key={label} style={styles.metric}>
            <Txt style={styles.metricValue}>{value}</Txt>
            <Txt style={styles.muted}>{label}</Txt>
          </View>
        ))}
      </View>
      <View style={styles.valueRow}>
        <Txt style={styles.customer}>
          Confirmed order value {currency(summary.confirmed_value)}
        </Txt>
        <Txt style={styles.muted}>
          Order value for confirmed, processing, dispatched and delivered
          orders. This is not payment received.
        </Txt>
      </View>
    </>
  );
}

export function AdminOrdersOverview() {
  const auth = useAuth();
  const permitted = hasPermission(auth.identity, 'order.manage');
  const [draft, setDraft] = useState<OrderFilters>(emptyOrderFilters);
  const [filters, setFilters] = useState<OrderFilters>(emptyOrderFilters);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');
  const list = useQuery({
    queryKey: ['admin-orders', auth.session?.user.id, filters, offset],
    queryFn: () => fetchAdminOrders(filters, offset),
    enabled: permitted,
    retry: false,
  });
  function apply(next: OrderFilters) {
    const validation = orderFilterError(next);
    setError(validation ?? '');
    if (validation) return;
    setDraft(next);
    setFilters({ ...next, search: next.search.trim() });
    setOffset(0);
    setSelected(null);
    setMessage('');
  }
  async function download() {
    if (exporting) return;
    setExporting(true);
    setMessage('');
    try {
      const count = await exportOrders(filters);
      setMessage(`Excel file prepared with ${count} matching orders.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setExporting(false);
    }
  }
  if (!permitted)
    return (
      <Empty
        title="Order access required"
        description="Your account needs order management permission to view this overview."
      />
    );
  const summary = list.data?.summary;
  const changed = JSON.stringify(draft) !== JSON.stringify(filters);
  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <View style={styles.intro}>
          <Txt style={styles.eyebrow}>ALL ORDER TYPES</Txt>
          <Txt style={styles.description}>
            Find a customer order, review progress and export the orders you
            need.
          </Txt>
        </View>
        <Button
          icon="download"
          disabled={
            exporting || list.isPending || !!list.error || !summary?.total
          }
          onPress={() => void download()}
        >
          {exporting ? 'Preparing Excel…' : 'Export Excel'}
        </Button>
        <Button
          secondary
          icon="refresh-cw"
          disabled={list.isFetching}
          onPress={() => void list.refetch()}
        >
          Refresh orders
        </Button>
      </View>
      {summary && !list.error ? <OrderMetrics summary={summary} /> : null}
      <Card style={styles.filters}>
        <Field
          label="Search orders"
          placeholder="Reference, customer, phone, material or tracking"
          value={draft.search}
          onChangeText={(search) => setDraft({ ...draft, search })}
        />
        <Choices
          label="Order type"
          options={orderKinds}
          value={draft.kind}
          onChange={(kind) =>
            setDraft({ ...draft, kind: kind as OrderFilters['kind'] })
          }
        />
        <Choices
          label="Order status"
          options={orderStates}
          value={draft.status}
          onChange={(status) => setDraft({ ...draft, status })}
        />
        <View style={styles.dates}>
          <View style={styles.dateField}>
            <Field
              label="From date (YYYY-MM-DD)"
              placeholder="2026-10-01"
              value={draft.from}
              onChangeText={(from) => setDraft({ ...draft, from })}
            />
          </View>
          <View style={styles.dateField}>
            <Field
              label="To date (YYYY-MM-DD)"
              placeholder="2026-10-31"
              value={draft.to}
              onChangeText={(to) => setDraft({ ...draft, to })}
            />
          </View>
        </View>
        <Txt style={styles.muted}>
          Dates include the full day in India time (IST).
        </Txt>
        <View style={styles.actions}>
          {[
            ['Today', 1],
            ['Last 7 days', 7],
            ['Last 30 days', 30],
          ].map(([label, days]) => (
            <Button
              key={label}
              secondary
              onPress={() =>
                apply({ ...draft, ...orderDateRange(Number(days)) })
              }
            >
              {String(label)}
            </Button>
          ))}
          <Button
            secondary
            onPress={() => apply({ ...draft, from: '', to: '' })}
          >
            All dates
          </Button>
        </View>
        <View style={styles.actions}>
          <Button icon="search" onPress={() => apply(draft)}>
            Search & apply filters
          </Button>
          <Button secondary onPress={() => apply(emptyOrderFilters)}>
            Reset filters
          </Button>
        </View>
        {changed ? (
          <Txt style={styles.muted}>
            Apply filters to update the overview, results and Excel export.
          </Txt>
        ) : null}
        {error ? (
          <Txt accessibilityRole="alert" style={styles.error}>
            {error}
          </Txt>
        ) : null}
      </Card>
      {message ? <Txt accessibilityRole="alert">{message}</Txt> : null}
      {list.isPending ? (
        <Txt>Loading order overview…</Txt>
      ) : list.error ? (
        <Empty
          title="Orders unavailable"
          description={list.error.message}
          action={
            <Button onPress={() => void list.refetch()}>Retry orders</Button>
          }
        />
      ) : summary ? (
        <>
          <Txt style={styles.muted}>
            {summary.total} matching orders · {filters.from || 'All dates'}
            {filters.to ? ` to ${filters.to}` : ''} ·{' '}
            {orderKindLabel(filters.kind)} · {orderStateLabel(filters.status)}
            {filters.search ? ` · “${filters.search}”` : ''}
          </Txt>
          {list.data.orders.length ? (
            list.data.orders.map((order) => (
              <OrderCard
                key={`${order.kind}:${order.id}`}
                order={order}
                expanded={selected === `${order.kind}:${order.id}`}
                onToggle={() =>
                  setSelected(
                    selected === `${order.kind}:${order.id}`
                      ? null
                      : `${order.kind}:${order.id}`,
                  )
                }
              />
            ))
          ) : (
            <Empty
              title="No matching orders"
              description="Try a different reference or date range, or reset the filters."
            />
          )}
          {summary.total > 24 || offset > 0 ? (
            <View style={styles.actions}>
              <Button
                secondary
                disabled={!offset}
                onPress={() => {
                  setOffset(Math.max(0, offset - 24));
                  setSelected(null);
                }}
              >
                Previous orders
              </Button>
              <Txt style={styles.muted}>
                {summary.total
                  ? `${offset + 1}–${Math.min(offset + 24, summary.total)} of ${summary.total}`
                  : 'No results'}
              </Txt>
              <Button
                secondary
                disabled={offset + 24 >= summary.total}
                onPress={() => {
                  setOffset(offset + 24);
                  setSelected(null);
                }}
              >
                Next orders
              </Button>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 18 },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  grow: { flex: 1, minWidth: 180, gap: 6 },
  intro: { flex: 1, minWidth: 240, gap: 6 },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.1,
    fontWeight: '700',
    color: '#A70101',
  },
  description: { color: '#58697C', fontSize: 14, lineHeight: 21 },
  filters: { gap: 12 },
  choices: { gap: 8 },
  choice: {
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#DCE1E8',
  },
  chosen: { backgroundColor: '#142D4E', borderColor: '#142D4E' },
  choiceText: { fontSize: 12, color: '#58697C', fontWeight: '600' },
  chosenText: { color: '#fff' },
  dates: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  dateField: { flex: 1, minWidth: 200 },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
  },
  muted: { color: '#58697C', fontSize: 12, lineHeight: 19 },
  error: { color: '#A70101' },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#DCE1E8',
  },
  metric: {
    flexGrow: 1,
    flexBasis: 140,
    paddingVertical: 16,
    paddingHorizontal: 12,
    gap: 5,
  },
  metricValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#142D4E',
    fontVariant: ['tabular-nums'],
  },
  valueRow: { gap: 5 },
  order: { gap: 10 },
  orderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  reference: { fontSize: 16, fontWeight: '700', color: '#142D4E' },
  customer: { fontSize: 14, fontWeight: '600', color: '#142D4E' },
  details: {
    gap: 12,
    paddingTop: 14,
    borderTopWidth: 1,
    borderColor: '#E4E8EE',
  },
});
