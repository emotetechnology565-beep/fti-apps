from pathlib import Path
import json,urllib.request,urllib.error,urllib.parse,sys,datetime
p=Path('.env');original=p.read_text(encoding='utf-8-sig');v={}
for line in original.splitlines():
 if '=' in line and not line.lstrip().startswith('#'):
  k,x=line.split('=',1);v[k.strip()]=x.strip().strip(chr(34)).strip(chr(39))
token=v['WHATSAPP_ACCESS_TOKEN'];business=v['WHATSAPP_BUSINESS_ID'];phone=v['WHATSAPP_PHONE_NUMBER_ID'];version=v.get('WHATSAPP_GRAPH_VERSION') or 'v23.0';name=v.get('WHATSAPP_AUTH_TEMPLATE') or 'fti_login_otp';language=v.get('WHATSAPP_TEMPLATE_LANGUAGE') or 'en_US'
def api(path,params=None,payload=None):
 url='https://graph.facebook.com/'+version+'/'+path
 if params:url+='?'+urllib.parse.urlencode(params)
 req=urllib.request.Request(url,data=json.dumps(payload).encode() if payload else None,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(req,timeout=30) as response:return json.load(response)
 except urllib.error.HTTPError as e:
  body=json.load(e).get('error',{});print(json.dumps({'error_code':body.get('code'),'error_subcode':body.get('error_subcode'),'message':str(body.get('message','')).replace(token,'[REDACTED]')}));sys.exit(1)
 except urllib.error.URLError:
  print('Network request failed. Check existing templates before retrying a submission.');sys.exit(2)
phones=api(business+'/phone_numbers',{'fields':'id','limit':100})
if not any(item['id']==phone for item in phones.get('data',[])):raise SystemExit('Account/phone mismatch; submission stopped.')
existing=api(business+'/message_templates',{'name':name,'fields':'id,name,status,category,language,components','limit':100})
matches=[item for item in existing.get('data',[]) if item.get('name')==name and item.get('language')==language]
payload={'name':name,'language':language,'category':'AUTHENTICATION','components':[{'type':'BODY','add_security_recommendation':True},{'type':'BUTTONS','buttons':[{'type':'OTP','otp_type':'COPY_CODE','text':'Copy Code'}]}]}
if matches:
 result=matches[0]
 if result.get('category')!='AUTHENTICATION':raise SystemExit('Existing template category differs; no changes made.')
 action='existing template reused'
else:
 result=api(business+'/message_templates',payload=payload);action='submitted'
 if not result.get('id'):raise SystemExit('Meta did not return a template ID; inspect before retrying.')
record={'action':action,'submitted_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'request':payload,'response':result}
Path('test-results/whatsapp-template-submission.json').write_text(json.dumps(record,indent=2))
settings={'WHATSAPP_AUTH_TEMPLATE':name,'WHATSAPP_TEMPLATE_LANGUAGE':language,'WHATSAPP_GRAPH_VERSION':version}
lines=original.splitlines();seen=set()
for i,line in enumerate(lines):
 key=line.split('=',1)[0].strip() if '=' in line and not line.lstrip().startswith('#') else ''
 if key in settings:lines[i]=key+'='+settings[key];seen.add(key)
for key,value in settings.items():
 if key not in seen:lines.append(key+'='+value)
p.write_text('\n'.join(lines)+'\n',encoding='utf-8')
print(json.dumps({'action':action,'name':name,'language':language,'id':result.get('id'),'status':result.get('status'),'category':result.get('category'),'env_updated':list(settings)}))
