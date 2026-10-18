import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@features/auth/ui';
import { Icon, Row, Txt, c } from '@shared/ui';
import { availableStaffSections, selectedStaffSection } from '../model/sections';

export function AdminNavigation({onNavigate}: {onNavigate?: () => void}) {
  const auth = useAuth();
  const {section} = useLocalSearchParams<{section?: string}>();
  const selected = selectedStaffSection(auth.identity,section);
  return <View style={{gap: 4, paddingBottom: 18}}>
    <Txt style={{fontSize: 10, fontWeight: '700', letterSpacing: 1, color: c.muted, padding: 12}}>STAFF TOOLS</Txt>
    {availableStaffSections(auth.identity).map(item => <Pressable
      key={item.id}
      accessibilityRole="link"
      accessibilityLabel={item.label}
      accessibilityState={{selected: selected?.id === item.id}}
      onPress={() => {router.setParams({section: item.id}); onNavigate?.();}}
      style={{minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 7, backgroundColor: selected?.id === item.id ? c.pink : 'transparent'}}
    ><Row style={{gap: 10}}><Icon name={item.icon} size={16} color={selected?.id === item.id ? c.red : c.muted}/><Txt style={{flex: 1, fontSize: 12, fontWeight: selected?.id === item.id ? '700' : '500', color: selected?.id === item.id ? c.red : c.ink}}>{item.label}</Txt></Row></Pressable>)}
  </View>;
}
