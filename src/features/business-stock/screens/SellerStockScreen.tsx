import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { AccessGate, useAuth } from '@features/auth/ui';
import { Button, Chip, Empty, Heading, Row, Txt } from '@shared/ui';
import { stockApi } from '../services/stock-api';
import { ListingEditor } from '../components/ListingEditor';
import { ListingPanel } from '../components/ListingPanel';
import { StockEnquiries } from '../components/Enquiries';
import { StockCard } from '../components/StockCard';
import { StockPages } from '../components/shared';

function Workspace() {
  const auth = useAuth();
  const [tab, setTab] = useState<'listings'|'seller'|'buyer'>('listings');
  const [offset, setOffset] = useState(0); const [selected, setSelected] = useState<string | null>(null); const [editing, setEditing] = useState(false); const [creating, setCreating] = useState(false);
  const eligible = !!auth.identity?.businesses.some(b => b.verification_status === 'verified');
  const list = useQuery({queryKey: ['business-stock','mine',auth.session?.user.id,offset], queryFn: () => stockApi.list('mine','','','',offset), retry: false, enabled: tab === 'listings'});
  const detail = useQuery({queryKey: ['business-stock','seller-detail',auth.session?.user.id,selected], queryFn: () => stockApi.detail(selected!), retry: false, enabled: !!selected && tab === 'listings'});
  return <View style={{gap: 14}}>
    <Row style={{flexWrap: 'wrap'}}>{(['listings','seller','buyer'] as const).map(v => <Chip key={v} selected={tab === v} onPress={() => setTab(v)}>{v === 'listings' ? 'My stock listings' : v === 'seller' ? 'Selling enquiries' : 'Buying enquiries'}</Chip>)}</Row>
    {tab !== 'listings' ? <StockEnquiries key={tab} scope={tab}/> : <>
      {!eligible ? <Empty title="Verify your business to sell stock" description="Complete business onboarding and FTI verification before creating or submitting listings." action={<Button secondary onPress={() => router.push('/account')}>Open business account</Button>}/> : null}
      {creating ? <ListingEditor onSaved={id => {setCreating(false); setSelected(id);}} onCancel={() => setCreating(false)}/> : selected ? <>
        <Button secondary onPress={() => {setSelected(null); setEditing(false);}}>Back to my stock listings</Button>
        {detail.isPending ? <Txt>Loading listing...</Txt> : detail.error ? <Empty title="Listing unavailable" description={detail.error.message} action={<Button secondary onPress={() => void detail.refetch()}>Reload listing</Button>}/> : detail.data ? editing ? <ListingEditor key={detail.data.id} item={detail.data} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)}/> : <ListingPanel listing={detail.data} onEdit={() => setEditing(true)}/> : null}
      </> : <>
        {eligible ? <Button onPress={() => setCreating(true)}>Create stock listing</Button> : null}
        <Button secondary onPress={() => void list.refetch()}>Refresh my stock</Button>
        {list.isPending ? <Txt>Loading your listings...</Txt> : list.error ? <Empty title="Your stock is unavailable" description={list.error.message}/> : <>
          {!list.data.length ? <Txt>You have not listed any stock.</Txt> : null}
          {list.data.map(item => <StockCard key={item.id} item={item} onOpen={() => setSelected(item.id)}/>)}
          <StockPages offset={offset} setOffset={setOffset} count={list.data.length}/>
        </>}
      </>}
    </>}
  </View>;
}
export function SellerStockScreen() {
  const auth = useAuth();
  return <View><Heading eyebrow="YOUR BUSINESS" title="My stock workspace" description="Manage your business-owned listings and buying or selling enquiries."/><AccessGate><Workspace key={auth.session?.user.id}/></AccessGate></View>;
}
