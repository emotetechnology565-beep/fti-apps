import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card } from './Card';
import { Txt } from './Txt';
import { Badge } from './Badge';
import { Button } from './Button';
import { c } from '../theme/tokens';

function display(value: unknown): string {
  if (value === null || value === undefined || value === '')
    return 'Not supplied';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(display).join(', ');
  if (typeof value === 'object')
    return Object.entries(value)
      .map(([key, item]) => `${key.replaceAll('_', ' ')}: ${display(item)}`)
      .join('\n');
  return String(value).replaceAll('_', ' ');
}
const buyerKeys = new Set(['name', 'business', 'phone', 'location']);
const hiddenKeys = new Set([
  'reference',
  'manual_input',
  'whatsapp_consent',
  'rate_revision',
]);
const fieldLabels: Record<string, string> = {
  name: 'Buyer name',
  business: 'Business',
  phone: 'WhatsApp',
  location: 'Delivery location',
  material: 'Material / shape',
  length_mm: 'Length (mm)',
  bolt_rate: 'Bolt rate',
  nut_rate: 'Nut rate',
};
export function RequestSummary({
  details,
  createdAt,
  children,
  detailLabel = 'notification details',
}: {
  details: Record<string, unknown>;
  createdAt: string;
  children: ReactNode;
  detailLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const fields = Object.entries(details).filter(
    ([key]) => !hiddenKeys.has(key) && !buyerKeys.has(key),
  );
  return (
    <Card style={{ padding: 0, overflow: 'hidden', gap: 0 }}>
      <View style={styles.header}>
        <View style={{ gap: 5, flexShrink: 1 }}>
          <Txt style={styles.reference} selectable>
            {String(details.reference ?? 'Order request')}
          </Txt>
          <Txt style={styles.muted}>
            {new Date(createdAt).toLocaleString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </Txt>
        </View>
        <Badge tone="gray">Buyer request</Badge>
      </View>
      <View style={styles.columns}>
        <View style={styles.column}>
          <Txt style={styles.heading}>Buyer & delivery</Txt>
          {['name', 'business', 'phone', 'location'].map((key) => (
            <View key={key} style={styles.field}>
              <Txt style={styles.label}>{fieldLabels[key]}</Txt>
              <Txt selectable style={styles.value}>
                {display(details[key])}
              </Txt>
            </View>
          ))}
        </View>
        <View style={styles.column}>
          <Txt style={styles.heading}>Requested specifications</Txt>
          {fields.map(([key, value]) => (
            <View key={key} style={styles.field}>
              <Txt style={styles.label}>
                {fieldLabels[key] ??
                  key
                    .replaceAll('_', ' ')
                    .replace(/^./, (v) => v.toUpperCase())}
              </Txt>
              <Txt selectable style={styles.value}>
                {display(value)}
              </Txt>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.actions}>
        <Button
          secondary
          icon={expanded ? 'chevron-up' : 'chevron-down'}
          onPress={() => setExpanded(!expanded)}
        >
          {`${expanded ? 'Hide' : 'View'} ${detailLabel}`}
        </Button>
      </View>
      {expanded ? <View style={styles.expanded}>{children}</View> : null}
    </Card>
  );
}
const styles = StyleSheet.create({
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  reference: { fontSize: 16, fontWeight: '700', lineHeight: 23 },
  muted: { color: '#58697C', fontSize: 12, lineHeight: 19 },
  columns: { padding: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 24 },
  column: { flexGrow: 1, flexShrink: 1, flexBasis: 220, minWidth: 0, gap: 12 },
  heading: { fontSize: 13, fontWeight: '700', marginBottom: 3 },
  field: { gap: 3 },
  label: { color: '#58697C', fontSize: 11, lineHeight: 17 },
  value: { fontSize: 13, lineHeight: 20, flexShrink: 1 },
  actions: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    alignItems: 'flex-start',
  },
  expanded: {
    borderTopWidth: 1,
    borderTopColor: c.line,
    backgroundColor: '#FAFBFD',
    padding: 20,
    gap: 12,
  },
});
