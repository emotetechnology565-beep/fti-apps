import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Txt, c } from '@shared/ui';
import { accountSections, selectedAccountSection } from '../model/sections';

export function AccountNavigation({onNavigate}: {onNavigate?: () => void}) {
  const {section} = useLocalSearchParams<{section?: string}>();
  const selected = selectedAccountSection(section);
  return <View style={{gap: 4, paddingBottom: 18}}>
    <Txt style={{fontSize: 10, fontWeight: '700', color: c.subtle, padding: 12}}>YOUR ACCOUNT</Txt>
    {accountSections.map(item => <Pressable key={item.id} accessibilityRole="link" accessibilityLabel={item.label}
      accessibilityState={{selected: selected === item.id}}
      onPress={() => {router.setParams({section: item.id}); onNavigate?.();}}
      style={{minHeight: 44, padding: 12, borderRadius: 7, backgroundColor: selected === item.id ? c.pink : 'transparent'}}>
      <Txt style={{fontSize: 12, fontWeight: selected === item.id ? '700' : '500', color: selected === item.id ? c.red : c.paper}}>{item.label}</Txt>
    </Pressable>)}
    <Pressable accessibilityRole="link" accessibilityLabel="Back to marketplace" onPress={() => {router.push('/products'); onNavigate?.();}} style={{minHeight: 44, padding: 12}}><Txt style={{fontSize: 12, color: c.subtle}}>Back to marketplace</Txt></Pressable>
  </View>;
}
