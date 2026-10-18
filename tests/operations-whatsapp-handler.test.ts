import test from 'node:test';
import assert from 'node:assert/strict';

test('WhatsApp worker requires its secret and approved templates, then records provider ID',async()=>{
 let handler:((request:Request)=>Promise<Response>)|undefined;
 const originalDeno=(globalThis as {Deno?:unknown}).Deno;const originalFetch=globalThis.fetch;
 const calls:string[]=[];let approved=false;
 let template='fti_order_status_v1';let parameters=['FTI-1','dispatched'];let allowed=true;
 try{
  const values:Record<string,string>={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-only',
   OPERATIONS_WORKER_SECRET:'worker-secret',WHATSAPP_ACCESS_TOKEN:'meta-only',WHATSAPP_BUSINESS_ID:'12345',
   WHATSAPP_PHONE_NUMBER_ID:'67890',WHATSAPP_GRAPH_VERSION:'v23.0',WHATSAPP_TEMPLATE_LANGUAGE:'en_US'};
  (globalThis as {Deno?:unknown}).Deno={env:{get:(name:string)=>values[name]},serve:(callback:typeof handler)=>{handler=callback;}};
  globalThis.fetch=async(input,init)=>{
   const url=String(input);calls.push(url);
   if(url.includes('/message_templates')){
    assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer meta-only');
    return Response.json({data:[{name:template,status:approved?'APPROVED':'PENDING',language:'en_US'}]});
   }
   if(url.endsWith('/rpc/fti_operations_whatsapp_claim')){
    assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer service-only');
    assert.deepEqual(JSON.parse(String(init?.body)).p_templates,[template]);
    return Response.json([{id:'job-1',template,phone:'+916398792951',parameters}]);
   }
   if(url.endsWith('/rpc/fti_operations_whatsapp_can_send'))return Response.json(allowed);
   if(url.endsWith('/messages')){
    const body=JSON.parse(String(init?.body));assert.equal(body.to,'916398792951');
    assert.equal(body.template.name,template);
    assert.deepEqual(body.template.components[0].parameters,parameters.map(text=>({type:'text',text})));
    return Response.json({messages:[{id:'wamid.test'}]});
   }
   if(url.endsWith('/rpc/fti_operations_whatsapp_finish')){
    const body=JSON.parse(String(init?.body));
    if(!allowed||parameters.length===0)assert.equal(body.p_result,'failed');
    else {assert.equal(body.p_result,'sent');assert.equal(body.p_provider_id,'wamid.test');}
    return new Response(null,{status:204});
   }
   throw new Error(`Unexpected request: ${url}`);
  };
  const path='../supabase/functions/operations-whatsapp/index';await import(path);assert.ok(handler);
  const request=(secret?:string)=>new Request('https://test.supabase.co/functions/v1/operations-whatsapp',{
   method:'POST',headers:secret?{'X-Worker-Secret':secret}:{}});
  assert.equal((await handler(request())).status,401);assert.equal(calls.length,0);
  const pending=await handler(request('worker-secret'));assert.equal(pending.status,200);
  assert.deepEqual(await pending.json(),{claimed:0,sent:0,approved:[]});
  approved=true;const sent=await handler(request('worker-secret'));assert.equal(sent.status,200);
  assert.equal((await sent.json()).sent,1);assert.equal(calls.filter(c=>c.endsWith('/messages')).length,1);
  for(const name of ['fti_request_received_v1','fti_admin_request_v1','fti_request_approved_v1','fti_request_rejected_v1','fti_request_update_v1']){
   template=name;parameters=['business verification','request-reference'];
   if(name==='fti_request_update_v1')parameters.push('under review');
   assert.equal((await (await handler(request('worker-secret'))).json()).sent,1);
  }
  const sends=calls.filter(c=>c.endsWith('/messages')).length;
  allowed=false;assert.equal((await (await handler(request('worker-secret'))).json()).sent,0);
  allowed=true;parameters=[];assert.equal((await (await handler(request('worker-secret'))).json()).sent,0);
  assert.equal(calls.filter(c=>c.endsWith('/messages')).length,sends);
 }finally{globalThis.fetch=originalFetch;(globalThis as {Deno?:unknown}).Deno=originalDeno;}
});
