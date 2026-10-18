import { useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Field, Txt, s } from '@shared/ui';
import { PrivateDocuments } from './PrivateDocuments';
import { Pages, useAction, usePage } from './shared';
import { operationsRpc as rpc, type DispatchOrder, type Shipment, type Report } from '../services/operations-api';

export function ShipmentTracking({orderId}:{orderId:string}) {
 const list=usePage<Shipment[]>('shipments',{p_order:orderId});
 return <Card style={{gap:8}}><Txt style={s.h2}>Shipment tracking</Txt><Txt>Order ID: {orderId}</Txt>
 {list.isPending?<Txt>Loading shipment?</Txt>:list.error?<Txt accessibilityRole="alert">{list.error.message}</Txt>:<>
 {!list.data.length&&<Txt>No dispatch recorded.</Txt>}{list.data.map(s=><View key={s.id}><Txt>{s.status} ? {s.carrier}</Txt><Txt>LR / tracking: {s.tracking_number}</Txt>{!!s.vehicle_number&&<Txt>Vehicle: {s.vehicle_number}</Txt>}{!!s.delivery_note&&<Txt>Delivery confirmation: {s.delivery_note}</Txt>}</View>)}</>}
 <PrivateDocuments kind="order_mtc" entityId={orderId} canUpload={false}/>
 <PrivateDocuments kind="order_pod" entityId={orderId} canUpload={false}/>
 </Card>;
}
function DispatchEditor({order}:{order:DispatchOrder}) {
 const [carrier,setCarrier]=useState('');const [tracking,setTracking]=useState('');const [vehicle,setVehicle]=useState('');const [note,setNote]=useState('');const [confirm,setConfirm]=useState(false);const action=useAction();
 const shipped=order.status==='shipped';
 return <Card style={{gap:10}}><Txt style={s.h2}>{order.order_no} ? {order.status}</Txt><ShipmentTracking orderId={order.id}/>
 {order.status!=='delivered'&&<>{shipped?<Field label="Delivery evidence / recipient confirmation reference" value={note} onChangeText={setNote} multiline/>:<>
 <Field label="Transporter / carrier" value={carrier} onChangeText={setCarrier}/><Field label="LR / tracking reference" value={tracking} onChangeText={setTracking}/><Field label="Vehicle number (optional)" value={vehicle} onChangeText={setVehicle}/></>}
 {!confirm?<Button disabled={shipped?note.trim().length<5:carrier.trim().length<2||tracking.trim().length<2} onPress={()=>setConfirm(true)}>Review {shipped?'delivery':'dispatch'}</Button>:<>
 <Txt>{shipped?'Confirm receipt against the evidence entered?':'Confirm the entire order has left with this transporter? Check shipping documents before confirming.'}</Txt>
 <Button disabled={action.busy} onPress={()=>void action.run(()=>shipped?rpc('fti_operations_deliver',{p_order:order.id,p_note:note}):rpc('fti_operations_dispatch',{p_order:order.id,p_carrier:carrier,p_tracking:tracking,p_vehicle:vehicle}),()=>setConfirm(false))}>Confirm {shipped?'delivery':'dispatch'}</Button>
 <Button secondary disabled={action.busy} onPress={()=>setConfirm(false)}>Cancel</Button></>}</>}
 <PrivateDocuments kind="order_mtc" entityId={order.id} canUpload={true}/>
 {shipped&&<PrivateDocuments kind="order_pod" entityId={order.id} canUpload={true}/>}
 {!!action.message&&<Txt accessibilityRole="alert">{action.message}</Txt>}</Card>;
}

export function DispatchManagement() {
 const [offset,setOffset]=useState(0);const [selected,setSelected]=useState<string|null>(null);const list=usePage<DispatchOrder[]>('orders',{p_offset:offset});const report=usePage<Report>('report');
 const order=list.data?.find(o=>o.id===selected);
 return <View style={{gap:12}}><Txt style={s.h2}>Operations overview</Txt>
 <Button secondary onPress={()=>{void list.refetch();void report.refetch();}}>Refresh operations</Button>
 {report.error?<Txt accessibilityRole="alert">{report.error.message}</Txt>:report.data?<Card><Txt>Open tickets: {report.data.open_tickets} ? Bank reviews: {report.data.transfers_awaiting_review} ? Failed events: {report.data.failed_outbox_events}</Txt>{Object.entries(report.data.orders_by_status).map(([status,count])=><Txt key={status}>{status}: {count}</Txt>)}</Card>:<Txt>Loading totals?</Txt>}
 {list.isPending?<Txt>Loading orders?</Txt>:list.error?<Txt accessibilityRole="alert">{list.error.message}</Txt>:<>
 {!list.data.length&&<Txt>No confirmed orders ready for tracking.</Txt>}{list.data.map(o=><Button key={o.id} secondary onPress={()=>setSelected(o.id)}>{o.order_no} ? {o.status}</Button>)}
 <Pages offset={offset} setOffset={n=>{setSelected(null);setOffset(n);}} count={list.data.length}/></>}
 {order&&<DispatchEditor key={order.id+order.status} order={order}/>}</View>;
}
