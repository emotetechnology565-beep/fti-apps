"""Read-only check of catalogue state and available publishing access."""
import json
import urllib.request
import urllib.error
from pathlib import Path

env = {}
for line in Path('.env').read_text(encoding='utf-8-sig').splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        key, value = line.split('=', 1)
        env[key.strip()] = value.strip().strip('\"\'')
key = env['SUPABASE_SERVICE_ROLE_KEY']
for path, payload, profile in [
    ('/rest/v1/rpc/fti_catalog_list', {'p_category': 'sheet'}, None),
    ('/rest/v1/rpc/fti_catalog_list', {'p_category': 'flat'}, None),
    ('/rest/v1/rpc/fti_catalog_admin_list', {}, None),
    ('/rest/v1/categories?select=slug&limit=1', None, 'catalog'),
]:
    headers = {'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'}
    if profile:
        headers['Accept-Profile'] = profile
    request = urllib.request.Request(env['EXPO_PUBLIC_SUPABASE_URL'] + path,
        data=json.dumps(payload).encode() if payload is not None else None, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            result = json.load(response)
        print(path, json.dumps(result))
    except urllib.error.HTTPError as error:
        print(path, error.code, error.read().decode())
