import { useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Linking from 'expo-linking';
import { Button, Card, Icon, Txt, c } from '@shared/ui';
import {
  alertContacts,
  rateAlertLink,
  type AlertChannel,
  type AlertContact,
} from './alert-links';
import type { CustomerOptions, MarketQuote } from './customer-api';

export function RateAlerts({
  quote,
  settings,
  children,
  compact = false,
}: {
  quote: MarketQuote;
  settings?: CustomerOptions['settings'];
  children?: ReactNode;
  compact?: boolean;
}) {
  const [channel, setChannel] = useState<AlertChannel | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const whatsapp = alertContacts(settings?.whatsapp ?? ''),
    sms = alertContacts(settings?.sms ?? '');
  async function open(selected: AlertChannel, contact: AlertContact) {
    setChannel(null);
    setBusy(true);
    setStatus('');
    try {
      const url = rateAlertLink(selected, contact, quote);
      if (Platform.OS === 'web')
        window.open(url, '_blank', 'noopener,noreferrer');
      else await Linking.openURL(url);
      setStatus(
        selected === 'whatsapp'
          ? 'Send your request in WhatsApp to receive market alerts.'
          : `Request ${quote.category} alerts for ${quote.district} in your SMS app.`,
      );
    } catch {
      setStatus(
        `Could not open ${selected === 'whatsapp' ? 'WhatsApp' : 'SMS'}. Contact ${contact.label} to request alerts.`,
      );
    } finally {
      setBusy(false);
    }
  }
  function request(selected: AlertChannel) {
    const contacts = selected === 'whatsapp' ? whatsapp : sms;
    setStatus('');
    if (contacts.length === 1) void open(selected, contacts[0]);
    else if (contacts.length > 1) setChannel(selected);
  }
  const contacts = channel === 'whatsapp' ? whatsapp : sms;
  return (
    <View style={styles.group}>
      <View style={[styles.actions, compact && { gap: 5, flexWrap: 'nowrap' }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="WhatsApp alerts"
          disabled={busy || !whatsapp.length}
          accessibilityState={{ disabled: busy || !whatsapp.length }}
          hitSlop={compact ? 4 : undefined}
          onPress={() => request('whatsapp')}
          style={[
            styles.whatsapp,
            compact && styles.compactAction,
            (busy || !whatsapp.length) && { opacity: 0.45 },
          ]}
        >
          <FontAwesome
            name="whatsapp"
            size={compact ? 14 : 19}
            color="#008665"
            accessible={false}
          />
          <Txt style={[styles.whatsappText, compact && styles.compactText]}>
            WhatsApp alerts
          </Txt>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="SMS alerts"
          accessibilityState={{ disabled: busy || !sms.length }}
          hitSlop={compact ? 4 : undefined}
          style={[
            styles.sms,
            compact && styles.compactAction,
            (busy || !sms.length) && { opacity: 0.45 },
          ]}
          disabled={busy || !sms.length}
          onPress={() => request('sms')}
        >
          <Icon
            name="message-square"
            size={compact ? 14 : 16}
            color="#0D2B50"
          />
          <Txt style={[styles.smsText, compact && styles.compactText]}>
            SMS alerts
          </Txt>
        </Pressable>
        {children}
      </View>
      {status ? (
        <Txt accessibilityRole="alert" style={styles.hint}>
          {status}
        </Txt>
      ) : null}
      {!whatsapp.length && !sms.length ? (
        <Txt style={styles.hint}>
          Alert contacts will appear when configured by FTI.
        </Txt>
      ) : null}
      <Modal
        transparent
        visible={channel !== null}
        animationType="none"
        onRequestClose={() => setChannel(null)}
      >
        <View style={styles.overlay}>
          <Card style={styles.dialog}>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
            >
              <Icon name="bell" size={20} color={c.blue} />
              <Txt style={styles.title}>
                {channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} market alerts
              </Txt>
            </View>
            <Txt>
              {quote.category} · {quote.district}, {quote.state}
            </Txt>
            <Txt style={styles.hint}>
              Choose an FTI contact to request alerts.
            </Txt>
            {contacts.map((contact) => (
              <Button
                key={contact.digits}
                secondary
                onPress={() => {
                  if (channel) void open(channel, contact);
                }}
              >{`${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} ${contact.label}`}</Button>
            ))}
            <Button secondary onPress={() => setChannel(null)}>
              Cancel alert request
            </Button>
          </Card>
        </View>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  group: { gap: 8 },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  sms: {
    minHeight: 42,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#FFFFFF',
    borderColor: '#CFD9E7',
    borderWidth: 1,
    borderRadius: 5,
  },
  smsText: { fontSize: 12, fontWeight: '700', color: '#0D2B50' },
  compactAction: {
    minHeight: 36,
    paddingHorizontal: 4,
    gap: 4,
    borderRadius: 4,
  },
  compactText: { fontSize: 9.5 },
  whatsapp: {
    minHeight: 42,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: '#55B69C',
    backgroundColor: '#FFFFFF',
    borderRadius: 5,
  },
  whatsappText: { fontSize: 12, fontWeight: '700', color: '#008665' },
  hint: { fontSize: 11, lineHeight: 17, color: c.muted },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#00000066',
  },
  dialog: { gap: 14, width: '100%', maxWidth: 440, alignSelf: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: c.dark },
});
