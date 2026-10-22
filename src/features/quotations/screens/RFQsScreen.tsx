import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useStore } from '@core/state/workspace-store';
import { useAuth } from '@features/auth/ui';
import { supabaseCatalogRepository } from '@features/catalog/export';
import { Badge, Button, Card, Chip, Empty, Field, Heading, Row, Txt, s } from '@shared/ui';
import { salesApi } from '../services/sales-api';
import type { SalesDetail } from '../model/sales-types';
import { AttachmentsPanel } from '../components/AttachmentsPanel';
import { PlaceOrderPanel } from '@features/orders/ui';
import { CategoryQuotationPdfs } from '../components/CategoryQuotationPdfs';

type Line = { variant_id: string; sku: string; name: string; qty: string; uom: string; minimum: number; requirements: string };
const newId = () => globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
  const n = Math.floor(Math.random() * 16); return (ch === 'x' ? n : (n & 3) | 8).toString(16);
});

function Composer({ submitted }: { submitted: (id: string) => Promise<void> }) {
  const auth = useAuth();
  const requestId = useRef(newId());
  const [business, setBusiness] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<Line[]>([]);
  const [sendCategoryPdfs, setSendCategoryPdfs] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const catalog = useQuery({ queryKey: ['sales','picker',search,offset], queryFn: () => supabaseCatalogRepository.listProducts({ search, offset, limit: 12 }), retry: false });
  const businesses = auth.identity?.businesses.filter(b => b.verification_status === 'verified') ?? [];
  const addresses = businesses.find(b => b.id === business)?.addresses.filter(a => a.label === 'shipping') ?? [];
  async function submit() {
    setError('');
    if (!items.length || items.some(i => !/^\d{1,15}(\.\d{1,3})?$/.test(i.qty) || Number(i.qty) < i.minimum)) {
      setError('Choose published variants and enter quantities at or above their minimums.'); return;
    }
    setBusy(true);
    try {
      const result = await salesApi.submit(requestId.current, business, address, notes,
        items.map(({ variant_id, qty, uom, requirements }) => ({ variant_id, qty, uom, requirements })), sendCategoryPdfs);
      requestId.current = newId(); setItems([]); setNotes(''); await submitted(result.id);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <Card style={{ gap: 12 }}><Txt style={s.h2}>New multi-item request</Txt>
    <Txt style={s.muted}>Select real published variants. FTI will send a separately priced quotation.</Txt>
    <Row style={{ flexWrap: 'wrap' }}><Chip selected={!business} onPress={() => { setBusiness(null); setAddress(null); }}>Personal request</Chip>
      {businesses.map(b => <Chip key={b.id} selected={business === b.id} onPress={() => { setBusiness(b.id); setAddress(null); }}>{b.legal_name}</Chip>)}</Row>
    {!!business && !!addresses.length && <Row style={{ flexWrap: 'wrap' }}><Chip selected={!address} onPress={() => setAddress(null)}>Confirm delivery later</Chip>
      {addresses.map(a => <Chip key={a.id} selected={address === a.id} onPress={() => setAddress(a.id)}>{a.city}, {a.state}</Chip>)}</Row>}
    <Field label="Delivery requirements and notes" placeholder="e.g. Deliver to Delhi; unloading available at the warehouse." value={notes} onChangeText={setNotes} multiline />
    <Field label="Find published product or SKU" placeholder="e.g. HEX-M12-50 or hex bolt" value={search} onChangeText={v => { setSearch(v); setOffset(0); }} />
    {catalog.isPending ? <Txt>Loading catalogue…</Txt> : catalog.error ? <Txt accessibilityRole="alert">{catalog.error.message}</Txt> : <>
      {!catalog.data.items.length && <Txt>No matching published products.</Txt>}
      {catalog.data.items.map(p => <View key={p.id} style={{ gap: 8 }}><Txt>{p.name}</Txt><Row style={{ flexWrap: 'wrap' }}>
        {p.variants.map(v => <Chip key={v.id} selected={items.some(i => i.variant_id === v.id)} onPress={() => setItems(old => old.some(i => i.variant_id === v.id) ? old.filter(i => i.variant_id !== v.id) : old.length >= 20 ? old : [...old, { variant_id: v.id, sku: v.sku, name: p.name, qty: String(v.min_order_qty), uom: v.uom, minimum: v.min_order_qty, requirements: '' }])}>{v.sku} · {v.uom}</Chip>)}
      </Row></View>)}
      <Row><Button secondary disabled={!offset} onPress={() => setOffset(Math.max(0,offset-12))}>Previous</Button><Button secondary disabled={offset+12>=catalog.data.total} onPress={() => setOffset(offset+12)}>Next</Button></Row>
    </>}
    {items.map(i => <Card key={i.variant_id} style={{ gap: 8 }}><Txt>{i.name} · {i.sku}</Txt>
      <Field label={`Quantity in ${i.uom} (minimum ${i.minimum})`} placeholder={`e.g. ${i.minimum} ${i.uom}`} numeric value={i.qty} onChangeText={v => setItems(old => old.map(line => line.variant_id === i.variant_id ? { ...line, qty: v } : line))} />
      <Field label="Item requirements (optional)" placeholder="e.g. Grade 8.8, zinc plated" value={i.requirements} onChangeText={v => setItems(old => old.map(line => line.variant_id === i.variant_id ? { ...line, requirements: v } : line))} />
      <Button secondary onPress={() => setItems(old => old.filter(line => line.variant_id !== i.variant_id))}>Remove item</Button></Card>)}
    {!!error && <Txt accessibilityRole="alert">{error}</Txt>}
    <Chip selected={sendCategoryPdfs} onPress={() => setSendCategoryPdfs(value => !value)}>Send fastener category PDFs to my WhatsApp</Chip>
    <Txt style={s.muted}>Selected category PDFs will be sent to your verified phone number. Staff are notified of this quotation request.</Txt>
    <Button disabled={busy || !items.length} onPress={() => void submit()}>{busy ? 'Submitting…' : 'Submit request to FTI'}</Button>
  </Card>;
}

function BuyerDetail({ detail, refresh }: { detail: SalesDetail; refresh: () => Promise<void> }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState<'accept' | 'revision' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const quote = detail.quotations[0];
  const current = quote?.revisions.find(r => r.revision_no === quote.current_revision);
  const actionable = quote?.status === 'sent' && current?.status === 'sent' && Date.parse(current.valid_until) > now;
  async function act() {
    if (!quote || !current || !confirm) return;
    setBusy(true); setError('');
    try { if (confirm === 'accept') await salesApi.accept(quote.id, current.revision_no);
      else await salesApi.revisionRequest(quote.id, current.revision_no, reason);
      setConfirm(null); setReason(''); await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <View style={{ gap: 14 }}><Card style={{ gap: 10 }}><Txt style={s.h2}>{detail.rfq_no}</Txt><Badge>{detail.status.toUpperCase()}</Badge>
    {detail.items.map(i => <Txt key={i.id}>{i.product_name} · {i.sku} · {i.qty} {i.uom}{i.requirements ? ` · ${i.requirements}` : ''}</Txt>)}
    {!!detail.notes && <Txt>{detail.notes}</Txt>}
  </Card>
    <AttachmentsPanel detail={detail} refresh={refresh} />
    {quote?.revisions.map(rev => <Card key={rev.id} style={{ gap: 8 }}><Txt style={s.h2}>{quote.quote_no} · revision {rev.revision_no}</Txt><Badge>{rev.status.toUpperCase()}</Badge>
      <Txt>Valid until {new Date(rev.valid_until).toLocaleString()}</Txt>
      {rev.items.map(i => <Txt key={i.variant_id}>{i.sku}: {i.qty} {i.uom} × INR {i.rate} = INR {i.line_total}</Txt>)}
      <Txt>Subtotal INR {rev.subtotal} · Discount INR {rev.discount_total}</Txt><Txt>GST INR {rev.gst_total} · Freight INR {rev.freight_total}</Txt>
      <Txt style={s.h2}>Total INR {rev.grand_total}</Txt><Txt>Terms: {rev.payment_terms?.text ?? 'Not supplied'}</Txt>
      {!!rev.notes && <Txt>{rev.notes}</Txt>}</Card>)}
    {actionable && <Card style={{ gap: 10 }}><Txt>Only this current unexpired revision can be accepted. Acceptance records your decision; it does not place an order or take payment.</Txt>
      {confirm === 'revision' && <Field label="Requested change" placeholder="e.g. Increase the quantity to 200 pieces." value={reason} onChangeText={setReason} multiline />}
      {!confirm ? <Row><Button secondary onPress={() => setConfirm('revision')}>Request revision</Button><Button onPress={() => setConfirm('accept')}>Review acceptance</Button></Row> : <>
        <Button disabled={busy || confirm === 'revision' && reason.trim().length < 3} onPress={() => void act()}>{busy ? 'Saving…' : confirm === 'accept' ? 'Confirm quote acceptance' : 'Send revision request'}</Button>
        <Button secondary disabled={busy} onPress={() => setConfirm(null)}>Cancel</Button></>}
    </Card>}
    {quote?.status === 'accepted' && current?.status === 'accepted' && Date.parse(current.valid_until)>now &&
      <PlaceOrderPanel quoteId={quote.id} businessId={detail.business_id} />}
    {!!error && <Txt accessibilityRole="alert">{error}</Txt>}
  </View>;
}

export function RFQs() {
  const auth = useAuth();
  const client = useQueryClient();
  const oldDrafts = useStore(state => state.rfqs);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const list = useQuery({ queryKey: ['sales','mine',auth.session?.user.id,offset], queryFn: () => salesApi.mine(offset), retry: false });
  const detail = useQuery({ queryKey: ['sales','detail',auth.session?.user.id,selected], queryFn: () => salesApi.detail(selected!), enabled: !!selected, retry: false });
  async function refresh() { await client.invalidateQueries({ queryKey: ['sales'] }); }
  return <View style={{ gap: 18 }}><Heading eyebrow="YOUR MATERIAL REQUIREMENTS" title="Requests & quotations" description="Send multi-item requirements to FTI and review your quotations." action={<Button onPress={() => setOpen(!open)}>{open ? 'Close form' : 'New request'}</Button>} />
    {!selected ? <CategoryQuotationPdfs /> : null}
    {open && <Composer submitted={async id => { setOpen(false); setSelected(id); await refresh(); }} />}
    {selected ? <><Button secondary onPress={() => setSelected(null)}>Back to requests</Button>
      {detail.isPending ? <Txt>Loading request…</Txt> : detail.error ? <Empty title="Request unavailable" description={detail.error.message} /> : <BuyerDetail detail={detail.data} refresh={refresh} />}</> : <>
      {list.isPending ? <Txt>Loading requests…</Txt> : list.error ? <Empty title="Requests unavailable" description={list.error.message} action={<Button onPress={() => void list.refetch()}>Retry</Button>} /> : <>
        {!list.data.length && <Empty title="No submitted requests" description="Select published products to send your first request." />}
        {list.data.map(r => <Card key={r.id} style={{ gap: 10 }}><Txt style={s.h2}>{r.rfq_no}</Txt><Badge>{r.status.toUpperCase()}</Badge><Txt>{r.item_count} items · {new Date(r.created_at).toLocaleString()}</Txt><Button secondary onPress={() => setSelected(r.id)}>View request</Button></Card>)}
        <Row><Button secondary disabled={!offset} onPress={() => setOffset(Math.max(0,offset-24))}>Previous</Button><Button secondary disabled={list.data.length<24} onPress={() => setOffset(offset+24)}>Next</Button></Row>
      </>}
      {!!oldDrafts.length && <Card style={{ gap: 8 }}><Txt style={s.h2}>Earlier device drafts</Txt><Txt style={s.muted}>These were never sent to FTI. Create a new request above to submit real variants.</Txt>
        {oldDrafts.map(d => <Txt key={d.id}>{d.title} · {d.quantity}</Txt>)}</Card>}
    </>}
  </View>;
}
