import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Heading, Empty, Button, Card, Chip, Field, Row, Txt, Badge } from '@shared/ui';
import { pricingApi } from '../services/pricing-api';
import type { PublishedRate } from '../model/types';
import { useStore } from '@core/state/workspace-store';

const money = (amount: string) => `INR ${Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 4 })}`;
function RateCard({ rate, market, now }: { rate: PublishedRate; market: string; now: number }) {
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const history = useQuery({ queryKey: ['pricing', 'history', market, rate.variant_id, offset, rate.revision], queryFn: () => pricingApi.history(market, rate.variant_id, offset), enabled: open, staleTime: 0 });
  const expired = new Date(rate.expires_at).getTime() <= now;
  return <Card style={{ gap: 12 }}>
    <Txt style={{ fontWeight: '700', fontSize: 20 }}>{rate.name}</Txt>
    <Txt>{rate.sku}{rate.size_label ? ` · ${rate.size_label}` : ''}</Txt>
    <Badge>{expired ? 'Expired — refresh rates' : 'Indicative'}</Badge>
    <Txt style={{ fontSize: 26, fontWeight: '700' }}>{money(rate.amount)} / {rate.uom}</Txt>
    <Txt>Published {new Date(rate.effective_at).toLocaleString()}</Txt>
    <Txt>Valid until {new Date(rate.expires_at).toLocaleString()} · Revision {rate.revision}</Txt>
    {rate.previous_amount && <Txt>Previous publication: {money(rate.previous_amount)} / {rate.uom} on {new Date(rate.previous_effective_at!).toLocaleString()}</Txt>}
    <Button secondary onPress={() => setOpen(!open)}>{open ? 'Hide history' : 'View price history'}</Button>
    {open && <View style={{ gap: 10 }}>
      <Txt>Historical publications — not current offers</Txt>
      {history.isPending ? <Txt>Loading history…</Txt> : history.error ? <Txt accessibilityRole="alert">{history.error.message}</Txt> : history.data.map(item => <Txt key={item.id}>{new Date(item.effective_at).toLocaleString()} · {money(item.amount)} / {item.uom}</Txt>)}
      <Row><Button secondary disabled={!offset} onPress={() => setOffset(Math.max(0, offset - 24))}>Newer</Button><Button secondary disabled={history.data?.length !== 24} onPress={() => setOffset(offset + 24)}>Older</Button></Row>
    </View>}
  </Card>;
}
export function Rates() {
  const market = useStore(state => state.market);
  const setMarket = useStore(state => state.setMarket);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const markets = useQuery({ queryKey: ['pricing', 'markets'], queryFn: pricingApi.markets, staleTime: 60000 });
  const selected = markets.data?.some(m => m.id === market) ? market : '';
  const rates = useQuery({ queryKey: ['pricing', 'rates', selected, search, offset], queryFn: () => pricingApi.rates(selected, search, offset), enabled: !!selected, staleTime: 15000, refetchInterval: 30000 });
  // Anchor expiry to the server clock; device clocks can be incorrect.
  const serverNow = rates.data ? new Date(rates.data.server_time).getTime() + Math.max(0, now - rates.dataUpdatedAt) : now;
  return <View style={{ gap: 16 }}>
    <Heading eyebrow="MARKET INTELLIGENCE" title="Market rates" description="Published indicative rates, with validity and price history." />
    {markets.isPending ? <Txt>Loading markets…</Txt> : markets.error ? <Empty title="Could not load markets" description={markets.error.message} action={<Button onPress={() => void markets.refetch()}>Retry</Button>} /> : !markets.data.length ? <Empty title="No markets available" description="Markets will appear when FTI staff creates them." /> : <>
      <Row>{markets.data.map(item => <Chip key={item.id} selected={selected === item.id} onPress={() => { setMarket(item.id); setOffset(0); }}>{item.name} · {item.state}</Chip>)}</Row>
      {!selected ? <Txt>Select a market to see its published rates.</Txt> : <>
        <Field label="Search product or SKU" value={search} onChangeText={value => { setSearch(value); setOffset(0); }} />
        <Button secondary disabled={rates.isFetching} onPress={() => void rates.refetch()}>Refresh rates</Button>
        {rates.isPending ? <Txt>Loading rates…</Txt> : rates.error ? <Empty title="Could not load rates" description={rates.error.message} /> : <>
          <Txt>{rates.data.disclosure}</Txt>
          {!rates.data.items.length ? <Empty title="No current rates" description="No unexpired published rates match this market and search." /> : rates.data.items.map(rate => <RateCard key={rate.id} rate={rate} market={selected} now={serverNow} />)}
          <Row><Button secondary disabled={!offset} onPress={() => setOffset(Math.max(0, offset - 24))}>Previous</Button><Button secondary disabled={offset + 24 >= rates.data.total} onPress={() => setOffset(offset + 24)}>Next</Button></Row>
        </>}
      </>}
    </>}
  </View>;
}
