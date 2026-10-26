"""Check import capabilities using the configured service key without printing secrets."""
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
headers = {'apikey': key, 'Authorization': 'Bearer ' + key}
for path in ['/rest/v1/fastener_weight_reference?select=workbook_row&limit=1', '/rest/v1/']:
    request = urllib.request.Request(env['EXPO_PUBLIC_SUPABASE_URL'] + path, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.load(response)
        if path == '/rest/v1/':
            paths = result.get('paths', {})
            print('SQL/import/weight endpoints:', [p for p in paths if any(s in p.lower() for s in ('sql', 'query', 'import', 'weight'))])
        else:
            print('Weight table accessible:', result)
    except urllib.error.HTTPError as error:
        print(path, error.code, error.read().decode())
