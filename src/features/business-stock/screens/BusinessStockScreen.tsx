import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { AccessGate, useAuth } from '@features/auth/ui';
import { Button, Chip, Empty, Field, Heading, Row, Txt } from '@shared/ui';
import { stockApi } from '../services/stock-api';
import { StockSourceDropdown } from '../components/StockSourceDropdown';
import { StockCard } from '../components/StockCard';
import { StockPages } from '../components/shared';

function Browse() {
  const auth = useAuth();
  const [search, setSearch] = useState(''); const [city, setCity] = useState(''); const [condition, setCondition] = useState(''); const [offset, setOffset] = useState(0);
  const query = useQuery({queryKey: ['business-stock','browse',auth.session?.user.id,search,city,condition,offset], queryFn: () => stockApi.list('browse',search,city,condition,offset), retry: false, refetchInterval: 60000});
  return <View style={{gap: 14}}>
    <Row style={{flexWrap: 'wrap'}}><Button onPress={() => router.push('/sell-stock' as never)}>Sell your stock</Button><Button secondary onPress={() => router.push('/sell-stock' as never)}>My listings and enquiries</Button><Button secondary onPress={() => void query.refetch()}>Refresh business stock</Button></Row>
    <Field label="Search business stock by material, grade or specification" placeholder="e.g. M12 bolts or grade 8.8" value={search} onChangeText={v => {setSearch(v); setOffset(0);}}/>
    <Field label="Filter stock city" placeholder="e.g. Delhi" value={city} onChangeText={v => {setCity(v); setOffset(0);}}/>
    <Row style={{flexWrap: 'wrap'}}>{['','new','surplus','used'].map(v => <Chip key={v || 'all'} selected={condition === v} onPress={() => {setCondition(v); setOffset(0);}}>{v || 'All conditions'}</Chip>)}</Row>
    {query.isPending ? <Txt>Loading business stock...</Txt> : query.error ? <Empty title="Business stock unavailable" description={query.error.message} action={<Button secondary onPress={() => void query.refetch()}>Retry business stock</Button>}/> : <>
      {!query.data.length ? <Empty title="No business stock found" description="Approved, available listings from verified businesses appear here. Try another material or city."/> : null}
      {query.data.map(item => <StockCard key={item.id} item={item}/>)}
      <StockPages offset={offset} setOffset={setOffset} count={query.data.length}/>
    </>}
  </View>;
}
export function BusinessStockScreen() {
  return <View><StockSourceDropdown source="business"/><Heading eyebrow="BUSINESS STOCK" title="Stock from businesses" description="Material owned and offered by verified businesses. Each listing identifies its seller and is reviewed by FTI."/><AccessGate><Browse/></AccessGate></View>;
}
