import { FulfillmentTimeline } from './FulfillmentTimeline';
import { DriverDetails, DriverFields } from './DriverDetails';
import { validDriverDetails } from '../model/driver-details';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Badge, Button, Card, Field, Icon, Txt, s } from '@shared/ui';
import { PrivateDocuments } from './PrivateDocuments';
import { Pages, useAction, usePage } from './shared';
import {
  operationsRpc as rpc,
  type DispatchOrder,
  type Shipment,
} from '../services/operations-api';

export function ShipmentTracking({
  orderId,
  status,
  createdAt,
}: {
  orderId: string;
  status: string;
  createdAt?: string;
}) {
  const list = usePage<Shipment[]>('shipments', { p_order: orderId });
  const shipments = list.data ?? [];
  return (
    <View style={{ gap: 14 }}>
      <Txt style={s.h2}>Order & dispatch timeline</Txt>
      {list.isPending ? (
        <Txt>Loading shipment details...</Txt>
      ) : list.error ? (
        <Txt accessibilityRole="alert">{list.error.message}</Txt>
      ) : null}
      <FulfillmentTimeline
        status={status}
        createdAt={createdAt}
        history={shipments.flatMap((shipment) => [
          ...(shipment.dispatched_at
            ? [{ status: 'shipped', at: shipment.dispatched_at }]
            : []),
          ...(shipment.delivered_at
            ? [{ status: 'delivered', at: shipment.delivered_at }]
            : []),
        ])}
        deliveryNote={shipments
          .map((shipment) => shipment.delivery_note)
          .filter(Boolean)
          .join('; ')}
        dispatchDetails={
          shipments.length ? (
            <>
              {shipments.map((shipment) => (
                <View key={shipment.id} style={{ gap: 8 }}>
                  <Txt style={s.h2}>{shipment.carrier}</Txt>
                  <Txt selectable>
                    LR / tracking: {shipment.tracking_number}
                  </Txt>
                  {shipment.vehicle_number ? (
                    <Txt>Vehicle: {shipment.vehicle_number}</Txt>
                  ) : null}
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
      {!list.isPending && !list.error && !shipments.length ? (
        <Txt style={s.muted}>
          No dispatch recorded. Add transporter and driver details below when
          the order is ready.
        </Txt>
      ) : null}
      <PrivateDocuments kind="order_mtc" entityId={orderId} canUpload={false} />
      <PrivateDocuments kind="order_pod" entityId={orderId} canUpload={false} />
    </View>
  );
}
function DispatchEditor({ order }: { order: DispatchOrder }) {
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(false);
  const action = useAction();
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const shipped = order.status === 'shipped';
  return (
    <Card style={{ gap: 10 }}>
      <Txt style={s.h2}>{order.order_no}</Txt>
      <Badge>{order.status === 'shipped' ? 'Dispatched' : order.status}</Badge>
      <ShipmentTracking
        orderId={order.id}
        status={order.status}
        createdAt={order.created_at}
      />
      {order.status !== 'delivered' && (
        <>
          {shipped ? (
            <Field
              label="Delivery evidence / recipient confirmation reference"
              placeholder="e.g. Signed POD reference POD-001"
              value={note}
              onChangeText={setNote}
              multiline
            />
          ) : (
            <>
              <Field
                label="Transporter / carrier"
                placeholder="e.g. Acme Transport"
                value={carrier}
                onChangeText={setCarrier}
              />
              <Field
                label="LR / tracking reference"
                placeholder="e.g. LR-2026-001"
                value={tracking}
                onChangeText={setTracking}
              />
              <Field
                label="Vehicle number (optional)"
                placeholder="e.g. DL01AB1234"
                value={vehicle}
                onChangeText={setVehicle}
              />
              <DriverFields
                name={driverName}
                phone={driverPhone}
                onName={(v) => {
                  setDriverName(v);
                  setConfirm(false);
                }}
                onPhone={(v) => {
                  setDriverPhone(v);
                  setConfirm(false);
                }}
              />
            </>
          )}
          {!shipped && !validDriverDetails(driverName, driverPhone) && (
            <Txt accessibilityRole="alert">
              Enter a driver name of 2-120 characters and phone number of 7-15
              digits, or leave the fields empty.
            </Txt>
          )}
          {!confirm ? (
            <Button
              disabled={
                shipped
                  ? note.trim().length < 5
                  : carrier.trim().length < 2 ||
                    tracking.trim().length < 2 ||
                    !validDriverDetails(driverName, driverPhone)
              }
              onPress={() => setConfirm(true)}
            >
              Review {shipped ? 'delivery' : 'dispatch'}
            </Button>
          ) : (
            <>
              {!shipped && (
                <DriverDetails name={driverName} phone={driverPhone} />
              )}
              <Txt>
                {shipped
                  ? 'Confirm receipt against the evidence entered?'
                  : 'Confirm the entire order has left with this transporter? Check shipping documents before confirming.'}
              </Txt>
              <Button
                disabled={action.busy}
                onPress={() =>
                  void action.run(
                    () =>
                      shipped
                        ? rpc('fti_operations_deliver', {
                            p_order: order.id,
                            p_note: note,
                          })
                        : rpc('fti_operations_dispatch', {
                            p_order: order.id,
                            p_carrier: carrier,
                            p_tracking: tracking,
                            p_vehicle: vehicle,
                            p_driver_name: driverName.trim(),
                            p_driver_phone: driverPhone.trim(),
                          }),
                    () => setConfirm(false),
                  )
                }
              >
                Confirm {shipped ? 'delivery' : 'dispatch'}
              </Button>
              <Button
                secondary
                disabled={action.busy}
                onPress={() => setConfirm(false)}
              >
                Cancel
              </Button>
            </>
          )}
        </>
      )}
      <PrivateDocuments kind="order_mtc" entityId={order.id} canUpload={true} />
      {shipped && (
        <PrivateDocuments
          kind="order_pod"
          entityId={order.id}
          canUpload={true}
        />
      )}
      {!!action.message && (
        <Txt accessibilityRole="alert">{action.message}</Txt>
      )}
    </Card>
  );
}

export function DispatchManagement() {
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const list = usePage<DispatchOrder[]>('orders', { p_offset: offset });
  const order = list.data?.find((item) => item.id === selected);
  return (
    <View style={{ gap: 16 }}>
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 160, gap: 4 }}>
          <Txt style={s.h2}>Dispatch workspace</Txt>
          <Txt style={s.muted}>
            Choose an order to review its timeline, assign a driver or confirm
            delivery.
          </Txt>
        </View>
        <Button secondary icon="refresh-cw" onPress={() => void list.refetch()}>
          Refresh orders
        </Button>
      </View>
      {list.isPending ? (
        <Txt>Loading orders...</Txt>
      ) : list.error ? (
        <Txt accessibilityRole="alert">{list.error.message}</Txt>
      ) : (
        <>
          {!list.data.length ? (
            <Card>
              <Txt>No confirmed orders ready for tracking.</Txt>
            </Card>
          ) : null}
          {list.data.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`View dispatch ${item.order_no}`}
              accessibilityState={{ selected: selected === item.id }}
              onPress={() => setSelected(selected === item.id ? null : item.id)}
              style={({ pressed }) => [
                styles.order,
                selected === item.id && styles.selectedOrder,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Icon
                name="truck"
                size={18}
                color={selected === item.id ? '#A70101' : '#58697C'}
              />
              <View style={{ flex: 1, gap: 4 }}>
                <Txt style={styles.orderNumber}>{item.order_no}</Txt>
                <Txt style={s.muted}>
                  {item.status === 'shipped'
                    ? 'Dispatched'
                    : item.status === 'processing'
                      ? 'Preparing for dispatch'
                      : item.status === 'delivered'
                        ? 'Delivery complete'
                        : 'Ready for dispatch review'}
                </Txt>
              </View>
              <Icon
                name={selected === item.id ? 'chevron-up' : 'chevron-down'}
                size={18}
                color="#58697C"
              />
            </Pressable>
          ))}
          <Pages
            offset={offset}
            setOffset={(value) => {
              setSelected(null);
              setOffset(value);
            }}
            count={list.data.length}
          />
        </>
      )}
      {order ? (
        <DispatchEditor key={order.id + order.status} order={order} />
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  order: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E4E8EE',
    borderRadius: 10,
    minHeight: 72,
  },
  selectedOrder: { borderColor: '#A70101', backgroundColor: '#FFF8F8' },
  orderNumber: {
    color: '#142D4E',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
  },
});
