import { useAuth } from '@features/auth/ui';
import { MaterialMobileHeader } from '@shared/ui/MaterialMobileHeader';
import { hasPermission } from '@features/auth';
import { AdminNavigation } from '@features/admin/ui';
import { AccountNavigation } from '@features/account/ui';
import { StaffOrderAlert } from '@features/operations/ui';
import { pricingApi } from '@features/pricing/export';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '@core/state/workspace-store';
import { Badge, Button, Icon, Row, Txt, c, s } from '@shared/ui';
import { Image } from 'expo-image';
import { router, useLocalSearchParams, usePathname } from 'expo-router';
import React, { ReactNode, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
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
    label: 'My stock & enquiries',
    icon: 'package',
    path: '/sell-stock',
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
    group: 'TOOLS',
  },
  {
    label: 'Claims & certificates',
    icon: 'shield',
    path: '/support',
    group: 'TOOLS',
  },
  {
    label: 'Business account',
    icon: 'briefcase',
    path: '/account',
    group: 'TOOLS',
  },
];
export function Shell({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { width } = useWindowDimensions();
  const desktop = width >= 1000;
  const phone = width < 600;
  const path = usePathname();
  const mobileCommercePage = !desktop && (['/', '/products', '/cart', '/checkout', '/orders', '/rates', '/rfqs', '/payments', '/account', '/support'].includes(path) || path.startsWith('/product/'));
  const {section: adminSection} = useLocalSearchParams<{section?: string}>();
  const staffWorkspace = path === '/admin' && hasPermission(auth.identity,'staff.access');
  const accountWorkspace = path === '/account' && !!auth.identity;
  const contentScroll = useRef<ScrollView>(null);
  useEffect(() => {
    if (accountWorkspace) contentScroll.current?.scrollTo({y: 0, animated: false});
  }, [accountWorkspace, adminSection]);
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
  const [menuProgress] = useState(() => new Animated.Value(0));
  const animateMenu = (toValue: number, onClosed?: () => void) => {
    Animated.timing(menuProgress, {
      toValue,
      duration: 220,
      useNativeDriver: Platform.OS !== 'web',
    }).start(({ finished }) => {
      if (finished) onClosed?.();
    });
  };
  const closeMenu = () => animateMenu(0, () => setMenu(false));
  const active = (p: string) => (p === '/' ? path === '/' : path.startsWith(p) || p === '/products' && path.startsWith('/business-stock'));
  const go = (p: string) => {
    if (menu) closeMenu();
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
        backgroundColor: '#0B1B36',
        paddingHorizontal: 16,
        paddingTop: 24,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="FTI home"
        onPress={() => go('/')}
      >
        <Row style={{ gap: 12, paddingHorizontal: 6, alignItems: 'center' }}>
          <Image
            source={require('../../../assets/logo/logo.jpeg')}
            accessibilityLabel="FTI logo"
            contentFit="contain"
            style={{ width: 44, height: 44, borderRadius: 6 }}
          />
          <View style={{ gap: 2 }}>
            <Txt
              style={{
                fontSize: 18,
                fontWeight: '900',
                letterSpacing: 0.5,
                color: '#FFFFFF',
              }}
            >
              FTI
            </Txt>
            <Txt
              style={{
                fontSize: 8,
                letterSpacing: 1.2,
                color: '#94A3B8',
                fontWeight: '600',
              }}
            >
              FieldFast Tech International
            </Txt>
          </View>
        </Row>
      </Pressable>
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ marginTop: 24 }}
      >
        {staffWorkspace ? (
          <AdminNavigation onNavigate={closeMenu} />
        ) : accountWorkspace ? (
          <AccountNavigation onNavigate={closeMenu} />
        ) : (
          ['PROCUREMENT', 'YOUR BUSINESS', 'TOOLS'].map((group) => (
            <View key={group} style={{ marginBottom: 20 }}>
              <Txt
                style={{
                  fontSize: 9,
                  fontWeight: '800',
                  letterSpacing: 1.2,
                  color: '#64748B',
                  marginBottom: 8,
                  paddingLeft: 12,
                }}
              >
                {group}
              </Txt>
              {nav
                .filter((n) => n.group === group)
                .map((n) => {
                  const isActive = active(n.path);
                  return (
                    <Pressable
                      key={n.path}
                      accessibilityRole="link"
                      accessibilityLabel={n.label}
                      onPress={() => go(n.path)}
                      style={({ hovered }: any) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        paddingHorizontal: 12,
                        minHeight: 40,
                        marginBottom: 4,
                        borderRadius: 8,
                        backgroundColor: isActive
                          ? '#A70101'
                          : hovered
                            ? 'rgba(255, 255, 255, 0.08)'
                            : 'transparent',
                      })}
                    >
                      <Icon
                        name={n.icon}
                        size={16}
                        color={isActive ? '#FFFFFF' : '#94A3B8'}
                      />
                      <Txt
                        style={{
                          fontSize: 12,
                          fontWeight: isActive ? '700' : '500',
                          color: isActive ? '#FFFFFF' : '#CBD5E1',
                          flex: 1,
                        }}
                      >
                        {n.label}
                      </Txt>
                      {n.path === '/cart' && cart.length ? (
                        <View
                          style={{
                            backgroundColor: isActive ? '#FFFFFF' : '#00409A',
                            borderRadius: 10,
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                          }}
                        >
                          <Txt
                            style={{
                              fontSize: 10,
                              fontWeight: '700',
                              color: isActive ? '#A70101' : '#FFFFFF',
                            }}
                          >
                            {cart.length}
                          </Txt>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
            </View>
          ))
        )}
      </ScrollView>
      <View
        style={{
          borderTopWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.1)',
          paddingTop: 14,
          paddingBottom: 20,
          gap: 12,
        }}
      >
        {hasPermission(auth.identity, 'staff.access') ? (
          <Pressable onPress={() => go(staffWorkspace ? '/products' : '/admin')} accessibilityRole="link" accessibilityLabel={staffWorkspace ? 'Back to marketplace' : 'Staff console'}>
            <Row style={{ paddingLeft: 12 }}>
              <Icon name="sliders" size={15} color="#94A3B8" />
              <Txt style={{ fontSize: 11, color: '#CBD5E1' }}>{staffWorkspace ? 'Back to marketplace' : 'Staff console'}</Txt>
              <Icon name="arrow-up-right" size={13} color="#94A3B8" />
            </Row>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => go('/account')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            padding: 8,
            borderRadius: 8,
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
          }}
        >
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: '#00409A',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Txt style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>
              {business.name
                ? business.name
                    .split(' ')
                    .map((word) => word[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()
                : 'AS'}
            </Txt>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt
              numberOfLines={1}
              style={{ fontSize: 11.5, fontWeight: '700', color: '#FFFFFF' }}
            >
              {business.name || 'Account'}
            </Txt>
            <Txt style={{ fontSize: 9.5, color: '#94A3B8' }}>
              Business Profile
            </Txt>
          </View>
        </Pressable>
      </View>
    </View>
  );
  if (!auth.ready)
    return <Txt>{auth.error ?? 'Opening your workspace...'}</Txt>;
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: !desktop && !staffWorkspace ? '#071A38' : c.bg }}
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
          {mobileCommercePage ? <MaterialMobileHeader variant={path === '/' ? 'white' : 'navy'} count={cart.length} onMenu={() => { menuProgress.setValue(0); setMenu(true); }} /> : <View
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
                  onPress={() => {
                    menuProgress.setValue(0);
                    setMenu(true);
                  }}
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
                      color: c.dark,
                      letterSpacing: -0.5,
                    }}
                  >
                    FTI
                  </Txt>
                </Pressable>
              </Row>
            ) : (
              <Row style={{ gap: 8, alignItems: 'center' }}>
                <Txt style={{ fontSize: 13, color: '#64748B' }}>Workspace</Txt>
                <Txt style={{ fontSize: 13, color: '#94A3B8' }}>/</Txt>
                <Txt style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
                  {path === '/' ? 'Overview' : current}
                </Txt>
              </Row>
            )}
            <Row style={{ gap: phone ? 10 : 16, alignItems: 'center' }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose market"
                onPress={() => setMarketOpen(true)}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                  borderRadius: 20,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                }}
              >
                <Row style={{ gap: 6, alignItems: 'center' }}>
                  <Icon name="map-pin" size={13} color="#00409A" />
                  <Txt
                    style={{
                      fontSize: phone ? 11 : 12,
                      fontWeight: '700',
                      color: '#0F172A',
                    }}
                  >
                    {markets.data?.find(item => item.id === market)?.name || 'Ludhiana market'}
                  </Txt>
                  <Icon name="chevron-down" size={12} color="#64748B" />
                </Row>
              </Pressable>
              {!phone ? (
                <View
                  style={{ width: 1, height: 24, backgroundColor: '#E2E8F0' }}
                />
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Notifications"
                onPress={() => setNotifications(true)}
                style={{ padding: 6, position: 'relative' }}
              >
                <Icon name="bell" size={18} color="#0F172A" />
                <View
                  style={{
                    position: 'absolute',
                    top: 5,
                    right: 6,
                    width: 7,
                    height: 7,
                    borderRadius: 4,
                    backgroundColor: '#DC2626',
                  }}
                />
              </Pressable>
              {desktop ? (
                <Pressable
                  onPress={() => go('/account')}
                  accessibilityLabel="Business account"
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    paddingLeft: 4,
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: '#0B1B36',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Txt
                      style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}
                    >
                      {business.name
                        ? business.name
                            .split(' ')
                            .map((word) => word[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()
                        : 'RS'}
                    </Txt>
                  </View>
                  <Txt
                    style={{
                      fontSize: 12.5,
                      fontWeight: '700',
                      color: '#0F172A',
                    }}
                  >
                    {business.name || 'Rohit Singh'}
                  </Txt>
                  <Icon name="chevron-down" size={12} color="#64748B" />
                </Pressable>
              ) : null}
            </Row>
          </View>}
          <ScrollView
            ref={contentScroll}
            key={staffWorkspace ? `${path}-${adminSection ?? ''}` : path}
            contentContainerStyle={{
              padding: mobileCommercePage ? 0 : phone ? 18 : 32,
              paddingBottom: mobileCommercePage ? 16 : phone ? 100 : 32,
            }}
          >
            <View
              style={{ maxWidth: 1250, width: '100%', alignSelf: 'center' }}
            >
              {!mobileCommercePage && path !== '/' && (!desktop || path !== '/products') ? <View
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
              </View> : null}
              <StaffOrderAlert />
              {children}
              {!mobileCommercePage && (!desktop || (path !== '/' && path !== '/products')) ? (
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
              ) : null}
            </View>
          </ScrollView>
          {!desktop ? (
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: '#071A38',
                borderTopWidth: 1,
                borderColor: c.cardBorder,
                minHeight: 64,
                paddingTop: 6,
                paddingBottom: 6,
                boxShadow: '0 -2px 10px rgba(31, 27, 22, 0.03)',
              }}
            >
              {[
                { label: 'Home', path: '/', icon: 'home' },
                { label: 'Catalogue', path: '/products', icon: 'grid' },
                { label: 'Market rates', path: '/rates', icon: 'trending-up' },
                { label: 'Orders', path: '/orders', icon: 'package' },
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
                    gap: 4,
                    minHeight: 46,
                  }}
                >
                  <Icon
                    name={n.icon as IconName}
                    size={18}
                    color={active(n.path) ? '#EB2027' : '#FFFFFF'}
                  />
                  <Txt
                    style={{
                      fontSize: 10,
                      color: active(n.path) ? '#EB2027' : '#FFFFFF',
                      fontWeight: active(n.path) ? '700' : '500',
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
        animationType="none"
        onShow={() => animateMenu(1)}
        onRequestClose={closeMenu}
      >
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
          }}
        >
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: '#17283B66',
              opacity: menuProgress,
            }}
          />
          <Animated.View style={{
            width: Math.min(280, width - 48),
            backgroundColor: 'white',
            transform: [{ translateX: menuProgress.interpolate({
              inputRange: [0, 1],
              outputRange: [-280, 0],
            }) }],
          }}>
            {sidebar}
          </Animated.View>
          <Pressable
            style={{ flex: 1 }}
            accessibilityLabel="Close navigation"
            onPress={closeMenu}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}
