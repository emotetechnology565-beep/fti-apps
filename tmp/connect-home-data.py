from pathlib import Path
p=Path('src/features/home/components/DesktopHome.tsx')
s=p.read_text(encoding='utf-8')
start=s.index('const marketWatchItems =')
end=s.index('export function DesktopHome()',start)
s=s[:start]+s[end:]
s=s.replace("import { companyCertificate } from '@shared/config/company-certificates';", """import { companyCertificate } from '@shared/config/company-certificates';
import { useQuery } from '@tanstack/react-query';
import { loadHomeCatalogue } from '../data/category-images';
import { drawingApi } from '@features/drawings/export';
import { pricingApi } from '@features/pricing/export';
import { usePriceAccess } from '@shared/hooks/use-price-access';
import { useStore } from '@core/state/workspace-store';""")
s=s.replace("  const [search, setSearch] = useState('');", """  const [search, setSearch] = useState('');
  const priceAccess = usePriceAccess();
  const selectedMarket = useStore((state) => state.market);
  const catalogue = useQuery({ queryKey: ['catalog', 'home', 'categories'], queryFn: () => loadHomeCatalogue(), staleTime: 30_000 });
  const fasteners = useQuery({ queryKey: ['fastener-photos', 'public'], queryFn: drawingApi.photos, staleTime: 30_000 });
  const markets = useQuery({ queryKey: ['pricing', 'markets'], queryFn: pricingApi.markets, staleTime: 30_000 });
  const market = markets.data?.find((item) => item.id === selectedMarket || item.code === selectedMarket) ?? markets.data?.[0];
  const rates = useQuery({ queryKey: ['pricing', 'rates', 'home', market?.id], queryFn: () => pricingApi.rates(market!.id, '', 0), enabled: !!market && priceAccess, staleTime: 30_000 });
  const categoryCards = catalogue.data?.categories ?? [];
  const marketWatchItems = rates.data?.items.slice(0, 3) ?? [];
  const steelImage = categoryCards.find((item) => item.imageUrl)?.imageUrl;
  const fastenerImage = fasteners.data?.find((item) => item.image_url)?.image_url;
  const tractorImage = catalogue.data?.tractorParts.find((item) => item.imageUrl)?.imageUrl;
  const photo = (uri: string | undefined, style: React.ComponentProps<typeof Image>['style']) => uri
    ? <Image source={{ uri }} contentFit="cover" style={style} />
    : <View style={[style, { backgroundColor: '#E8EDF3', alignItems: 'center', justifyContent: 'center' }]}><Icon name="image" size={22} color="#64748B" /></View>;
""")
start=s.index('        <Image',s.index('INDUSTRIAL STEEL FACTORY'))
end=s.index('        <View style={styles.heroOverlay}',start)
s=s[:start]+"        {photo(steelImage, styles.heroImage)}\n"+s[end:]
s=s.replace('Latest rates for key materials in Ludhiana.', "{market ? `Latest published rates in ${market.name}.` : 'Published market rates.'}")
s=s.replace('          {marketWatchItems.map((item) => (', '''          {!priceAccess ? <Txt>Sign in with price access to view current rates.</Txt> : markets.isPending || (market && rates.isPending) ? <Txt>Loading market rates...</Txt> : markets.isError || rates.isError ? <Pressable onPress={() => { void markets.refetch(); if (market) void rates.refetch(); }}><Txt>Market rates unavailable. Tap to retry.</Txt></Pressable> : !marketWatchItems.length ? <Txt>No published rates available for this market.</Txt> : null}
          {marketWatchItems.map((item) => (''')
s=s.replace('''              <Image
                source={item.image}
                contentFit="cover"
                style={styles.marketImage}
              />''', '''              {photo(undefined, styles.marketImage)}''')
s=s.replace('{item.title}', '{item.name}')
s=s.replace('router.push(item.path as never)', "router.push('/rates')")
s=s.replace('Request current rate', "{`₹${Number(item.amount).toLocaleString('en-IN')} / ${item.uom}`}")
s=s.replace('''              <Image
                source={cat.image}
                contentFit="cover"
                style={styles.categoryImage}
              />''', '''              {photo(cat.imageUrl, styles.categoryImage)}''')
s=s.replace('          {categoryCards.map((cat) => (', '''          {catalogue.isPending ? <Txt>Loading published categories...</Txt> : catalogue.isError ? <Pressable onPress={() => void catalogue.refetch()}><Txt>Catalogue unavailable. Tap to retry.</Txt></Pressable> : !categoryCards.length ? <Txt>No published material categories available.</Txt> : null}
          {categoryCards.map((cat) => (''')
for marker, image in [('Fasteners', 'fastenerImage'), ('Tractor Parts', 'tractorImage')]:
    start=s.index('          <Image',s.index('{/* '+marker+' */}'))
    end=s.index('          <View style={styles.promoBody}',start)
    s=s[:start]+f'          {{photo({image}, styles.promoImage)}}\n'+s[end:]
s=s.replace('Nuts, bolts, washers and more for industrial applications.', "{fasteners.isPending ? 'Loading published fasteners...' : fasteners.isError ? 'Fastener catalogue temporarily unavailable.' : `${fasteners.data?.length ?? 0} published fastener categories. Explore sizes and standards.`}")
s=s.replace('Blades, wear parts and replacement components.', "{catalogue.isPending ? 'Loading published tractor parts...' : catalogue.isError ? 'Tractor catalogue temporarily unavailable.' : `${catalogue.data?.tractorParts.length ?? 0} published tractor parts. View current specifications.`}")
s=s.replace('Fast, reliable dispatch across North India.', 'Dispatch availability and freight confirmed with your quote.')
p.write_text(s,encoding='utf-8')
