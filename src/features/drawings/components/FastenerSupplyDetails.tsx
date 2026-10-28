import { StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import { Txt, c } from '@shared/ui';
import type { DrawingDefinition } from '../model/types';

// Hex-bolt capabilities: supplied FTI poster, transcribed in extracted-details.md.
// Other product ranges come only from that product's published drawings.
export function FastenerSupplyDetails({
  subcategory,
  drawings,
  sectionHeights,
  onMeasureSection,
  compact = false,
}: {
  subcategory: string;
  drawings: DrawingDefinition[];
  sectionHeights: Record<string, number>;
  onMeasureSection: (section: string, height: number) => void;
  compact?: boolean;
}) {
  const hexBolts = subcategory === 'hex-bolt';
  const diameters = drawings
    .map((row) => row.dimensions.diameter)
    .filter((value) => Number.isFinite(value) && value > 0);
  const lengths = drawings
    .flatMap((row) => row.dimensions.lengths)
    .filter((value) => Number.isFinite(value) && value > 0);
  const standards = [
    ...new Set(drawings.map((row) => `${row.standard}:${row.edition}`)),
  ];
  function section(name: string, children: ReactNode) {
    return (
      <View
        style={{
          minHeight: compact ? sectionHeights[name] : undefined,
          gap: 10,
        }}
        onLayout={(event) =>
          compact && onMeasureSection(name, event.nativeEvent.layout.height)
        }
      >
        {children}
      </View>
    );
  }
  if (compact)
    return (
      <View style={[styles.details, { flex: 1 }]}>
        {section(
          'size',
          <Detail
            label="Size range"
            value={
              hexBolts
                ? 'Diameter 5–56 mm'
                : diameters.length
                  ? `Diameter ${range(diameters)} mm`
                  : 'Available on enquiry'
            }
          />,
        )}
        {section(
          'grades',
          <Detail
            label="Materials / steel grades"
            value={
              hexBolts
                ? 'LC / MS / CHQ · EN-8D + more'
                : 'Confirm with your enquiry'
            }
          />,
        )}
        {section(
          'standards',
          <Detail
            label="Drawing standards"
            value={
              standards.length
                ? standards[0] +
                  (standards.length > 1
                    ? ` + ${standards.length - 1} more`
                    : '')
                : 'Available on enquiry'
            }
          />,
        )}
        <Txt style={styles.more}>View specifications →</Txt>
      </View>
    );
  return (
    <View style={styles.details}>
      {section(
        'size',
        hexBolts ? (
          <>
            <Detail
              label="Cold forged"
              value="Diameter 5–24 mm · Length 10–200 mm"
            />
            <Detail
              label="Hot forged"
              value="Diameter 24–56 mm · Length 50–450 mm"
            />
          </>
        ) : (
          <>
            {diameters.length ? (
              <Detail
                label="Drawing diameters"
                value={`${range(diameters)} mm`}
              />
            ) : null}
            {lengths.length ? (
              <Detail label="Drawing lengths" value={`${range(lengths)} mm`} />
            ) : null}
            {!diameters.length && !lengths.length ? (
              <Detail label="Size range" value="Available on enquiry" />
            ) : null}
          </>
        ),
      )}
      {section(
        'grades',
        <Detail
          label="Materials / steel grades"
          value={
            hexBolts
              ? 'LC / MS / CHQ · EN-8D · Boron · SAE-4140 · EN-19'
              : 'Confirm with your enquiry'
          }
        />,
      )}
      {section(
        'threads',
        <Detail
          label="Threads"
          value={
            hexBolts
              ? 'BSW · UNC · UNF · Coarse (metric & inch)'
              : 'Confirm with your enquiry'
          }
        />,
      )}
      {section(
        'finishes',
        <Detail
          label="Finishes"
          value={
            hexBolts
              ? 'Auto black · Zinc plating · Hot dip galvanizing · Zinc flake'
              : 'Confirm with your enquiry'
          }
        />,
      )}
      {section(
        'standards',
        <Detail
          label="Drawing standards"
          value={
            standards.length
              ? standards.join(' · ')
              : 'Confirm with your enquiry'
          }
        />,
      )}
      {section(
        'note',
        <Txt style={styles.note}>
          {hexBolts
            ? 'Size, strength class and availability confirmed on quotation.'
            : drawings.length
              ? 'Listed drawing sizes; confirm combinations and availability.'
              : 'Sizes and specifications available on enquiry.'}
        </Txt>,
      )}
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Txt style={styles.label}>{label}</Txt>
      <Txt style={styles.value}>{value}</Txt>
    </View>
  );
}
function range(values: number[]) {
  const min = Math.min(...values),
    max = Math.max(...values);
  return min === max ? String(min) : `${min}–${max}`;
}
const styles = StyleSheet.create({
  details: { padding: 12, gap: 10 },
  detail: { gap: 3 },
  label: { fontSize: 11, lineHeight: 16, fontWeight: '700', color: c.ink },
  value: { fontSize: 12, lineHeight: 18, color: c.ink },
  note: { fontSize: 10, lineHeight: 16, color: '#58697C' },
  more: {
    marginTop: 'auto',
    fontSize: 11,
    lineHeight: 18,
    fontWeight: '700',
    color: c.red,
    paddingTop: 4,
  },
});
