import { router } from 'expo-router';
import { Button } from '@shared/ui';

export function SubscribeForPrices() {
  return (
    <Button secondary onPress={() => router.push('/account?section=subscription')}>
      Subscribe for live prices
    </Button>
  );
}
