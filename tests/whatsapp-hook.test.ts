import test from 'node:test';
import assert from 'node:assert/strict';
import { Webhook } from 'standardwebhooks';
import { handleWhatsAppHook, type WhatsAppConfig } from '../supabase/functions/whatsapp-otp/handler';
const secret='whsec_'+Buffer.alloc(32,7).toString('base64');
const config:WhatsAppConfig={secret,token:'isolated-test-token',phoneId:'1',template:'test_auth',language:'en',graphVersion:'v23.0'};
const wh=new Webhook(secret);
const verify=(s:string,body:string,headers:Record<string,string>)=>new Webhook(s).verify(body,headers);
function request(body:string,date=new Date(),signature?:string){const id='isolated-test-event';return new Request('http://localhost/hook',{method:'POST',body,headers:{'webhook-id':id,'webhook-timestamp':String(Math.floor(date.getTime()/1000)),'webhook-signature':signature??wh.sign(id,date,body)}});}
const payload=JSON.stringify({user:{phone:'+919000000001'},sms:{otp:'123456'}});
test('WhatsApp hook rejects forged and expired signatures before delivery',async()=>{
 let calls=0;const send:typeof fetch=async()=>{calls++;return Response.json({});};
 assert.equal((await handleWhatsAppHook(request(payload,new Date(),'v1,invalid'),config,verify,send)).status,401);
 assert.equal((await handleWhatsAppHook(request(payload,new Date(Date.now()-600000)),config,verify,send)).status,401);
 assert.equal(calls,0);
});
test('signed hook sends approved template with matching body/button code without exposing it in response',async()=>{
 const send:typeof fetch=async(url,init)=>{assert.equal(String(url),'https://graph.facebook.com/v23.0/1/messages');const body=JSON.parse(init!.body as string);assert.equal(body.messaging_product,'whatsapp');assert.equal(body.template.components[0].parameters[0].text,body.template.components[1].parameters[0].text);return Response.json({messages:[{id:'test-message'}]});};
 const result=await handleWhatsAppHook(request(payload),config,verify,send);assert.equal(result.status,200);assert.equal(await result.text(),'{}');
});
test('hook handles provider failures, malformed input and missing configuration without leaking secrets',async()=>{
 const failed:typeof fetch=async()=>Response.json({token:'sensitive-provider-error'},{status:400});
 const result=await handleWhatsAppHook(request(payload),config,verify,failed);assert.equal(result.status,502);assert.ok(!(await result.text()).includes('sensitive-provider-error'));
 assert.equal((await handleWhatsAppHook(request('{}'),config,verify,failed)).status,400);
 assert.equal((await handleWhatsAppHook(request(payload),{...config,secret:''},verify,failed)).status,503);
});
