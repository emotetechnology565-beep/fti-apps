import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { Txt } from './Txt';

export const adminOrderStatuses = [
  ['all', 'All'],
  ['pending_confirmation', 'Awaiting confirmation'],
  ['confirmed', 'Confirmed'],
  ['processing', 'Processing'],
  ['shipped', 'Dispatched'],
  ['delivered', 'Delivered'],
  ['cancelled', 'Cancelled'],
  ['rejected', 'Rejected'],
] as const;
export const adminOrderStatusLabel = (status: string) =>
  adminOrderStatuses.find(([value]) => value === status)?.[1] ?? status;

export function OrderStatusFilters({
  value,
  onChange,
  dispatchOnly = false,
}: {
  value: string;
  onChange: (status: string) => void;
  dispatchOnly?: boolean;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filters}
      accessibilityLabel="Filter orders by status"
    >
      {adminOrderStatuses
        .filter(
          ([status]) =>
            !dispatchOnly ||
            !['pending_confirmation', 'cancelled', 'rejected'].includes(status),
        )
        .map(([status, label]) => (
          <Pressable
            key={status}
            accessibilityRole="button"
            accessibilityLabel={`Filter ${label.toLowerCase()} orders`}
            accessibilityState={{ selected: value === status }}
            onPress={() => onChange(status)}
            style={[styles.filter, value === status && styles.selected]}
          >
            <Txt
              style={[styles.label, value === status && styles.selectedLabel]}
            >
              {label}
            </Txt>
          </Pressable>
        ))}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  filters: { gap: 8, paddingVertical: 4 },
  filter: {
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DCE1E8',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  selected: { backgroundColor: '#142D4E', borderColor: '#142D4E' },
  label: { color: '#58697C', fontSize: 12, fontWeight: '600' },
  selectedLabel: { color: '#fff' },
});
