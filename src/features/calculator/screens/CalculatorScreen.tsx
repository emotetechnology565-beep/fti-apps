import { roundBarWeight, squareBarWeight } from '@features/calculator';
import {
  Button,
  c,
  Card,
  Chip,
  Field,
  Heading,
  Icon,
  Row,
  s,
  Section,
  Txt,
} from '@shared/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
const go = (path: string) => router.push(path as never);
export function Calculator() {
  const [diameter, setDiameter] = useState('');
  const [length, setLength] = useState('');
  const [pieces, setPieces] = useState('');
  const [type, setType] = useState('Round bar / TMT');
  const d = Number(diameter),
    l = Number(length),
    n = Number(pieces);
  const square = type === 'Square bar';
  const calculate = square ? squareBarWeight : roundBarWeight;
  const perMetre = calculate(d, 1, 1);
  const weight = calculate(d, l, n);
  return (
    <View>
      <Heading
        eyebrow="PRECISION BEFORE PROCUREMENT"
        title="Material weight calculator"
        description="Plan your order with theoretical steel weights. Built for the shop floor."
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24 }}>
        <Card style={{ flex: 1, minWidth: 260 }}>
          <Section title="Configure your material" />
          <Row style={{ marginBottom: 22, flexWrap: 'wrap' }}>
            {['Round bar / TMT', 'Square bar'].map((v) => (
              <Chip key={v} selected={type === v} onPress={() => setType(v)}>
                {v}
              </Chip>
            ))}
          </Row>
          <Field
            label={type === 'Square bar' ? 'Side (mm)' : 'Diameter (mm)'} placeholder="e.g. 12"
            numeric
            value={diameter}
            onChangeText={setDiameter}
          />
          <Field
            label="Length (m)" placeholder="e.g. 6"
            numeric
            value={length}
            onChangeText={setLength}
          />
          <Field
            label="Number of pieces" placeholder="e.g. 10"
            numeric
            value={pieces}
            onChangeText={setPieces}
          />
          <Txt style={s.muted}>
            Steel density: 7,850 kg/m³. Positive dimensions and a whole number
            of pieces are required.
          </Txt>
        </Card>
        <View style={{ flex: 1, minWidth: 260, gap: 18 }}>
          <Card
            style={{
              backgroundColor: c.dark,
              borderColor: c.dark,
              padding: 30,
            }}
          >
            {perMetre !== null ? <Txt style={{ color: '#ADC0D4', marginBottom: 12 }}>
              Weight per metre: {perMetre.toLocaleString('en-IN', { maximumFractionDigits: 3 })} kg/m
            </Txt> : null}
            <Txt style={{ fontSize: 10, color: '#ADC0D4', letterSpacing: 1.4 }}>
              THEORETICAL TOTAL WEIGHT
            </Txt>
            <Txt
              accessibilityLiveRegion="polite"
              style={{
                fontSize: 49,
                letterSpacing: -2,
                fontWeight: '700',
                color: 'white',
                marginVertical: 22,
              }}
            >
              {weight === null
                ? '—'
                : weight.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              <Txt style={{ fontSize: 17, color: '#ADC0D4' }}> kg</Txt>
            </Txt>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt style={{ color: '#ADC0D4', fontSize: 12 }}>
                {weight === null
                  ? 'Enter valid dimensions'
                  : (weight / 1000).toFixed(3) + ' metric tonnes'}
              </Txt>
              <Icon name="box" color="#ADC0D4" size={32} />
            </Row>
          </Card>
          <Card>
            <Section title="A useful estimate, every time." />
            <Txt style={{ ...s.muted, lineHeight: 23 }}>
              Actual dispatch weight is determined by the weighbridge.
              Manufacturing tolerances and material density can affect the final
              weight.
            </Txt>
            <View style={s.divider} />
            <Txt style={{ fontSize: 12, fontWeight: '600' }}>Formula</Txt>
            <Txt style={{ ...s.muted, marginTop: 8 }}>
              {square
                ? 'Weight (kg/m) = S × S × 0.00785'
                : 'π / 4 × diameter² × length × density × pieces'}
            </Txt>
            {square ? <>
              <Txt style={{ ...s.muted, marginTop: 8 }}>S is the side dimension in millimetres. Total weight (kg) = weight per metre × length (m) × pieces.</Txt>
              <Txt style={{ ...s.muted, marginTop: 8 }}>Example: 50 × 50 mm = 19.625 kg/m. One 6-metre bar weighs approximately 117.75 kg.</Txt>
            </> : null}
          </Card>
          <Button onPress={() => go('/products')} icon="arrow-right">
            Find your material
          </Button>
        </View>
      </View>
    </View>
  );
}
