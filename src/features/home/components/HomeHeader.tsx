import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Icon, Txt, c } from '@shared/ui';

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
        <Icon name="map-pin" size={13} color={c.brandRed} />
        <Txt numberOfLines={1} style={styles.marketText}>
          {market || 'Select market'}
        </Txt>
        <Icon name="chevron-down" size={12} color={c.muted} />
      </Pressable>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          onPress={onNotifications}
          style={styles.action}
        >
          <Icon name="bell" size={20} color={c.ink} />
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
    backgroundColor: c.paper,
    borderBottomWidth: 1,
    borderColor: c.line,
    boxShadow: '0 1px 4px rgba(16, 24, 40, 0.04)',
    zIndex: 1,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: c.brandBlue,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 64, 154, 0.3)',
  },
  logoText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  fieldfast: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: c.brandRed,
  },
  company: { fontSize: 13, fontWeight: '700', color: c.brandBlue, letterSpacing: -0.2 },
  market: {
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 11,
    minHeight: 32,
    borderRadius: 20,
    backgroundColor: c.paper,
    borderWidth: 1,
    borderColor: c.cardBorder,
    boxShadow: '0 1px 3px rgba(16, 24, 40, 0.04)',
    flexShrink: 1,
    alignItems: 'center',
  },
  marketText: {
    fontSize: 11,
    fontWeight: '700',
    color: c.ink,
    flexShrink: 1,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  action: {
    width: 38,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.brandBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
});
