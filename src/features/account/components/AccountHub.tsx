import { SubscriptionCard } from '@features/subscriptions/SubscriptionCard';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@features/auth/ui';
import { Card, Icon, Txt, c } from '@shared/ui';

const accountBlue = c.cardBorder;

function AccountLink({
  icon, title, description, onPress,
}: {
  icon: ComponentProps<typeof Icon>['name'];
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={title}
      accessibilityHint={description}
      onPress={onPress}
      style={({ pressed }) => [styles.link, pressed && styles.pressed]}
    >
      <View style={styles.icon}><Icon name={icon} color={c.brandBlue} size={22} /></View>
      <View style={styles.linkText}>
        <Txt style={styles.linkTitle}>{title}</Txt>
        <Txt style={styles.description}>{description}</Txt>
      </View>
      <Icon name="chevron-right" size={19} color={c.ink} />
    </Pressable>
  );
}

export function RateSubscription() { return <SubscriptionCard />; }

export function AccountHub({ settings = false }: { settings?: boolean }) {
  const { identity } = useAuth();
  if (!identity) return null;
  const name = identity.profile.full_name.trim() || 'Your FTI account';
  const initials = name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return (
    <View style={styles.hub}>
      {!settings ? (
        <Card style={styles.profile}>
          <View style={styles.profileHeader}>
            <View style={styles.avatar}><Txt style={styles.initials}>{initials}</Txt></View>
            <View style={styles.linkText}>
              <Txt accessibilityRole="header" style={styles.name}>{name}</Txt>
              <Txt style={styles.description}>{identity.profile.phone}</Txt>
            </View>
          </View>
          <AccountLink icon="edit-2" title="Edit personal profile" description="Update your name and view saved account details" onPress={() => router.setParams({section: 'profile'})} />
        </Card>
      ) : null}

      <View style={styles.group}>
        <Txt accessibilityRole="header" style={styles.groupTitle}>RATES & SUBSCRIPTION</Txt>
        <RateSubscription />
      </View>

      <View style={styles.group}>
        <Txt accessibilityRole="header" style={styles.groupTitle}>ORDERS & BUSINESS</Txt>
        <AccountLink icon="package" title="Order history" description="View your orders, payment details and shipment tracking" onPress={() => router.push('/orders')} />
        <AccountLink icon="briefcase" title="Business details" description="View your company details and verification status" onPress={() => router.setParams({section: 'business'})} />
        <AccountLink icon="map-pin" title="Saved business addresses" description="Manage billing and delivery addresses" onPress={() => router.setParams({section: 'addresses'})} />
      </View>

      <View style={styles.group}>
        <Txt accessibilityRole="header" style={styles.groupTitle}>SUPPORT & ACCOUNT</Txt>
        <AccountLink icon="headphones" title="Help & support" description="Contact FTI and get help with your requests" onPress={() => router.push('/support')} />
        {!settings ? <AccountLink icon="settings" title="Notifications & account settings" description="Manage updates, sign out or request account deletion" onPress={() => router.setParams({section: 'settings'})} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hub: { gap: 26 },
  group: { gap: 12 },
  groupTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: c.muted },
  profile: { padding: 0, borderRadius: 18, overflow: 'hidden', borderColor: accountBlue, borderTopWidth: 4, borderTopColor: accountBlue, gap: 18 },
  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingTop: 24 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.dark, alignItems: 'center', justifyContent: 'center' },
  initials: { color: c.paper, fontSize: 20, fontWeight: '700' },
  name: { fontSize: 22, lineHeight: 29, fontWeight: '700', color: c.ink },
  link: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, backgroundColor: c.paper, borderWidth: 1, borderColor: accountBlue, borderRadius: 16 },
  pressed: { backgroundColor: c.bg },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.goldLight, alignItems: 'center', justifyContent: 'center' },
  linkText: { flex: 1, minWidth: 0, gap: 5 },
  linkTitle: { fontSize: 16, lineHeight: 22, fontWeight: '700', color: c.ink },
  description: { fontSize: 13, lineHeight: 21, color: c.muted, flexShrink: 1 },
  subscription: { padding: 20, borderRadius: 18, borderWidth: 2, borderColor: accountBlue, gap: 14 },
  subscriptionHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  subscriptionIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: c.goldLight, alignItems: 'center', justifyContent: 'center' },
  subscriptionTitle: { fontSize: 22, lineHeight: 29, fontWeight: '700', color: c.ink },
  subscriptionNote: { gap: 6, paddingTop: 14, borderTopWidth: 1, borderTopColor: c.line },
  noteTitle: { fontSize: 13, lineHeight: 21, fontWeight: '600', color: c.ink },
});
