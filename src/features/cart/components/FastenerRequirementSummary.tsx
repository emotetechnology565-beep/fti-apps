import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Txt, c } from '@shared/ui';
import type { MaterialCartSelection } from '../model/types';

const dimensionLabels: Record<string, string> = {
  diameter: 'Diameter', diameter_mm: 'Diameter', length: 'Length', length_mm: 'Length',
  width: 'Width', width_mm: 'Width', radius: 'Inside radius', radius_mm: 'Inside radius', returnHeight: 'Return height', return_height_mm: 'Return height', angle: 'Return angle', angle_deg: 'Return angle', thickness_mm: 'Thickness',
};

export function FastenerRequirementSummary({ material, editable = false }: { material: MaterialCartSelection; editable?: boolean }) {
  const requirement = material.fastenerRequirement;
  if (!requirement) return null;
  const fields = [
    ['Standard', requirement.standard || 'To be confirmed'],
    ['Shape', requirement.shape || 'To be confirmed'],
    ['Dimensions', Object.entries(requirement.dimensions).map(([key, value]) => `${dimensionLabels[key] ?? key.replaceAll('_', ' ')}: ${value}${key === 'angle' || key === 'angle_deg' ? '°' : ' mm'}`).join(' · ') || 'To be confirmed'],
    ['Material', requirement.material || 'To be confirmed'],
    ['Grade', requirement.grade || 'To be confirmed'],
    ['Thread', requirement.thread || 'To be confirmed'],
    ['Pitch', requirement.pitch || 'To be confirmed'],
    ['Finish', requirement.finish || 'To be confirmed'],
    ['Supply', requirement.with_nut ? 'With nut' : 'Single fastener'],
    ...(requirement.notes ? [['Notes', requirement.notes]] : []),
  ];
  return <View style={{ gap: 5, minWidth: 0 }}>
    {requirement.custom ? <Txt style={{ color: c.brandBlue, fontSize: 11, fontWeight: '700' }}>Custom requirement · FTI to confirm</Txt> : null}
    {fields.map(([label, value]) => <Txt key={label} style={{ color: c.muted, fontSize: 11, lineHeight: 17 }}><Txt style={{ fontWeight: '600' }}>{label}: </Txt>{value}</Txt>)}
    {editable ? <Pressable accessibilityRole="link" accessibilityLabel={`Edit ${material.name} requirement`}
      onPress={() => router.push({ pathname: '/fastener/[slug]', params: { slug: requirement.subcategory, editKey: material.key, configure: '1' } })}
      style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
      <Txt style={{ color: c.brandBlue, fontSize: 12, fontWeight: '600' }}>Edit requirement</Txt>
    </Pressable> : null}
  </View>;
}
