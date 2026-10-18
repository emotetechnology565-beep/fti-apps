import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@features/auth/ui';
import { Button, Row } from '@shared/ui';
import { operationsRpc as rpc } from '../services/operations-api';

export function usePage<T>(name:string,args:Record<string,unknown>={},enabled=true) {
 const auth=useAuth();
 return useQuery({queryKey:['operations',name,auth.session?.user.id,args],queryFn:()=>rpc<T>('fti_operations_'+name,args),enabled:enabled&&!!auth.session,retry:false});
}
export function Pages({offset,setOffset,count}:{offset:number;setOffset:(n:number)=>void;count:number}) {
 return <Row><Button secondary disabled={!offset} onPress={()=>setOffset(Math.max(0,offset-24))}>Previous</Button><Button secondary disabled={count<24} onPress={()=>setOffset(offset+24)}>Next</Button></Row>;
}
export function useAction() {
 const client=useQueryClient(); const [busy,setBusy]=useState(false); const [message,setMessage]=useState('');
 async function run(action:()=>Promise<unknown>,done?:()=>void) {
  setBusy(true);setMessage('');
  try {await action();done?.();setMessage('Saved.');await client.invalidateQueries({queryKey:['operations']});await client.invalidateQueries({queryKey:['commerce']});}
  catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 return {busy,message,run};
}
