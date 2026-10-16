import json,urllib.request,urllib.error
from pathlib import Path
v={}
for line in Path('.env').read_text().splitlines():
 if '=' in line:
  k,x=line.split('=',1);v[k.strip()]=x.strip().strip(chr(34)).strip(chr(39))
u=v['EXPO_PUBLIC_SUPABASE_URL'];k=v['SUPABASE_SERVICE_ROLE_KEY']
for path in ['/rest/v1/','/auth/v1/settings']:
 try:
  req=urllib.request.Request(u+path,headers={'apikey':k,'Authorization':'Bearer '+k})
  with urllib.request.urlopen(req,timeout=20) as r: data=json.load(r)
  print(path, list(data.get('paths',{})) if path.startswith('/rest') else {'phone_enabled':data.get('external',{}).get('phone'),'disable_signup':data.get('disable_signup'),'sms_autoconfirm':data.get('sms_autoconfirm')})
 except urllib.error.HTTPError as e: print(path,e.code)
