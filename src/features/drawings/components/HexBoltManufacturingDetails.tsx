import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Txt, c } from '@shared/ui';

// Advertised capabilities transcribed from the supplied FTI hex-bolt poster.
const details = [
  ['Material used', 'Wire and round bars'],
  ['Material grades', 'LC / MS / CHQ · EN-8D · Boron · SAE-4140 · EN-19'],
  ['Cold forging', 'Diameter: 5–24 mm · Length: 10–200 mm'],
  ['Hot forging', 'Diameter: 24–56 mm · Length: 50–450 mm'],
  ['Threading capacity', '5–56 mm'],
  ['Threads available', 'BSW · UNC · UNF · Coarse (metric and inch)'],
  ['Manufacturing process', 'Wire / round bars → Cutting to length → Cold or hot forging → Threading → Inspection'],
  ['Inspection', 'Dimensional check and quality inspection'],
  ['Facilities available', 'Cold forging headers · Screw forgings (multiple stages) · Nut forging M24–M42 using a friction press'],
  ['Finishing facilities', 'Auto black · Zinc plating · Hot dip galvanizing · Zinc flake'],
] as const;

export function HexBoltManufacturingDetails() {
  const [expanded, setExpanded] = useState(false);
  return <View style={styles.container}>
    <Pressable accessibilityRole="button" accessibilityLabel="Hex bolt manufacturing details"
      accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={styles.toggle}>
      <Txt style={styles.title}>Manufacturing details</Txt>
      <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={c.brandBlue} />
    </Pressable>
    {expanded ? <View style={styles.content}>
      {details.map(([label, value]) => <View key={label} style={styles.detail}>
        <Txt style={styles.label}>{label}</Txt>
        <Txt style={styles.value}>{value}</Txt>
      </View>)}
      <Txt style={styles.note}>Advertised capabilities. The forging route depends on the required size. Confirm grade, thread pitch, finish and availability with your quote. Nut forging is a facility capability.</Txt>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { marginTop: 10, borderTopWidth: 1, borderColor: c.line },
  toggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { flex: 1, fontSize: 12, fontWeight: '600', color: c.brandBlue },
  content: { gap: 12, paddingBottom: 12 },
  detail: { gap: 4 },
  label: { fontSize: 11, fontWeight: '700', color: c.ink },
  value: { fontSize: 12, lineHeight: 19, color: c.ink },
  note: { fontSize: 10.5, lineHeight: 17, color: c.muted },
});
