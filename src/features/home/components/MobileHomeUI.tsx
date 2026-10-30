import { useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Icon, Txt } from '@shared/ui';

export const homeFont = Platform.select({ web: 'Arial, sans-serif', default: 'sans-serif' });
export const homeColors = { navy: '#071A38', red: '#EB2027', border: '#D6DFE9', text: '#0A2045', muted: '#63738A' };
export function HomePhoto({ uri, label, height = 88 }: { uri?: string | null; label: string; height?: number }) {
  const [failed, setFailed] = useState(false);
  return uri && !failed ? <Image source={{ uri }} accessibilityLabel={label} contentFit="contain" onError={() => setFailed(true)} style={{ width: '100%', height, backgroundColor: '#F8FAFC', borderRadius: 3 }} /> : <View accessibilityLabel={`${label}: photo unavailable`} style={{ width: '100%', height, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', borderRadius: 3 }}><Icon name="image" size={24} color="#8A9BAE" /></View>;
}
export function HomeNotice({ children }: { children: ReactNode }) {
  return <View style={u.notice}><Icon name="info" color="#1260E8" size={19} /><Txt style={u.noticeText}>{children}</Txt></View>;
}
export function HomeButton({ children, onPress, secondary = false, disabled = false }: { children: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[u.button, secondary && u.secondary, disabled && { opacity: 0.5 }]}><Txt style={[u.buttonText, secondary && { color: homeColors.red }]}>{children}</Txt></Pressable>;
}
export function HomeSection({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  return <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}><Txt accessibilityRole="header" style={u.section}>{title}</Txt>{action && onPress ? <Pressable accessibilityRole="link" onPress={onPress} style={{ minHeight: 44, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 3 }}><Txt style={{ color: '#1260E8', fontSize: 12, fontFamily: homeFont }}>{action}</Txt><Icon name="chevron-right" color="#1260E8" size={16} /></Pressable> : null}</View>;
}
export const u = StyleSheet.create({
  section: { color: homeColors.text, fontSize: 19, fontWeight: '800', fontFamily: homeFont, flexShrink: 1 },
  small: { color: homeColors.muted, fontSize: 12, lineHeight: 17, fontFamily: homeFont },
  notice: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 5, backgroundColor: '#EAF3FF', flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  noticeText: { color: '#315789', fontSize: 12, lineHeight: 16, fontFamily: homeFont, flex: 1 },
  button: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7, paddingVertical: 9, borderRadius: 5, borderWidth: 1, borderColor: homeColors.red, backgroundColor: homeColors.red },
  secondary: { backgroundColor: '#FFFFFF' },
  buttonText: { color: '#FFFFFF', fontSize: 13, lineHeight: 18, fontWeight: '700', textAlign: 'center', fontFamily: homeFont },
});
