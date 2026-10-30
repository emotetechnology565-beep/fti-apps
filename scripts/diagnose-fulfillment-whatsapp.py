"""Read-only fulfillment notification diagnostics; never sends messages."""
import json
import os
from pathlib import Path
import urllib.error
import urllib.request
from meta_templates import settings

cfg = settings()
base = cfg['EXPO_PUBLIC_SUPABASE_URL'].rstrip('/')


def read(label, url, headers, payload=None):
    try:
        req = urllib.request.Request(url, headers=headers, data=json.dumps(payload).encode() if payload else None)
        with urllib.request.urlopen(req, timeout=20) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        print(json.dumps({'check': label, 'http_status': error.code}), flush=True)
    except (OSError, ValueError):
        print(json.dumps({'check': label, 'result': 'unavailable'}), flush=True)
    return None


templates = read('template_approval', f"https://graph.facebook.com/{cfg['WHATSAPP_GRAPH_VERSION']}/{cfg['WHATSAPP_BUSINESS_ID']}/message_templates?fields=name,status,language&limit=100", {'Authorization': 'Bearer ' + cfg['WHATSAPP_ACCESS_TOKEN']})
if templates:
    print(json.dumps({'status_templates': [row for row in templates.get('data', []) if row.get('name') in ('fti_order_status_v1', 'fti_order_dispatch_v1')], 'configured_language': cfg['WHATSAPP_TEMPLATE_LANGUAGE']}), flush=True)

token = os.environ.get('SUPABASE_ACCESS_TOKEN') or cfg.get('SUPABASE_ACCESS_TOKEN')
token_file = Path.home() / '.supabase' / 'access-token'
if not token and token_file.is_file():
    token = token_file.read_text().strip()
if token:
    ref = base.split('//', 1)[1].split('.', 1)[0]
    query = """
    select jsonb_build_object(
      'status_notices',(select count(*) from platform.notifications where template_code='operations' and payload->>'request_type' in ('material','fastener') and payload->>'request_state' in ('confirmed','processing','shipped','delivered')),
      'status_jobs',(select count(*) from platform.whatsapp_jobs j join platform.notifications n on n.id=j.notification_id where n.payload->>'request_type' in ('material','fastener') and n.payload->>'request_state' in ('confirmed','processing','shipped','delivered')),
      'eligible_status_notices',(select count(*) from platform.notifications n join identity.profiles p on p.id=n.user_id where n.template_code='operations' and n.payload->>'request_type' in ('material','fastener') and n.payload->>'request_state' in ('confirmed','processing','shipped','delivered') and p.account_status='active' and p.whatsapp_updates_opt_in_at is not null),
      'queue',(select coalesce(jsonb_agg(t),'[]') from (select template_code,status,count(*) from platform.whatsapp_jobs group by template_code,status) t),
      'cron',(select coalesce(jsonb_agg(t),'[]') from (select jobname,schedule,active from cron.job where jobname='fti-operations-whatsapp') t)
    ) as diagnostics;
    """
    result = read('database_diagnostics', f'https://api.supabase.com/v1/projects/{ref}/database/query', {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}, {'query': query, 'read_only': True})
    if result:
        print(json.dumps({'database_diagnostics': result}), flush=True)
else:
    print(json.dumps({'database_diagnostics': 'No management token is available locally.'}), flush=True)
