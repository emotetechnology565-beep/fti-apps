import { Pressable } from 'react-native';
import { router } from 'expo-router';
import { Icon, Txt, c } from '@shared/ui';

export function BackToCatalogue({ fastener = false }: { fastener?: boolean }) {
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel="Back to catalogue"
    onPress={() => router.canGoBack() ? router.back() : router.replace(fastener ? '/products?kind=fastener' : '/products')}
    style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12, marginBottom: 8 }}
  >
    <Icon name="arrow-left" size={18} color={c.brandBlue} />
    <Txt style={{ color: c.brandBlue, fontWeight: '600', fontSize: 13 }}>Back to catalogue</Txt>
  </Pressable>;
}
