import { router } from 'expo-router';
import { Badge, Button, Card, Txt, s } from '@shared/ui';
import { priceSubscriptionMessage } from '@shared/lib/price-access';

export function SubscriptionNotice() {
  return (
    <Card style={{ gap: 12 }}>
      <Badge>ANNUAL ACCESS</Badge>
      <Txt style={s.h2}>Price subscription</Txt>
      <Txt>{priceSubscriptionMessage}</Txt>
      <Button onPress={() => router.push('/account?section=subscription')}>
        View subscription
      </Button>
    </Card>
  );
}
