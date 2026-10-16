import { View } from 'react-native';
import { router } from 'expo-router';
import { Heading, Empty, Button } from '@shared/ui';
export function Checkout() {
  return (
    <View>
      <Heading eyebrow="REVIEW & CONFIRM" title="Checkout" />
      <Empty
        title="Order from an accepted quotation"
        description="Direct cart checkout is waiting for approved pricing, GST, freight and payment rules. Request a quotation, accept its current revision, then place an order from that quotation when tracked stock is available. Your cart remains saved."
        action={
          <Button secondary onPress={() => router.push('/rfqs')}>
            Open requests & quotations
          </Button>
        }
      />
    </View>
  );
}
