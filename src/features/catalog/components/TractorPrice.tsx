import { usePriceAccess } from '@shared/hooks/use-price-access';
import { SubscribeForPrices } from '@features/subscriptions/SubscribeForPrices';
import type { Variant } from '../model/types';
import { formatTractorPrice, tractorPricing } from '../model/tractor-pricing';
import { Row, Txt, c } from '@shared/ui';

export function TractorPrice({ variant }: { variant: Variant }) {
  const priceAccess = usePriceAccess();
  if (!priceAccess) return <SubscribeForPrices />;
  const price = tractorPricing(variant);
  if (!price) return <Txt style={{ fontSize: 13, color: c.muted }}>Request price</Txt>;
  return (
    <Row style={{ flexWrap: 'wrap', gap: 8 }}>
      {price.discounted !== null ? (
        <Txt accessibilityLabel={`Base price ${formatTractorPrice(price.base)}`} style={{ color: c.muted, textDecorationLine: 'line-through', fontSize: 15 }}>
          {formatTractorPrice(price.base)}
        </Txt>
      ) : null}
      <Txt accessibilityLabel={`${price.discounted !== null ? 'Discounted' : 'Base'} price ${formatTractorPrice(price.discounted ?? price.base)} per ${variant.uom}`} style={{ color: '#00409A', fontWeight: '700', fontSize: 17 }}>
        {formatTractorPrice(price.discounted ?? price.base)}
      </Txt>
      <Txt style={{ fontSize: 12, color: c.muted }}>/{variant.uom}</Txt>
    </Row>
  );
}
