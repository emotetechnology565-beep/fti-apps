import { usePriceAccess } from '@shared/hooks/use-price-access';
import { SubscriptionNotice } from '../components/SubscriptionNotice';
import { useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Heading,
  Empty,
  Button,
  Card,
  Field,
  Row,
  Txt,
  Badge,
} from '@shared/ui';
import { pricingApi } from '../services/pricing-api';
import type { Market, PublishedRate } from '../model/types';
import { MarketDropdown } from '../components/MarketDropdown';
import { pricingUpdateTime } from '../model/rate-calculation';
import { catalogApi } from '@features/catalog';
import type { CatalogImage } from '@features/catalog';

const money = (amount: string) =>
  `INR ${Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 4 })}`;
function attributeText(attributes: Record<string, unknown>, names: string[]) {
  const entry = Object.entries(attributes).find(([key]) =>
    names.includes(key.toLowerCase().replaceAll('-', '_')),
  );
  const value = entry?.[1];
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
}
function RateCard({
  rate,
  market,
  image,
}: {
  rate: PublishedRate;
  market: string;
  image?: CatalogImage;
}) {
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const color = attributeText(rate.attributes ?? {}, ['color', 'colour']);
  const finish = attributeText(rate.attributes ?? {}, ['finish', 'coating']);
  const history = useQuery({
    queryKey: [
      'pricing',
      'history',
      market,
      rate.variant_id,
      offset,
      rate.revision,
    ],
    queryFn: () => pricingApi.history(market, rate.variant_id, offset),
    enabled: open,
    staleTime: 0,
  });
  return (
    <Card
      style={{
        gap: 14,
        padding: 16,
        borderWidth: 1,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#E7F2FF',
        boxShadow: '0px 2px 8px rgba(7, 82, 153, 0.08)',
      }}
    >
      <View
        pointerEvents="none"
        style={{
          height: 4,
          flexDirection: 'row',
          marginHorizontal: -16,
          marginTop: -16,
        }}
      >
        <View style={{ flex: 2, backgroundColor: '#B51624' }} />
        <View style={{ flex: 3, backgroundColor: '#075299' }} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        {image ? (
          <Image
            source={{ uri: image.url }}
            contentFit="cover"
            accessibilityLabel={`${rate.name} product photo`}
            style={{
              width: 82,
              height: 82,
              borderRadius: 10,
              backgroundColor: '#F3F6FB',
            }}
          />
        ) : (
          <View
            accessibilityLabel="Product photo unavailable"
            style={{
              width: 82,
              height: 82,
              borderRadius: 10,
              backgroundColor: '#F3F6FB',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 6,
            }}
          >
            <Txt
              style={{ textAlign: 'center', fontSize: 11, color: '#718095' }}
            >
              No photo
            </Txt>
          </View>
        )}
        <View style={{ flex: 1, gap: 5 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <Txt
              style={{
                flex: 1,
                fontWeight: '700',
                fontSize: 17,
                lineHeight: 22,
                color: '#075299',
              }}
            >
              {rate.name}
            </Txt>
            <Badge>Indicative</Badge>
          </View>
          <Txt style={{ color: '#718095', fontSize: 13 }}>
            {rate.sku}
            {rate.size_label ? ` · ${rate.size_label}` : ''}
          </Txt>
          {!!(color || finish) && (
            <Txt style={{ color: '#526277', fontSize: 12 }}>
              {[color && `Color: ${color}`, finish && `Finish: ${finish}`]
                .filter(Boolean)
                .join(' · ')}
            </Txt>
          )}
        </View>
      </View>
      <View
        style={{
          backgroundColor: '#FFF0F0',
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 13,
          gap: 3,
        }}
      >
        <Txt
          style={{
            color: '#B51624',
            fontSize: 11,
            fontWeight: '700',
            letterSpacing: 0.8,
          }}
        >
          CURRENT SELLING RATE
        </Txt>
        <Txt
          accessibilityRole="summary"
          style={{
            fontSize: 28,
            lineHeight: 36,
            fontWeight: '700',
            color: '#B51624',
          }}
        >
          {money(rate.amount)}
          <Txt style={{ fontSize: 15, fontWeight: '500', color: '#718095' }}>
            {' '}
            / {rate.uom}
          </Txt>
        </Txt>
      </View>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          columnGap: 24,
          rowGap: 10,
        }}
      >
        <View style={{ flexGrow: 1, gap: 3 }}>
          <Txt style={{ color: '#718095', fontSize: 11, fontWeight: '700' }}>
            LAST UPDATED
          </Txt>
          <Txt style={{ fontSize: 13 }}>
            {pricingUpdateTime(rate.effective_at)}
          </Txt>
        </View>
        <View style={{ flexGrow: 1, gap: 3 }}>
          <Txt style={{ color: '#718095', fontSize: 11, fontWeight: '700' }}>
            PRICE STATUS
          </Txt>
          <Txt style={{ fontSize: 13 }}>Active · Revision {rate.revision}</Txt>
        </View>
      </View>
      {rate.previous_amount && (
        <Txt style={{ color: '#718095', fontSize: 12 }}>
          Previous: {money(rate.previous_amount)} / {rate.uom}
          {rate.previous_effective_at
            ? ` · ${pricingUpdateTime(rate.previous_effective_at)}`
            : ''}
        </Txt>
      )}
      <Button secondary onPress={() => setOpen(!open)}>
        {open ? 'Hide price history' : 'View price history'}
      </Button>
      {open && (
        <View
          style={{
            gap: 10,
            borderTopWidth: 1,
            borderTopColor: '#E5EAF0',
            paddingTop: 12,
          }}
        >
          <Txt style={{ fontWeight: '700', fontSize: 14 }}>
            Previous published rates
          </Txt>
          {history.isPending ? (
            <Txt>Loading history…</Txt>
          ) : history.error ? (
            <Txt accessibilityRole="alert">{history.error.message}</Txt>
          ) : (
            history.data.map((item) => (
              <View
                key={item.id}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <Txt style={{ color: '#718095', fontSize: 13 }}>
                  {pricingUpdateTime(item.effective_at)}
                </Txt>
                <Txt style={{ fontWeight: '600', fontSize: 13 }}>
                  {money(item.amount)} / {item.uom}
                </Txt>
              </View>
            ))
          )}
          <Row>
            <Button
              secondary
              disabled={!offset}
              onPress={() => setOffset(Math.max(0, offset - 24))}
            >
              Newer
            </Button>
            <Button
              secondary
              disabled={history.data?.length !== 24}
              onPress={() => setOffset(offset + 24)}
            >
              Older
            </Button>
          </Row>
        </View>
      )}
    </Card>
  );
}
function MarketRates({ market, search }: { market: Market; search: string }) {
  const [offset, setOffset] = useState(0);
  const rates = useQuery({
    queryKey: ['pricing', 'rates', market.id, search, offset],
    queryFn: () => pricingApi.rates(market.id, search, offset),
    staleTime: 15000,
    refetchInterval: 30000,
  });
  const productIds = [
    ...new Set(
      rates.data?.items.map((rate) => rate.product_id).filter(Boolean) ?? [],
    ),
  ].sort();
  const images = useQuery({
    queryKey: ['pricing', 'product-images', productIds],
    queryFn: () => catalogApi.publicImages(productIds),
    enabled: productIds.length > 0,
    staleTime: 60000,
    retry: false,
  });
  const imageByProduct = new Map(
    (images.data ?? []).map((image) => [image.product_id, image]),
  );
  return (
    <View style={{ gap: 16 }}>
      <Txt
        accessibilityRole="header"
        style={{ fontSize: 20, fontWeight: '700' }}
      >
        {market.name} · {market.state}
      </Txt>
      {rates.isPending ? (
        <Txt>Loading rates…</Txt>
      ) : rates.error ? (
        <Empty
          title="Could not load rates"
          description={rates.error.message}
          action={
            <Button onPress={() => void rates.refetch()}>Retry rates</Button>
          }
        />
      ) : (
        <>
          <Txt>{rates.data.disclosure}</Txt>
          {!rates.data.items.length ? (
            <Empty
              title="No current rates"
              description="No published rates match this market and search."
            />
          ) : (
            rates.data.items.map((rate) => (
              <RateCard
                key={rate.id}
                rate={rate}
                market={market.id}
                image={imageByProduct.get(rate.product_id)}
              />
            ))
          )}
          {rates.data.total > 24 || offset > 0 ? (
            <Row>
              <Button
                secondary
                disabled={!offset}
                onPress={() => setOffset(Math.max(0, offset - 24))}
              >
                Previous
              </Button>
              <Txt>
                {offset + 1}–{offset + rates.data.items.length} of{' '}
                {rates.data.total}
              </Txt>
              <Button
                secondary
                disabled={offset + 24 >= rates.data.total}
                onPress={() => setOffset(offset + 24)}
              >
                Next
              </Button>
            </Row>
          ) : null}
        </>
      )}
    </View>
  );
}

export function Rates() {
  const priceAccess = usePriceAccess();
  return priceAccess ? <RatesContent /> : <SubscriptionNotice />;
}

function RatesContent() {
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const client = useQueryClient();
  const fetching = useIsFetching({ queryKey: ['pricing', 'rates'] });
  const markets = useQuery({
    queryKey: ['pricing', 'markets'],
    queryFn: pricingApi.markets,
    staleTime: 60000,
  });
  const selected = selectedMarkets.filter((id) =>
    markets.data?.some((market) => market.id === id),
  );
  const visibleMarkets =
    markets.data?.filter(
      (market) => !selected.length || selected.includes(market.id),
    ) ?? [];
  return (
    <View style={{ gap: 16 }}>
      <Heading
        eyebrow="MARKET INTELLIGENCE"
        title="Market rates"
        description="Current selling rates, with update date, time and price history."
      />
      {markets.isPending ? (
        <Txt>Loading markets…</Txt>
      ) : markets.error ? (
        <Empty
          title="Could not load markets"
          description={markets.error.message}
          action={<Button onPress={() => void markets.refetch()}>Retry</Button>}
        />
      ) : !markets.data.length ? (
        <Empty
          title="No markets available"
          description="Markets will appear when FTI staff creates them."
        />
      ) : (
        <>
          <MarketDropdown
            markets={markets.data}
            selected={selected}
            onChange={setSelectedMarkets}
          />
          <Field
            label="Search product or SKU"
            placeholder="e.g. M12 hex bolt"
            value={search}
            onChangeText={setSearch}
          />
          <Row style={{ flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <Txt>
              {selected.length
                ? `${visibleMarkets.length} selected markets`
                : 'Showing all markets'}
            </Txt>
            <Button
              secondary
              disabled={fetching > 0}
              onPress={() =>
                void client.invalidateQueries({
                  queryKey: ['pricing', 'rates'],
                })
              }
            >
              Refresh rates
            </Button>
          </Row>
          {visibleMarkets.map((market) => (
            <MarketRates
              key={`${market.id}:${search}`}
              market={market}
              search={search}
            />
          ))}
        </>
      )}
    </View>
  );
}
