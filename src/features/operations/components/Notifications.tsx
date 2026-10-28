import { useState } from 'react';
import { Button, Card, Txt, s, c } from '@shared/ui';
import { useAuth } from '@features/auth/ui';
import { Pages, useAction, usePage } from './shared';
import { operationsRpc as rpc, type Notice, type Announcement } from '../services/operations-api';

export function Notifications({ borderColor = c.cardBorder }: { borderColor?: string }) {
 const [offset,setOffset]=useState(0);const list=usePage<Notice[]>('notifications',{p_offset:offset});const preference=usePage<{enabled:boolean}>('whatsapp_preferences');const action=useAction();
 return <Card style={{gap:10, borderColor}}><Txt style={s.h2}>Your updates</Txt><Button secondary onPress={()=>void list.refetch()}>Refresh updates</Button>
 <Txt>Opt in to WhatsApp confirmations and updates for business applications, quotations, orders, payments, support and stock requests. All active staff receive new-order alerts. Other staff alerts follow assigned permissions. You can turn these updates off at any time.</Txt>
 {preference.error?<Txt accessibilityRole="alert">{preference.error.message}</Txt>:preference.data?
 <Button secondary disabled={action.busy} onPress={()=>void action.run(()=>rpc('fti_operations_whatsapp_opt_in',{p_enabled:!preference.data.enabled}))}>
 {preference.data.enabled?'Turn off WhatsApp updates':'Opt in to WhatsApp updates'}</Button>:<Txt>Loading WhatsApp preference...</Txt>}
 {list.isPending?<Txt>Loading updates?</Txt>:list.error?<Txt accessibilityRole="alert">{list.error.message}</Txt>:<>
 {!list.data.length&&<Txt>No updates yet.</Txt>}{list.data.map(n=><Card key={n.id} style={{gap:6, borderColor}}><Txt>{n.payload.title||'Account update'}</Txt><Txt>{new Date(n.created_at).toLocaleString()}</Txt>
 {!!n.payload.entity_id&&<Txt>Reference: {n.payload.entity_id}</Txt>}{!n.read_at&&<Button secondary disabled={action.busy} onPress={()=>void action.run(()=>rpc('fti_operations_read',{p_id:n.id}))}>Mark read</Button>}</Card>)}
 <Pages offset={offset} setOffset={setOffset} count={list.data.length}/></>}
 {!!action.message&&<Txt accessibilityRole="alert">{action.message}</Txt>}</Card>;
}
export function Announcements() {
 const auth=useAuth();const list=usePage<Announcement[]>('announcements',{},!!auth.session);
 if(!auth.session)return null;
 return <Card style={{gap:10}}><Txt style={s.h2}>FTI announcements</Txt>
 {list.error?<Txt accessibilityRole="alert">{list.error.message}</Txt>:list.data?<>
 {!list.data.length&&<Txt>No announcements.</Txt>}{list.data.map(a=><Card key={a.id} style={{gap:5}}><Txt style={s.h2}>{a.title}</Txt><Txt>{a.body}</Txt></Card>)}
 </>:<Txt>Loading announcements...</Txt>}</Card>;
}
