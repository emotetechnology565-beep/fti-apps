import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Icon } from './Icon';
import { Txt } from './Txt';

export const mobileCommerce = StyleSheet.create({
  page: { backgroundColor: '#F6F8FB', gap: 12, paddingBottom: 16 },
  body: { paddingHorizontal: 12, gap: 12 },
  card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E7ECF2', borderRadius: 8, padding: 12, gap: 10 },
  title: { color: '#123657', fontSize: 20, lineHeight: 26, fontWeight: '800' },
  heading: { color: '#123657', fontSize: 16, fontWeight: '800' },
  muted: { color: '#65788F', fontSize: 12, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#DFE7F0', borderRadius: 5, paddingHorizontal: 12, minHeight: 44, fontSize: 13, color: '#123657' },
  action: { backgroundColor: '#ED222B', minHeight: 46, paddingHorizontal: 14, borderRadius: 5, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9 },
  actionText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});

export function MobileCommerceHeader({ title, children, back = false }: { title: string; children?: ReactNode; back?: boolean }) {
  return <View style={{ backgroundColor: '#123B60', padding: 14, gap: 12 }}>
    <View style={mobileCommerce.row}>
      {back ? <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.canGoBack() ? router.back() : router.replace('/products')} style={{ minHeight: 32, minWidth: 32, justifyContent: 'center' }}><Icon name="arrow-left" color="#FFFFFF" size={23} /></Pressable> : null}
      <Txt accessibilityRole="header" style={{ flex: 1, color: '#FFFFFF', fontSize: 21, fontWeight: '800' }}>{title}</Txt>
    </View>
    {children}
  </View>;
}
