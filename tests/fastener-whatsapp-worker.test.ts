import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';

test('Worker uploads a rendered PNG and attaches it to both fastener templates', async () => {
  const globals = globalThis as unknown as Record<string, unknown>;
  const previousDeno = globals.Deno;
  const previousFetch = globalThis.fetch;
  let handler: ((request: Request) => Promise<Response>) | undefined;
  const settings: Record<string, string> = {
    SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service',
    OPERATIONS_WORKER_SECRET: 'test-worker', WHATSAPP_ACCESS_TOKEN: 'test-token',
    WHATSAPP_BUSINESS_ID: '123', WHATSAPP_PHONE_NUMBER_ID: '456',
    WHATSAPP_GRAPH_VERSION: 'v23.0', WHATSAPP_TEMPLATE_LANGUAGE: 'en_US',
  };
  globals.Deno = {env: {get: (name: string) => settings[name]}, readFile,
    serve: (callback: typeof handler) => {handler = callback;}};
  const definitions = JSON.parse(readFileSync('deployment/fastener-dimensions/hex-source-definitions.json', 'utf8'));
  const definition = definitions.find((row: {shape:string;size:string}) => row.shape === 'hex-bolt' && row.size === 'M10');
  const templates = ['fti_fastener_received_v1','fti_fastener_admin_v1'];
  const sent: Record<string, unknown>[] = [];
  let uploaded = 0;
  const finished: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/message_templates?')) return Response.json({data:templates.map(name => ({name,status:'APPROVED',language:'en_US'}))});
    if (url.endsWith('/media')) {
      const form = init?.body as FormData;
      const file = form.get('file') as Blob;
      const bytes = new Uint8Array(await file.arrayBuffer());
      assert.deepEqual(Array.from(bytes.slice(0,8)),[137,80,78,71,13,10,26,10]);
      assert.equal(file.type,'image/png'); uploaded++;
      return Response.json({id:'789'});
    }
    if (url.endsWith('/messages')) {
      sent.push(JSON.parse(String(init?.body)));return Response.json({messages:[{id:'wamid.test'}]});
    }
    const operation = url.split('/').pop();
    const args = JSON.parse(String(init?.body));
    if (operation === 'fti_operations_whatsapp_claim') return Response.json([]);
    if (operation === 'fti_fastener_claim') return Response.json(templates.map((template,i) => ({id:String(i),template,phone:'+919000000001',parameters:Array.from({length:11},(_,j)=>'sample '+j)})));
    if (operation === 'fti_fastener_can_send') return Response.json(true);
    if (operation === 'fti_fastener_drawing_delivery') return Response.json({definition,input:{length:60}});
    if (operation === 'fti_fastener_finish') {assert.equal(args.p_result,'sent');finished.push(args.p_id);return Response.json(null);}
    throw new Error('Unexpected operation: '+operation);
  }) as typeof fetch;
  try {
    const modulePath = '../supabase/functions/operations-whatsapp/index.ts';
    await import(modulePath);
    assert.ok(handler);
    const response = await handler(new Request('https://worker.test',{method:'POST',headers:{'X-Worker-Secret':'test-worker'}}));
    assert.equal(response.status,200);
    assert.deepEqual((await response.json()).sent,2);
    assert.equal(uploaded,2);assert.equal(finished.length,2);
    for (let i=0;i<sent.length;i++) {
      const template = sent[i].template as {name:string;components:{type:string;parameters:{type:string;image?:{id:string}}[]}[]};
      assert.equal(template.name,templates[i]);
      assert.deepEqual(template.components[0],{type:'header',parameters:[{type:'image',image:{id:'789'}}]});
      assert.equal(template.components[1].parameters.length,11);
    }
  } finally {globalThis.fetch=previousFetch;globals.Deno=previousDeno;}
});
