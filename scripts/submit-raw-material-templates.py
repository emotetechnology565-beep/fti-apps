"""Submit only the two raw-material templates, recording results without sending messages."""
import datetime
import json
from pathlib import Path
import urllib.parse
from meta_templates import NAMES, call, settings


def main():
    cfg = settings()
    base = f"https://graph.facebook.com/{cfg['WHATSAPP_GRAPH_VERSION']}"
    endpoint = f"{base}/{cfg['WHATSAPP_BUSINESS_ID']}/message_templates"
    token = cfg['WHATSAPP_ACCESS_TOKEN']
    output = Path('test-results/raw-material-template-submission.json')
    output.parent.mkdir(exist_ok=True)
    records = []
    for name in ['fti_raw_material_received_v1', 'fti_raw_material_admin_v1']:
        payload = {**NAMES[name], 'language': cfg['WHATSAPP_TEMPLATE_LANGUAGE']}
        query = urllib.parse.urlencode({'name': name, 'fields': 'id,name,status,language,category,components', 'limit': 100})
        existing = call(endpoint + '?' + query, token)
        match = next((item for item in existing.get('data', [])
                      if item.get('name') == name and item.get('language') == payload['language']), None)
        if match:
            body = next((c.get('text') for c in match.get('components', []) if c.get('type') == 'BODY'), None)
            if body != payload['components'][0]['text'] or match.get('category') != payload['category']:
                raise RuntimeError('Existing template differs from prepared content: ' + name)
            result, action = match, 'existing'
        else:
            result, action = call(endpoint, token, payload), 'submitted'
            if not result.get('id'):
                raise RuntimeError('No template ID returned; inspect Meta before retrying: ' + name)
        records.append({'action': action, 'checked_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                        'request': payload, 'response': result})
        output.write_text(json.dumps(records, indent=2) + '\n', encoding='utf-8')
        print(json.dumps({'name': name, 'action': action, 'id': result.get('id'), 'status': result.get('status')}), flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Never print request URLs, headers, credentials, or a network traceback.
        print('Submission stopped: ' + type(error).__name__ + '. Check Meta template status before retrying.')
        raise SystemExit(1)
