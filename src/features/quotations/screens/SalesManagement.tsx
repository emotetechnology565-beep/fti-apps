import { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@features/auth/ui';
import { hasPermission } from '@features/auth';
import { Badge, Button, Card, Empty, Field, Row, Txt, s } from '@shared/ui';
import { salesApi } from '../services/sales-api';
import type { SalesDetail } from '../model/sales-types';
import { AttachmentsPanel } from '../components/AttachmentsPanel';

const amount = /^\d{1,15}(\.\d{1,4})?$/;
function QuoteEditor({ detail, refresh }: { detail: SalesDetail; refresh: () => Promise<void> }) {
  const auth = useAuth();
  const [rates, setRates] = useState<Record<string,string>>({});
  const [expiry, setExpiry] = useState('');
  const [discount, setDiscount] = useState('');
  const [gst, setGst] = useState('');
  const [freight, setFreight] = useState('');
  const [terms, setTerms] = useState('');
  const [notes, setNotes] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const canQuote = detail.status === 'submitted' || detail.status === 'reviewing' || detail.status === 'quoted';
  const assigned = detail.assigned_to === auth.session?.user.id || auth.identity?.roles.includes('super_admin');
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true); setMessage('');
    try { await action(); setMessage(success); setConfirm(false); await refresh(); }
    catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  }
  async function issue() {
    if (!/(Z|[+-]\d{2}:\d{2})$/i.test(expiry) || !Number.isFinite(Date.parse(expiry)) || Date.parse(expiry) <= Date.now()
      || detail.items.some(i => !amount.test(rates[i.variant_id] ?? '') || Number(rates[i.variant_id]) <= 0)
      || [discount,gst,freight].some(v => !amount.test(v)) || terms.trim().length < 3) {
      setMessage('Enter future expiry with timezone, positive line rates, approved amounts and payment terms.'); return;
    }
    await run(() => salesApi.quote(detail.id, new Date(expiry).toISOString(),
      detail.items.map(i => ({ variant_id: i.variant_id, rate: rates[i.variant_id] })), discount, gst, freight, terms, notes),
      'Quotation revision sent to the buyer.');
  }
  return <View style={{ gap: 14 }}><Card style={{ gap: 8 }}><Txt style={s.h2}>{detail.rfq_no}</Txt><Badge>{detail.status.toUpperCase()}</Badge>
    <Txt>Buyer: {detail.buyer_id}</Txt><Txt>Assigned: {detail.assigned_to ?? 'No one yet'}</Txt>
    {detail.items.map(i => <Txt key={i.id}>{i.product_name} · {i.sku} · {i.qty} {i.uom}{i.requirements ? ` · ${i.requirements}` : ''}</Txt>)}
    {!!detail.notes && <Txt>{detail.notes}</Txt>}
    {canQuote && !detail.assigned_to && <Button secondary disabled={busy} onPress={() => void run(() => salesApi.assign(detail.id, auth.session!.user.id), 'Request assigned to you.')}>Assign to me</Button>}
  </Card>
    <AttachmentsPanel detail={detail} refresh={refresh} />
    {detail.quotations.flatMap(q => q.revisions.map(rev => <Card key={rev.id} style={{ gap: 6 }}><Txt>{q.quote_no} · revision {rev.revision_no} · {rev.status}</Txt>
      <Txt>INR {rev.grand_total} · valid until {new Date(rev.valid_until).toLocaleString()}</Txt>
      {rev.items.map(i => <Txt key={i.variant_id}>{i.sku} · INR {i.rate} / {i.uom}</Txt>)}
    </Card>))}
    {canQuote && assigned && <Card style={{ gap: 12 }}><Txt style={s.h2}>Issue a quotation revision</Txt>
      <Txt>Enter approved INR rates and totals. Tax and freight values must be decided by FTI; the app does not calculate them.</Txt>
      {detail.items.map(i => <Field key={i.id} label={`INR per ${i.uom} for ${i.sku} (${i.qty} ${i.uom})`} numeric value={rates[i.variant_id] ?? ''} onChangeText={v => setRates(old => ({ ...old, [i.variant_id]: v }))} />)}
      <Field label="Valid until with timezone (YYYY-MM-DDTHH:mm:ss+05:30)" value={expiry} onChangeText={setExpiry} />
      <Field label="Approved discount in INR" numeric value={discount} onChangeText={setDiscount} />
      <Field label="Approved GST amount in INR" numeric value={gst} onChangeText={setGst} />
      <Field label="Approved freight in INR" numeric value={freight} onChangeText={setFreight} />
      <Field label="Payment terms" value={terms} onChangeText={setTerms} multiline />
      <Field label="Quote notes (optional)" value={notes} onChangeText={setNotes} multiline />
      {!confirm ? <Button disabled={busy} onPress={() => setConfirm(true)}>Review issue</Button> : <>
        <Txt>Send this manually priced quotation to the buyer? A new revision supersedes the previous one.</Txt>
        <Button disabled={busy} onPress={() => void issue()}>{busy ? 'Sending…' : 'Confirm and send quotation'}</Button>
        <Button secondary disabled={busy} onPress={() => setConfirm(false)}>Cancel</Button></>}
    </Card>}
    {!!message && <Txt accessibilityRole="alert">{message}</Txt>}
  </View>;
}

export function SalesManagement() {
  const auth = useAuth();
  const client = useQueryClient();
  const permitted = hasPermission(auth.identity, 'sales.manage');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const queue = useQuery({ queryKey: ['sales','queue',auth.session?.user.id,offset], queryFn: () => salesApi.queue(offset), enabled: permitted, retry: false });
  const detail = useQuery({ queryKey: ['sales','staff-detail',auth.session?.user.id,selected], queryFn: () => salesApi.detail(selected!), enabled: permitted && !!selected, retry: false });
  async function refresh() { await client.invalidateQueries({ queryKey: ['sales'] }); }
  if (!permitted) return null;
  return <View style={{ gap: 14 }}><Txt style={{ fontSize: 24, fontWeight: '700' }}>RFQ and quotation management</Txt>
    <Button secondary onPress={() => void refresh()}>Refresh requests</Button>
    {selected ? <><Button secondary onPress={() => setSelected(null)}>Back to sales queue</Button>
      {detail.isPending ? <Txt>Loading request…</Txt> : detail.error ? <Empty title="Request unavailable" description={detail.error.message} /> : <QuoteEditor key={detail.data.id} detail={detail.data} refresh={refresh} />}</> : <>
      {queue.isPending ? <Txt>Loading sales queue…</Txt> : queue.error ? <Empty title="Sales queue unavailable" description={queue.error.message} /> : <>
        {!queue.data.length && <Empty title="No sales requests" description="Submitted buyer requests will appear here." />}
        {queue.data.map(r => <Card key={r.id} style={{ gap: 8 }}><Txt style={s.h2}>{r.rfq_no}</Txt><Badge>{r.status.toUpperCase()}</Badge>
          <Txt>{r.item_count} items · {new Date(r.created_at).toLocaleString()}</Txt><Button secondary onPress={() => setSelected(r.id)}>Review request</Button></Card>)}
        <Row><Button secondary disabled={!offset} onPress={() => setOffset(Math.max(0,offset-24))}>Previous</Button><Button secondary disabled={queue.data.length<24} onPress={() => setOffset(offset+24)}>Next</Button></Row>
      </>}
    </>}
  </View>;
}
