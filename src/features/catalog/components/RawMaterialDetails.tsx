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
  if (product.product_kind !== 'steel') return null;
  const profile = rawMaterialDetails(product);
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
      <Detail
        compact={compact}
        label="Special-grade MOQ"
        value={profile?.specialGradeMoq ?? 'Confirm with your enquiry'}
      />
    </>
  );
  if (compact) return <View style={styles.summary}>{summary}</View>;
  return (
    <Card style={styles.full}>
      <Txt accessibilityRole="header" style={styles.title}>
        Material specifications
      </Txt>
      {summary}
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
  full: { gap: 16, marginBottom: 18 },
  title: { fontSize: 20, lineHeight: 27, fontWeight: '700' },
  detail: { gap: 4 },
  compactDetail: { minHeight: 52, gap: 2 },
  compactLabel: { fontSize: 10, lineHeight: 15 },
  compactValue: { fontSize: 11, lineHeight: 17 },
  label: { fontSize: 11, lineHeight: 17, fontWeight: '700', color: c.ink },
  value: { fontSize: 12, lineHeight: 19, color: c.ink },
  note: { fontSize: 12, lineHeight: 20, color: '#58697C' },
});
