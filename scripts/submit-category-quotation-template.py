"""Submit the reviewed PDF-header quotation template; never sends customer messages."""
import argparse
import json
from pathlib import Path
import re
import urllib.parse
import urllib.request

from meta_templates import call, settings

TEMPLATE = {
    'name': 'fti_category_quotation_v1',
    'category': 'UTILITY',
    'components': [
        {'type': 'HEADER', 'format': 'DOCUMENT'},
        {'type': 'BODY', 'text': 'FTI quotation for {{1}} is attached, as requested. PDF updated: {{2}}. Request reference: {{3}}. Please contact FTI if you need any changes.',
         'example': {'body_text': [['Hex bolts', '21 Oct 2026 15:30 IST', 'FTI-Q-123456789ABC']]}},
    ],
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--submit', action='store_true')
    parser.add_argument('--header-handle', help='Meta resumable upload handle for the sample PDF')
    parser.add_argument('--sample-pdf', type=Path)
    parser.add_argument('--app-id', help='Meta application ID used for resumable sample upload')
    parser.add_argument('--preview', type=Path, help='Write a draft without using credentials or network')
    args = parser.parse_args()
    if args.preview:
        args.preview.parent.mkdir(parents=True, exist_ok=True)
        args.preview.write_text(json.dumps(TEMPLATE, indent=2) + '\n', encoding='utf-8')
        print('Draft written. The submit command adds language and the required sample upload handle.')
        return
    cfg = settings()
    version = cfg['WHATSAPP_GRAPH_VERSION']
    waba = cfg['WHATSAPP_BUSINESS_ID']
    if not re.fullmatch(r'v\d+\.\d+', version) or not waba.isdigit():
        raise RuntimeError('Invalid Meta configuration')
    base = 'https://graph.facebook.com/' + version
    endpoint = base + '/' + waba + '/message_templates'
    # Check permissions and existing templates before uploading or submitting anything.
    rows = call(endpoint + '?fields=name,status,language&limit=100', cfg['WHATSAPP_ACCESS_TOKEN'])
    existing = next((row for row in rows.get('data', []) if row.get('name') == TEMPLATE['name'] and row.get('language') == cfg['WHATSAPP_TEMPLATE_LANGUAGE']), None)
    if existing:
        print('Template already exists:', existing.get('status', 'unknown'))
        return
    if not args.submit:
        print('Template not found. Use --submit and a sample PDF upload handle to submit.')
        return
    handle = args.header_handle
    if not handle:
        app_id = args.app_id or cfg.get('WHATSAPP_APP_ID', '')
        if not app_id.isdigit() or not args.sample_pdf:
            raise RuntimeError('Supply --header-handle, or --app-id plus --sample-pdf. A real sample upload is required.')
        content = args.sample_pdf.read_bytes()
        if not content.startswith(b'%PDF-') or not 6 <= len(content) <= 3 * 1024 * 1024:
            raise RuntimeError('Sample must be a PDF up to 3 MB')
        query = urllib.parse.urlencode({'file_name': args.sample_pdf.name, 'file_length': len(content), 'file_type': 'application/pdf'})
        session = call(base + '/' + app_id + '/uploads?' + query, cfg['WHATSAPP_ACCESS_TOKEN'], {})
        upload_id = session.get('id')
        if not isinstance(upload_id, str) or not upload_id.startswith('upload:'):
            raise RuntimeError('No resumable upload session returned')
        request = urllib.request.Request(base + '/' + upload_id, data=content, headers={'Authorization': 'OAuth ' + cfg['WHATSAPP_ACCESS_TOKEN'], 'file_offset': '0', 'Content-Type': 'application/pdf'}, method='POST')
        with urllib.request.urlopen(request, timeout=30) as response:
            handle = json.load(response).get('h')
    if not isinstance(handle, str) or not handle.strip():
        raise RuntimeError('No valid Meta sample upload handle returned')
    payload = {**TEMPLATE, 'language': cfg['WHATSAPP_TEMPLATE_LANGUAGE'], 'components': [dict(item) for item in TEMPLATE['components']]}
    payload['components'][0]['example'] = {'header_handle': [handle]}
    result = call(endpoint, cfg['WHATSAPP_ACCESS_TOKEN'], payload)
    print('Template submitted:', 'id=' + str(result.get('id')), 'status=' + str(result.get('status', 'PENDING')))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Do not print request URLs or stack traces that could include upload/session data.
        print(str(error)[:350])
        raise SystemExit(1)
