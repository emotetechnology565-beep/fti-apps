"""Send one explicitly requested sample of each FTI utility notification template."""
import datetime
import json
import re
import sys
from pathlib import Path

from meta_templates import NAMES, call, settings


def main():
    if len(sys.argv) != 2 or not re.fullmatch(r'\+[1-9][0-9]{7,14}', sys.argv[1]):
        raise RuntimeError('Usage: python scripts/send-notification-samples.py +countrycodephonenumber')
    recipient = sys.argv[1][1:]
    cfg = settings()
    phone_id = cfg.get('WHATSAPP_PHONE_NUMBER_ID', '')
    version = cfg['WHATSAPP_GRAPH_VERSION']
    waba = cfg['WHATSAPP_BUSINESS_ID']
    if not phone_id.isdigit() or not waba.isdigit() or not re.fullmatch(r'v\d+\.\d+', version):
        raise RuntimeError('Invalid WhatsApp phone ID, business ID or Graph version')
    base = f'https://graph.facebook.com/{version}'
    templates = call(f'{base}/{waba}/message_templates?fields=name,status,language&limit=100', cfg['WHATSAPP_ACCESS_TOKEN'])
    approved = {row['name'] for row in templates.get('data', [])
                if row.get('status') == 'APPROVED' and row.get('language') == cfg['WHATSAPP_TEMPLATE_LANGUAGE']}
    missing = set(NAMES) - approved
    if missing:
        raise RuntimeError('Templates not approved in the configured language: ' + ', '.join(sorted(missing)))

    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    reference = 'TEST-' + stamp
    samples = {
        'fti_request_received_v1': ['TEST business verification', reference],
        'fti_admin_request_v1': ['TEST business verification', reference],
        'fti_request_approved_v1': ['TEST business verification', reference],
        'fti_request_rejected_v1': ['TEST business verification', reference],
        'fti_request_update_v1': ['TEST quotation', reference, 'TEST quotation ready'],
        'fti_order_status_v1': [reference, 'TEST dispatched'],
        'fti_support_reply_v1': [reference],
    }
    evidence = Path(__file__).resolve().parents[1] / 'test-results' / f'whatsapp-samples-{stamp}.json'
    evidence.parent.mkdir(parents=True, exist_ok=True)
    results = {'recipient_last_four': recipient[-4:], 'reference': reference, 'messages': []}

    def save():
        evidence.write_text(json.dumps(results, indent=2) + '\n', encoding='utf-8')

    for name, parameters in samples.items():
        item = {'template': name, 'status': 'attempting'}
        results['messages'].append(item)
        save()
        payload = {
            'messaging_product': 'whatsapp', 'recipient_type': 'individual',
            'to': recipient, 'type': 'template',
            'template': {'name': name, 'language': {'code': cfg['WHATSAPP_TEMPLATE_LANGUAGE']},
                         'components': [{'type': 'body', 'parameters': [{'type': 'text', 'text': text} for text in parameters]}]},
        }
        try:
            result = call(f'{base}/{phone_id}/messages', cfg['WHATSAPP_ACCESS_TOKEN'], payload)
        except (OSError, RuntimeError):
            item['status'] = 'unconfirmed; do not retry without checking Meta message logs'
            save()
            raise
        provider_id = (result.get('messages') or [{}])[0].get('id')
        if not isinstance(provider_id, str) or not provider_id.startswith('wamid.'):
            item['status'] = 'unconfirmed; provider returned no message ID'
            save()
            raise RuntimeError('Provider returned no message ID; check Meta logs before retrying')
        item.update(status='accepted', provider_message_id=provider_id)
        save()
        print(name, 'accepted by WhatsApp', flush=True)
    print('Accepted:', len(results['messages']), 'notification samples. Delivery is not yet confirmed.', flush=True)


if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
