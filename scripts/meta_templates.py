"""List or submit FTI utility templates using local, uncommitted .env credentials."""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

NAMES = {
    'fti_request_received_v1': {
        'name': 'fti_request_received_v1', 'category': 'UTILITY',
        'components': [{'type': 'BODY',
            'text': 'FTI has received your {{1}} request. Reference: {{2}}. You can check its progress in the FTI app.',
            'example': {'body_text': [['business verification', 'REQ-12345678']]}}],
    },
    'fti_admin_request_v1': {
        'name': 'fti_admin_request_v1', 'category': 'UTILITY',
        'components': [{'type': 'BODY',
            'text': 'FTI staff notification: a {{1}} request requires your attention. Reference: {{2}}. Sign in to the FTI staff console to review it.',
            'example': {'body_text': [['business verification', 'REQ-12345678']]}}],
    },
    'fti_request_approved_v1': {
        'name': 'fti_request_approved_v1', 'category': 'UTILITY',
        'components': [{'type': 'BODY',
            'text': 'FTI has approved your {{1}} request. Reference: {{2}}. Open the FTI app to view the decision and next steps.',
            'example': {'body_text': [['business verification', 'REQ-12345678']]}}],
    },
    'fti_request_rejected_v1': {
        'name': 'fti_request_rejected_v1', 'category': 'UTILITY',
        'components': [{'type': 'BODY',
            'text': 'FTI could not approve your {{1}} request. Reference: {{2}}. Open the FTI app to view the review details and contact FTI if you need help.',
            'example': {'body_text': [['business verification', 'REQ-12345678']]}}],
    },
    'fti_request_update_v1': {
        'name': 'fti_request_update_v1', 'category': 'UTILITY',
        'components': [{'type': 'BODY',
            'text': 'FTI update for your {{1}} request. Reference: {{2}}. Status: {{3}}. Open the FTI app for details.',
            'example': {'body_text': [['quotation', 'REQ-12345678', 'quotation ready']]}}],
    },
    'fti_order_status_v1': {
        'name': 'fti_order_status_v1', 'category': 'UTILITY',
        'components': [{'type': 'BODY',
            'text': 'FTI update for order {{1}}: {{2}}. Open the FTI app for details.',
            'example': {'body_text': [['FTI-1001', 'dispatched']]}}],
    },
    'fti_support_reply_v1': {
        'name': 'fti_support_reply_v1', 'category': 'UTILITY',
        'components': [{'type': 'BODY',
            'text': 'FTI has replied to your support request {{1}}. Open the FTI app to read the response.',
            'example': {'body_text': [['FTI-HELP-1001']]}}],
    },
}

def settings():
    values = {}
    for line in (Path(__file__).resolve().parents[1] / '.env').read_text(encoding='utf-8-sig').splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            values[key] = value.strip().strip('"')
    wanted = ('WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_BUSINESS_ID', 'WHATSAPP_GRAPH_VERSION', 'WHATSAPP_TEMPLATE_LANGUAGE')
    if not all(values.get(key) for key in wanted):
        raise RuntimeError('Missing WhatsApp credentials or language in .env')
    return values

def call(url, token, data=None):
    headers = {'Authorization': 'Bearer ' + token}
    if data is not None:
        headers['Content-Type'] = 'application/json'
    request = urllib.request.Request(url, headers=headers,
                                     data=json.dumps(data).encode() if data is not None else None)
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        try:
            details = json.load(error)['error']
            message = str(details.get('message', 'Meta request failed'))[:250]
            code = details.get('code', 'unknown')
        except Exception:
            message, code = 'Meta request failed', 'unknown'
        raise RuntimeError(f'Meta HTTP {error.code}, code {code}: {message}') from None

def main():
    cfg = settings()
    version = cfg['WHATSAPP_GRAPH_VERSION']
    waba = cfg['WHATSAPP_BUSINESS_ID']
    if not version.startswith('v') or not version[1:].replace('.', '').isdigit() or not waba.isdigit():
        raise RuntimeError('Invalid Graph version or WhatsApp business account ID')
    endpoint = f'https://graph.facebook.com/{version}/{waba}/message_templates'
    query = '?fields=name,status,language,category&limit=100'
    response = call(endpoint + query, cfg['WHATSAPP_ACCESS_TOKEN'])
    existing = {(item.get('name'), item.get('language')): item.get('status')
                for item in response.get('data', [])}
    print('Matching existing templates:',
          {name: existing.get((name, cfg['WHATSAPP_TEMPLATE_LANGUAGE']), 'absent') for name in NAMES})
    if len(sys.argv) < 2 or sys.argv[1] not in ('list', 'submit'):
        raise RuntimeError('Usage: python scripts/meta_templates.py list|submit [template_names...]')
    selected = sys.argv[2:] or list(NAMES)
    if any(name not in NAMES for name in selected):
        raise RuntimeError('Unknown template name')
    if sys.argv[1] == 'list':
        return
    for name, template in NAMES.items():
        if name not in selected:
            continue
        if (name, cfg['WHATSAPP_TEMPLATE_LANGUAGE']) in existing:
            print(name, 'already exists; left unchanged')
            continue
        payload = {**template, 'language': cfg['WHATSAPP_TEMPLATE_LANGUAGE']}
        result = call(endpoint, cfg['WHATSAPP_ACCESS_TOKEN'], payload)
        print(name, 'submitted', 'status=' + str(result.get('status', 'pending')),
              'id=' + str(result.get('id', 'unavailable')))

if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
