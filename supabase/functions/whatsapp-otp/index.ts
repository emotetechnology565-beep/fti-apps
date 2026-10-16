import { Webhook } from 'npm:standardwebhooks@1.0.0';
import { handleWhatsAppHook } from './handler.ts';
Deno.serve((request:Request)=>handleWhatsAppHook(request,{
 secret:Deno.env.get('SEND_SMS_HOOK_SECRET')??'',
 token:Deno.env.get('WHATSAPP_ACCESS_TOKEN')??'',
 phoneId:Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')??'',
 template:Deno.env.get('WHATSAPP_AUTH_TEMPLATE')??'',
 language:Deno.env.get('WHATSAPP_TEMPLATE_LANGUAGE')??'',
 graphVersion:Deno.env.get('WHATSAPP_GRAPH_VERSION')??'',
},(secret,payload,headers)=>new Webhook(secret.replace(/^v1,/, '')).verify(payload,headers)));
