import { View } from 'react-native';
import { router } from 'expo-router';
import { Heading, Empty, Button } from '@shared/ui';
export function Checkout() {
  return (
    <View>
      <Heading eyebrow="REVIEW & CONFIRM" title="Checkout" />
      <Empty
        title="Order submission is not available yet"
        description="Checkout requires confirmed prices, inventory, tax, freight, and an authenticated order service. Your cart is kept until those services are connected."
        action={
          <Button secondary onPress={() => router.push('/cart')}>
            Return to cart
          </Button>
        }
      />
    </View>
  );
}
