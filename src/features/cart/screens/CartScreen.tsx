import { View } from 'react-native';
import { router } from 'expo-router';
import { useStore } from '@core/state/workspace-store';
import { useShallow } from 'zustand/react/shallow';
import { Heading, Empty, Button, Card, Row, Txt, s } from '@shared/ui';
export function Cart() {
  const { cart, products, quantity } = useStore(
    useShallow((state) => ({
      cart: state.cart,
      products: state.catalogProducts,
      quantity: state.quantity,
    })),
  );
  return (
    <View>
      <Heading
        eyebrow="YOUR PROCUREMENT LIST"
        title="Your cart"
        description="Materials selected for your next order."
      />
      {!cart.length ? (
        <Empty
          title="Your cart is empty"
          description="Add materials from your connected catalogue to get started."
          action={
            <Button onPress={() => router.push('/products')}>
              Browse materials
            </Button>
          }
        />
      ) : (
        <View style={{ gap: 16 }}>
          {cart.map((line) => {
            const product = products.find((p) => p.id === line.productId);
            return (
              <Card key={line.productId}>
                <Row
                  style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}
                >
                  <View style={{ gap: 8, flex: 1, minWidth: 180 }}>
                    <Txt style={s.h2}>
                      {product?.name ?? 'Material details unavailable'}
                    </Txt>
                    <Txt style={s.muted}>
                      Saved quantity: {line.quantity}
                      {product ? ' ' + product.unit : ''}
                    </Txt>
                    {!product ? (
                      <Txt style={s.muted}>
                        Reconnect the catalogue to verify this saved item.
                      </Txt>
                    ) : null}
                  </View>
                  <Button secondary onPress={() => quantity(line.productId, 0)}>
                    Remove
                  </Button>
                </Row>
              </Card>
            );
          })}
          <Button onPress={() => router.push('/checkout')}>
            Review checkout availability
          </Button>
        </View>
      )}
    </View>
  );
}
