import { usePriceAccess } from '@shared/hooks/use-price-access';
import { SubscriptionNotice } from './SubscriptionNotice';
import { View, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '@core/state/workspace-store';
import { Button, Row, Txt, c } from '@shared/ui';
import { pricingApi } from '../services/pricing-api';
import { pricingUpdateTime } from '../model/rate-calculation';
import type { PublishedRate } from '../model/types';
import { PriceTicker } from './PriceTicker';

const money = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 });
const changeMoney = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

function PriceChange({ rate }: { rate: PublishedRate }) {
  const previous = Number(rate.previous_amount);
  if (!rate.previous_amount || !Number.isFinite(previous) || previous <= 0) {
    return <Txt style={styles.details}>New rate</Txt>;
  }
  const change = Number(rate.amount) - previous;
  const percent = Math.abs((change / previous) * 100);
  const direction = change > 0 ? '↑' : change < 0 ? '↓' : '→';
  return (
    <Txt
      style={[
        styles.change,
        { color: change < 0 ? '#E94459' : change > 0 ? '#27AA50' : '#777777' },
      ]}
    >
      {direction} {changeMoney.format(Math.abs(change))} (
      {change < 0 ? '-' : ''}
      {percent.toFixed(1)}%)
    </Txt>
  );
}

export function MaterialPriceBanner() {
  const priceAccess = usePriceAccess();
  return priceAccess ? (
    <MaterialPriceBannerContent />
  ) : (
    <SubscriptionNotice />
  );
}

function MaterialPriceBannerContent() {
  const market = useStore((state) => state.market);
  const setMarket = useStore((state) => state.setMarket);
  const markets = useQuery({
    queryKey: ['pricing', 'markets'],
    queryFn: pricingApi.markets,
    staleTime: 60000,
  });
  const selected =
    markets.data?.find((item) => item.id === market) ?? markets.data?.[0];
  const marketId = selected?.id ?? '';
  const rates = useQuery({
    queryKey: ['pricing', 'rates', marketId, '', 0],
    queryFn: () => pricingApi.rates(marketId, '', 0),
    enabled: !!marketId,
    staleTime: 15000,
    refetchInterval: 30000,
  });
  const viewRates = () => {
    if (marketId) setMarket(marketId);
    router.push('/rates');
  };
  const error = markets.error ?? rates.error;

  return (
    <View style={styles.banner}>
      <Row style={styles.header}>
        <Txt accessibilityRole="header" style={styles.heading}>
          Latest material prices
        </Txt>
        <Pressable
          accessibilityRole="link"
          onPress={viewRates}
          hitSlop={10}
          style={styles.link}
        >
          <Txt style={styles.linkText}>View all rates ↗</Txt>
        </Pressable>
      </Row>
      {markets.isPending ? (
        <Txt>Loading material markets…</Txt>
      ) : markets.error ? null : !selected ? (
        <Txt>Material prices will appear when a market is available.</Txt>
      ) : (
        <>
          {rates.isPending ? (
            <Txt>Loading published prices…</Txt>
          ) : rates.error ? null : !rates.data?.items.length ? (
            <Txt>
              No material prices have been published for {selected.name} yet.
            </Txt>
          ) : (
            <>
              <View style={styles.track}>
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                  {Array.from({ length: 60 }, (_, index) => (
                    <View
                      key={`v${index}`}
                      style={[styles.verticalLine, { left: index * 24 }]}
                    />
                  ))}
                  {Array.from({ length: 7 }, (_, index) => (
                    <View
                      key={`h${index}`}
                      style={[styles.horizontalLine, { top: index * 24 }]}
                    />
                  ))}
                </View>
                <PriceTicker key={marketId} count={rates.data.items.length}>
                  {(duplicate) =>
                    rates.data.items.map((rate) => (
                      <Pressable
                        key={rate.id}
                        onPress={viewRates}
                        accessibilityRole="link"
                        accessible={!duplicate}
                        focusable={!duplicate}
                        tabIndex={duplicate ? -1 : 0}
                        accessibilityLabel={`${rate.name}, ${selected.name}, ${rate.currency_code} ${rate.amount} per ${rate.uom}. Updated ${pricingUpdateTime(rate.effective_at)}. View market rates.`}
                        style={({ pressed }) => [
                          styles.material,
                          { opacity: pressed ? 0.75 : 1 },
                        ]}
                      >
                        <View pointerEvents="none" style={styles.brandStripe} />
                        <Txt numberOfLines={1} style={styles.materialName}>
                          {rate.name}, {selected.name}, {selected.state}
                        </Txt>
                        <Txt numberOfLines={1} style={styles.details}>
                          {rate.size_label || rate.sku}
                        </Txt>
                        <Row style={styles.priceRow}>
                          <Txt style={styles.amount}>
                            {rate.currency_code === 'INR'
                              ? '₹'
                              : rate.currency_code}{' '}
                            {money.format(Number(rate.amount))}
                            <Txt style={styles.unit}> / {rate.uom}</Txt>
                          </Txt>
                          <PriceChange rate={rate} />
                        </Row>
                      </Pressable>
                    ))
                  }
                </PriceTicker>
              </View>
              <Txt style={styles.disclosure}>
                {rates.data.disclosure} Changes vs previous published rate.
              </Txt>
            </>
          )}
        </>
      )}
      {error ? (
        <View style={styles.titleText}>
          <Txt accessibilityRole="alert">
            Could not refresh material prices. {error.message}
          </Txt>
          <Button
            secondary
            onPress={() =>
              void (markets.error ? markets.refetch() : rates.refetch())
            }
          >
            Retry prices
          </Button>
        </View>
      ) : null}
      {rates.data && rates.error ? (
        <Txt style={styles.details}>
          Previously loaded prices may have changed. Open market rates to check
          again.
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { marginBottom: 24, gap: 10 },
  header: { justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  titleText: { gap: 5, flexShrink: 1 },
  heading: { color: '#00409A', fontSize: 14, fontWeight: '700' },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { color: '#00409A', fontSize: 12, fontWeight: '600' },
  track: {
    backgroundColor: '#EAF2FC',
    borderRadius: 12,
    overflow: 'hidden',
  },
  verticalLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: '#D8E5F5',
  },
  horizontalLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#D8E5F5',
  },
  material: {
    width: 320,
    flexShrink: 0,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: c.cardBorder,
    boxShadow: '0 2px 8px rgba(16, 24, 40, 0.04)',
  },
  materialName: {
    color: '#00409A',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  details: { color: '#526277', fontSize: 13, lineHeight: 20 },
  priceRow: {
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 16,
    flexWrap: 'wrap',
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    marginHorizontal: -20,
    marginBottom: -14,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  brandStripe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#00409A',
  },
  amount: { color: '#00409A', fontSize: 15, fontWeight: '700' },
  unit: { fontSize: 11 },
  change: { fontSize: 13, fontWeight: '700' },
  disclosure: { color: '#777777', fontSize: 11, lineHeight: 16 },
});
