import { View } from 'react-native';
import { useStore } from '@core/state/workspace-store';
import { Heading, Empty, Card, Row, Txt, Badge, s } from '@shared/ui';
export function Orders() {
  const orders = useStore((state) => state.orders);
  return (
    <View>
      <Heading
        eyebrow="ORDERS & LOGISTICS"
        title="Orders & dispatch"
        description="Your order history and delivery updates."
      />
      {!orders.length ? (
        <Empty
          title="No orders available"
          description="Orders will appear here when your account is connected to the order service."
        />
      ) : (
        <View style={{ gap: 16 }}>
          {orders.map((order) => (
            <Card key={order.id}>
              <Row
                style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}
              >
                <Txt style={s.h2}>{order.id}</Txt>
                <Badge>LOCAL RECORD · NOT VERIFIED</Badge>
              </Row>
              <Txt style={{ ...s.muted, marginTop: 16 }}>{order.address}</Txt>
              <Txt style={s.muted}>Last saved status: {order.status}</Txt>
              <Txt style={s.muted}>
                Reconnect the order service to verify the current status and
                financial details.
              </Txt>
            </Card>
          ))}
        </View>
      )}
    </View>
  );
}
