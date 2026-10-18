import { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@features/auth/ui';
import { hasPermission } from '@features/auth';
import { supabaseCatalogRepository } from '@features/catalog/export';
import { Badge, Button, Card, Chip, Empty, Field, Row, Txt } from '@shared/ui';
import { pricingApi, pricingRpc } from '../services/pricing-api';
import type { DraftItem, GradeBase, Market, PriceDraft, StaffRate } from '../model/types';
import { PriceBreakdown } from '../components/PriceBreakdown';
import { GradeBaseManagement } from '../components/GradeBaseManagement';
import { calculateRate, emptyPriceComponents, materialGrade, priceComponents, pricingUpdateTime, type PriceComponents } from '../model/rate-calculation';

type RateSeed = { market_id: string; title: string; items: DraftItem[] };
function DraftEditor({ draft, markets, seed, currentRates, bases, onSaved }: { draft: PriceDraft | null; markets: Market[]; seed: RateSeed | null; currentRates: StaffRate[]; bases: GradeBase[]; onSaved: () => Promise<void> }) {
  const [market, setMarket] = useState(draft?.market_id ?? seed?.market_id ?? '');
  const [title, setTitle] = useState(draft?.title ?? seed?.title ?? '');
  const [items, setItems] = useState<DraftItem[]>(draft?.items ?? seed?.items ?? []);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<{ variant_id: string; sku: string; uom: string; grade_code?: string | null } | null>(null);
  const [components, setComponents] = useState<PriceComponents>(emptyPriceComponents);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const catalog = useQuery({ queryKey: ['pricing', 'variant-picker', search, offset], queryFn: () => supabaseCatalogRepository.listProducts({ search, offset, limit: 24 }) });
  const linkedBase = bases.find(base => base.market_id === market && base.grade_code === selected?.grade_code && base.uom === selected.uom);
  const effectiveComponents = linkedBase ? { ...components, base_price: linkedBase.base_price } : components;
  const calculated = calculateRate(effectiveComponents);
  function select(item: { variant_id: string; sku: string; uom: string; grade_code?: string | null }) {
    setSelected(item);
    const existing = items.find(i => i.variant_id === item.variant_id) ?? currentRates.find(i => i.variant_id === item.variant_id && i.market_id === market);
    setComponents(existing ? priceComponents(existing) : emptyPriceComponents);
    setMessage('');
  }
  async function save() {
    setMessage('');
    setBusy(true);
    try {
      await pricingRpc('fti_pricing_draft_save', { p_id: draft?.id ?? null, p_revision: draft?.revision ?? null, p_market: market, p_title: title, p_expires: null,
        p_items: items.map(item => ({ variant_id: item.variant_id, amount: item.amount, ...priceComponents(item) })) });
      await onSaved();
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  function add() {
    if (!selected || !calculated) { setMessage('Enter a positive base price and non-negative increases, rolling charges and profit percentage, with at most four decimal places.'); return; }
    const parts = { base_price: effectiveComponents.base_price.trim(), increased_price: components.increased_price.trim() || '0', rolling_price: components.rolling_price.trim() || '0', profit_percent: components.profit_percent.trim() || '0' };
    setItems(old => [...old.filter(i => i.variant_id !== selected.variant_id), { ...selected, ...parts, amount: calculated.amount }]);
    setSelected(null); setComponents(emptyPriceComponents); setMessage('');
  }
  return <Card style={{ gap: 12 }}>
    <Txt style={{ fontSize: 20, fontWeight: '700' }}>{draft ? 'Edit rate draft' : 'New rate draft'}</Txt>
    <Txt>Rates stay active until replaced. Selling rate = base price + increased price + rolling charge + profit on that subtotal. GST and freight are excluded.</Txt>
    <Txt>Publishing records the update date and time automatically. Cost and profit details are visible to pricing staff only.</Txt>
    <Row style={{ flexWrap: 'wrap' }}>{markets.map(m => <Chip key={m.id} selected={market === m.id} onPress={() => setMarket(m.id)}>{m.name}</Chip>)}</Row>
    <Field label="Draft title" placeholder="e.g. Delhi fastener rates" value={title} onChangeText={setTitle} />
    {items.map(item => <View key={item.variant_id} style={{ gap: 8 }}><Txt>{item.sku}</Txt><PriceBreakdown item={item}/>
      <Button secondary disabled={busy} onPress={() => select(item)}>Edit breakdown for {item.sku}</Button>
      <Button secondary disabled={busy} onPress={() => { setItems(items.filter(i => i.variant_id !== item.variant_id)); if (selected?.variant_id === item.variant_id) setSelected(null); }}>Remove {item.sku}</Button></View>)}
    <Field label="Find published product or SKU" placeholder="e.g. HEX-M12-50 or hex bolt" value={search} onChangeText={v => { setSearch(v); setOffset(0); }} />
    {catalog.isPending ? <Txt>Loading catalogue…</Txt> : catalog.error ? <Txt accessibilityRole="alert">{catalog.error.message}</Txt> : <>
      {!catalog.data.items.length && <Txt>No published products match. Publish real catalogue records before adding rates.</Txt>}
      {catalog.data.items.map(product => <View key={product.id} style={{ gap: 8 }}><Txt>{product.name}</Txt><Row style={{ flexWrap: 'wrap' }}>{product.variants.map(v => <Chip key={v.id} selected={selected?.variant_id === v.id} onPress={() => select({ variant_id: v.id, sku: v.sku, uom: v.uom, grade_code: materialGrade(v.attributes.grade) })}>{v.sku} · {v.uom}</Chip>)}</Row></View>)}
      <Row><Button secondary disabled={!offset} onPress={() => setOffset(Math.max(0, offset - 24))}>Previous products</Button><Button secondary disabled={offset + 24 >= catalog.data.total} onPress={() => setOffset(offset + 24)}>Next products</Button></Row>
    </>}
    {selected && <>
      <Txt style={{ fontWeight: '700' }}>Price breakdown for {selected.sku}</Txt>
      {([
        ['base_price', `Base price (INR per ${selected.uom})`, 'e.g. 70.00'],
        ['increased_price', `Increased price (INR per ${selected.uom})`, 'e.g. 2.00'],
        ['rolling_price', `Rolling charge (INR per ${selected.uom})`, 'e.g. 3.00'],
        ['profit_percent', 'Profit (% of subtotal)', 'e.g. 10'],
      ] as const).map(([key, label, placeholder]) => key === 'base_price' && linkedBase
        ? <Txt key={key}>Shared {linkedBase.grade_code} base: INR {linkedBase.base_price} / {selected.uom}. Update it under Shared material base prices.</Txt>
        : <Field key={key} label={label} placeholder={placeholder} numeric value={components[key]} onChangeText={value => setComponents(old => ({ ...old, [key]: value }))}/>)}
      {calculated ? <><Txt>Subtotal: INR {calculated.subtotal} / {selected.uom}</Txt><Txt>Profit amount: INR {calculated.profit_amount} / {selected.uom}</Txt><Txt style={{ fontWeight: '700' }}>Calculated selling rate: INR {calculated.amount} / {selected.uom}</Txt></> : <Txt>Enter the base price to calculate the selling rate.</Txt>}
      <Button secondary disabled={busy || items.length >= 100 && !items.some(i => i.variant_id === selected.variant_id)} onPress={add}>Add or replace draft item</Button>
    </>}
    <Button disabled={busy || !market || !title.trim() || !items.length || !!selected} onPress={() => void save()}>{busy ? 'Saving…' : 'Save draft for review'}</Button>
    {selected ? <Txt>Add or replace the edited item before saving the draft.</Txt> : null}
    {!!message && <Txt accessibilityRole="alert">{message}</Txt>}
  </Card>;
}

export function PricingManagement() {
  const auth = useAuth();
  const client = useQueryClient();
  const permitted = hasPermission(auth.identity, 'price.manage');
  const canPublish = hasPermission(auth.identity, 'price.publish');
  const [offset, setOffset] = useState(0);
  const [edit, setEdit] = useState<PriceDraft | null>(null);
  const [seed, setSeed] = useState<RateSeed | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [state, setState] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const query = useQuery({ queryKey: ['pricing', 'admin', auth.session?.user.id, offset], queryFn: () => pricingApi.admin(offset), enabled: permitted, retry: false, staleTime: 0 });
  async function refresh() { await client.invalidateQueries({ queryKey: ['pricing'] }); }
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true); setMessage('');
    try { await action(); setMessage(success); await refresh(); }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); setConfirm(null); }
  }
  if (!permitted) return null;
  return <View style={{ gap: 18 }}>
    <Txt style={{ fontSize: 24, fontWeight: '700' }}>Pricing management</Txt>
    {!!message && <Txt accessibilityRole="alert">{message}</Txt>}
    <Button secondary disabled={busy} onPress={() => void refresh()}>Refresh pricing</Button>
    <Card style={{ gap: 10 }}>
      <Txt>Create a real trading market</Txt>
      <Field label="Market code" placeholder="e.g. TEST_DELHI" value={code} onChangeText={setCode} />
      <Field label="Market name" placeholder="e.g. Delhi Test Market" value={name} onChangeText={setName} />
      <Field label="State" placeholder="e.g. Delhi" value={state} onChangeText={setState} />
      <Button disabled={busy || !code.trim() || !name.trim() || !state.trim()} onPress={() => void run(async () => { await pricingRpc('fti_pricing_market_create', { p_code: code, p_name: name, p_state: state }); setCode(''); setName(''); setState(''); }, 'Market created.')}>Create market</Button>
    </Card>
    {query.isPending ? <Txt>Loading drafts…</Txt> : query.error ? <Empty title="Pricing unavailable" description={query.error.message} /> : <>
      {query.data.markets.length > 0 && <GradeBaseManagement markets={query.data.markets} bases={query.data.grade_bases ?? []} canPublish={canPublish} onSaved={refresh}/>}
      {query.data.markets.length > 0 && <DraftEditor key={`${edit?.id ?? 'new'}-${editorKey}`} draft={edit} seed={seed} currentRates={query.data.current_rates ?? []} bases={query.data.grade_bases ?? []} markets={query.data.markets} onSaved={async () => { setEdit(null); setSeed(null); setEditorKey(k => k + 1); setMessage('Draft saved. Review it below before publishing.'); await refresh(); }} />}
      {(edit || seed) && <Button secondary onPress={() => { setEdit(null); setSeed(null); setEditorKey(k => k + 1); }}>Cancel edit</Button>}
      <Txt style={{ fontSize: 20, fontWeight: '700' }}>Current rates</Txt>
      {(query.data.current_rates ?? []).map(rate => <Card key={rate.id} style={{ gap: 10 }}>
        <Txt style={{ fontWeight: '700' }}>{rate.name} · {rate.sku}</Txt>
        <Txt>{query.data.markets.find(m => m.id === rate.market_id)?.name ?? 'Market'}</Txt>
        <PriceBreakdown item={rate}/>
        <Txt>Last updated: {pricingUpdateTime(rate.effective_at)}</Txt>
        <Button secondary disabled={busy} onPress={() => { setEdit(null); setSeed({ market_id: rate.market_id, title: `${rate.name} price update`.slice(0, 160), items: [rate] }); setEditorKey(k => k + 1); }}>Update {rate.sku}</Button>
        {seed?.items.some(item => item.variant_id === rate.variant_id) && seed.market_id === rate.market_id ? <Txt accessibilityRole="alert">This rate is loaded in the draft above. Edit its breakdown, save and publish the replacement.</Txt> : null}
      </Card>)}
      {!query.data.current_rates?.length ? <Txt>No published rates on this page.</Txt> : null}
      <Txt style={{ fontSize: 20, fontWeight: '700' }}>Drafts awaiting publication</Txt>
      {!query.data.drafts.length && <Txt>No drafts on this page.</Txt>}
      {query.data.drafts.map(draft => <Card key={draft.id} style={{ gap: 12 }}>
        <Txt>{draft.title}</Txt><Badge>Draft · revision {draft.revision}</Badge>
        <Txt>{query.data.markets.find(m => m.id === draft.market_id)?.name ?? 'Inactive market'}{draft.updated_at ? ` · Saved ${pricingUpdateTime(draft.updated_at)}` : ''}</Txt>
        {draft.items.map(item => <View key={item.variant_id} style={{ gap: 6 }}><Txt>{item.sku}</Txt><PriceBreakdown item={item}/></View>)}
        <Button secondary disabled={busy} onPress={() => { setEdit(draft); setSeed(null); setEditorKey(k => k + 1); setConfirm(null); }}>Edit draft</Button>
        {canPublish && (confirm !== draft.id ? <Button disabled={busy} onPress={() => setConfirm(draft.id)}>Review publication</Button> : <>
          <Txt>Publish these {draft.items.length} selling rates now? They stay active until replaced. The update time is recorded automatically and published history cannot be edited.</Txt>
          <Button disabled={busy} onPress={() => void run(() => pricingRpc('fti_pricing_publish', { p_id: draft.id, p_revision: draft.revision }), 'Rates published. Public rates have been refreshed.')}>Confirm and publish</Button>
          <Button secondary disabled={busy} onPress={() => setConfirm(null)}>Cancel publication</Button>
        </>)}
      </Card>)}
      <Row><Button secondary disabled={!offset} onPress={() => setOffset(Math.max(0, offset - 24))}>Previous rates and drafts</Button><Button secondary disabled={query.data.drafts.length !== 24 && query.data.current_rates?.length !== 24} onPress={() => setOffset(offset + 24)}>Next rates and drafts</Button></Row>
    </>}
  </View>;
}
