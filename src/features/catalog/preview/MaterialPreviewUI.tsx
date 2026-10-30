import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Txt, Icon } from '@shared/ui';
import { MaterialPhoto } from '../components/MaterialPhoto';
import type { DemoMaterial } from './material-preview-model';

export const previewStyles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FFFFFF' },
  navy: { backgroundColor: '#123B60', padding: 16, gap: 6 },
  title: { color: '#082341', fontSize: 27, lineHeight: 32, fontWeight: '800', fontFamily: Platform.OS === 'web' ? '"Arial Narrow", Arial, sans-serif' : 'sans-serif-condensed', letterSpacing: -0.8 },
  h2: { color: '#082341', fontSize: 15, lineHeight: 21, fontWeight: '700', fontFamily: 'Arial' },
  text: { color: '#193A59', fontSize: 12, lineHeight: 18, fontFamily: 'Arial' },
  muted: { color: '#61758A', fontSize: 11, lineHeight: 16, fontFamily: 'Arial' },
  card: { padding: 10, gap: 9, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DFE7F0', borderRadius: 5 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  action: { minHeight: 44, borderRadius: 5, backgroundColor: '#ED222B', paddingHorizontal: 12, paddingVertical: 9, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: '#FFFFFF', fontSize: 13, lineHeight: 19, fontWeight: '700', textAlign: 'center' },
  secondary: { backgroundColor: '#FFFFFF', borderColor: '#B3C8DD', borderWidth: 1 },
  secondaryText: { color: '#123B60' },
  tableRow: { flexDirection: 'row', gap: 12, paddingVertical: 7, borderBottomWidth: 1, borderColor: '#E7EDF4' },
});
export const money = (value: number) => `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export function Action({ children, onPress, secondary = false, disabled = false }: { children: ReactNode; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[previewStyles.action, secondary && previewStyles.secondary, disabled && { opacity: 0.45 }]}><Txt style={[previewStyles.actionText, secondary && previewStyles.secondaryText]}>{children}</Txt></Pressable>;
}
export function Panel({ title, children }: { title?: string; children: ReactNode }) {
  return <View style={previewStyles.card}>{title ? <Txt style={previewStyles.h2}>{title}</Txt> : null}{children}</View>;
}
export function Info({ children, warning = false }: { children: ReactNode; warning?: boolean }) {
  return <View style={{ backgroundColor: warning ? '#FFF2DC' : '#E8F3FF', padding: 12, borderRadius: 6, flexDirection: 'row', gap: 9 }}><Icon name={warning ? 'alert-circle' : 'info'} size={18} color={warning ? '#9A5800' : '#1260B6'} /><Txt style={[previewStyles.text, { flex: 1, fontSize: 12 }]}>{children}</Txt></View>;
}
export function Table({ rows, highlight = false }: { rows: (readonly [string, string])[]; highlight?: boolean }) {
  return <View>{rows.map(([label, value], index) => <View key={`${label}-${index}`} style={[previewStyles.tableRow, highlight && index === rows.length - 1 && { backgroundColor: '#FFF0F1', paddingHorizontal: 8 }]}><Txt style={[previewStyles.text, { flex: 1 }]}>{label}</Txt><Txt selectable style={[previewStyles.text, { flex: 1, fontWeight: '700', textAlign: 'right' }, highlight && index === rows.length - 1 && { color: '#ED222B' }]}>{value}</Txt></View>)}</View>;
}
export function MaterialSummary({ item, children }: { item: DemoMaterial; children?: ReactNode }) {
  return <View style={{ gap: 8 }}><View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><View style={{ width: 96 }}><MaterialPhoto category={item.category} height={78} /></View><View style={{ flex: 1, gap: 3 }}><Txt style={previewStyles.h2}>{item.name}</Txt><Txt style={previewStyles.text}>{item.grade || 'Grade needed'}</Txt><Txt style={previewStyles.muted}>{item.size}</Txt><Txt style={previewStyles.muted}>{item.pieces} pieces</Txt></View></View>{children}</View>;
}
export function Check({ checked, onPress, children }: { checked: boolean; onPress: () => void; children: ReactNode }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 44 }}><View style={{ height: 23, width: 23, borderRadius: 4, borderWidth: 1, borderColor: checked ? '#ED222B' : '#94A8BC', backgroundColor: checked ? '#ED222B' : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>{checked ? <Icon name="check" color="#FFFFFF" size={17} /> : null}</View><Txt style={[previewStyles.text, { flex: 1 }]}>{children}</Txt></Pressable>;
}
export function Input({ label, value, onChange, numeric = false }: { label: string; value: string; onChange: (value: string) => void; numeric?: boolean }) {
  return <View style={{ gap: 5 }}><Txt style={previewStyles.text}>{label}</Txt><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} keyboardType={numeric ? 'decimal-pad' : 'default'} placeholder={label} placeholderTextColor="#7C8CA0" style={{ borderWidth: 1, borderColor: '#CBD8E5', borderRadius: 4, minHeight: 42, paddingHorizontal: 10, fontSize: 13, color: '#193A59', backgroundColor: '#FAFCFF', fontFamily: 'Arial' }} /></View>;
}
export function InlineInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Txt style={[previewStyles.text, { flex: 1 }]}>{label}</Txt><TextInput accessibilityLabel={label} keyboardType="decimal-pad" value={value} onChangeText={onChange} style={{ flex: 1, minHeight: 36, borderWidth: 1, borderColor: '#CBD8E5', borderRadius: 4, paddingHorizontal: 10, backgroundColor: '#FAFCFF', color: '#132B4F', fontSize: 13 }} /></View>;
}
export function DimensionFigure({ diameter = '40', length = '3000', square = false }: { diameter?: string; length?: string; square?: boolean }) {
  return <View accessibilityLabel={`${square ? 'Square side' : 'Diameter'} ${diameter} mm, length ${length} mm`} style={{ padding: 16, backgroundColor: '#F4F7FB', borderRadius: 6, gap: 12 }}>
    <Txt style={[previewStyles.text, { textAlign: 'center', color: '#ED222B', fontWeight: '700' }]}>{square ? 'Side' : 'Diameter'} ↔ {diameter} mm</Txt>
    <View style={{ flexDirection: 'row', gap: 18, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 66, height: 66, borderRadius: square ? 0 : 33, backgroundColor: '#B9C5CE', borderWidth: 2, borderColor: '#28475E' }} /><View style={{ height: 47, flex: 1, maxWidth: 220, backgroundColor: '#B9C5CE', borderColor: '#28475E', borderWidth: 2, borderRadius: 7 }} /></View>
    <Txt style={[previewStyles.text, { textAlign: 'center', fontWeight: '700' }]}>← Length {length} mm →</Txt>
    <Txt style={[previewStyles.muted, { textAlign: 'center' }]}>Schematic · dimensions in mm · not to scale</Txt>
  </View>;
}
