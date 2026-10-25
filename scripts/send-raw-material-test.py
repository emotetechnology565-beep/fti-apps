"""Send exactly one explicitly requested raw-material acknowledgment test.

This tests the provider template, not the Supabase Queue. Never retries a send.
"""
import datetime
import json
import re
import sys
from pathlib import Path

from meta_templates import call, settings


def main():
    if len(sys.argv) != 2 or not re.fullmatch(r'\+[1-9][0-9]{7,14}', sys.argv[1]):
        raise RuntimeError('Usage: python scripts/send-raw-material-test.py +countrycodephonenumber')
    recipient = sys.argv[1][1:]
    cfg = settings()
    version, phone, waba = (cfg.get(key, '') for key in ['WHATSAPP_GRAPH_VERSION', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_BUSINESS_ID'])
    if not re.fullmatch(r'v\d+\.\d+', version) or not phone.isdigit() or not waba.isdigit():
        raise RuntimeError('Invalid configured WhatsApp endpoint')
    base = f'https://graph.facebook.com/{version}'
    template = 'fti_raw_material_received_v1'
    listing = call(f'{base}/{waba}/message_templates?fields=name,status,language&limit=100', cfg['WHATSAPP_ACCESS_TOKEN'])
    if not any(row.get('name') == template and row.get('status') == 'APPROVED' and row.get('language') == cfg['WHATSAPP_TEMPLATE_LANGUAGE'] for row in listing.get('data', [])):
        raise RuntimeError('Raw-material acknowledgment template is not approved in the configured language')
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    reference = 'TEST-FTI-RM-' + stamp
    parameters = ['TEST recipient', reference, 'TEST Round bar', '15 mm', 'EN-8D', 'TEST 1 MT']
    payload = {
        'messaging_product': 'whatsapp', 'recipient_type': 'individual', 'to': recipient, 'type': 'template',
        'template': {'name': template, 'language': {'code': cfg['WHATSAPP_TEMPLATE_LANGUAGE']},
                     'components': [{'type': 'body', 'parameters': [{'type': 'text', 'text': value} for value in parameters]}]},
    }
    evidence = Path(__file__).resolve().parents[1] / 'test-results' / f'raw-material-whatsapp-test-{stamp}.json'
    evidence.parent.mkdir(exist_ok=True)
    record = {'mode': 'direct provider test; Supabase Queue not exercised', 'recipient_last_four': recipient[-4:],
              'template': template, 'reference': reference, 'status': 'attempting', 'parameters': parameters}

    def save():
        evidence.write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')

    save()
    try:
        result = call(f'{base}/{phone}/messages', cfg['WHATSAPP_ACCESS_TOKEN'], payload)
    except (OSError, RuntimeError):
        record['status'] = 'unconfirmed; inspect provider logs before retrying'
        save()
        raise
    message = (result.get('messages') or [{}])[0]
    provider_id = message.get('id')
    if not isinstance(provider_id, str) or not provider_id.startswith('wamid.'):
        record['status'] = 'unconfirmed; provider returned no message ID; do not retry automatically'
        save()
        raise RuntimeError('No provider message ID returned. Check Meta logs before retrying.')
    record.update(status='accepted', provider_message_id=provider_id, provider_status=message.get('message_status'), delivery_confirmed=False)
    save()
    print(json.dumps({'status': 'accepted by WhatsApp', 'recipient_last_four': recipient[-4:], 'template': template,
                      'reference': reference, 'delivery_confirmed': False, 'evidence': str(evidence)}, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
