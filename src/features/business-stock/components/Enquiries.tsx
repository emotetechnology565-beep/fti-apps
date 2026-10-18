import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@features/auth/ui';
import { Badge, Button, Card, Field, Txt, s } from '@shared/ui';
import { newStockId, type StockEnquiry } from '../model/types';
import { stockApi } from '../services/stock-api';
import { StockPages, useStockAction } from './shared';
import { StockMedia } from './StockMedia';

function Thread({enquiry}: {enquiry: StockEnquiry}) {
  const auth = useAuth();
  const [offset, setOffset] = useState(0);
  const [body, setBody] = useState('');
  const [close, setClose] = useState(false);
  const messageId = useRef(newStockId());
  const action = useStockAction();
  const messages = useQuery({queryKey: ['business-stock','thread',auth.session?.user.id,enquiry.id,offset], queryFn: () => stockApi.thread(enquiry.id,offset), retry: false, refetchInterval: 30000});
  return <Card style={{gap: 12}}>
    <Txt style={s.h2}>Enquiry conversation</Txt>
    <Txt>Requested {enquiry.quantity} {enquiry.uom} of {enquiry.listing_snapshot.material} · {enquiry.business_name}</Txt>
    <Txt>Price at enquiry: INR {enquiry.listing_snapshot.asking_price} / {enquiry.listing_snapshot.price_unit}. This enquiry does not reserve stock or create an order.</Txt>
    {messages.isPending ? <Txt>Loading messages...</Txt> : messages.error ? <Txt accessibilityRole="alert">{messages.error.message}</Txt> : <>
      {messages.data.map(message => <View key={message.id} style={{gap: 5}}><Txt>{message.is_mine ? 'You' : message.author_name || 'Account holder'} · {new Date(message.created_at).toLocaleString()}</Txt><Txt>{message.body}</Txt></View>)}
      <StockPages offset={offset} setOffset={setOffset} count={messages.data.length}/>
    </>}
    {enquiry.status === 'open' ? <>
      <Field label="Enquiry reply" placeholder="e.g. This stock is available for dispatch tomorrow." value={body} onChangeText={setBody} multiline/>
      <Button secondary onPress={() => setClose(!close)}>{close ? 'Keep enquiry open' : 'Close enquiry with this reply'}</Button>
      {close ? <Txt>This reply will close the enquiry for both parties. It does not mark the material sold.</Txt> : null}
      <Button disabled={action.busy || body.trim().length < 1 || body.length > 2000} onPress={() => void action.run(() => stockApi.reply(enquiry,messageId.current,body,close), close ? 'Enquiry closed.' : 'Reply sent.', () => {setBody(''); setClose(false); messageId.current = newStockId();})}>{close ? 'Send reply and close enquiry' : 'Send enquiry reply'}</Button>
    </> : <Txt>This enquiry is closed.</Txt>}
    {action.message ? <Txt accessibilityRole="alert">{action.message}</Txt> : null}
    <StockMedia listing={enquiry.listing_snapshot} kind="stock_certificate"/>
  </Card>;
}
export function StockEnquiries({scope}: {scope: 'buyer' | 'seller' | 'staff'}) {
  const auth = useAuth();
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const query = useQuery({queryKey: ['business-stock','enquiries',auth.session?.user.id,scope,offset], queryFn: () => stockApi.enquiries(scope,offset), retry: false, refetchInterval: 30000});
  const selectedEnquiry = query.data?.find(item => item.id === selected);
  return <View style={{gap: 14}}>
    <Txt style={s.h2}>{scope === 'buyer' ? 'My buying enquiries' : scope === 'seller' ? 'Enquiries on my stock' : 'Business stock enquiry oversight'}</Txt>
    <Button secondary onPress={() => void query.refetch()}>Refresh enquiries</Button>
    {query.isPending ? <Txt>Loading enquiries...</Txt> : query.error ? <Txt accessibilityRole="alert">{query.error.message}</Txt> : <>
      {!query.data.length ? <Txt>No enquiries yet.</Txt> : null}
      {query.data.map(item => <Card key={item.id} style={{gap: 8}}><Badge>Business stock</Badge><Txt>{item.material} · {item.business_name}</Txt><Txt>{item.quantity} {item.uom} · {item.status}</Txt><Txt>Buyer: {item.buyer_name || 'Account holder'}</Txt><Button secondary onPress={() => setSelected(selected === item.id ? null : item.id)}>{selected === item.id ? 'Hide conversation' : 'Open conversation'}</Button></Card>)}
      <StockPages offset={offset} setOffset={value => {setOffset(value); setSelected(null);}} count={query.data.length}/>
    </>}
    {selectedEnquiry ? <Thread key={selectedEnquiry.id} enquiry={selectedEnquiry}/> : null}
  </View>;
}
