import { useState } from 'react';
import { View } from 'react-native';
import * as Linking from 'expo-linking';
import { Badge, Button, Card, Chip, Field, Row, Txt, c, s } from '@shared/ui';
import { chartsForProduct, referenceRows, referenceSizes } from '../model/product-references';

const pageSize = 6;

export function ProductReferenceCharts({ product }: { product: { slug: string } }) {
  const charts = chartsForProduct(product.slug);
  const [chartId, setChartId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [size, setSize] = useState('');
  const [length, setLength] = useState('');
  const [offset, setOffset] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [error, setError] = useState('');
  const chart = charts.find(item => item.id === chartId) ?? charts[0];
  if (!chart) return null;
  const group = chart.groups.find(item => item.id === groupId) ?? chart.groups[0];
  const rows = referenceRows(chart.id, group.id, size, length);
  const sizes = referenceSizes(chart.id, group.id);
  const hasLengths = referenceRows(chart.id, group.id).some(row => !!row.length);
  function resetFilters() { setSize(''); setLength(''); setOffset(0); setError(''); }
  return (
    <Card style={{ gap: 14, marginBottom: 18 }}>
      <Txt style={s.h2}>Dimensions & weight references</Txt>
      <Txt style={s.muted}>FTI reference charts for this product family. Confirm the required standard and finish when ordering.</Txt>
      {charts.length > 1 ? <Row style={{ flexWrap: 'wrap' }}>
        {charts.map(item => <Chip key={item.id} selected={item.id === chart.id} onPress={() => {
          setChartId(item.id); setGroupId(''); setShowNotes(false); resetFilters();
        }}>{item.title}</Chip>)}
      </Row> : null}
      <Txt style={{ fontWeight: '700' }}>{chart.title}</Txt>
      <Txt style={s.muted}>{group.standard ?? chart.standard}</Txt>
      <Badge>{chart.unit === 'mm' ? 'DIMENSIONS IN MM' : 'APPROX. KG PER 1,000 PIECES'}</Badge>
      {chart.date ? <Txt style={s.muted}>Source chart dated 1 January 2026</Txt> : null}
      {chart.groups.length > 1 ? <Row style={{ flexWrap: 'wrap' }}>
        {chart.groups.map(item => <Chip key={item.id} selected={item.id === group.id} onPress={() => {
          setGroupId(item.id); resetFilters();
        }}>{item.label}</Chip>)}
      </Row> : <Txt>{group.label}</Txt>}
      <Field label="Reference size" value={size} placeholder={chart.id === 'unc-weights' ? 'e.g. 1/2 or 1 1/4' : 'e.g. M12'} onChangeText={value => { setSize(value); setOffset(0); }} />
      {hasLengths ? <Field label={`Reference length (${chart.id === 'unc-weights' ? 'inches' : 'mm'})`} value={length} placeholder={chart.id === 'unc-weights' ? 'e.g. 2 or 1 1/2' : 'e.g. 100'} onChangeText={value => { setLength(value); setOffset(0); }} /> : null}
      <Txt style={s.muted}>Chart sizes: {sizes.join(', ')}</Txt>
      {size || length ? <Button secondary onPress={resetFilters}>Clear reference filters</Button> : null}
      <Txt>{rows.length} reference {rows.length === 1 ? 'entry' : 'entries'}{rows.length ? ` · ${offset + 1}–${Math.min(offset + pageSize, rows.length)}` : ''}</Txt>
      {!rows.length ? <Txt>No chart entry for this size and length. Blank source cells are not estimated.</Txt> : null}
      {rows.slice(offset, offset + pageSize).map(row => (
        <View key={`${row.chartId}-${row.groupId}-${row.size}-${row.length ?? ''}`} style={{ gap: 8, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 12 }}>
          <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Txt style={{ fontWeight: '700' }}>{row.size}{row.length ? ` × ${row.length}` : ''}</Txt>
            {row.weightKgPer1000 !== undefined ? <Txt style={{ fontWeight: '700' }}>{row.weightKgPer1000.toFixed(2)} kg / 1,000 pcs</Txt> : null}
          </Row>
          {Object.entries(row.dimensions ?? {}).map(([label, value]) => <Row key={label} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Txt style={s.muted}>{label}</Txt><Txt>{value} mm</Txt>
          </Row>)}
          {row.reviewNote ? <Txt style={{ color: c.red }}>Needs confirmation — {row.reviewNote} Value retained as printed.</Txt> : null}
        </View>
      ))}
      {rows.length > pageSize ? <Row>
        <Button secondary disabled={offset === 0} onPress={() => setOffset(Math.max(0, offset - pageSize))}>Previous entries</Button>
        <Button secondary disabled={offset + pageSize >= rows.length} onPress={() => setOffset(offset + pageSize)}>Next entries</Button>
      </Row> : null}
      <Button secondary onPress={() => setShowNotes(!showNotes)}>{showNotes ? 'Hide chart notes' : 'Show chart notes'}</Button>
      {showNotes ? chart.notes.map(note => <Txt key={note} style={s.muted}>{note}</Txt>) : null}
      {chart.pdfUrl ? <Button secondary onPress={() => {
        setError('');
        void Linking.openURL(chart.pdfUrl!).catch(() => setError('Could not open the source PDF. Please try again.'));
      }}>Open original PDF</Button> : null}
      {error ? <Txt accessibilityRole="alert" style={{ color: c.red }}>{error}</Txt> : null}
    </Card>
  );
}
