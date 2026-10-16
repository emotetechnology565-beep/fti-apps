import { roundBarWeight } from '@features/calculator';
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
  const round = roundBarWeight(d, l, n);
  const weight =
    round === null
      ? null
      : type === 'Square bar'
        ? ((d * d) / 1e6) * l * 7850 * n
        : round;
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
            label={type === 'Square bar' ? 'Side (mm)' : 'Diameter (mm)'}
            numeric
            value={diameter}
            onChangeText={setDiameter}
          />
          <Field
            label="Length (m)"
            numeric
            value={length}
            onChangeText={setLength}
          />
          <Field
            label="Number of pieces"
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
              {type === 'Square bar'
                ? 'Side² × length × density × pieces'
                : 'π / 4 × diameter² × length × density × pieces'}
            </Txt>
          </Card>
          <Button onPress={() => go('/products')} icon="arrow-right">
            Find your material
          </Button>
        </View>
      </View>
    </View>
  );
}
