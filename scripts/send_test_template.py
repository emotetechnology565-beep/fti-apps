"""Send a single WhatsApp template message for manual testing."""
import json, os, sys, urllib.error, urllib.request
from pathlib import Path

def settings():
    values = {}
    for line in (Path(__file__).resolve().parents[1] / '.env').read_text(encoding='utf-8-sig').splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            values[key] = value.strip().strip('"')
    return values

def call(url, token, data):
    req = urllib.request.Request(
        url,
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'},
        data=json.dumps(data).encode(),
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        try:
            details = json.load(e)['error']
            msg = details.get('message', 'request failed')
            code = details.get('code', '?')
        except Exception:
            msg, code = 'request failed', '?'
        raise RuntimeError(f'Meta HTTP {e.code}, code {code}: {msg}') from None

def main():
    cfg = settings()
    to = sys.argv[1] if len(sys.argv) > 1 else '916398792951'
    if not to.startswith('+') and not to.startswith('91'):
        to = '91' + to          # default to India country code
    to = to.lstrip('+')

    template_name = 'fti_order_status_v1'
    language     = cfg['WHATSAPP_TEMPLATE_LANGUAGE']   # en_US
    phone_id     = cfg['WHATSAPP_PHONE_NUMBER_ID']
    token        = cfg['WHATSAPP_ACCESS_TOKEN']
    version      = cfg['WHATSAPP_GRAPH_VERSION']

    payload = {
        'messaging_product': 'whatsapp',
        'to': to,
        'type': 'template',
        'template': {
            'name': template_name,
            'language': {'code': language},
            'components': [{
                'type': 'body',
                'parameters': [
                    {'type': 'text', 'text': 'FTI-1001'},
                    {'type': 'text', 'text': 'dispatched'},
                ],
            }],
        },
    }

    url = f'https://graph.facebook.com/{version}/{phone_id}/messages'
    result = call(url, token, payload)
    print('Sent! Response:', json.dumps(result, indent=2))

if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
