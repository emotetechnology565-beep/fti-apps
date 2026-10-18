import test from 'node:test';
import assert from 'node:assert/strict';

test('operations dashboard function forwards only verified buyer JWTs to restricted RPCs', async () => {
  let handler: ((request: Request) => Promise<Response>) | undefined;
  const originalDeno=(globalThis as {Deno?:unknown}).Deno;
  const originalFetch=globalThis.fetch;
  let calls=0;
  let consentResponse = () => new Response(null, {status: 204});
  try {
    (globalThis as {Deno?:unknown}).Deno={
      env:{get:(name:string)=>({SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'test-anon'} as Record<string,string>)[name]},
      serve:(callback:typeof handler)=>{handler=callback;},
    };
    globalThis.fetch=async (input,init)=>{
      calls++;
      const url=String(input);
      assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer buyer-jwt');
      assert.equal((init?.headers as Record<string,string>).apikey,'test-anon');
      if(url.endsWith('/auth/v1/user')) return Response.json({id:'buyer'});
      if(url.endsWith('/rpc/fti_operations_notifications')) return Response.json([]);
      if(url.endsWith('/rpc/fti_operations_whatsapp_opt_in')) {
        assert.deepEqual(JSON.parse(String(init?.body)), {p_enabled:true});
        return consentResponse();
      }
      if(url.endsWith('/rpc/fti_operations_dispatch')) return Response.json({code:'42501',message:'Permission denied'},{status:403});
      throw new Error(`Unexpected request: ${url}`);
    };
    const functionPath='../deployment/phase7/02_operations';
    await import(functionPath);
    assert.ok(handler);
    const request=(operation:string,authorized=true,args:Record<string,unknown>={})=>new Request('https://test.supabase.co/functions/v1/operations',{
      method:'POST',headers:authorized?{Authorization:'Bearer buyer-jwt'}:{},body:JSON.stringify({operation,arguments:args}),
    });
    assert.equal((await handler(request('fti_operations_notifications',false))).status,401);
    assert.equal(calls,0);
    assert.equal((await handler(request('anything_else'))).status,400);
    const my=await handler(request('fti_operations_notifications'));
    assert.equal(my.status,200);
    assert.deepEqual((await my.json()).data,[]);
    const blocked=await handler(request('fti_operations_dispatch'));
    assert.equal(blocked.status,403);
    assert.equal((await blocked.json()).message,'Permission denied');
    assert.equal(calls,5);
    for (const response of [
      () => new Response(null, {status:204}),
      () => new Response('', {headers:{'Content-Type':'application/json'}}),
      () => Response.json(null),
    ]) {
      consentResponse=response;
      const saved=await handler(new Request('https://test.supabase.co/functions/v1/operations',{
        method:'POST',headers:{Authorization:'Bearer buyer-jwt'},
        body:JSON.stringify({operation:'fti_operations_whatsapp_opt_in',arguments:{p_enabled:true}}),
      }));
      assert.equal(saved.status,200);
      assert.equal((await saved.json()).data,null);
    }
    consentResponse=()=>Response.json({code:'22023',message:'A verified WhatsApp phone number is required'},{status:400});
    const invalid=await handler(request('fti_operations_whatsapp_opt_in',true,{p_enabled:true}));
    assert.equal(invalid.status,422);
    assert.match((await invalid.json()).message,/verified WhatsApp/);
  } finally {
    globalThis.fetch=originalFetch;
    (globalThis as {Deno?:unknown}).Deno=originalDeno;
  }
});
