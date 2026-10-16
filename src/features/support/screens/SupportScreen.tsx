import { View } from 'react-native';
import { Heading, Empty } from '@shared/ui';
export function Support() {
  return (
    <View>
      <Heading
        eyebrow="SUPPORT & DOCUMENTS"
        title="Claims, certificates & support"
        description="Get help with orders and access authorized consignment documents."
      />
      <Empty
        title="Support service not connected"
        description="Claims, mill test certificates, and support tickets will be available when the support and private document services are connected."
      />
    </View>
  );
}
