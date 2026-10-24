"""Check deployment without changing data or printing credentials."""
import json
import urllib.error
import urllib.request
from meta_templates import settings

cfg = settings()
base = cfg['EXPO_PUBLIC_SUPABASE_URL'].rstrip('/')
key = cfg['SUPABASE_SERVICE_ROLE_KEY']
try:
    request = urllib.request.Request(base + '/rest/v1/', headers={'apikey': key, 'Authorization': 'Bearer ' + key})
    with urllib.request.urlopen(request, timeout=20) as response:
        schema = json.load(response)
    names = ['fti_catalog_raw_recipients', 'fti_catalog_raw_recipient_save', 'fti_catalog_raw_orders', 'fti_catalog_raw_order_submit']
    print(json.dumps({'database_functions': {name: '/rpc/' + name in schema.get('paths', {}) for name in names}}), flush=True)
    request = urllib.request.Request(base + '/functions/v1/catalog',
        data=json.dumps({'operation': 'fti_catalog_raw_recipients', 'arguments': {}}).encode(),
        headers={'apikey': cfg['EXPO_PUBLIC_SUPABASE_ANON_KEY'], 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            print(json.dumps({'edge_http_status': response.status}))
    except urllib.error.HTTPError as error:
        body = json.load(error)
        print(json.dumps({'edge_http_status': error.code, 'code': body.get('code'), 'message': body.get('message')}))
except (OSError, ValueError):
    print('Backend check failed; no data was changed.')
    raise SystemExit(1)
