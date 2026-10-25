"""Read-only check of TMT records and the configured publishing connection."""
import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from meta_templates import settings

cfg = settings()
base = cfg['EXPO_PUBLIC_SUPABASE_URL'].rstrip('/')
key = cfg['SUPABASE_SERVICE_ROLE_KEY']
headers = {'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'}
token_path = Path.home() / '.supabase' / 'access-token'
token = os.environ.get('SUPABASE_ACCESS_TOKEN') or cfg.get('SUPABASE_ACCESS_TOKEN')
if not token and token_path.is_file():
    token = token_path.read_text().strip()
print(json.dumps({'management_connection_available': bool(token)}), flush=True)
for label, path, payload, profile in [
    ('published_tmt', '/rest/v1/rpc/fti_catalog_filtered_list', {'p_category': 'tmt', 'p_limit': 50}, None),
    ('catalog_schema_access', '/rest/v1/categories?select=slug&slug=eq.tmt', None, 'catalog'),
]:
    request_headers = {**headers}
    if profile:
        request_headers['Accept-Profile'] = profile
    request = urllib.request.Request(base + path, headers=request_headers,
        data=json.dumps(payload).encode() if payload is not None else None)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            data = json.load(response)
        if label == 'published_tmt':
            data = {'total': data['total'], 'products': [
                {'name': p['name'], 'variants': len(p['variants'])} for p in data['items']]}
        print(json.dumps({label: data}), flush=True)
    except urllib.error.HTTPError as error:
        data = json.load(error)
        print(json.dumps({label: {'status': error.code, 'code': data.get('code'), 'message': data.get('message')}}), flush=True)
