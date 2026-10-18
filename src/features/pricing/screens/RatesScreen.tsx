import { useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Heading, Empty, Button, Card, Chip, Field, Row, Txt, Badge } from '@shared/ui';
import { pricingApi } from '../services/pricing-api';
import type { PublishedRate } from '../model/types';
import { useStore } from '@core/state/workspace-store';
import { pricingUpdateTime } from '../model/rate-calculation';

const money = (amount: string) => `INR ${Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 4 })}`;
function RateCard({ rate, market }: { rate: PublishedRate; market: string }) {
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const history = useQuery({ queryKey: ['pricing', 'history', market, rate.variant_id, offset, rate.revision], queryFn: () => pricingApi.history(market, rate.variant_id, offset), enabled: open, staleTime: 0 });
  return <Card style={{ gap: 14, padding: 16 }}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
      <View style={{ flex: 1, gap: 4 }}>
        <Txt style={{ fontWeight: '700', fontSize: 18, lineHeight: 24 }}>{rate.name}</Txt>
        <Txt style={{ color: '#718095', fontSize: 13 }}>{rate.sku}{rate.size_label ? ` · ${rate.size_label}` : ''}</Txt>
      </View>
      <Badge>Indicative</Badge>
    </View>
    <View style={{ backgroundColor: '#F3F6FB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, gap: 3 }}>
      <Txt style={{ color: '#718095', fontSize: 11, fontWeight: '700', letterSpacing: 0.8 }}>CURRENT SELLING RATE</Txt>
      <Txt accessibilityRole="summary" style={{ fontSize: 28, lineHeight: 36, fontWeight: '700', color: '#17283B' }}>{money(rate.amount)}<Txt style={{ fontSize: 15, fontWeight: '500', color: '#718095' }}> / {rate.uom}</Txt></Txt>
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 24, rowGap: 10 }}>
      <View style={{ flexGrow: 1, gap: 3 }}>
        <Txt style={{ color: '#718095', fontSize: 11, fontWeight: '700' }}>LAST UPDATED</Txt>
        <Txt style={{ fontSize: 13 }}>{pricingUpdateTime(rate.effective_at)}</Txt>
      </View>
      <View style={{ flexGrow: 1, gap: 3 }}>
        <Txt style={{ color: '#718095', fontSize: 11, fontWeight: '700' }}>PRICE STATUS</Txt>
        <Txt style={{ fontSize: 13 }}>Active · Revision {rate.revision}</Txt>
      </View>
    </View>
    {rate.previous_amount && <Txt style={{ color: '#718095', fontSize: 12 }}>Previous: {money(rate.previous_amount)} / {rate.uom}{rate.previous_effective_at ? ` · ${pricingUpdateTime(rate.previous_effective_at)}` : ''}</Txt>}
    <Button secondary onPress={() => setOpen(!open)}>{open ? 'Hide price history' : 'View price history'}</Button>
    {open && <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: '#E5EAF0', paddingTop: 12 }}>
      <Txt style={{ fontWeight: '700', fontSize: 14 }}>Previous published rates</Txt>
      {history.isPending ? <Txt>Loading history…</Txt> : history.error ? <Txt accessibilityRole="alert">{history.error.message}</Txt> : history.data.map(item => <View key={item.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><Txt style={{ color: '#718095', fontSize: 13 }}>{pricingUpdateTime(item.effective_at)}</Txt><Txt style={{ fontWeight: '600', fontSize: 13 }}>{money(item.amount)} / {item.uom}</Txt></View>)}
      <Row><Button secondary disabled={!offset} onPress={() => setOffset(Math.max(0, offset - 24))}>Newer</Button><Button secondary disabled={history.data?.length !== 24} onPress={() => setOffset(offset + 24)}>Older</Button></Row>
    </View>}
  </Card>;
}
export function Rates() {
  const market = useStore(state => state.market);
  const setMarket = useStore(state => state.setMarket);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const markets = useQuery({ queryKey: ['pricing', 'markets'], queryFn: pricingApi.markets, staleTime: 60000 });
  const selected = markets.data?.some(m => m.id === market) ? market : '';
  const rates = useQuery({ queryKey: ['pricing', 'rates', selected, search, offset], queryFn: () => pricingApi.rates(selected, search, offset), enabled: !!selected, staleTime: 15000, refetchInterval: 30000 });
  return <View style={{ gap: 16 }}>
    <Heading eyebrow="MARKET INTELLIGENCE" title="Market rates" description="Current selling rates, with update date, time and price history." />
    {markets.isPending ? <Txt>Loading markets…</Txt> : markets.error ? <Empty title="Could not load markets" description={markets.error.message} action={<Button onPress={() => void markets.refetch()}>Retry</Button>} /> : !markets.data.length ? <Empty title="No markets available" description="Markets will appear when FTI staff creates them." /> : <>
      <Row style={{ flexWrap: 'wrap' }}>{markets.data.map(item => <Chip key={item.id} selected={selected === item.id} onPress={() => { setMarket(item.id); setOffset(0); }}>{item.name} · {item.state}</Chip>)}</Row>
      {!selected ? <Txt>Select a market to see its published rates.</Txt> : <>
        <Field label="Search product or SKU" placeholder="e.g. M12 hex bolt" value={search} onChangeText={value => { setSearch(value); setOffset(0); }} />
        <Button secondary disabled={rates.isFetching} onPress={() => void rates.refetch()}>Refresh rates</Button>
        {rates.isPending ? <Txt>Loading rates…</Txt> : rates.error ? <Empty title="Could not load rates" description={rates.error.message} /> : <>
          <Txt>{rates.data.disclosure}</Txt>
          {!rates.data.items.length ? <Empty title="No current rates" description="No published rates match this market and search." /> : rates.data.items.map(rate => <RateCard key={rate.id} rate={rate} market={selected} />)}
          <Row><Button secondary disabled={!offset} onPress={() => setOffset(Math.max(0, offset - 24))}>Previous</Button><Button secondary disabled={offset + 24 >= rates.data.total} onPress={() => setOffset(offset + 24)}>Next</Button></Row>
        </>}
      </>}
    </>}
  </View>;
}
