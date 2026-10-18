import { useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@features/auth/ui';
import { hasPermission } from '@features/auth';
import { Button, Card, Txt, s } from '@shared/ui';
import { stockApi } from '../services/stock-api';
import { StockPages } from './shared';
import { ListingPanel } from './ListingPanel';
import { StockEnquiries } from './Enquiries';

export function StockReviewPanel() {
  const auth = useAuth(); const allowed = hasPermission(auth.identity,'stock.review');
  const [offset, setOffset] = useState(0); const [selected, setSelected] = useState<string | null>(null); const [showEnquiries, setShowEnquiries] = useState(false);
  const queue = useQuery({queryKey: ['business-stock','review',auth.session?.user.id,offset], queryFn: () => stockApi.list('review','','','',offset), enabled: allowed, retry: false});
  const detail = useQuery({queryKey: ['business-stock','review-detail',auth.session?.user.id,selected], queryFn: () => stockApi.detail(selected!), enabled: allowed && !!selected, retry: false});
  if (!allowed) return null;
  return <View style={{gap: 14}}><Txt style={s.h2}>Review business stock</Txt><Button secondary onPress={() => void queue.refetch()}>Refresh stock review queue</Button>
    {queue.isPending ? <Txt>Loading submitted stock...</Txt> : queue.error ? <Txt accessibilityRole="alert">{queue.error.message}</Txt> : <>
      {!queue.data.length ? <Txt>No business stock awaiting review.</Txt> : null}
      {queue.data.map(item => <Card key={item.id} style={{gap: 10}}><Txt>{item.material} · {item.business_name}</Txt><Button secondary onPress={() => setSelected(item.id)}>Review stock submission</Button></Card>)}
      <StockPages offset={offset} setOffset={v => {setOffset(v); setSelected(null);}} count={queue.data.length}/>
    </>}
    {selected ? <><Button secondary onPress={() => setSelected(null)}>Close stock review</Button>{detail.isPending ? <Txt>Loading submitted listing...</Txt> : detail.error ? <Txt accessibilityRole="alert">{detail.error.message}</Txt> : detail.data ? <ListingPanel key={selected} listing={detail.data} review/> : null}</> : null}
    <Button secondary onPress={() => setShowEnquiries(!showEnquiries)}>{showEnquiries ? 'Hide stock enquiry oversight' : 'Open stock enquiry oversight'}</Button>
    {showEnquiries ? <StockEnquiries scope="staff"/> : null}
  </View>;
}
