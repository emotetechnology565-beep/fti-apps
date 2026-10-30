import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Skeleton, SkeletonBlock } from '@shared/ui/Skeleton';

function ProductCardPlaceholder() {
  return (
    <View style={styles.card}>
      <View style={styles.summary}>
        <SkeletonBlock width={86} height={86} radius={8} />
        <View style={styles.copy}>
          <SkeletonBlock width="42%" height={10} />
          <SkeletonBlock width="88%" height={20} />
          <SkeletonBlock width="64%" height={12} />
          <SkeletonBlock width="48%" height={14} />
        </View>
      </View>
      <View style={styles.fields}>
        <View style={styles.field}>
          <SkeletonBlock width="50%" height={10} />
          <SkeletonBlock height={42} />
        </View>
        <View style={styles.field}>
          <SkeletonBlock width="46%" height={10} />
          <SkeletonBlock height={42} />
        </View>
      </View>
      <SkeletonBlock width="70%" height={12} />
      <View style={styles.fields}>
        <SkeletonBlock height={44} style={{ flex: 1 }} />
        <SkeletonBlock height={44} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

export function ProductGridSkeleton({ count = 4 }: { count?: number }) {
  const desktop = useWindowDimensions().width >= 1000;
  return (
    <Skeleton label="Loading products">
      <View style={styles.grid}>
        {Array.from({ length: count }, (_, index) => (
          <View key={index} style={desktop ? styles.gridCell : styles.fullCell}>
            <ProductCardPlaceholder />
          </View>
        ))}
      </View>
    </Skeleton>
  );
}

export function ProductDetailSkeleton() {
  const desktop = useWindowDimensions().width >= 1000;
  return (
    <Skeleton label="Loading product details">
      <View style={styles.detail}>
        <SkeletonBlock width={130} height={18} />
        <SkeletonBlock width="32%" height={11} />
        <SkeletonBlock width="70%" height={30} />
        <View
          style={[
            styles.detailColumns,
            { flexDirection: desktop ? 'row' : 'column' },
          ]}
        >
          <View style={desktop ? styles.imageColumn : styles.fullCell}>
            <SkeletonBlock height={desktop ? 320 : 210} radius={12} />
          </View>
          <View style={styles.detailsColumn}>
            <SkeletonBlock width="80%" height={22} />
            <SkeletonBlock height={13} />
            <SkeletonBlock width="86%" height={13} />
            <SkeletonBlock width="55%" height={13} />
            <SkeletonBlock height={46} />
            <SkeletonBlock height={46} />
            <SkeletonBlock width="70%" height={15} />
            <SkeletonBlock height={44} />
          </View>
        </View>
      </View>
    </Skeleton>
  );
}
const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  gridCell: { width: '48.8%' },
  fullCell: { width: '100%' },
  card: {
    padding: 14,
    gap: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  summary: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  copy: { flex: 1, gap: 10 },
  fields: { flexDirection: 'row', gap: 12 },
  field: { flex: 1, gap: 8 },
  detail: { gap: 18 },
  detailColumns: { gap: 24 },
  imageColumn: { width: '42%' },
  detailsColumn: { flex: 1, gap: 18 },
});
