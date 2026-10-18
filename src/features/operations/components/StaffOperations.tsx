import { useState } from 'react';
import { View } from 'react-native';
import { useAuth } from '@features/auth/ui';
import { hasPermission } from '@features/auth';
import { Button, Card, Field, Txt, s } from '@shared/ui';
import { Pages, useAction, usePage } from './shared';
import { DispatchManagement } from './Dispatch';
import { SupportTickets } from './SupportTickets';
import { operationsRpc as rpc, type FailedEvent, type WhatsAppJob, type AuditRow, type DailyReport, type Announcement } from '../services/operations-api';

function FailedEvents() {
 const [offset,setOffset]=useState(0);const list=usePage<FailedEvent[]>('failed_events',{p_offset:offset});const action=useAction();
 return <Card style={{gap:10}}><Txt style={s.h2}>Failed background events</Txt>
 <Button secondary onPress={()=>void list.refetch()}>Refresh failed events</Button>
 {list.isPending?<Txt>Loading failures...</Txt>:list.error?<Txt accessibilityRole="alert">{list.error.message}</Txt>:<>
 {!list.data.length&&<Txt>No failed events.</Txt>}{list.data.map(e=><Card key={e.id} style={{gap:6}}>
 <Txt>{e.event_type} - {e.attempts} attempts</Txt><Txt>{e.last_error||'No error details'}</Txt>
 <Txt>{new Date(e.created_at).toLocaleString()}</Txt>
 <Button secondary disabled={action.busy} onPress={()=>void action.run(()=>rpc('fti_operations_replay',{p_id:e.id}))}>Replay event</Button></Card>)}
 <Pages offset={offset} setOffset={setOffset} count={list.data.length}/></>}
 {!!action.message&&<Txt accessibilityRole="alert">{action.message}</Txt>}</Card>;
}


function WhatsAppAttention() {
 const [offset,setOffset]=useState(0);const [selected,setSelected]=useState<string|null>(null);
 const list=usePage<WhatsAppJob[]>('whatsapp_attention',{p_offset:offset});const action=useAction();
 return <Card style={{gap:10}}><Txt style={s.h2}>WhatsApp delivery review</Txt>
 <Txt>Before replaying a job with an unknown provider response, check Meta message logs. A replay may send a duplicate.</Txt>
 <Button secondary onPress={()=>void list.refetch()}>Refresh delivery review</Button>
 {list.isPending?<Txt>Loading deliveries...</Txt>:list.error?<Txt accessibilityRole="alert">{list.error.message}</Txt>:<>
 {!list.data.length&&<Txt>No deliveries need review.</Txt>}{list.data.map(j=><Card key={j.id} style={{gap:6}}>
 <Txt>{j.template_code} - {j.status} - {j.attempts} attempts</Txt><Txt>{j.last_error||'No error details'}</Txt>
 {selected===j.id?<><Txt>Have you verified this message was not delivered by Meta?</Txt>
 <Button disabled={action.busy} onPress={()=>void action.run(()=>rpc('fti_operations_whatsapp_replay',{p_id:j.id}),()=>setSelected(null))}>Confirm replay</Button>
 <Button secondary onPress={()=>setSelected(null)}>Cancel</Button></>:
 <Button secondary onPress={()=>setSelected(j.id)}>Review replay</Button>}</Card>)}
 <Pages offset={offset} setOffset={n=>{setOffset(n);setSelected(null);}} count={list.data.length}/></>}
 {!!action.message&&<Txt accessibilityRole="alert">{action.message}</Txt>}</Card>;
}



function ContentManagement() {
 const [title,setTitle]=useState('');const [body,setBody]=useState('');const [selected,setSelected]=useState<string|null>(null);const [offset,setOffset]=useState(0);
 const list=usePage<Announcement[]>('content_queue',{p_offset:offset});const action=useAction();
 return <Card style={{gap:10}}><Txt style={s.h2}>Operational announcements</Txt>
 <Txt>Draft informational notices for the app home screen. Publish only approved wording.</Txt>
 <Field label="Title" placeholder="e.g. Holiday dispatch schedule" value={title} onChangeText={setTitle}/><Field label="Body" placeholder="e.g. Dispatches resume on the next working day." value={body} onChangeText={setBody} multiline/>
 <Button disabled={action.busy||title.trim().length<5||title.length>120||body.trim().length<10||body.length>2000}
 onPress={()=>void action.run(()=>rpc('fti_operations_content_save',{p_title:title,p_body:body}),()=>{setTitle('');setBody('');})}>Save draft</Button>
 {list.error?<Txt accessibilityRole="alert">{list.error.message}</Txt>:list.data?<>
 {!list.data.length&&<Txt>No announcements yet.</Txt>}{list.data.map(a=><Card key={a.id} style={{gap:6}}>
 <Txt style={s.h2}>{a.title} - {a.status}</Txt><Txt>{a.body}</Txt>
 {['draft','published'].includes(a.status||'')&&<>{selected===a.id?<>
 <Txt>Confirm this announcement should {a.status==='draft'?'appear':'be removed'} on the app home screen?</Txt>
 <Button disabled={action.busy} onPress={()=>void action.run(()=>rpc('fti_operations_content_publish',{p_id:a.id,p_publish:a.status==='draft'}),()=>setSelected(null))}>Confirm</Button>
 <Button secondary onPress={()=>setSelected(null)}>Cancel</Button></>:<Button secondary onPress={()=>setSelected(a.id)}>{a.status==='draft'?'Review publication':'Review archive'}</Button>}</>}
 </Card>)}<Pages offset={offset} setOffset={n=>{setOffset(n);setSelected(null);}} count={list.data.length}/></>:<Txt>Loading content...</Txt>}
 {!!action.message&&<Txt accessibilityRole="alert">{action.message}</Txt>}</Card>;
}

function AuditAndReports() {
 const [offset,setOffset]=useState(0);
 const audit=usePage<AuditRow[]>('audit',{p_offset:offset});
 const today=new Date();const end=today.toISOString().slice(0,10);
 const start=new Date(today.getTime()-29*86400000).toISOString().slice(0,10);
 const report=usePage<DailyReport>('daily',{p_from:start,p_to:end});
 return <View style={{gap:12}}><Card style={{gap:8}}><Txt style={s.h2}>Last 30 days</Txt>
 <Txt>Order values below are quotation snapshots, not recognized revenue.</Txt>
 {report.error?<Txt accessibilityRole="alert">{report.error.message}</Txt>:report.data?<>
 {report.data.orders.map(d=><Txt key={d.report_day}>{d.report_day}: {d.orders_created} orders, INR {d.quoted_order_value}</Txt>)}
 {!report.data.orders.length&&<Txt>No orders in this period.</Txt>}
 {report.data.tickets.map(d=><Txt key={d.report_day}>{d.report_day}: {d.tickets_created} support tickets</Txt>)}
 {report.data.payments.map(d=><Txt key={d.report_day}>{d.report_day}: {d.transfer_claims} transfer claims, {d.verified_transfers} currently verified</Txt>)}
 </>:<Txt>Loading daily totals...</Txt>}</Card>
 <Card style={{gap:8}}><Txt style={s.h2}>Recent audit activity</Txt>
 {audit.error?<Txt accessibilityRole="alert">{audit.error.message}</Txt>:audit.data?<>
 {!audit.data.length&&<Txt>No audit entries yet.</Txt>}{audit.data.map(a=><Txt key={a.id}>{new Date(a.created_at).toLocaleString()} - {a.action} - {a.resource_type} {a.resource_id||''}</Txt>)}
 <Pages offset={offset} setOffset={setOffset} count={audit.data.length}/></>:<Txt>Loading audit activity...</Txt>}</Card></View>;
}

export function OperationsManagement({section = 'all'}: {section?: 'all'|'dispatch'|'jobs'|'reports'|'support'|'content'}) {
 const auth=useAuth();return <View style={{gap:20}}>
 {hasPermission(auth.identity,'operations.manage')&&<>
 {['all','dispatch'].includes(section)&&<DispatchManagement/>}
 {['all','jobs'].includes(section)&&<><FailedEvents/><WhatsAppAttention/></>}
 {['all','reports'].includes(section)&&<AuditAndReports/>}</>}
 {['all','support'].includes(section)&&hasPermission(auth.identity,'support.manage')&&<SupportTickets staff/>}
 {['all','content'].includes(section)&&hasPermission(auth.identity,'content.manage')&&<ContentManagement/>}</View>;
}
