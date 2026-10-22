// Scheduled utility-message worker. A shared secret protects invocation; the service key stays server-side.
import { importDocumentKey, openDocument } from './crypto.ts';
const env = {
 url: Deno.env.get('SUPABASE_URL') ?? '', service: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
 worker: Deno.env.get('OPERATIONS_WORKER_SECRET') ?? '', token: Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? '',
 waba: Deno.env.get('WHATSAPP_BUSINESS_ID') ?? '', phoneId: Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '',
 version: Deno.env.get('WHATSAPP_GRAPH_VERSION') ?? 'v23.0', language: Deno.env.get('WHATSAPP_TEMPLATE_LANGUAGE') ?? 'en_US',
 zone: Deno.env.get('BUNNY_STORAGE_ZONE') ?? '', storageKey: Deno.env.get('BUNNY_STORAGE_ACCESS_KEY') ?? '',
 storageEndpoint: Deno.env.get('BUNNY_STORAGE_ENDPOINT') ?? '', encryptionKey: Deno.env.get('BUNNY_MEDIA_ENCRYPTION_KEY') ?? '',
};
const parameterCounts: Record<string,number> = {
 fti_order_status_v1:2,fti_support_reply_v1:1,fti_request_received_v1:2,fti_admin_request_v1:2,
 fti_request_approved_v1:2,fti_request_rejected_v1:2,fti_request_update_v1:3,
 fti_category_quotation_v1:3,
};
const names = Object.keys(parameterCounts);
type Job = { id:string; template:string; parameters:string[]; phone:string };
function equalSecret(actual: string, expected: string): boolean {
 if (!expected || actual.length!==expected.length) return false;
 let difference=0;for(let i=0;i<actual.length;i++)difference|=actual.charCodeAt(i)^expected.charCodeAt(i);
 return difference===0;
}
async function rpc<T>(name:string,args:Record<string,unknown>):Promise<T> {
 const response=await fetch(`${env.url}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:env.service,
  Authorization:`Bearer ${env.service}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw new Error(`Database operation failed: ${name}`);
 const body=await response.text();
 return (body.trim()?JSON.parse(body):null) as T;
}
async function approvedTemplates():Promise<string[]> {
 const response=await fetch(`https://graph.facebook.com/${env.version}/${env.waba}/message_templates?fields=name,status,language&limit=100`,{
  headers:{Authorization:`Bearer ${env.token}`},signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error('Meta template status unavailable');
 const data=await response.json();
 return names.filter(name=>data.data?.some((item:{name:string;status:string;language:string})=>
  item.name===name&&item.status==='APPROVED'&&item.language===env.language));
}
async function quotationMedia(jobId: string): Promise<string> {
 const endpoint = new URL(env.storageEndpoint);
 if (endpoint.protocol !== 'https:' || !/^(?:[a-z]{2,3}\.)?storage\.bunnycdn\.com$/.test(endpoint.hostname) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname.replaceAll('/', '') || !env.storageKey)
  throw new Error('Quotation storage is unavailable');
 const asset = await rpc<{ object_key: string; size_bytes: number; storage_zone: string; sha256_hex: string }>('fti_sales_category_quote_delivery', { p_job: jobId });
 if (asset.storage_zone !== env.zone || !/^category-quote-files\/[0-9a-f-]+\/[0-9a-f-]+\.pdf$/.test(asset.object_key) || Number(asset.size_bytes) > 3145728)
  throw new Error('Quotation metadata is invalid');
 const response = await fetch(`${env.storageEndpoint}/${env.zone}/${asset.object_key}`, { headers: { AccessKey: env.storageKey }, signal: AbortSignal.timeout(15000) });
 if (!response.ok) throw new Error('Quotation could not be retrieved');
 const sealed = new Uint8Array(await response.arrayBuffer());
 const bytes = await openDocument(sealed, asset.object_key, await importDocumentKey(env.encryptionKey), 3145728);
 const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(value => value.toString(16).padStart(2, '0')).join('');
 if (bytes.length !== Number(asset.size_bytes) || String.fromCharCode(...bytes.subarray(0,5)) !== '%PDF-' || hash !== asset.sha256_hex)
  throw new Error('Quotation integrity check failed');
 const form = new FormData();
 form.set('messaging_product', 'whatsapp'); form.set('type', 'application/pdf');
 form.set('file', new Blob([bytes.slice()], { type: 'application/pdf' }), 'FTI-quotation.pdf');
 const uploaded = await fetch(`https://graph.facebook.com/${env.version}/${env.phoneId}/media`, { method: 'POST', headers: { Authorization: `Bearer ${env.token}` }, body: form, signal: AbortSignal.timeout(20000) });
 if (!uploaded.ok) throw new Error('Quotation media upload failed');
 const result = await uploaded.json();
 if (typeof result.id !== 'string' || !/^\d+$/.test(result.id)) throw new Error('Quotation media ID is invalid');
 return result.id;
}
Deno.serve(async(request:Request)=>{
 if(request.method!=='POST')return Response.json({code:'METHOD_NOT_ALLOWED'},{status:405});
 if(!equalSecret(request.headers.get('X-Worker-Secret')??'',env.worker))return Response.json({code:'UNAUTHORIZED'},{status:401});
 if(!env.url||!env.service||!env.token||!/^\d+$/.test(env.waba)||!/^\d+$/.test(env.phoneId)||
  !/^v\d+\.\d+$/.test(env.version))return Response.json({code:'UNAVAILABLE'},{status:503});
 try {
  const approved=await approvedTemplates();
  if(!approved.length)return Response.json({claimed:0,sent:0,approved:[]});
  const jobs=await rpc<Job[]>('fti_operations_whatsapp_claim',{p_templates:approved,p_limit:10});
  let sent=0,attention=0;
  for(const job of jobs){
   const allowed=await rpc<boolean>('fti_operations_whatsapp_can_send',{p_id:job.id});
   if(!allowed){
    await rpc('fti_operations_whatsapp_finish',{p_id:job.id,p_result:'failed',p_error:'Recipient unavailable, consent withdrawn or staff permission removed'});
    attention++;continue;
   }
   if(!names.includes(job.template)||!/^\+[1-9][0-9]{7,14}$/.test(job.phone)||
    !Array.isArray(job.parameters)||job.parameters.length!==parameterCounts[job.template]||
    job.parameters.some(v=>typeof v!=='string'||!v||v.length>100)){
    await rpc('fti_operations_whatsapp_finish',{p_id:job.id,p_result:'failed',p_error:'Invalid job parameters'});
    attention++;continue;
   }
   const components: Record<string,unknown>[] = [{type:'body',parameters:job.parameters.map(text=>({type:'text',text}))}];
   if (job.template === 'fti_category_quotation_v1') {
    try {
     const mediaId = await quotationMedia(job.id);
     components.unshift({type:'header',parameters:[{type:'document',document:{id:mediaId,filename:'FTI-quotation.pdf'}}]});
    } catch {
     // No message has been sent yet, so retrying document preparation is safe.
     await rpc('fti_operations_whatsapp_finish',{p_id:job.id,p_result:'retry',p_error:'Quotation PDF preparation failed; no message sent'});
     attention++;continue;
    }
    // Consent/account state may change while fetching the PDF.
    if (!await rpc<boolean>('fti_operations_whatsapp_can_send',{p_id:job.id})) {
     await rpc('fti_operations_whatsapp_finish',{p_id:job.id,p_result:'failed',p_error:'Recipient unavailable before PDF send'});
     attention++;continue;
    }
   }
   const payload={messaging_product:'whatsapp',recipient_type:'individual',to:job.phone.slice(1),type:'template',
    template:{name:job.template,language:{code:env.language},components}};
   try {
    const result=await fetch(`https://graph.facebook.com/${env.version}/${env.phoneId}/messages`,{
     method:'POST',headers:{Authorization:`Bearer ${env.token}`,'Content-Type':'application/json'},
     body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)});
    if(result.ok){
     const data=await result.json();const providerId=data.messages?.[0]?.id;
     if(typeof providerId==='string'&&providerId.startsWith('wamid.')){
      await rpc('fti_operations_whatsapp_finish',{p_id:job.id,p_result:'sent',p_provider_id:providerId});sent++;continue;
     }
     await rpc('fti_operations_whatsapp_finish',{p_id:job.id,p_result:'manual_review',p_error:'Provider accepted request without message ID'});
    }else{
     const state=result.status===429?'retry':result.status>=500?'manual_review':'failed';
     await rpc('fti_operations_whatsapp_finish',{p_id:job.id,p_result:state,p_error:`Meta HTTP ${result.status}`});
    }
   }catch{
    // A timeout may mean Meta accepted the message. Never resend automatically.
    await rpc('fti_operations_whatsapp_finish',{p_id:job.id,p_result:'manual_review',p_error:'Provider response unknown; reconcile before replay'});
   }
   attention++;
  }
  return Response.json({claimed:jobs.length,sent,attention,approved});
 }catch{return Response.json({code:'UNAVAILABLE',message:'Notification worker could not complete'},{status:503});}
});
