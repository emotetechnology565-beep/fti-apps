import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useStore } from '@core/state/workspace-store';
import { Button, Card, CatalogFilter, Field, Icon, Txt, c, s } from '@shared/ui';
import type { DrawingDefinition } from '../model/types';
import { shapeLabels } from '../model/types';
import { DrawingPreview } from './DrawingPreview';
import {
  customStandard, dimensionNames, fastenerStepError, initialFastenerDraft, requirementSteps,
  type FastenerDetail, type FastenerDraft, type FastenerRequirement,
} from '../model/fastener-requirement';

const distinct = (values: string[]) => [...new Set(values)];
const choices = (values: string[]) => values.map(value => ({ value, label: value }));

function RequirementChoice({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  const options = distinct([...values, 'Not sure']);
  const [custom, setCustom] = useState(!!value && !options.includes(value));
  return <View style={{ gap: 12 }}>
    <CatalogFilter label={label} value={custom ? '__custom__' : value}
      options={[{ value: '', label: `Choose ${label.toLowerCase()}` }, ...choices(options), { value: '__custom__', label: 'Other / Enter requirement' }]}
      onChange={next => { setCustom(next === '__custom__'); onChange(next === '__custom__' ? '' : next); }} />
    {custom ? <Field label={`Required ${label.toLowerCase()}`} value={value} onChangeText={onChange} placeholder="Enter your requirement" /> : null}
  </View>;
}

export function FastenerRequirementWizard({ detail, drawings, imageUrl, editKey, onClose }: {
  detail: FastenerDetail; drawings: DrawingDefinition[]; imageUrl?: string | null; editKey?: string; onClose: () => void;
}) {
  const editing = useStore.getState().cart.find(line => line.material?.key === editKey && line.material?.fastenerRequirement?.subcategory === detail.subcategory);
  const [draft, setDraft] = useState(() => initialFastenerDraft(editing?.material?.fastenerRequirement, editing?.quantity));
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [added, setAdded] = useState(false);
  const custom = draft.standard === customStandard;
  const standards = distinct(drawings.map(row => `${row.standard}:${row.edition}`));
  const standardRows = drawings.filter(row => `${row.standard}:${row.edition}` === draft.standard);
  const shapes = distinct(standardRows.map(row => row.shape));
  const shape = draft.shape || (shapes.length === 1 ? shapes[0] : '');
  const rows = standardRows.filter(row => row.shape === shape);
  const definition = drawings.find(row => row.id === draft.definitionId);
  function update<K extends keyof FastenerDraft>(key: K, value: FastenerDraft[K]) {
    setDraft(previous => ({ ...previous, [key]: value })); setError('');
  }
  function dimension(key: string, value: string) {
    setDraft(previous => ({ ...previous, dimensions: { ...previous.dimensions, [key]: value } })); setError('');
  }
  function chooseDefinition(id: string) {
    const row = rows.find(item => item.id === id);
    update('definitionId', id);
    if (row) setDraft(previous => ({ ...previous, shape: row.shape, dimensions: { diameter_mm: String(row.dimensions.diameter) } }));
  }
  function next() {
    const message = fastenerStepError(step, draft);
    if (message) { setError(message); return; }
    setError(''); setStep(value => Math.min(value + 1, 5));
  }
  const dimensions = Object.fromEntries(Object.entries(draft.dimensions).filter(([, value]) => value.trim()).map(([key, value]) => [key, Number(value)]));
  const requirement: FastenerRequirement = {
    subcategory: detail.subcategory, definition_id: custom ? null : definition?.id ?? null,
    revision: custom ? null : definition?.published_revision ?? definition?.revision ?? null,
    standard: draft.standard, shape: custom ? detail.subcategory : draft.shape,
    dimensions, material: draft.material.trim(), grade: draft.grade.trim(), thread: draft.thread.trim(),
    pitch: draft.pitch.trim() || 'Not sure', finish: draft.finish.trim(), with_nut: draft.withNut,
    notes: draft.notes.trim(), custom,
  };
  function add() {
    for (let index = 0; index < 5; index++) {
      const message = fastenerStepError(index, draft);
      if (message) { setStep(index); setError(message); return; }
    }
    if (!custom && !definition) { setStep(1); setError('Choose a current published drawing.'); return; }
    const key = `fastener-requirement:${JSON.stringify(requirement)}`;
    const store = useStore.getState();
    if (editing) store.quantity(editing.productId, 0, editing.variantId);
    store.addMaterial(`fastener:${detail.subcategory}`, Number(draft.quantity), {
      key, name: detail.title, size: [draft.standard, ...Object.entries(dimensions).map(([key, value]) => `${dimensionNames[key] ?? key}: ${value}`)].join(' / '),
      grade: draft.grade, unit: 'piece', minimum: 1, fastenerRequirement: requirement, ...(imageUrl ? { imageUrl } : {}),
    });
    setAdded(true);
  }
  if (added) return <Card style={styles.success}>
    <Icon name="check-circle" size={40} color={c.green} />
    <Txt accessibilityRole="header" style={s.h2}>{editing ? 'Requirement updated' : 'Added to quote basket'}</Txt>
    <Txt style={s.muted}>{detail.title} · {draft.quantity} pieces. FTI will confirm specifications, price and availability in your quotation.</Txt>
    <Button onPress={() => router.push('/cart')}>Review basket & request quotation</Button>
    <Button secondary onPress={() => router.push('/products?kind=fastener')}>Continue browsing fasteners</Button>
  </Card>;
  return <View style={{ gap: 18 }}>
    <Pressable accessibilityRole="button" onPress={onClose} style={styles.back}><Icon name="arrow-left" size={18} color={c.brandBlue} /><Txt style={styles.link}>Back to product details</Txt></Pressable>
    <Card style={{ gap: 20 }}>
      <View style={styles.heading}>
        {imageUrl ? <Image source={{ uri: imageUrl }} contentFit="contain" style={{ width: 56, height: 56 }} /> : <Icon name="tool" size={30} color={c.brandBlue} />}
        <View style={{ flex: 1, gap: 5 }}><Txt style={s.h2}>{detail.title}</Txt><Txt style={s.muted}>{editing ? 'Edit your requirement' : 'Configure your requirement'}</Txt></View>
      </View>
      <View style={{ gap: 10 }}>
        <Txt accessibilityLiveRegion="polite" style={styles.step}>Step {step + 1} of {requirementSteps.length} · {requirementSteps[step]}</Txt>
        <View style={styles.progress}>{requirementSteps.map((label, index) => <View key={label} style={[styles.segment, { backgroundColor: index <= step ? c.brandBlue : c.line }]} />)}</View>
      </View>
      <View style={{ gap: 18 }}>
        {step === 0 ? <>
          <Txt style={s.muted}>Choose a published standard, or ask FTI to help specify a custom requirement.</Txt>
          <CatalogFilter label="Standard" value={draft.standard} options={[{ value: '', label: 'Choose standard' }, ...choices(standards), { value: customStandard, label: customStandard }]}
            onChange={value => { setDraft(previous => ({ ...previous, standard: value, definitionId: '', shape: '', dimensions: {} })); setError(''); }} />
        </> : null}
        {step === 1 ? <>
          {custom ? <Txt style={s.muted}>Enter the dimensions you know. If you need help, leave them blank and describe your requirement in the notes step.</Txt> : <>
            {shapes.length > 1 ? <CatalogFilter label="Shape" value={draft.shape} options={[{ value: '', label: 'Choose shape' }, ...shapes.map(value => ({ value, label: shapeLabels[value as keyof typeof shapeLabels] ?? value }))]}
              onChange={value => { setDraft(previous => ({ ...previous, shape: value, definitionId: '', dimensions: {} })); setError(''); }} /> : null}
            <CatalogFilter label="Drawing size / diameter" value={draft.definitionId} disabled={!shape}
              options={[{ value: '', label: 'Choose published size' }, ...rows.map(row => ({ value: row.id, label: row.size }))]} onChange={chooseDefinition} />
          </>}
          {custom ? <Field label="Diameter (mm)" value={draft.dimensions.diameter_mm ?? ''} onChangeText={value => dimension('diameter_mm', value)} numeric /> : null}
          {(custom || (definition && !['hex-nut', 'lock-nut'].includes(definition.shape))) ? <Field label="Length (mm)" value={draft.dimensions.length_mm ?? ''} onChangeText={value => dimension('length_mm', value)} numeric /> : null}
          {(definition && ['u-square', 'l', 'j-i'].includes(definition.shape)) || (custom && /u-bolt|j-|l-bolt|square/.test(detail.subcategory)) ? <Field label="Width (mm)" value={draft.dimensions.width_mm ?? ''} onChangeText={value => dimension('width_mm', value)} numeric /> : null}
          {(definition && ['u-round', 'j-ii'].includes(definition.shape)) || (custom && /u-bolt|j-/.test(detail.subcategory)) ? <Field label="Bend radius (mm)" value={draft.dimensions.radius_mm ?? ''} onChangeText={value => dimension('radius_mm', value)} numeric /> : null}
          {definition?.shape === 'j-ii' ? <Field label="Return height (mm)" value={draft.dimensions.return_height_mm ?? ''} onChangeText={value => dimension('return_height_mm', value)} numeric /> : null}
          {definition?.shape === 'j-i' ? <Field label="Return angle (degrees)" value={draft.dimensions.angle_deg ?? ''} onChangeText={value => dimension('angle_deg', value)} numeric /> : null}
          {custom && /washer|nut|plate/.test(detail.subcategory) ? <Field label="Thickness (mm)" value={draft.dimensions.thickness_mm ?? ''} onChangeText={value => dimension('thickness_mm', value)} numeric /> : null}
        </> : null}
        {step === 2 ? <>
          <RequirementChoice key="material" label="Material" value={draft.material} values={detail.materials} onChange={value => update('material', value)} />
          <RequirementChoice key="grade" label="Grade" value={draft.grade} values={detail.grades} onChange={value => update('grade', value)} />
          <Txt style={s.muted}>These are requirement choices. FTI will confirm grade and size availability.</Txt>
        </> : null}
        {step === 3 ? <>
          <RequirementChoice key="thread" label="Thread type" value={draft.thread} values={[...detail.threads, 'Not applicable']} onChange={value => update('thread', value)} />
          <Field label="Thread pitch (optional)" value={draft.pitch} onChangeText={value => update('pitch', value)} placeholder="e.g. 1.5 mm, 20 TPI, or leave blank" />
          <RequirementChoice key="finish" label="Finish" value={draft.finish} values={detail.finishes} onChange={value => update('finish', value)} />
          {['hex-bolt', 'heavy-hex-bolt'].includes(detail.subcategory) ? <CatalogFilter label="Nut supply" value={draft.withNut ? 'with' : 'without'} options={[{ value: 'without', label: 'Without nut' }, { value: 'with', label: 'With nut' }]} onChange={value => update('withNut', value === 'with')} /> : null}
        </> : null}
        {step === 4 ? <>
          <Field label="Quantity (pieces)" value={draft.quantity} onChangeText={value => update('quantity', value)} numeric />
          <Field label="Additional requirement notes" value={draft.notes} onChangeText={value => update('notes', value)} multiline placeholder="Custom standard, application, delivery timeline or dimensions you need help specifying" />
        </> : null}
        {step === 5 ? <>
          <Txt style={s.muted}>Review your specification before adding it to the quote basket.</Txt>
          {[
            ['Product', detail.title], ['Standard', draft.standard], ['Shape', draft.shape ? shapeLabels[draft.shape as keyof typeof shapeLabels] ?? draft.shape : 'Custom requirement'],
            ...Object.entries(dimensions).map(([key, value]) => [dimensionNames[key] ?? key, String(value)]),
            ['Material', draft.material], ['Grade', draft.grade], ['Thread type', draft.thread], ['Thread pitch', draft.pitch || 'To be confirmed'], ['Finish', draft.finish],
            ...(['hex-bolt', 'heavy-hex-bolt'].includes(detail.subcategory) ? [['Nut supply', draft.withNut ? 'With nut' : 'Without nut']] : []),
            ['Quantity', `${draft.quantity} pieces`], ['Notes', draft.notes || 'None'],
          ].map(([label, value]) => <View key={label} style={styles.reviewRow}><Txt style={styles.reviewLabel}>{label}</Txt><Txt style={styles.reviewValue}>{value}</Txt></View>)}
          <Txt style={s.muted}>This is a quotation requirement. Final specifications, rate, GST, freight and delivery are confirmed by FTI.</Txt>
          {definition && !custom ? <DrawingPreview definition={definition} input={{
            length: dimensions.length_mm ?? definition.dimensions.head_height ?? 0,
            ...(dimensions.width_mm ? { width: dimensions.width_mm } : {}),
            ...(dimensions.radius_mm ? { radius: dimensions.radius_mm } : {}),
            ...(dimensions.return_height_mm ? { returnHeight: dimensions.return_height_mm } : {}),
            ...(dimensions.angle_deg ? { angle: dimensions.angle_deg } : {}),
          }} /> : null}
        </> : null}
      </View>
      {error ? <Txt accessibilityRole="alert" style={{ color: c.brandRed }}>{error}</Txt> : null}
      <View style={styles.footer}>
        <Button secondary onPress={() => { if (step === 0) onClose(); else { setStep(value => value - 1); setError(''); } }}>Back</Button>
        {step < 5 ? <Button onPress={next}>Continue</Button> : <Button icon="shopping-cart" onPress={add}>{editing ? 'Update cart item' : 'Add to cart'}</Button>}
      </View>
    </Card>
  </View>;
}

const styles = StyleSheet.create({
  back: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  link: { fontSize: 13, color: c.brandBlue, fontWeight: '600' },
  heading: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  step: { color: c.brandBlue, fontSize: 13, fontWeight: '700' },
  progress: { flexDirection: 'row', gap: 6 }, segment: { flex: 1, height: 4, borderRadius: 2 },
  footer: { borderTopWidth: 1, borderColor: c.line, paddingTop: 18, flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  reviewRow: { flexDirection: 'row', gap: 16, borderBottomWidth: 1, borderColor: c.line, paddingBottom: 10 },
  reviewLabel: { width: '35%', color: c.muted, fontSize: 12, lineHeight: 19 },
  reviewValue: { flex: 1, minWidth: 0, color: c.ink, fontSize: 13, lineHeight: 19 },
  success: { gap: 18, padding: 24 },
});
