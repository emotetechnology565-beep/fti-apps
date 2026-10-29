import { usePriceAccess } from '@shared/hooks/use-price-access';
import { Row, Txt, s } from '@shared/ui';
import type { Variant } from '../model/types';
import { priceUnitLabel } from '../model/shared-material-options';
import { hasOrderConfirmationCharges, orderConfirmationChargesNote } from '../model/price-disclosure';

export function GradeListPrice({ variant }: { variant: Variant }) {
  const priceAccess = usePriceAccess();
  if (!priceAccess) return <Txt style={s.h2}>Request quotation</Txt>;
  const value = variant.attributes.grade_list_price;
  const base = variant.attributes.grade_list_base_price;
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value)) {
    return variant.attributes.quote_only === true ? <Txt style={s.h2}>Request quote</Txt> : null;
  }
  const money = (amount: string) => `INR ${Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 4 })} / ${priceUnitLabel(variant.uom)}`;
  const included = variant.attributes.grade_list_gst_included;
  const rate = variant.attributes.grade_list_gst_rate;
  return <>
    <Row style={{ flexWrap: 'wrap', justifyContent: 'space-between' }}>
      <Txt style={s.muted}>Base Price</Txt>
      <Txt>{typeof base === 'string' && /^\d+(\.\d+)?$/.test(base) && Number(base) > 0 ? money(base) : 'Not specified in sheet'}</Txt>
    </Row>
    <Row style={{ flexWrap: 'wrap', justifyContent: 'space-between' }}>
      <Txt style={{ fontWeight: '700' }}>Net Price</Txt><Txt style={s.h2}>{money(value)}</Txt>
    </Row>
    <Txt style={s.muted}>{included === true ? `Price including GST (${rate}%)` : included === false ? 'Price excluding GST' : 'GST inclusion not specified'} | MOQ {variant.min_order_qty} {variant.uom}</Txt>
    {hasOrderConfirmationCharges(variant.attributes) ? <Txt style={s.muted}>{orderConfirmationChargesNote}</Txt> : null}
  </>;
}
