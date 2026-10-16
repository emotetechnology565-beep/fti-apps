const allowed=new Set(['fti_identity_me','fti_save_profile','fti_apply_business','fti_review_queue','fti_review_business','fti_request_account_deletion']);
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'private, no-store'};
Deno.serve(async(request:Request)=>{
 const requestId=crypto.randomUUID();const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{...cors,'X-Request-Id':requestId}});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(request.method!=='POST')return json({code:'METHOD_NOT_ALLOWED',message:'POST required',requestId},405);
 const authorization=request.headers.get('Authorization')??'';
 if(!authorization.startsWith('Bearer '))return json({code:'UNAUTHENTICATED',message:'Sign in required',requestId},401);
 const url=Deno.env.get('SUPABASE_URL');const apikey=Deno.env.get('SUPABASE_ANON_KEY');
 if(!url||!apikey)return json({code:'UNAVAILABLE',message:'Account service is unavailable',requestId},503);
 const headers={Authorization:authorization,apikey,'Content-Type':'application/json'};
 try{
 // Verify the user with Auth, then preserve their JWT for the database's own checks.
 const verified=await fetch(`${url}/auth/v1/user`,{headers,signal:AbortSignal.timeout(8000)});
 if(!verified.ok)return json({code:'UNAUTHENTICATED',message:'Session expired; sign in again',requestId},401);
 const user=await verified.json();if(!user.id)return json({code:'UNAUTHENTICATED',message:'Sign in required',requestId},401);
 const raw=await request.text();if(raw.length>16384)return json({code:'INVALID_INPUT',message:'Request too large',requestId},413);
 const body=JSON.parse(raw);
 if(!allowed.has(body.operation))return json({code:'INVALID_OPERATION',message:'Unsupported operation',requestId},400);
 const response=await fetch(`${url}/rest/v1/rpc/${body.operation}`,{method:'POST',headers,body:JSON.stringify(body.arguments??{}),signal:AbortSignal.timeout(8000)});
 const data=response.status===204?null:await response.json();
 if(!response.ok){const status=data.code==='42501'?403:data.code==='40001'||data.code==='23505'?409:422;
 const safeMessage=data.code==='23505'?'These business details are already registered. Contact FTI for help.': ['42501','40001','22023'].includes(data.code)?data.message:'Account request could not be completed.';
 return json({code:data.code,message:safeMessage,requestId},status);}
 return json({data,requestId});
 }catch{return json({code:'UNAVAILABLE',message:'Unable to process the account request',requestId},503);}
});
