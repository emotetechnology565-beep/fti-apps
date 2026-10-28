import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Icon, Txt } from '@shared/ui';

export function HomeHeader({
  market,
  name,
  onMarket,
  onNotifications,
  onMenu,
}: {
  market: string;
  name: string;
  onMarket: () => void;
  onNotifications: () => void;
  onMenu: () => void;
}) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open navigation"
        onPress={onMenu}
        style={styles.brand}
      >
        <View style={styles.logo}>
          <Txt style={styles.logoText}>FTI</Txt>
        </View>
        <View>
          <Txt style={styles.fieldfast}>FIELDFAST</Txt>
          <Txt style={styles.company}>Tech Int.</Txt>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose market"
        onPress={onMarket}
        style={styles.market}
      >
        <Icon name="map-pin" size={14} color="#b6171e" />
        <Txt numberOfLines={1} style={styles.marketText}>
          {market || 'Select market'}
        </Txt>
        <Icon name="chevron-down" size={13} color="#44474e" />
      </Pressable>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          onPress={onNotifications}
          style={styles.action}
        >
          <Icon name="bell" size={22} color="#101c2c" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Business account"
          onPress={() => router.push('/account')}
          style={styles.action}
        >
          <View style={styles.avatar}>
            <Txt style={styles.initial}>
              {name ? name.slice(0, 1).toUpperCase() : 'FTI'}
            </Txt>
          </View>
        </Pressable>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  header: {
    height: 64,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: '#f8f9ff',
    boxShadow: '0 1px 8px rgba(0,0,0,0.04)',
    zIndex: 1,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#142d4e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ebf1ff',
    letterSpacing: -1,
  },
  fieldfast: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: '#b6171e',
  },
  company: { fontSize: 12, fontWeight: '700', color: '#001835' },
  market: {
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: 8,
    minHeight: 32,
    borderRadius: 20,
    backgroundColor: '#e6eeff',
    flexShrink: 1,
    alignItems: 'center',
  },
  marketText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#001835',
    flexShrink: 1,
  },
  actions: { flexDirection: 'row' },
  action: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#d7e3f9',
    borderColor: '#c4c6cf',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { fontSize: 11, fontWeight: '700', color: '#142d4e' },
});
