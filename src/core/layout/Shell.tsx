import { useAuth } from '@features/auth/ui';
import { hasPermission } from '@features/auth';
import { pricingApi } from '@features/pricing/export';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '@core/state/workspace-store';
import { Badge, Button, Icon, Row, Txt, c, s } from '@shared/ui';
import { Image } from 'expo-image';
import { router, usePathname } from 'expo-router';
import React, { ReactNode, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
type IconName = React.ComponentProps<typeof Icon>['name'];
const nav: { label: string; icon: IconName; path: string; group: string }[] = [
  { label: 'Overview', icon: 'grid', path: '/', group: 'PROCUREMENT' },
  {
    label: 'Material catalogue',
    icon: 'box',
    path: '/products',
    group: 'PROCUREMENT',
  },
  {
    label: 'Market rates',
    icon: 'trending-up',
    path: '/rates',
    group: 'PROCUREMENT',
  },
  {
    label: 'Requests & quotations',
    icon: 'file-text',
    path: '/rfqs',
    group: 'PROCUREMENT',
  },
  {
    label: 'Cart',
    icon: 'shopping-bag',
    path: '/cart',
    group: 'YOUR BUSINESS',
  },
  {
    label: 'Orders & dispatch',
    icon: 'truck',
    path: '/orders',
    group: 'YOUR BUSINESS',
  },
  {
    label: 'Payments & credit',
    icon: 'credit-card',
    path: '/payments',
    group: 'YOUR BUSINESS',
  },
  {
    label: 'Weight calculator',
    icon: 'cpu',
    path: '/calculator',
    group: 'TOOLS & SUPPORT',
  },
  {
    label: 'Claims & certificates',
    icon: 'shield',
    path: '/support',
    group: 'TOOLS & SUPPORT',
  },
  {
    label: 'Business account',
    icon: 'briefcase',
    path: '/account',
    group: 'TOOLS & SUPPORT',
  },
];
export function Shell({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { width } = useWindowDimensions();
  const desktop = width >= 1000;
  const phone = width < 600;
  const path = usePathname();
  const markets = useQuery({ queryKey: ['pricing', 'markets'], queryFn: pricingApi.markets, staleTime: 60000 });
  const setMarket = useStore(state => state.setMarket);
  const { market, cart } = useStore(
    useShallow((state) => ({
      market: state.market,
      cart: state.cart,
    })),
  );
  const business = {
    name:
      auth.identity?.businesses[0]?.legal_name ??
      auth.identity?.profile.full_name ??
      '',
  };
  const [marketOpen, setMarketOpen] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [menu, setMenu] = useState(false);
  const active = (p: string) => (p === '/' ? path === '/' : path.startsWith(p));
  const go = (p: string) => {
    setMenu(false);
    router.push(p as never);
  };
  const current =
    nav.find((n) => active(n.path))?.label ??
    (path === '/admin'
      ? 'Staff workspace'
      : path === '/checkout'
        ? 'Checkout'
        : 'Material detail');
  const sidebar = (
    <View
      style={{
        flex: 1,
        backgroundColor: 'white',
        paddingHorizontal: 18,
        paddingTop: 27,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="FTI home"
        onPress={() => go('/')}
      >
        <Row style={{ gap: 12, paddingHorizontal: 9 }}>
          <Image
            source={require('../../../assets/logo/logo.jpeg')}
            accessibilityLabel="FTI logo"
            contentFit="contain"
            style={{ width: 43, height: 43 }}
          />
          <View>
            <Txt
              style={{ fontSize: 17, fontWeight: '800', letterSpacing: -0.6 }}
            >
              FIELDFAST
            </Txt>
            <Txt
              style={{
                fontSize: 8,
                letterSpacing: 2,
                color: c.muted,
                marginTop: 3,
              }}
            >
              TECH INTERNATIONAL
            </Txt>
          </View>
        </Row>
      </Pressable>
      <View
        style={{
          marginTop: 30,
          marginBottom: 22,
          backgroundColor: c.bg,
          borderRadius: 7,
          padding: 13,
        }}
      >
        <Row style={{ gap: 8 }}>
          <View
            style={{
              width: 7,
              height: 7,
              backgroundColor: c.green,
              borderRadius: 5,
            }}
          />
          <Txt style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8 }}>
            BUSINESS WORKSPACE
          </Txt>
        </Row>
      </View>
      <ScrollView showsVerticalScrollIndicator={false}>
        {['PROCUREMENT', 'YOUR BUSINESS', 'TOOLS & SUPPORT'].map((group) => (
          <View key={group} style={{ marginBottom: 23 }}>
            <Txt
              style={{
                fontSize: 8,
                fontWeight: '700',
                letterSpacing: 1.6,
                color: '#98A2B1',
                marginBottom: 10,
                paddingLeft: 13,
              }}
            >
              {group}
            </Txt>
            {nav
              .filter((n) => n.group === group)
              .map((n) => (
                <Pressable
                  key={n.path}
                  accessibilityRole="link"
                  accessibilityLabel={n.label}
                  onPress={() => go(n.path)}
                  style={({ hovered }: any) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingHorizontal: 13,
                    minHeight: 43,
                    marginBottom: 3,
                    borderRadius: 6,
                    backgroundColor: active(n.path)
                      ? c.pink
                      : hovered
                        ? c.bg
                        : 'transparent',
                  })}
                >
                  <Icon
                    name={n.icon}
                    size={16}
                    color={active(n.path) ? c.red : c.muted}
                  />
                  <Txt
                    style={{
                      fontSize: 11,
                      fontWeight: active(n.path) ? '700' : '500',
                      color: active(n.path) ? c.red : '#59687A',
                      flex: 1,
                    }}
                  >
                    {n.label}
                  </Txt>
                  {n.path === '/cart' && cart.length ? (
                    <Badge tone="red">{cart.length}</Badge>
                  ) : null}
                </Pressable>
              ))}
          </View>
        ))}
      </ScrollView>
      <View
        style={{
          borderTopWidth: 1,
          borderColor: c.line,
          paddingTop: 17,
          paddingBottom: 22,
          gap: 17,
        }}
      >
        {hasPermission(auth.identity, 'staff.access') ? (
          <Pressable onPress={() => go('/admin')} accessibilityRole="link">
            <Row style={{ paddingLeft: 12 }}>
              <Icon name="sliders" size={15} />
              <Txt style={{ fontSize: 11, color: c.muted }}>Staff console</Txt>
              <Icon name="arrow-up-right" size={13} />
            </Row>
          </Pressable>
        ) : null}
        <Row
          style={{
            backgroundColor: c.bg,
            padding: 12,
            borderRadius: 7,
            gap: 9,
          }}
        >
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: '#DDE6F3',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Txt style={{ fontSize: 10, fontWeight: '700', color: '#48638C' }}>
              {business.name
                ? business.name
                    .split(' ')
                    .map((word) => word[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()
                : 'FTI'}
            </Txt>
          </View>
          <View style={{ flex: 1 }}>
            <Txt numberOfLines={1} style={{ fontSize: 10, fontWeight: '700' }}>
              {business.name || 'Set up your business'}
            </Txt>
            <Txt style={{ fontSize: 9, color: c.muted, marginTop: 3 }}>
              Business profile
            </Txt>
          </View>
        </Row>
      </View>
    </View>
  );
  if (!auth.ready)
    return <Txt>{auth.error ?? 'Opening your workspace...'}</Txt>;
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: c.bg }}
      edges={['top', 'bottom']}
    >
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {desktop ? (
          <View
            style={{ width: 235, borderRightWidth: 1, borderColor: c.line }}
          >
            {sidebar}
          </View>
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View
            style={{
              height: phone ? 68 : 76,
              backgroundColor: 'white',
              borderBottomWidth: 1,
              borderColor: c.line,
              paddingHorizontal: phone ? 18 : 32,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            {!desktop ? (
              <Row style={{ gap: 6 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open navigation"
                  onPress={() => setMenu(true)}
                  style={{ padding: 8 }}
                >
                  <Icon name="menu" color={c.ink} />
                </Pressable>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="FTI home"
                  onPress={() => go('/')}
                >
                  <Txt
                    style={{
                      fontSize: 18,
                      fontWeight: '900',
                      color: c.red,
                      letterSpacing: -1,
                    }}
                  >
                    FTI
                  </Txt>
                </Pressable>
              </Row>
            ) : (
              <Row style={{ gap: 9 }}>
                <Txt style={{ fontSize: 11, color: c.muted }}>Workspace</Txt>
                <Icon name="chevron-right" size={12} />
                <Txt style={{ fontSize: 11, fontWeight: '600' }}>{current}</Txt>
              </Row>
            )}
            <Row style={{ gap: phone ? 10 : 22 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose market"
                onPress={() => setMarketOpen(true)}
              >
                <Row style={{ gap: 7 }}>
                  <Icon name="map-pin" size={15} color={c.red} />
                  <View>
                    <Txt
                      style={{
                        fontSize: 8,
                        color: c.muted,
                        letterSpacing: 0.8,
                      }}
                    >
                      YOUR MARKET
                    </Txt>
                    <Txt
                      style={{
                        fontSize: phone ? 10 : 11,
                        fontWeight: '600',
                        marginTop: 3,
                      }}
                    >
                      {markets.data?.find(item => item.id === market)?.name || 'Select market'}
                    </Txt>
                  </View>
                  <Icon name="chevron-down" size={12} />
                </Row>
              </Pressable>
              {!phone ? (
                <View
                  style={{ width: 1, height: 27, backgroundColor: c.line }}
                />
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Notifications"
                onPress={() => setNotifications(true)}
                style={{ padding: 8 }}
              >
                <Icon name="bell" size={19} color={c.ink} />
              </Pressable>
              {desktop ? (
                <Pressable
                  onPress={() => go('/account')}
                  accessibilityLabel="Business account"
                >
                  <View
                    style={{
                      width: 33,
                      height: 33,
                      borderRadius: 17,
                      backgroundColor: c.pink,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Txt
                      style={{ fontSize: 10, fontWeight: '700', color: c.red }}
                    >
                      {business.name
                        ? business.name
                            .split(' ')
                            .map((word) => word[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()
                        : 'FTI'}
                    </Txt>
                  </View>
                </Pressable>
              ) : null}
            </Row>
          </View>
          <ScrollView
            key={path}
            contentContainerStyle={{
              padding: phone ? 18 : 32,
              paddingBottom: phone ? 100 : 32,
            }}
          >
            <View
              style={{ maxWidth: 1250, width: '100%', alignSelf: 'center' }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 7,
                  marginBottom: 22,
                }}
              >
                <View
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: 4,
                    backgroundColor: '#BA8D41',
                  }}
                />
                <Txt
                  style={{ fontSize: 9, color: '#8A7960', letterSpacing: 0.4 }}
                >
                  Business services awaiting connection
                </Txt>
              </View>
              {children}
              <View
                style={{
                  marginTop: 36,
                  borderTopWidth: 1,
                  borderColor: c.line,
                  paddingTop: 19,
                }}
              >
                <Row
                  style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}
                >
                  <Txt style={{ fontSize: 9, color: '#98A2B1' }}>
                    © 2026 FTI · Fieldfast Industrial Commerce
                  </Txt>
                  <Txt style={{ fontSize: 9, color: '#98A2B1' }}>
                    Built for the businesses that build India.
                  </Txt>
                </Row>
              </View>
            </View>
          </ScrollView>
          {!desktop ? (
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: 'white',
                borderTopWidth: 1,
                borderColor: c.line,
                minHeight: 66,
                paddingTop: 7,
                paddingBottom: 5,
              }}
            >
              {[
                { label: 'Home', path: '/', icon: 'grid' },
                { label: 'Materials', path: '/products', icon: 'box' },
                { label: 'Rates', path: '/rates', icon: 'trending-up' },
                { label: 'Cart', path: '/cart', icon: 'shopping-bag' },
                { label: 'Account', path: '/account', icon: 'user' },
              ].map((n) => (
                <Pressable
                  key={n.path}
                  accessibilityRole="link"
                  accessibilityLabel={n.label}
                  onPress={() => go(n.path)}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    minHeight: 48,
                  }}
                >
                  <Icon
                    name={n.icon as IconName}
                    size={18}
                    color={active(n.path) ? c.red : c.muted}
                  />
                  <Txt
                    style={{
                      fontSize: 9,
                      color: active(n.path) ? c.red : c.muted,
                      fontWeight: active(n.path) ? '700' : '400',
                    }}
                  >
                    {n.label}
                    {n.path === '/cart' && cart.length
                      ? ` (${cart.length})`
                      : ''}
                  </Txt>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </View>
      <Modal
        visible={marketOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMarketOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: '#17283B66',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <View
            style={{
              backgroundColor: 'white',
              borderRadius: 12,
              padding: 26,
              width: '100%',
              maxWidth: 410,
              gap: 16,
            }}
          >
            <Txt style={s.h2}>Choose your market</Txt>
            {markets.isPending ? <Txt>Loading markets…</Txt> : markets.error ? <>
              <Txt accessibilityRole="alert">{markets.error.message}</Txt>
              <Button secondary onPress={() => void markets.refetch()}>Retry</Button>
            </> : <ScrollView style={{ maxHeight: 320 }}>
              {!markets.data.length && <Txt>No markets available yet.</Txt>}
              {markets.data.map(item => <Button key={item.id} secondary={market !== item.id} onPress={() => { setMarket(item.id); setMarketOpen(false); }}>{item.name} · {item.state}</Button>)}
            </ScrollView>}
            <Button secondary onPress={() => setMarketOpen(false)}>
              Cancel
            </Button>
          </View>
        </View>
      </Modal>
      <Modal
        visible={notifications}
        transparent
        animationType="fade"
        onRequestClose={() => setNotifications(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: '#17283B66',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <View
            style={{
              backgroundColor: 'white',
              borderRadius: 12,
              padding: 26,
              width: '100%',
              maxWidth: 430,
              gap: 19,
            }}
          >
            <Txt style={s.h2}>Your workspace updates</Txt>
            <Badge>NOTIFICATIONS</Badge>
            <Txt style={{ lineHeight: 23 }}>
              No notifications available. Updates will appear when the
              notification service is connected.
            </Txt>
            <Button
              onPress={() => {
                setNotifications(false);
                go('/orders');
              }}
            >
              View orders
            </Button>
            <Button secondary onPress={() => setNotifications(false)}>
              Close
            </Button>
          </View>
        </View>
      </Modal>
      <Modal
        visible={menu}
        transparent
        animationType="slide"
        onRequestClose={() => setMenu(false)}
      >
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            backgroundColor: '#17283B66',
          }}
        >
          <View style={{ width: 280, backgroundColor: 'white' }}>
            {sidebar}
          </View>
          <Pressable
            style={{ flex: 1 }}
            accessibilityLabel="Close navigation"
            onPress={() => setMenu(false)}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}
