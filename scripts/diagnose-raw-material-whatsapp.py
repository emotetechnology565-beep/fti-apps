"""Read-only delivery diagnostics. Never invokes a worker or sends a message."""
import json
import os
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path
from meta_templates import settings

cfg = settings()
base = cfg['EXPO_PUBLIC_SUPABASE_URL'].rstrip('/')
service = cfg['SUPABASE_SERVICE_ROLE_KEY']


def read(label, url, headers=None, payload=None):
    try:
        request = urllib.request.Request(url, headers=headers or {},
            data=json.dumps(payload).encode() if payload is not None else None)
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        print(json.dumps({'check': label, 'http_status': error.code}))
    except (OSError, ValueError):
        print(json.dumps({'check': label, 'result': 'unavailable'}))
    return None


headers = {'apikey': service, 'Authorization': 'Bearer ' + service}
schema = read('database_functions', base + '/rest/v1/', headers)
if schema:
    print(json.dumps({'database_functions': {name: '/rpc/' + name in schema.get('paths', {}) for name in
        ['fti_raw_material_claim', 'fti_raw_material_can_send', 'fti_raw_material_finish', 'fti_catalog_selection_request_submit']}}))

queue = read('queue', base + '/rest/v1/raw_material_jobs?select=status,attempts,last_error,created_at&order=created_at.desc&limit=100',
    {**headers, 'Accept-Profile': 'sales'})
if isinstance(queue, list):
    print(json.dumps({'queue_statuses': dict(Counter(row['status'] for row in queue)),
        'recent_errors': list({row['last_error'] for row in queue if row.get('last_error')}),
        'oldest_in_sample': min((row['created_at'] for row in queue), default=None)}))

templates = read('meta_templates', f"https://graph.facebook.com/{cfg['WHATSAPP_GRAPH_VERSION']}/{cfg['WHATSAPP_BUSINESS_ID']}/message_templates?fields=name,status,language&limit=100",
    {'Authorization': 'Bearer ' + cfg['WHATSAPP_ACCESS_TOKEN']})
if templates:
    print(json.dumps({'templates': [item for item in templates.get('data', []) if item.get('name', '').startswith('fti_raw_material_')]}))

token = os.environ.get('SUPABASE_ACCESS_TOKEN') or cfg.get('SUPABASE_ACCESS_TOKEN')
if not token:
    token_file = Path.home() / '.supabase' / 'access-token'
    if token_file.is_file():
        candidate = token_file.read_text().strip()
        if candidate.startswith('sbp_'):
            token = candidate
if token:
    ref = base.split('//', 1)[1].split('.', 1)[0]
    management = {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}
    result = read('schedule_and_queue', f'https://api.supabase.com/v1/projects/{ref}/database/query', management, {
        'query': "select json_build_object('jobs',(select coalesce(json_agg(t),'[]') from (select template,status,count(*) as count,min(created_at) as oldest,max(last_error) as error from sales.raw_material_jobs group by template,status) t),'schedule',(select coalesce(json_agg(t),'[]') from (select jobid,jobname,schedule,active from cron.job where jobname='fti-operations-whatsapp') t),'runs',(select coalesce(json_agg(t),'[]') from (select status,return_message,start_time from cron.job_run_details where jobid in(select jobid from cron.job where jobname='fti-operations-whatsapp') order by start_time desc limit 3) t)) as diagnostics;",
        'read_only': True})
    if result:
        print(json.dumps({'database_diagnostics': result}))
else:
    print(json.dumps({'management_access': 'No local management token available; private queue and cron may require SQL Editor checks.'}))
