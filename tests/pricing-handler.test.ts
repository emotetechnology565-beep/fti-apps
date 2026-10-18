import test from 'node:test';
import assert from 'node:assert/strict';

test('shared base updates require a verified user and forward that JWT to database permissions', async () => {
  let handler:((request:Request)=>Promise<Response>)|undefined;
  const runtime=globalThis as {Deno?:unknown};
  const previousDeno=runtime.Deno,previousFetch=globalThis.fetch;
  let authorized=true,rpcCalls=0;
  const args={p_market:'market-1',p_grade:'MS',p_uom:'kg',p_base_price:'80',p_revision:1};
  try {
    runtime.Deno={env:{get:(name:string)=>({SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'anon-key'} as Record<string,string>)[name]},serve:(callback:typeof handler)=>{handler=callback;}};
    globalThis.fetch=async(input,init)=>{
      const url=String(input),headers=init?.headers as Record<string,string>;
      assert.equal(headers.Authorization,'Bearer current-user-jwt');
      assert.equal(headers.apikey,'anon-key');
      if(url.endsWith('/auth/v1/user')) return Response.json(authorized?{id:'staff'}:{message:'Expired'},{status:authorized?200:401});
      assert.ok(url.endsWith('/rpc/fti_pricing_grade_base_update'));
      assert.deepEqual(JSON.parse(String(init?.body)),args);
      rpcCalls++;
      return Response.json({base_price:'80.0000',updated_products:2});
    };
    const path='../supabase/functions/pricing/index';await import(path);assert.ok(handler);
    const request=(signedIn=true)=>new Request('https://test.supabase.co/functions/v1/pricing',{
      method:'POST',headers:signedIn?{Authorization:'Bearer current-user-jwt'}:{},
      body:JSON.stringify({operation:'fti_pricing_grade_base_update',arguments:args}),
    });
    assert.equal((await handler(request(false))).status,401);assert.equal(rpcCalls,0);
    const updated=await handler(request());assert.equal(updated.status,200);
    assert.deepEqual((await updated.json()).data,{base_price:'80.0000',updated_products:2});assert.equal(rpcCalls,1);
    authorized=false;
    assert.equal((await handler(request())).status,401);assert.equal(rpcCalls,1);
  } finally {globalThis.fetch=previousFetch;runtime.Deno=previousDeno;}
});
