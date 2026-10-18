import { useState } from 'react';
import { Button, Card, Chip, Field, Row, Txt, s } from '@shared/ui';
import type { GradeBase, Market } from '../model/types';
import { calculateRate, emptyPriceComponents, pricingUpdateTime } from '../model/rate-calculation';
import { pricingRpc } from '../services/pricing-api';

export function GradeBaseManagement({ markets, bases, canPublish, onSaved }: {
  markets: Market[]; bases: GradeBase[]; canPublish: boolean; onSaved: () => Promise<void>;
}) {
  const [market, setMarket] = useState('');
  const [grade, setGrade] = useState<'MS' | 'EN8'>('MS');
  const [unit, setUnit] = useState('kg');
  const [input, setInput] = useState<string | null>(null);
  const [review, setReview] = useState<{ price: string; revision: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const current = bases.find(base => base.market_id === market && base.grade_code === grade && base.uom === unit);
  const price = input ?? current?.base_price ?? '';
  const calculated = calculateRate({ ...emptyPriceComponents, base_price: price });
  async function update() {
    if (!review || busy) return;
    setBusy(true);setMessage('');
    try {
      const result = await pricingRpc<GradeBase & { updated_products: number }>('fti_pricing_grade_base_update', {
        p_market: market, p_grade: grade, p_uom: unit, p_base_price: review.price, p_revision: review.revision,
      });
      setReview(null);setInput(null);
      setMessage(`${grade} base price updated. ${result.updated_products} product rates recalculated.`);
      await onSaved();
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return <Card style={{ gap: 12 }}>
    <Txt style={s.h2}>Shared material base prices</Txt>
    <Txt>Set the MS or EN8 base once. Every existing published rate of that grade in the same market and unit is recalculated, keeping its increased price, rolling charge and profit percentage.</Txt>
    <Txt style={s.muted}>Set the variant Grade in FTI catalogue to MS or EN8. Per-kg and per-piece rates use separate base prices.</Txt>
    <Txt style={s.label}>Base-price market</Txt>
    <Row style={{ flexWrap: 'wrap' }}>{markets.map(item => <Chip key={item.id} selected={market === item.id} onPress={() => { setMarket(item.id);setInput(null);setReview(null);setMessage(''); }}>{item.name}</Chip>)}</Row>
    <Txt style={s.label}>Material grade</Txt>
    <Row>{(['MS', 'EN8'] as const).map(item => <Chip key={item} selected={grade === item} onPress={() => { setGrade(item);setInput(null);setReview(null);setMessage(''); }}>{item}</Chip>)}</Row>
    <Txt style={s.label}>Base-price unit</Txt>
    <Row style={{ flexWrap: 'wrap' }}>{['kg','MT','piece','box','bundle'].map(item => <Chip key={item} selected={unit === item} onPress={() => { setUnit(item);setInput(null);setReview(null);setMessage(''); }}>{item}</Chip>)}</Row>
    <Field label={`${grade} base price (INR per ${unit})`} placeholder="e.g. 70.00" numeric value={price} onChangeText={value => { setInput(value);setReview(null);setMessage(''); }}/>
    {current ? <Txt style={s.muted}>Current base: INR {current.base_price} / {unit} · Updated {pricingUpdateTime(current.updated_at)}</Txt> : null}
    {!canPublish ? <Txt>Pricing publication permission is required to update shared material bases.</Txt> : review ? <>
      <Txt>Change the {grade} base to INR {review.price} / {unit} in {markets.find(item => item.id === market)?.name}? All matching published product rates will update immediately. Their previous prices remain in history.</Txt>
      <Button disabled={busy} onPress={() => void update()}>{`Confirm ${grade} base update`}</Button>
      <Button secondary disabled={busy} onPress={() => setReview(null)}>Cancel base update</Button>
    </> : <Button disabled={busy || !market || !calculated} onPress={() => { if (calculated) setReview({ price: calculated.amount, revision: current?.revision ?? null }); }}>Review material base update</Button>}
    {!!message && <Txt accessibilityRole="alert">{message}</Txt>}
    {bases.map(base => <Txt key={base.id} style={s.muted}>{base.grade_code} · {markets.find(item => item.id === base.market_id)?.name} · INR {base.base_price} / {base.uom}</Txt>)}
  </Card>;
}
