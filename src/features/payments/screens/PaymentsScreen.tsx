import { View } from 'react-native';
import { Heading, Empty } from '@shared/ui';
export function Payments() {
  return (
    <View>
      <Heading
        eyebrow="YOUR BUSINESS ACCOUNT"
        title="Payments & credit"
        description="Invoices, verified payments, and approved credit information."
      />
      <Empty
        title="No financial account connected"
        description="Balances, invoices, and payment activity will appear after the finance service is connected. No credit limit or balance is assumed."
      />
    </View>
  );
}
