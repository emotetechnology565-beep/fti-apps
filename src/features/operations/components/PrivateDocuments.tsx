import { useState } from 'react';
import { Platform, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Button, Card, Txt, s } from '@shared/ui';
import { operationsMediaApi } from '../services/operations-api';
import { useAuth } from '@features/auth/ui';

type Kind = 'order_pod' | 'order_mtc' | 'support_ticket';
const supported = ['application/pdf','image/jpeg','image/png'];
const extension = (mime:string) => mime==='application/pdf'?'pdf':mime==='image/png'?'png':'jpg';
export function PrivateDocuments({kind,entityId,canUpload}:{kind:Kind;entityId:string;canUpload:boolean}) {
 const auth=useAuth();const client=useQueryClient();const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const docs=useQuery({queryKey:['operations','documents',auth.session?.user.id,kind,entityId],queryFn:()=>operationsMediaApi.list(kind,entityId),retry:false});
 async function upload() {
  setError('');
  try {
   const picked=await DocumentPicker.getDocumentAsync({type:supported,copyToCacheDirectory:true,base64:true});
   if(picked.canceled)return;
   const asset=picked.assets[0];
   if(!asset||!asset.mimeType||!supported.includes(asset.mimeType)||!asset.size||asset.size>3*1024*1024)
    throw new Error('Choose a PDF, JPEG or PNG file up to 3 MB.');
   setBusy(true);
   const base64=Platform.OS==='web'?asset.base64??await asset.file?.arrayBuffer().then(buffer=>{
    const bytes=new Uint8Array(buffer);let raw='';bytes.forEach(b=>{raw+=String.fromCharCode(b);});return btoa(raw);
   }):await new File(asset.uri).base64();
   if(!base64)throw new Error('Could not read this file. Please choose it again.');
   await operationsMediaApi.upload(kind,entityId,asset.mimeType,base64);
   await client.invalidateQueries({queryKey:['operations','documents',auth.session?.user.id,kind,entityId]});
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function download(id:string) {
  setBusy(true);setError('');
  try {
   const data=await operationsMediaApi.download(id);
   if(!supported.includes(data.mimeType))throw new Error('Unsupported document type.');
   if(Platform.OS==='web'){
    const bytes=Uint8Array.from(atob(data.base64),c=>c.charCodeAt(0));
    const url=URL.createObjectURL(new Blob([bytes],{type:data.mimeType}));
    const link=document.createElement('a');link.href=url;link.download=`fti-${kind}-${id}.${extension(data.mimeType)}`;
    document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
   }else{
    const file=new File(Paths.cache,`fti-${kind}-${id}.${extension(data.mimeType)}`);
    await file.write(data.base64,{encoding:'base64'});
    if(!await Sharing.isAvailableAsync())throw new Error('No document viewer is available.');
    await Sharing.shareAsync(file.uri,{mimeType:data.mimeType});
   }
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 const title=kind==='order_pod'?'Proof of delivery':kind==='order_mtc'?'Mill test certificates':'Support documents';
 return <Card style={{gap:10}}><Txt style={s.h2}>{title}</Txt><Txt>Private PDF, JPEG or PNG, up to 3 MB.</Txt>
 {docs.isPending?<Txt>Loading documents...</Txt>:docs.error?<Txt accessibilityRole="alert">{docs.error.message}</Txt>:<>
 {!docs.data.length&&<Txt>No documents yet.</Txt>}{docs.data.map(d=><View key={d.id} style={{gap:5}}>
 <Txt>{d.mime_type} - {Math.ceil(d.size_bytes/1024)} KB - {new Date(d.created_at).toLocaleString()}</Txt>
 <Button secondary disabled={busy} onPress={()=>void download(d.id)}>Open document</Button></View>)}
 {canUpload&&docs.data.length<10&&<Button secondary disabled={busy} onPress={()=>void upload()}>{busy?'Working...':'Add document'}</Button>}</>}
 {!!error&&<Txt accessibilityRole="alert">{error}</Txt>}</Card>;
}
