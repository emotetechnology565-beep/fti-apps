from pathlib import Path
import json,urllib.request,urllib.error,urllib.parse,sys
v={}
for line in Path('.env').read_text(encoding='utf-8-sig').splitlines():
 if '=' in line and not line.lstrip().startswith('#'):
  k,x=line.split('=',1);v[k.strip()]=x.strip().strip(chr(34)).strip(chr(39))
token=v.get('WHATSAPP_ACCESS_TOKEN','');version=v.get('WHATSAPP_GRAPH_VERSION') or 'v23.0';business=v.get('WHATSAPP_BUSINESS_ID','');phone=v.get('WHATSAPP_PHONE_NUMBER_ID','')
def get(path,params):
 url='https://graph.facebook.com/'+version+'/'+path+'?'+urllib.parse.urlencode(params)
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers={'Authorization':'Bearer '+token}),timeout=30) as r: return json.load(r)
 except urllib.error.HTTPError as e:
  error=json.load(e).get('error',{});print(json.dumps({'error_code':error.get('code'),'message':str(error.get('message','')).replace(token,'[REDACTED]')}));sys.exit(1)
phones=get(business+'/phone_numbers',{'fields':'id,verified_name,display_phone_number','limit':100})
match=[p for p in phones.get('data',[]) if p['id']==phone]
if not match: print('Configured phone ID is not in this WhatsApp Business Account. No changes made.');sys.exit(2)
print(json.dumps({'account_phone_matches':True,'verified_name':match[0].get('verified_name'),'phone_suffix':match[0].get('display_phone_number','')[-4:],'graph_version':version}))
result=get(business+'/message_templates',{'name':v.get('WHATSAPP_AUTH_TEMPLATE') or 'fti_login_otp','fields':'id,name,status,category,language,components','limit':100})
Path('test-results/whatsapp-template-inspection.json').write_text(json.dumps(result,indent=2))
print(json.dumps({'matching_templates':result.get('data',[])}))
