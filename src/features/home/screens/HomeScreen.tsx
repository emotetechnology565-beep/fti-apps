import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Announcements } from '@features/operations/ui';
import { useAuth } from '@features/auth/ui';
import { MaterialPriceBanner } from '@features/pricing/ui';
import { Heading, Txt, Icon, c } from '@shared/ui';

const shortcuts = [
  { title: 'Market rates', icon: 'trending-up', path: '/rates' },
  { title: 'Requests & quotations', icon: 'file-text', path: '/rfqs' },
  { title: 'Orders & dispatch', icon: 'truck', path: '/orders' },
  { title: 'Weight calculator', icon: 'cpu', path: '/calculator' },
] as const;

export function Home() {
  const { identity, session, ready, loading, error } = useAuth();
  const name = identity?.profile.full_name ?? '';
  const business =
    identity?.businesses.find(
      (item) => item.verification_status === 'verified',
    ) ?? identity?.businesses[0];
  const accountResolved = ready && !loading && !error && !!identity;
  const accountTitle = business ? business.legal_name : 'Set up your business';
  const accountDescription = business
    ? business.verification_status === 'verified'
      ? 'Verified business · View profile'
      : business.verification_status === 'pending'
        ? 'Application under review · View details'
        : 'Application needs changes · Review feedback'
    : 'Add your business details to get verified.';

  return (
    <View>
      <Heading
        title={name ? 'Welcome, ' + name + '.' : 'Welcome to FTI.'}
        description="What would you like to do?"
      />
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Browse materials"
        onPress={() => router.push('/products')}
        style={({ pressed }) => [styles.browse, pressed && styles.pressed]}
      >
        <Icon name="box" size={24} color="white" />
        <View style={styles.label}>
          <Txt style={styles.browseTitle}>Browse materials</Txt>
          <Txt style={styles.browseDescription}>
            Find materials and specifications
          </Txt>
        </View>
        <Icon name="arrow-right" size={20} color="white" />
      </Pressable>

      <View style={styles.shortcuts}>
        {shortcuts.map((item, index) => (
          <Pressable
            key={item.path}
            accessibilityRole="link"
            accessibilityLabel={item.title}
            onPress={() => router.push(item.path)}
            style={({ pressed }) => [
              styles.shortcut,
              index > 0 && styles.divider,
              pressed && styles.pressed,
            ]}
          >
            <Icon name={item.icon} size={21} color={c.red} />
            <Txt style={styles.shortcutTitle}>{item.title}</Txt>
            <Icon name="chevron-right" size={18} />
          </Pressable>
        ))}
      </View>

      {accountResolved || (!session && ready) ? (
        <Pressable
          accessibilityRole="link"
          onPress={() =>
            router.push(
              accountResolved
                ? {
                    pathname: '/account',
                    params: { section: business ? 'profile' : 'business' },
                  }
                : '/login',
            )
          }
          accessibilityLabel={
            accountResolved
              ? `${accountTitle}. ${accountDescription}`
              : 'Sign in to your FTI account'
          }
          style={({ pressed }) => [styles.account, pressed && styles.pressed]}
        >
          <Icon name={accountResolved ? 'briefcase' : 'user'} size={21} />
          <View style={styles.label}>
            <Txt style={styles.accountTitle}>
              {accountResolved ? accountTitle : 'Sign in to your FTI account'}
            </Txt>
            <Txt style={styles.accountDescription}>
              {accountResolved
                ? accountDescription
                : 'Manage your business and orders.'}
            </Txt>
          </View>
          <Icon name="chevron-right" size={18} />
        </Pressable>
      ) : null}

      <MaterialPriceBanner />
      <Announcements />
    </View>
  );
}

const styles = StyleSheet.create({
  browse: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 20,
    minHeight: 96,
    borderRadius: 12,
    backgroundColor: c.red,
    marginBottom: 16,
  },
  label: { flex: 1, minWidth: 0, gap: 5 },
  browseTitle: { color: 'white', fontSize: 20, fontWeight: '700' },
  browseDescription: { color: 'white', fontSize: 13, lineHeight: 20 },
  shortcuts: {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 12,
    backgroundColor: c.paper,
    marginBottom: 16,
  },
  shortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 64,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  divider: { borderTopWidth: 1, borderTopColor: c.line },
  shortcutTitle: { flex: 1, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 72,
    paddingVertical: 16,
    marginBottom: 20,
  },
  accountTitle: { fontSize: 14, fontWeight: '600', lineHeight: 21 },
  accountDescription: { color: '#526277', fontSize: 12, lineHeight: 19 },
  pressed: { opacity: 0.7 },
});
