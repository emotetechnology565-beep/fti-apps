import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@features/auth/ui';
import { SubscribeForPrices } from '@features/subscriptions/SubscribeForPrices';
import { usePriceAccess } from '@shared/hooks/use-price-access';
import { Button, Icon, Row, Txt, c } from '@shared/ui';
import { customerMarketApi } from './customer-api';
import { saleMoney, saleMovement } from './customer-model';
import { categories, type Category } from './model';

export function HomeMarketWatch() {
  const access = usePriceAccess(),
    auth = useAuth();
  const [category, setCategory] = useState<Category>('Ingot');
  const quotes = useQuery({
    queryKey: [
      'customer-market',
      auth.session?.user.id,
      'board',
      category,
      [],
      [],
      '',
      0,
    ],
    queryFn: () => customerMarketApi.board(category, [], [], '', 0),
    enabled: access,
    staleTime: 15000,
    refetchInterval: access ? 30000 : false,
    retry: false,
  });
  return (
    <View style={styles.panel}>
      <Row style={styles.header}>
        <View style={styles.heading}>
          <Icon name="bar-chart-2" size={19} color={c.blue} />
          <View style={{ flex: 1 }}>
            <Txt style={styles.title}>Market watch</Txt>
            <Txt style={styles.caption}>
              Published district sale prices · INR / tonne
            </Txt>
          </View>
        </View>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="View all district market rates"
          onPress={() =>
            router.push({ pathname: '/rates', params: { category } })
          }
          style={styles.link}
        >
          <Txt style={styles.linkText}>View market rates →</Txt>
        </Pressable>
      </Row>
      {!access ? (
        <View style={{ gap: 12 }}>
          <Txt style={styles.caption}>
            Subscribe to view the latest district prices.
          </Txt>
          <SubscribeForPrices />
        </View>
      ) : (
        <>
          <Row style={styles.tabs}>
            {categories.map((value) => (
              <Pressable
                key={value}
                accessibilityRole="tab"
                accessibilityLabel={`Market watch ${value}`}
                accessibilityState={{ selected: category === value }}
                aria-selected={category === value}
                onPress={() => setCategory(value)}
                style={[styles.tab, category === value && styles.activeTab]}
              >
                <Txt
                  style={[
                    styles.tabText,
                    category === value && styles.activeText,
                  ]}
                >
                  {value}
                </Txt>
              </Pressable>
            ))}
          </Row>
          {quotes.isPending ? (
            <Txt style={styles.caption}>Loading district prices…</Txt>
          ) : quotes.error ? (
            <View style={{ gap: 10 }}>
              <Txt accessibilityRole="alert">
                Market watch unavailable. {quotes.error.message}
              </Txt>
              <Button secondary onPress={() => void quotes.refetch()}>
                Retry market watch
              </Button>
            </View>
          ) : !quotes.data.items.length ? (
            <Txt style={styles.caption}>
              No published {category.toLowerCase()} district prices yet. Choose
              another category.
            </Txt>
          ) : (
            <View style={styles.tiles}>
              {quotes.data.items.slice(0, 3).map((quote) => {
                const movement = saleMovement(quote.price_change);
                return (
                  <Pressable
                    key={quote.location_id}
                    accessibilityRole="link"
                    accessibilityLabel={`Open ${quote.category} rates for ${quote.district}, ${quote.state}`}
                    onPress={() =>
                      router.push({
                        pathname: '/rates',
                        params: {
                          category: quote.category,
                          state: quote.state,
                          district: quote.location_id,
                        },
                      })
                    }
                    style={styles.tile}
                  >
                    <Txt style={styles.state}>{quote.state}</Txt>
                    <Txt style={styles.district}>{quote.district}</Txt>
                    <Row
                      style={{
                        justifyContent: 'space-between',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <Txt style={styles.price}>
                        {saleMoney(quote.sale_price)}
                      </Txt>
                      <Txt
                        style={[
                          styles.change,
                          {
                            color:
                              movement.tone === 'up'
                                ? '#9AE8AF'
                                : movement.tone === 'down'
                                  ? '#FFBAB1'
                                  : '#BCD0E5',
                          },
                        ]}
                      >
                        {movement.symbol} {movement.label}
                      </Txt>
                    </Row>
                  </Pressable>
                );
              })}
            </View>
          )}
        </>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  panel: {
    padding: 18,
    gap: 14,
    backgroundColor: '#EDF3FB',
    borderWidth: 1,
    borderColor: '#D0DFF0',
    borderRadius: 12,
  },
  header: { justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexGrow: 1,
    flexBasis: 220,
  },
  title: { fontSize: 18, fontWeight: '700', color: c.dark },
  caption: { fontSize: 11, lineHeight: 17, color: c.muted },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { fontSize: 12, fontWeight: '700', color: c.blue },
  tabs: { flexWrap: 'wrap', gap: 6 },
  tab: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#DDE7F4',
  },
  activeTab: { backgroundColor: c.blue },
  tabText: { fontSize: 11, fontWeight: '600', color: c.blue },
  activeText: { color: 'white' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    flexBasis: 220,
    flexGrow: 1,
    padding: 16,
    gap: 10,
    backgroundColor: '#102F53',
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: c.brandRed,
  },
  state: {
    fontSize: 9,
    color: '#A9C5E5',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  district: { fontSize: 15, lineHeight: 21, color: 'white', fontWeight: '700' },
  price: {
    fontSize: 24,
    fontWeight: '700',
    color: 'white',
    fontVariant: ['tabular-nums'],
  },
  change: { fontSize: 11, fontWeight: '700' },
});
