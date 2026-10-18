import { router } from 'expo-router';
import { Badge, Button, Card, Txt, s } from '@shared/ui';
import type { StockListing } from '../model/types';

export function StockCard({item, onOpen}: {item: StockListing; onOpen?: () => void}) {
  return <Card style={{gap: 10}}>
    <Badge>Business stock</Badge>
    <Txt style={s.h2}>{item.material}</Txt><Txt>Owned by {item.business_name}</Txt>
    <Txt>{item.grade} · {item.specification}</Txt>
    <Txt>{item.quantity} {item.uom} · {item.condition}</Txt>
    <Txt>Asking INR {item.asking_price} / {item.price_unit}</Txt>
    <Txt>{item.city}, {item.state} · {item.pincode}</Txt>
    <Txt>Available until {new Date(item.available_until).toLocaleString()}</Txt>
    {item.is_seller ? <Txt>Status: {item.status}{!item.available && item.status === 'published' ? ' · unavailable or expired' : ''}</Txt> : null}
    <Button secondary onPress={onOpen ?? (() => router.push(`/business-stock/${item.id}` as never))}>{onOpen ? 'Manage listing' : 'View business stock'}</Button>
  </Card>;
}
