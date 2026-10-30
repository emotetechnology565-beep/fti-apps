import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Icon } from './Icon';
import { Txt } from './Txt';

export function MaterialMobileHeader({ onMenu, onSearch, onCart, onSupport, count = 0, variant = 'navy', compact = false }: { onMenu: () => void; onSearch?: () => void; onCart?: () => void; onSupport?: () => void; count?: number; variant?: 'navy' | 'white'; compact?: boolean }) {
  const white = variant === 'white';
  const ink = white ? '#071A38' : '#FFFFFF';
  return <View style={{ flexDirection: 'row', paddingHorizontal: compact ? 8 : 12, paddingVertical: compact ? 5 : white ? 4 : 12, backgroundColor: white ? '#FFFFFF' : '#0C3555', alignItems: 'center', gap: 4 }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Open navigation" onPress={onMenu} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="menu" size={24} color={ink} /></Pressable>
    <View style={{ flex: 1 }} />
    {([{ icon: 'search', label: 'Search materials', action: onSearch ?? (() => router.push('/products')) }, { icon: 'shopping-cart', label: `Basket ${count} items`, action: onCart ?? (() => router.push('/cart')) }, { icon: 'headphones', label: 'Support', action: onSupport ?? (() => router.push('/support')) }] as const).map(item => <Pressable key={item.label} accessibilityRole="button" accessibilityLabel={item.label} onPress={item.action} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name={item.icon} size={white ? 25 : 22} color={ink} />{item.icon === 'shopping-cart' ? <Txt style={{ position: 'absolute', right: 0, top: 0, backgroundColor: '#EB2027', color: '#FFFFFF', borderRadius: 9, minWidth: 16, textAlign: 'center', paddingHorizontal: 3, fontSize: 10 }}>{count}</Txt> : null}</Pressable>)}
  </View>;
}
