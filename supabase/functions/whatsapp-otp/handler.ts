export type WhatsAppConfig={secret:string;token:string;phoneId:string;template:string;language:string;graphVersion:string};
type Verify=(secret:string,payload:string,headers:Record<string,string>)=>unknown;
export async function handleWhatsAppHook(request:Request,config:WhatsAppConfig,verify:Verify,send:typeof fetch=fetch){
 const fail=(status:number,message:string)=>Response.json({error:{http_code:status,message}},{status});
 if(request.method!=='POST')return fail(405,'Method not allowed');
 if(Object.values(config).some(value=>!value)||!/^v\d+\.\d+$/.test(config.graphVersion)||!/^\d+$/.test(config.phoneId))return fail(503,'WhatsApp authentication is unavailable');
 const raw=await request.text();if(raw.length>32768)return fail(413,'Request too large');
 let event:{user?:{phone?:string};sms?:{otp?:string}};
 try{event=verify(config.secret,raw,Object.fromEntries(request.headers)) as typeof event;}catch{return fail(401,'Invalid hook signature');}
 const phone=event?.user?.phone?.replace(/^\+/,'');const otp=event?.sms?.otp;
 if(!phone||!/^91[6-9]\d{9}$/.test(phone)||!otp||!/^\d{6}$/.test(otp))return fail(400,'Invalid authentication request');
 try{
 const response=await send(`https://graph.facebook.com/${config.graphVersion}/${config.phoneId}/messages`,{
 method:'POST',headers:{Authorization:`Bearer ${config.token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(4000),
 body:JSON.stringify({messaging_product:'whatsapp',to:phone,type:'template',template:{name:config.template,language:{code:config.language},components:[
 {type:'body',parameters:[{type:'text',text:otp}]},
 {type:'button',sub_type:'url',index:'0',parameters:[{type:'text',text:otp}]},
 ]}})});
 if(!response.ok)return fail(502,'WhatsApp delivery could not be accepted');
 const result=await response.json();
 if(!result.messages?.[0]?.id)return fail(502,'WhatsApp delivery could not be accepted');
 // Never log phone numbers, OTPs, provider payloads or credentials.
 return Response.json({});
 }catch{return fail(502,'WhatsApp delivery is temporarily unavailable');}
}
