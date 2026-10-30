import { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@features/auth/ui';
import { hasPermission } from '@features/auth';
import { supabaseCatalogRepository } from '@features/catalog/export';
import { Button, Card, Chip, Field, Row, Txt, s } from '@shared/ui';
import { commerceApi } from '../services/commerce-api';

function PolicyPanel() {
  const auth=useAuth(); const client=useQueryClient();
  const [hours,setHours]=useState(''); const [confirm,setConfirm]=useState(false);
  const [busy,setBusy]=useState(false); const [message,setMessage]=useState('');
  const permitted=hasPermission(auth.identity,'order.policy');
  const policy=useQuery({queryKey:['commerce','policy',auth.session?.user.id],queryFn:commerceApi.policy,enabled:permitted,retry:false});
  if (!permitted) return null;
  async function save() {
    setBusy(true); setMessage('');
    try { await commerceApi.setPolicy(Number(hours)); setConfirm(false); setMessage('Approved reservation duration saved.');
      await client.invalidateQueries({queryKey:['commerce','policy']}); }
    catch(e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }
  return <Card style={{gap:10}}><Txt style={s.h2}>Order reservation policy</Txt>
    <Txt>{policy.isPending ? 'Loading policy…' : policy.error ? policy.error.message : policy.data ? `Current duration: ${policy.data.reservation_hours} hours` : 'No duration approved. Order placement is blocked.'}</Txt>
    <Txt>Enter only the duration approved by FTI operations. This controls how long unpaid orders hold tracked stock.</Txt>
    <Field label="Approved reservation hours (1–168)" placeholder="e.g. 24" numeric value={hours} onChangeText={setHours}/>
    {!confirm ? <Button secondary disabled={busy || !/^\d{1,3}$/.test(hours) || Number(hours)<1 || Number(hours)>168} onPress={()=>setConfirm(true)}>Review policy change</Button> : <>
      <Txt>Set the reservation duration to {hours} hours?</Txt>
      <Button disabled={busy} onPress={()=>void save()}>Confirm approved policy</Button>
      <Button secondary disabled={busy} onPress={()=>setConfirm(false)}>Cancel</Button></>}
    {!!message && <Txt accessibilityRole="alert">{message}</Txt>}
  </Card>;
}

function InventoryPanel() {
  const auth=useAuth(); const client=useQueryClient();
  const [code,setCode]=useState(''); const [name,setName]=useState(''); const [city,setCity]=useState('');
  const [search,setSearch]=useState(''); const [variant,setVariant]=useState(''); const [location,setLocation]=useState('');
  const [delta,setDelta]=useState(''); const [reason,setReason]=useState(''); const [reference,setReference]=useState('');
  const [confirm,setConfirm]=useState(false); const [busy,setBusy]=useState(false); const [message,setMessage]=useState('');
  const permitted=hasPermission(auth.identity,'inventory.manage');
  const stock=useQuery({queryKey:['commerce','stock',auth.session?.user.id],queryFn:commerceApi.stock,enabled:permitted,retry:false});
  const catalog=useQuery({queryKey:['commerce','catalog-picker',search],queryFn:()=>supabaseCatalogRepository.listProducts({search,limit:12,offset:0}),enabled:permitted,retry:false});
  if (!permitted) return null;
  async function createLocation() {
    setBusy(true); setMessage('');
    try { await commerceApi.createLocation(code.trim().toUpperCase(),name,city); setCode(''); setName(''); setCity('');
      setMessage('Stock location created.'); await client.invalidateQueries({queryKey:['commerce','stock']}); }
    catch(e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }
  async function adjust() {
    setBusy(true); setMessage('');
    try { await commerceApi.adjustStock(variant,location,delta,reason,reference); setDelta(''); setReason(''); setReference(''); setConfirm(false);
      setMessage('Inventory movement recorded.'); await client.invalidateQueries({queryKey:['commerce','stock']}); }
    catch(e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }
  return <Card style={{gap:12}}><Txt style={s.h2}>Tracked inventory</Txt>
    <Txt>Only stock recorded here can be reserved for quote-based orders. Enter adjustments from verified physical receipts or counts.</Txt>
    {stock.isPending ? <Txt>Loading stock…</Txt> : stock.error ? <Txt accessibilityRole="alert">{stock.error.message}</Txt> : <>
      {stock.data.inventory.map(i=><Txt key={`${i.variant_id}-${i.location_id}`}>{i.sku} · {stock.data.locations.find(l=>l.id===i.location_id)?.code}: {i.on_hand} on hand, {i.reserved} reserved, {i.available} available</Txt>)}
      {!stock.data.inventory.length && <Txt>No tracked stock yet.</Txt>}
      <Row style={{flexWrap:'wrap'}}>{stock.data.locations.filter(l=>l.is_active).map(l=><Chip key={l.id} selected={location===l.id} onPress={()=>setLocation(l.id)}>{l.code} · {l.name}</Chip>)}</Row>
    </>}
    <Txt style={s.h2}>Create stock location</Txt>
    <Field label="Code (A–Z, 0–9, underscore or hyphen)" placeholder="e.g. DELHI_WH_01" value={code} onChangeText={setCode}/>
    <Field label="Location name" placeholder="e.g. Delhi main warehouse" value={name} onChangeText={setName}/>
    <Field label="City (optional)" placeholder="e.g. Delhi" value={city} onChangeText={setCity}/>
    <Button secondary disabled={busy || !/^[A-Z0-9_-]{2,24}$/.test(code.trim().toUpperCase()) || name.trim().length<2} onPress={()=>void createLocation()}>Create location</Button>
    <Txt style={s.h2}>Record stock movement</Txt>
    <Field label="Find product or SKU" placeholder="e.g. HEX-M12-50 or hex bolt" value={search} onChangeText={setSearch}/>
    {catalog.isPending ? <Txt>Loading catalogue…</Txt> : catalog.error ? <Txt accessibilityRole="alert">{catalog.error.message}</Txt> : <Row style={{flexWrap:'wrap'}}>
      {catalog.data.items.flatMap(p=>p.variants.map(v=><Chip key={v.id} selected={variant===v.id} onPress={()=>setVariant(v.id)}>{v.sku}</Chip>))}</Row>}
    <Field label="Signed quantity (+ receipt, − correction)" placeholder="e.g. +100 or -5" value={delta} onChangeText={setDelta}/>
    <Field label="Reason (at least 5 characters)" placeholder="e.g. Goods received against purchase order PO-001" value={reason} onChangeText={setReason}/>
    <Field label="Document / count reference (optional)" placeholder="e.g. GRN-2026-001" value={reference} onChangeText={setReference}/>
    {!confirm ? <Button secondary disabled={busy || !variant || !location || !/^-?\d{1,12}(\.\d{1,3})?$/.test(delta) || Number(delta)===0 || reason.trim().length<5} onPress={()=>setConfirm(true)}>Review stock movement</Button> : <>
      <Txt>Record {delta} units for the selected variant and location? This changes order availability.</Txt>
      <Button disabled={busy} onPress={()=>void adjust()}>Confirm movement</Button>
      <Button secondary disabled={busy} onPress={()=>setConfirm(false)}>Cancel</Button></>}
    {!!message && <Txt accessibilityRole="alert">{message}</Txt>}
  </Card>;
}

function PaymentsPanel() {
  const auth=useAuth(); const client=useQueryClient();
  const permitted=hasPermission(auth.identity,'payment.review');
  const [offset,setOffset]=useState(0); const [selected,setSelected]=useState<string|null>(null);
  const [note,setNote]=useState(''); const [decision,setDecision]=useState<boolean|null>(null);
  const [busy,setBusy]=useState(false); const [message,setMessage]=useState('');
  const queue=useQuery({queryKey:['commerce','payment-queue',auth.session?.user.id,offset],queryFn:()=>commerceApi.paymentQueue(offset),enabled:permitted,retry:false});
  if (!permitted) return null;
  async function decide() {
    if (!selected || decision===null) return;
    setBusy(true); setMessage('');
    try { await commerceApi.paymentDecide(selected,decision,note); setSelected(null); setDecision(null); setNote('');
      setMessage(decision?'Payment verified and order confirmed.':'Transfer claim rejected.');
      await client.invalidateQueries({queryKey:['commerce']}); await client.invalidateQueries({queryKey:['order-payments']}); await client.invalidateQueries({queryKey:['admin-orders']}); }
    catch(e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }
  return <Card style={{gap:10}}><Txt style={s.h2}>Manual bank verification</Txt>
    <Txt>Compare each UTR, payer, amount and order with the actual bank statement. Do not approve from the buyer&apos;s claim alone. Bank claims must match the remaining balance after any recorded payments.</Txt>
    <Button secondary onPress={()=>void queue.refetch()}>Refresh transfer queue</Button>
    {queue.isPending ? <Txt>Loading transfer claims…</Txt> : queue.error ? <Txt accessibilityRole="alert">{queue.error.message}</Txt> : <>
      {!queue.data.length && <Txt>No transfers awaiting review.</Txt>}
      {queue.data.map(p=><Card key={p.id} style={{gap:6}}><Txt>{p.order_no} · INR {p.amount}</Txt>
        <Txt>UTR {p.reference} · buyer {p.buyer_id}</Txt><Txt>{new Date(p.created_at).toLocaleString()}</Txt>
        {selected===p.id ? <><Field label="Verification note (bank statement evidence)" placeholder="e.g. Match the UTR, amount and date to the bank statement." value={note} onChangeText={setNote} multiline/>
          <Row><Chip selected={decision===true} onPress={()=>setDecision(true)}>Verified in bank</Chip>
            <Chip selected={decision===false} onPress={()=>setDecision(false)}>Reject claim</Chip></Row>
          {decision!==null && <Txt>{decision?'Confirm full payment and allocate stock?':'Reject this transfer claim?'}</Txt>}
          <Button disabled={busy || decision===null || note.trim().length<5} onPress={()=>void decide()}>Confirm decision</Button>
          <Button secondary disabled={busy} onPress={()=>{setSelected(null);setDecision(null);}}>Cancel</Button></> :
          <Button secondary onPress={()=>{setSelected(p.id);setDecision(null);setNote('');}}>Review transfer</Button>}
      </Card>)}
      <Row><Button secondary disabled={!offset} onPress={()=>setOffset(Math.max(0,offset-24))}>Previous</Button>
        <Button secondary disabled={queue.data.length<24} onPress={()=>setOffset(offset+24)}>Next</Button></Row>
    </>}
    {!!message && <Txt accessibilityRole="alert">{message}</Txt>}
  </Card>;
}

function ExpiryPanel() {
  const auth=useAuth(); const client=useQueryClient();
  const [confirm,setConfirm]=useState(false); const [busy,setBusy]=useState(false); const [message,setMessage]=useState('');
  if (!hasPermission(auth.identity,'order.manage')) return null;
  async function expire() {
    setBusy(true); setMessage('');
    try { const count=await commerceApi.expire(); setMessage(`${count} expired unpaid orders released.`); setConfirm(false);
      await client.invalidateQueries({queryKey:['commerce']}); await client.invalidateQueries({queryKey:['order-payments']}); await client.invalidateQueries({queryKey:['admin-orders']}); }
    catch(e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }
  return <Card style={{gap:8}}><Txt style={s.h2}>Expired reservations</Txt>
    <Txt>Release up to 20 expired unpaid orders per run. Transfers awaiting bank review are excluded until accounts staff resolve them.</Txt>
    {!confirm ? <Button secondary onPress={()=>setConfirm(true)}>Review release</Button> : <>
      <Txt>Release expired reservations and cancel their unpaid orders?</Txt>
      <Button disabled={busy} onPress={()=>void expire()}>Confirm release</Button>
      <Button secondary disabled={busy} onPress={()=>setConfirm(false)}>Cancel</Button></>}
    {!!message && <Txt accessibilityRole="alert">{message}</Txt>}
  </Card>;
}

export function CommerceManagement({section = 'all'}: {section?: 'all'|'policy'|'inventory'|'payments'|'expiry'}) {
  const auth=useAuth();
  if (!['order.policy','order.manage','inventory.manage','payment.review'].some(p=>hasPermission(auth.identity,p))) return null;
  return <View style={{gap:14}}>
    {section === 'all' ? <Txt style={{fontSize:24,fontWeight:'700'}}>Orders, stock & payments</Txt> : null}
    {['all','policy'].includes(section) ? <PolicyPanel/> : null}
    {['all','inventory'].includes(section) ? <InventoryPanel/> : null}
    {['all','payments'].includes(section) ? <PaymentsPanel/> : null}
    {['all','expiry'].includes(section) ? <ExpiryPanel/> : null}
  </View>;
}
