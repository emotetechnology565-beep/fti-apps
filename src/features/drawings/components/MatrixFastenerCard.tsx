import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { Button, Icon, Txt, c } from '@shared/ui';
import type { DrawingDefinition } from '../model/types';
import { subcategoryLabel } from '../model/subcategories';
import { loadFastenerDetail } from '../services/fastener-requirement-api';

export function MatrixFastenerCard({ slug, imageUrl, drawings, onSelect }: {
  slug: string; imageUrl: string | null; drawings: DrawingDefinition[]; onSelect: () => void; desktop?: boolean;
}) {
  const detail = useQuery({ queryKey: ['fastener-detail', slug], queryFn: () => loadFastenerDetail(slug), staleTime: 30000, retry: false });
  const name = detail.data?.title ?? subcategoryLabel(slug);
  const standards = [...new Set(drawings.map(row => `${row.standard}:${row.edition}`))];
  return <View style={styles.card} testID="fastener-catalogue-card">
    <Pressable accessibilityRole="link" accessibilityLabel={`View ${name}`} onPress={onSelect} style={styles.top}>
      {imageUrl ? <Image source={{ uri: imageUrl }} accessibilityLabel={`${name} product photo`} contentFit="contain" style={styles.image} /> : <View style={[styles.image, styles.placeholder]}><Icon name="tool" size={32} color={c.brandBlue} /></View>}
      <View style={styles.text}>
        <Txt style={styles.title}>{name}</Txt>
        <Txt style={styles.description} numberOfLines={3}>{detail.data?.description ?? 'View product information, standards and available specifications.'}</Txt>
        <Txt style={styles.note}>{standards.length ? `${standards.length} published drawing standard${standards.length === 1 ? '' : 's'}` : 'Custom requirements on enquiry'}</Txt>
      </View>
    </Pressable>
    <View style={styles.footer}><Txt style={styles.rate}>Quotation on request</Txt><Button onPress={onSelect}>View details</Button></View>
  </View>;
}
const styles = StyleSheet.create({
  card: { flex: 1, padding: 16, gap: 18, backgroundColor: c.paper, borderWidth: 1, borderColor: c.line, borderRadius: 8 },
  top: { flexDirection: 'row', gap: 14, flex: 1, minHeight: 134 },
  image: { width: 96, height: 106, borderRadius: 6 }, placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg },
  text: { flex: 1, minWidth: 0, gap: 9 }, title: { color: c.ink, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  description: { color: c.muted, fontSize: 12, lineHeight: 19 }, note: { color: c.muted, fontSize: 11, lineHeight: 17 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, borderTopWidth: 1, borderColor: c.line, paddingTop: 14 },
  rate: { color: c.brandRed, fontWeight: '700', fontSize: 12 },
});
