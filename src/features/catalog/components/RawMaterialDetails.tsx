import { StyleSheet, View } from 'react-native';
import { Card, Txt, c } from '@shared/ui';
import type { Product } from '../model/types';
import { rawMaterialDetails } from '../model/raw-material-details';

export function RawMaterialDetails({
  product,
  compact = false,
}: {
  product: Product;
  compact?: boolean;
}) {
  if (!['steel', 'fastener'].includes(product.product_kind)) return null;
  const profile = rawMaterialDetails(product);
  if (!profile) return null;
  const summary = (
    <>
      <Detail
        compact={compact}
        label="Advertised size range"
        value={profile?.size ?? 'Confirm with your enquiry'}
      />
      <Detail
        compact={compact}
        label="Materials / grades"
        value={profile?.materials ?? 'Confirm required grade with FTI'}
      />
      {profile.specialGradeMoq ? <Detail
        compact={compact}
        label="Special-grade MOQ"
        value={profile.specialGradeMoq}
      /> : null}
    </>
  );
  if (compact) return <View style={styles.summary}>{summary}</View>;
  return (
    <Card style={styles.full}>
      <Txt accessibilityRole="header" style={styles.title}>
        Product specifications
      </Txt>
      <View style={styles.grid}>{summary}</View>
      {profile?.details.map(([label, value]) => (
        <Detail key={label} label={label} value={value} />
      ))}
      {profile?.grades ? (
        <Detail
          label="Advertised steel grades"
          value={profile.grades.join(' · ')}
        />
      ) : null}
      <Txt style={styles.note}>
        Advertised ranges describe the product family. Confirm the size and
        grade combination, availability and final specification with FTI when
        requesting a quotation.
      </Txt>
    </Card>
  );
}
function Detail({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <View style={[styles.detail, compact ? styles.compactDetail : undefined]}>
      <Txt style={[styles.label, compact && styles.compactLabel]}>{label}</Txt>
      <Txt style={[styles.value, compact && styles.compactValue]}>{value}</Txt>
    </View>
  );
}
const styles = StyleSheet.create({
  summary: { gap: 4 },
  full: {
    gap: 12,
    marginBottom: 16,
    padding: 14,
    borderWidth: 0,
    borderRadius: 8,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  title: { fontSize: 18, lineHeight: 24, fontWeight: '600', color: '#101c2c' },
  detail: {
    gap: 4,
    backgroundColor: '#eff4ff',
    padding: 12,
    borderRadius: 6,
    minWidth: 0,
    maxWidth: '100%',
  },
  compactDetail: {
    minHeight: 52,
    gap: 2,
    backgroundColor: 'transparent',
    padding: 0,
    flexGrow: 0,
    flexBasis: 'auto',
  },
  compactLabel: { fontSize: 10, lineHeight: 15 },
  compactValue: { fontSize: 11, lineHeight: 17 },
  label: { fontSize: 11, lineHeight: 17, fontWeight: '700', color: c.ink },
  value: { fontSize: 12, lineHeight: 19, color: c.ink },
  note: { fontSize: 12, lineHeight: 20, color: '#58697C' },
});
