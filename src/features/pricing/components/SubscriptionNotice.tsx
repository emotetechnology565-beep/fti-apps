import { Badge, Card, Txt, s } from '@shared/ui';
import { SubscribeForPrices } from '@features/subscriptions/SubscribeForPrices';
import { priceSubscriptionMessage } from '@shared/lib/price-access';

export function SubscriptionNotice() {
  return (
    <Card style={{ gap: 12 }}>
      <Badge>ANNUAL ACCESS</Badge>
      <Txt style={s.h2}>Live prices for subscribers</Txt>
      <Txt>{priceSubscriptionMessage}</Txt>
      <SubscribeForPrices />
    </Card>
  );
}
