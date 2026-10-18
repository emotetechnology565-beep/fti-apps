import { View } from 'react-native';
import { Txt, s } from '@shared/ui';
import type { DraftItem } from '../model/types';
import { calculateRate, priceComponents } from '../model/rate-calculation';

export function PriceBreakdown({ item }: { item: DraftItem }) {
  const parts = priceComponents(item);
  const calculation = calculateRate(parts);
  return <View style={{ gap: 6 }}>
    <Txt style={s.muted}>Base INR {parts.base_price} + increased price INR {parts.increased_price} + rolling charge INR {parts.rolling_price} / {item.uom}</Txt>
    <Txt style={s.muted}>Profit: {parts.profit_percent}% of subtotal{calculation ? ` = INR ${calculation.profit_amount} / ${item.uom}` : ''}</Txt>
    <Txt style={{ fontWeight: '700' }}>Selling rate: INR {item.amount} / {item.uom}</Txt>
  </View>;
}
