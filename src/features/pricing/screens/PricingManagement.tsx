import { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@features/auth/ui';
import { hasPermission } from '@features/auth';
import { supabaseCatalogRepository } from '@features/catalog/export';
import { Badge, Button, Card, Chip, Empty, Field, Row, Txt } from '@shared/ui';
import { pricingApi, pricingRpc } from '../services/pricing-api';
import type { DraftItem, Market, PriceDraft } from '../model/types';

function DraftEditor({ draft, markets, onSaved }: { draft: PriceDraft | null; markets: Market[]; onSaved: () => Promise<void> }) {
  const [market, setMarket] = useState(draft?.market_id ?? '');
  const [title, setTitle] = useState(draft?.title ?? '');
  const [expires, setExpires] = useState(draft?.expires_at ?? '');
  const [items, setItems] = useState<DraftItem[]>(draft?.items ?? []);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Omit<DraftItem, 'amount'> | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const catalog = useQuery({ queryKey: ['pricing', 'variant-picker', search, offset], queryFn: () => supabaseCatalogRepository.listProducts({ search, offset, limit: 24 }) });
  async function save() {
    setMessage('');
    // Require an explicit timezone rather than silently treating local input as UTC.
    if (!/(Z|[+-]\d{2}:\d{2})$/i.test(expires) || !Number.isFinite(Date.parse(expires))) { setMessage('Enter an expiry with timezone, for example YYYY-MM-DDTHH:mm:ss+05:30.'); return; }
    setBusy(true);
    try {
      await pricingRpc('fti_pricing_draft_save', { p_id: draft?.id ?? null, p_revision: draft?.revision ?? null, p_market: market, p_title: title, p_expires: new Date(expires).toISOString(), p_items: items.map(({ variant_id, amount }) => ({ variant_id, amount })) });
      await onSaved();
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  function add() {
    if (!selected || !/^\d{1,16}(\.\d{1,4})?$/.test(amount) || Number(amount) <= 0) { setMessage('Enter a positive rate with at most four decimal places.'); return; }
    setItems(old => [...old.filter(i => i.variant_id !== selected.variant_id), { ...selected, amount }]);
    setSelected(null); setAmount(''); setMessage('');
  }
  return <Card style={{ gap: 12 }}>
    <Txt style={{ fontSize: 20, fontWeight: '700' }}>{draft ? 'Edit rate draft' : 'New rate draft'}</Txt>
    <Txt>Public indicative rates in INR, excluding GST and freight. Publication starts immediately. Enter approved selling rates only.</Txt>
    <Row>{markets.map(m => <Chip key={m.id} selected={market === m.id} onPress={() => setMarket(m.id)}>{m.name}</Chip>)}</Row>
    <Field label="Draft title" value={title} onChangeText={setTitle} />
    <Field label="Expiry with timezone (YYYY-MM-DDTHH:mm:ss+05:30)" value={expires} onChangeText={setExpires} />
    {items.map(item => <View key={item.variant_id} style={{ gap: 8 }}><Txt>{item.sku} · INR {item.amount} / {item.uom}</Txt><Button secondary disabled={busy} onPress={() => setItems(items.filter(i => i.variant_id !== item.variant_id))}>Remove {item.sku}</Button></View>)}
    <Field label="Find published product or SKU" value={search} onChangeText={v => { setSearch(v); setOffset(0); }} />
    {catalog.isPending ? <Txt>Loading catalogue…</Txt> : catalog.error ? <Txt accessibilityRole="alert">{catalog.error.message}</Txt> : <>
      {!catalog.data.items.length && <Txt>No published products match. Publish real catalogue records before adding rates.</Txt>}
      {catalog.data.items.map(product => <View key={product.id} style={{ gap: 8 }}><Txt>{product.name}</Txt><Row>{product.variants.map(v => <Chip key={v.id} selected={selected?.variant_id === v.id} onPress={() => { setSelected({ variant_id: v.id, sku: v.sku, uom: v.uom }); setAmount(items.find(i => i.variant_id === v.id)?.amount ?? ''); }}>{v.sku} · {v.uom}</Chip>)}</Row></View>)}
      <Row><Button secondary disabled={!offset} onPress={() => setOffset(Math.max(0, offset - 24))}>Previous products</Button><Button secondary disabled={offset + 24 >= catalog.data.total} onPress={() => setOffset(offset + 24)}>Next products</Button></Row>
    </>}
    {selected && <><Field label={`INR per ${selected.uom} for ${selected.sku}`} numeric value={amount} onChangeText={setAmount} /><Button secondary disabled={busy || items.length >= 100 && !items.some(i => i.variant_id === selected.variant_id)} onPress={add}>Add or replace draft item</Button></>}
    <Button disabled={busy || !market || !title.trim() || !expires || !items.length} onPress={() => void save()}>{busy ? 'Saving…' : 'Save draft for review'}</Button>
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
      <Field label="Market code" value={code} onChangeText={setCode} />
      <Field label="Market name" value={name} onChangeText={setName} />
      <Field label="State" value={state} onChangeText={setState} />
      <Button disabled={busy || !code.trim() || !name.trim() || !state.trim()} onPress={() => void run(async () => { await pricingRpc('fti_pricing_market_create', { p_code: code, p_name: name, p_state: state }); setCode(''); setName(''); setState(''); }, 'Market created.')}>Create market</Button>
    </Card>
    {query.isPending ? <Txt>Loading drafts…</Txt> : query.error ? <Empty title="Pricing unavailable" description={query.error.message} /> : <>
      {query.data.markets.length > 0 && <DraftEditor key={`${edit?.id ?? 'new'}-${editorKey}`} draft={edit} markets={query.data.markets} onSaved={async () => { setEdit(null); setEditorKey(k => k + 1); setMessage('Draft saved. Review it below before publishing.'); await refresh(); }} />}
      {edit && <Button secondary onPress={() => { setEdit(null); setEditorKey(k => k + 1); }}>Cancel edit</Button>}
      <Txt style={{ fontSize: 20, fontWeight: '700' }}>Drafts awaiting publication</Txt>
      {!query.data.drafts.length && <Txt>No drafts on this page.</Txt>}
      {query.data.drafts.map(draft => <Card key={draft.id} style={{ gap: 12 }}>
        <Txt>{draft.title}</Txt><Badge>Draft · revision {draft.revision}</Badge>
        <Txt>{query.data.markets.find(m => m.id === draft.market_id)?.name ?? 'Inactive market'} · Expires {new Date(draft.expires_at).toLocaleString()}</Txt>
        {draft.items.map(item => <Txt key={item.variant_id}>{item.sku} · INR {item.amount} / {item.uom}</Txt>)}
        <Button secondary disabled={busy} onPress={() => { setEdit(draft); setEditorKey(k => k + 1); setConfirm(null); }}>Edit draft</Button>
        {canPublish && (confirm !== draft.id ? <Button disabled={busy} onPress={() => setConfirm(draft.id)}>Review publication</Button> : <>
          <Txt>Publish these {draft.items.length} rates to everyone immediately? This replaces current public rates for these variants. Published history cannot be edited.</Txt>
          <Button disabled={busy} onPress={() => void run(() => pricingRpc('fti_pricing_publish', { p_id: draft.id, p_revision: draft.revision }), 'Rates published. Public rates have been refreshed.')}>Confirm and publish</Button>
          <Button secondary disabled={busy} onPress={() => setConfirm(null)}>Cancel publication</Button>
        </>)}
      </Card>)}
      <Row><Button secondary disabled={!offset} onPress={() => setOffset(Math.max(0, offset - 24))}>Previous drafts</Button><Button secondary disabled={query.data.drafts.length !== 24} onPress={() => setOffset(offset + 24)}>Next drafts</Button></Row>
    </>}
  </View>;
}
