import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { AccessGate, useAuth } from '@features/auth/ui';
import { Button, Empty, Heading, Txt } from '@shared/ui';
import { stockApi } from '../services/stock-api';
import { ListingPanel } from '../components/ListingPanel';

function Detail({id}: {id: string}) {
  const auth = useAuth();
  const valid = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id);
  const query = useQuery({queryKey: ['business-stock','detail',auth.session?.user.id,id], queryFn: () => stockApi.detail(id), enabled: valid, retry: false, refetchInterval: 60000});
  if (!valid) return <Empty title="Listing unavailable" description="This listing link is invalid."/>;
  if (query.isPending) return <Txt>Loading business stock...</Txt>;
  if (query.error) return <Empty title="Listing unavailable" description={query.error.message} action={<Button secondary onPress={() => void query.refetch()}>Retry listing</Button>}/>;
  return <ListingPanel listing={query.data}/>;
}
export function StockDetailScreen() {
  const {id} = useLocalSearchParams<{id: string}>();
  return <View style={{gap: 14}}><Heading eyebrow="BUSINESS STOCK" title="Business stock details" description="Check the seller, material and availability before enquiring."/><Button secondary onPress={() => router.push('/business-stock' as never)}>Back to business stock</Button><AccessGate><Detail key={id} id={id ?? ''}/></AccessGate></View>;
}
