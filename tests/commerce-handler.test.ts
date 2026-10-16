import test from 'node:test';
import assert from 'node:assert/strict';

test('commerce dashboard function forwards only verified buyer JWTs to restricted RPCs', async () => {
  let handler: ((request: Request) => Promise<Response>) | undefined;
  const originalDeno=(globalThis as {Deno?:unknown}).Deno;
  const originalFetch=globalThis.fetch;
  let calls=0;
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
      if(url.endsWith('/rpc/fti_commerce_my')) return Response.json([]);
      if(url.endsWith('/rpc/fti_commerce_policy_set')) return Response.json({code:'42501',message:'Permission denied'},{status:403});
      throw new Error(`Unexpected request: ${url}`);
    };
    const functionPath='../deployment/phase6/02_commerce';
    await import(functionPath);
    assert.ok(handler);
    const request=(operation:string,authorized=true)=>new Request('https://test.supabase.co/functions/v1/commerce',{
      method:'POST',headers:authorized?{Authorization:'Bearer buyer-jwt'}:{},body:JSON.stringify({operation,arguments:{}}),
    });
    assert.equal((await handler(request('fti_commerce_my',false))).status,401);
    assert.equal(calls,0);
    assert.equal((await handler(request('anything_else'))).status,400);
    const my=await handler(request('fti_commerce_my'));
    assert.equal(my.status,200);
    assert.deepEqual((await my.json()).data,[]);
    const blocked=await handler(request('fti_commerce_policy_set'));
    assert.equal(blocked.status,403);
    assert.equal((await blocked.json()).message,'Permission denied');
    assert.equal(calls,5);
  } finally {
    globalThis.fetch=originalFetch;
    (globalThis as {Deno?:unknown}).Deno=originalDeno;
  }
});
