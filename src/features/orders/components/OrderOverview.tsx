import { StyleSheet, View } from 'react-native';
import { Badge, Card, Icon, Row, Txt, c } from '@shared/ui';
import type { OrderDetail } from '../model/commerce-types';

export function OrderStatus({ status }: { status: string }) {
  const label =
    status === 'pending_confirmation'
      ? 'Awaiting confirmation'
      : status === 'pending_payment'
        ? 'Awaiting payment'
        : status
            .replaceAll('_', ' ')
            .replace(/^./, (character) => character.toUpperCase());
  return (
    <Badge
      tone={
        status === 'delivered'
          ? 'green'
          : status === 'cancelled'
            ? 'gray'
            : 'blue'
      }
    >
      {label}
    </Badge>
  );
}

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});
const amount = (value: string) => currency.format(Number(value));

export function OrderOverview({ order }: { order: OrderDetail }) {
  const awaiting = order.status === 'pending_confirmation';
  const address = order.delivery_address_snapshot;
  const placed = new Date(order.created_at);
  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.orderIdentity}>
          <Txt style={styles.eyebrow}>ORDER DETAILS</Txt>
          <Txt selectable style={styles.orderNumber}>
            {order.order_no}
          </Txt>
          <Txt style={styles.secondary}>
            Placed{' '}
            {placed.toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}{' '}
            at{' '}
            {placed.toLocaleTimeString('en-IN', {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </Txt>
        </View>
        <OrderStatus status={order.status} />
      </View>

      {awaiting ? (
        <View style={styles.notice}>
          <View style={styles.noticeIcon}>
            <Icon name="clock" size={20} color="#8A5A12" />
          </View>
          <View style={styles.noticeText}>
            <Txt style={styles.noticeTitle}>Your order is with our team</Txt>
            <Txt style={styles.noticeBody}>
              FTI will confirm item prices, GST and delivery charges before you
              pay.
            </Txt>
            <Txt style={styles.paymentNote}>No payment is due yet.</Txt>
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <Row style={styles.sectionHeading}>
          <Txt style={styles.title}>Order items</Txt>
          <Txt style={styles.secondary}>
            {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
          </Txt>
        </Row>
        {order.items.map((item, index) => (
          <View
            key={item.id}
            style={[styles.item, index > 0 ? styles.itemDivider : null]}
          >
            <View style={styles.itemIdentity}>
              <View style={styles.itemIcon}>
                <Icon name="package" size={20} color={c.ink} />
              </View>
              <View style={styles.itemText}>
                <Txt style={styles.label}>SKU / ITEM REFERENCE</Txt>
                <Txt selectable style={styles.sku}>
                  {item.sku}
                </Txt>
                <Txt style={styles.secondary}>
                  Quantity:{' '}
                  <Txt style={styles.quantity}>
                    {Number(item.qty).toLocaleString('en-IN', {
                      maximumFractionDigits: 3,
                    })}{' '}
                    {item.uom}
                  </Txt>
                </Txt>
              </View>
            </View>
            <View style={styles.itemPrice}>
              {awaiting && Number(item.unit_price) === 0 ? (
                <Txt style={styles.pendingPrice}>Price to be confirmed</Txt>
              ) : (
                <>
                  <Txt style={styles.lineTotal}>
                    {amount(item.line_total)}
                    {awaiting ? ' (estimate)' : ''}
                  </Txt>
                  <Txt style={styles.secondary}>
                    {amount(item.unit_price)} / {item.uom}
                  </Txt>
                </>
              )}
            </View>
          </View>
        ))}
      </View>

      <View style={styles.footer}>
        <View style={styles.delivery}>
          <Row style={{ gap: 8 }}>
            <Icon name="map-pin" size={17} color={c.ink} />
            <Txt style={styles.title}>Delivery address</Txt>
          </Row>
          <Txt selectable style={styles.address}>
            {address.line1}
            {address.line2 ? `\n${address.line2}` : ''}
          </Txt>
          <Txt style={styles.address}>
            {address.city}, {address.state} {address.pincode}
          </Txt>
        </View>
        <View style={styles.summary}>
          <Txt style={styles.title}>Payment summary</Txt>
          {awaiting ? (
            <>
              <Row style={styles.summaryRow}>
                <Txt style={styles.secondary}>Order total</Txt>
                <Txt style={styles.pendingPrice}>To be confirmed</Txt>
              </Row>
              <Txt style={styles.secondary}>
                Your final total will include confirmed prices, GST and
                delivery.
              </Txt>
            </>
          ) : (
            <>
              {(
                [
                  ['Subtotal', order.subtotal],
                  ['Discount', order.discount_total],
                  ['GST', order.gst_total],
                  ['Freight', order.freight_total],
                  ['Loading', order.loading_total],
                ] as const
              ).map(([label, value]) => (
                <Row key={label} style={styles.summaryRow}>
                  <Txt style={styles.secondary}>{label}</Txt>
                  <Txt>{amount(value)}</Txt>
                </Row>
              ))}
              <Row style={styles.totalRow}>
                <Txt style={styles.title}>Order total</Txt>
                <Txt style={styles.lineTotal}>{amount(order.grand_total)}</Txt>
              </Row>
              <Row style={styles.summaryRow}>
                <Txt style={styles.title}>Amount due</Txt>
                <Txt style={styles.lineTotal}>{amount(order.amount_due)}</Txt>
              </Row>
            </>
          )}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 0,
    overflow: 'hidden',
    borderRadius: 14,
    borderColor: c.cardBorder,
    borderWidth: 1,
  },
  header: {
    padding: 22,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  orderIdentity: { gap: 7, flexShrink: 1, minWidth: 0 },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.3,
    color: c.muted,
  },
  orderNumber: {
    fontSize: 21,
    lineHeight: 28,
    fontWeight: '700',
    color: c.ink,
  },
  secondary: { color: '#58697C', fontSize: 12, lineHeight: 19, flexShrink: 1 },
  notice: {
    marginHorizontal: 22,
    marginBottom: 4,
    padding: 16,
    borderRadius: 10,
    backgroundColor: '#FFF8E9',
    flexDirection: 'row',
    gap: 12,
    borderWidth: 1,
    borderColor: '#F0DFBB',
  },
  noticeIcon: { paddingTop: 2 },
  noticeText: { flex: 1, gap: 5 },
  noticeTitle: {
    color: '#714A12',
    fontWeight: '700',
    fontSize: 15,
    lineHeight: 21,
  },
  noticeBody: { color: '#714F23', fontSize: 13, lineHeight: 21 },
  paymentNote: {
    color: '#714A12',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 3,
  },
  section: { padding: 22 },
  sectionHeading: { justifyContent: 'space-between', gap: 12, marginBottom: 6 },
  title: { fontSize: 14, fontWeight: '700', lineHeight: 21 },
  item: {
    paddingVertical: 18,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  itemDivider: { borderTopWidth: 1, borderTopColor: c.line },
  itemIdentity: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 260,
    minWidth: 0,
  },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: 9,
    backgroundColor: c.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: { flex: 1, gap: 5, minWidth: 0 },
  label: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.7,
    color: '#58697C',
  },
  sku: { fontSize: 12, lineHeight: 19, color: c.ink, flexShrink: 1 },
  quantity: { fontSize: 12, fontWeight: '600', color: c.ink },
  itemPrice: { gap: 4, flexShrink: 1 },
  pendingPrice: {
    fontSize: 12,
    lineHeight: 19,
    fontWeight: '600',
    color: '#58697C',
    flexShrink: 1,
  },
  lineTotal: { fontSize: 15, fontWeight: '700', lineHeight: 22 },
  footer: {
    borderTopWidth: 1,
    borderTopColor: c.line,
    backgroundColor: '#FAFBFD',
    padding: 22,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 28,
  },
  delivery: { flexBasis: 240, flexGrow: 1, flexShrink: 1, gap: 7, minWidth: 0 },
  address: { fontSize: 13, lineHeight: 21, color: '#58697C' },
  summary: { flexBasis: 260, flexGrow: 1, flexShrink: 1, gap: 10, minWidth: 0 },
  summaryRow: { justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 },
  totalRow: {
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: c.line,
    paddingTop: 12,
  },
});
