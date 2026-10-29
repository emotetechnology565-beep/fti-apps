"""Read-only check that the guided fastener database migration is deployed."""
import json
import ssl
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import certifi

env = {}
for line in Path('.env').read_text(encoding='utf-8-sig').splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        key, value = line.split('=', 1)
        env[key.strip()] = value.strip().strip('"').strip("'")
request = Request(env['EXPO_PUBLIC_SUPABASE_URL'].rstrip('/') + '/rest/v1/rpc/fti_catalog_fastener_detail',
                  data=json.dumps({'p_subcategory': 'hex-bolt'}).encode(), method='POST',
                  headers={'apikey': env['EXPO_PUBLIC_SUPABASE_ANON_KEY'], 'Authorization': 'Bearer ' + env['EXPO_PUBLIC_SUPABASE_ANON_KEY'], 'Content-Type': 'application/json'})
try:
    with urlopen(request, timeout=30, context=ssl.create_default_context(cafile=certifi.where())) as response:
        detail = json.load(response)
    if not detail or not detail.get('specifications'):
        raise SystemExit('The live API responded but the Hex Bolt profile is not published.')
    print('Live Hex Bolt details API is available:', len(detail['specifications']), 'specifications, revision', detail['revision'])
except HTTPError as error:
    body = json.loads(error.read())
    if body.get('code') == 'PGRST202':
        raise SystemExit('The new fastener database migration is not deployed yet.')
    raise SystemExit('Live API check failed: ' + str(body.get('code', error.code)))
