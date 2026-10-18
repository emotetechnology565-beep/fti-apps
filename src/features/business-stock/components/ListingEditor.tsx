import { useState } from 'react';
import { View } from 'react-native';
import { useAuth } from '@features/auth/ui';
import { Button, Card, Chip, Field, Row, Txt, s } from '@shared/ui';
import { stockApi } from '../services/stock-api';
import { newStockId, stockUnits, type StockFields, type StockListing } from '../model/types';
import { useStockAction } from './shared';

const initial: StockFields = {material: '', grade: '', specification: '', condition: 'new', quantity: '', uom: 'kg', asking_price: '', price_unit: 'kg', city: '', state: '', pincode: '', notes: '', available_until: ''};
export function ListingEditor({item, onSaved, onCancel}: {item?: StockListing; onSaved: (id: string) => void; onCancel: () => void}) {
  const auth = useAuth();
  const businesses = (auth.identity?.businesses ?? []).filter(b => b.verification_status === 'verified');
  const [business, setBusiness] = useState(item?.business_id ?? businesses[0]?.id ?? '');
  const [id] = useState(() => item?.id ?? newStockId());
  const [fields, setFields] = useState<StockFields>(item ?? initial);
  const action = useStockAction();
  function update<K extends keyof StockFields>(key: K, value: StockFields[K]) { setFields(old => ({...old, [key]: value})); }
  async function save() {
    if (!business || fields.material.trim().length < 3 || !fields.grade.trim() || !fields.specification.trim() || fields.city.trim().length < 2 || fields.state.trim().length < 2 || !/^[1-9][0-9]{5}$/.test(fields.pincode) || !/^\d{1,15}(\.\d{1,3})?$/.test(fields.quantity) || Number(fields.quantity) <= 0 || !/^\d{1,16}(\.\d{1,2})?$/.test(fields.asking_price) || Number(fields.asking_price) <= 0 || !/(Z|[+-]\d{2}:\d{2})$/.test(fields.available_until) || !Number.isFinite(Date.parse(fields.available_until)) || Date.parse(fields.available_until) <= Date.now()) throw new Error('Complete the material and location details, positive quantity and price, and a future expiry with timezone.');
    await stockApi.save(id, item?.version ?? 0, business, fields);
  }
  return <Card style={{gap: 12}}>
    <Txt style={s.h2}>{item ? 'Edit business stock' : 'Create business stock listing'}</Txt>
    <Txt>Edits save as a draft. FTI must review it before it appears to buyers.</Txt>
    {!item ? <><Txt style={s.label}>Selling business</Txt><Row style={{flexWrap: 'wrap'}}>{businesses.map(b => <Chip key={b.id} selected={business === b.id} onPress={() => setBusiness(b.id)}>{b.legal_name}</Chip>)}</Row></> : <Txt>Owned by {item.business_name}</Txt>}
    <Field label="Material name" placeholder="e.g. MS hex bolts" value={fields.material} onChangeText={v => update('material', v)}/>
    <Field label="Grade / standard" placeholder="e.g. Grade 8.8 / IS 1364" value={fields.grade} onChangeText={v => update('grade', v)}/>
    <Field label="Dimensions and specification" placeholder="e.g. M12 x 50 mm, zinc plated" value={fields.specification} onChangeText={v => update('specification', v)} multiline/>
    <Txt style={s.label}>Stock condition</Txt><Row style={{flexWrap: 'wrap'}}>{(['new','surplus','used'] as const).map(v => <Chip key={v} selected={fields.condition === v} onPress={() => update('condition', v)}>{v}</Chip>)}</Row>
    <Field label="Available quantity" placeholder="e.g. 500" numeric value={fields.quantity} onChangeText={v => update('quantity', v)}/>
    <Txt style={s.label}>Quantity unit</Txt><Row style={{flexWrap: 'wrap'}}>{stockUnits.map(v => <Chip key={v} selected={fields.uom === v} onPress={() => update('uom', v)}>{v}</Chip>)}</Row>
    <Field label="Asking price in INR" placeholder="e.g. 12.50" numeric value={fields.asking_price} onChangeText={v => update('asking_price', v)}/>
    <Txt style={s.label}>Price per unit</Txt><Row style={{flexWrap: 'wrap'}}>{stockUnits.map(v => <Chip key={v} selected={fields.price_unit === v} onPress={() => update('price_unit', v)}>{v}</Chip>)}</Row>
    <Field label="Stock city" placeholder="e.g. Delhi" value={fields.city} onChangeText={v => update('city', v)}/>
    <Field label="Stock state" placeholder="e.g. Delhi" value={fields.state} onChangeText={v => update('state', v)}/>
    <Field label="Stock PIN code" placeholder="e.g. 110001" value={fields.pincode} onChangeText={v => update('pincode', v)}/>
    <Field label="Available until with timezone (YYYY-MM-DDTHH:mm:ss+05:30)" placeholder={`e.g. ${new Date().getFullYear() + 1}-01-01T18:00:00+05:30`} value={fields.available_until} onChangeText={v => update('available_until', v)}/>
    <Field label="Seller notes (optional, up to 2000 characters)" placeholder="e.g. Unused surplus stock, packed in sealed boxes." value={fields.notes} onChangeText={v => update('notes', v)} multiline/>
    <Txt>Buyers see your business name, location, asking price, and approved photos. Certificates become available after a buyer submits an enquiry. Verify your rights to share every attachment.</Txt>
    <View style={{gap: 10}}><Button disabled={action.busy || !business} onPress={() => void action.run(save, 'Draft saved.', () => onSaved(id))}>{action.busy ? 'Saving draft...' : 'Save stock draft'}</Button><Button secondary disabled={action.busy} onPress={onCancel}>Cancel editing</Button></View>
    {action.message ? <Txt accessibilityRole="alert">{action.message}</Txt> : null}
  </Card>;
}
