"""Submit fastener IMAGE-header utility templates; never send messages."""
import datetime
import json
from pathlib import Path
import urllib.parse
import urllib.request
from meta_templates import call, settings

ROOT = Path(__file__).resolve().parents[1]
EXAMPLE = ['FTI-FN-SAMPLE1001', 'Hex bolt', 'IS 1363:1967', 'M10 / L 60 mm', 'MS', '100 pieces', 'Without nut', 'Sample Buyer', 'Sample Engineering', '+919000000001', 'Pune, Maharashtra 411001']
DETAILS = '\nReference: {{1}}\nFastener: {{2}}\nStandard: {{3}}\nSize: {{4}}\nGrade: {{5}}\nQuantity: {{6}}\nSupply: {{7}}\nBuyer: {{8}}\nBusiness: {{9}}\nBuyer phone: {{10}}\nDelivery location: {{11}}'
TEMPLATES = [
    {'name': 'fti_fastener_received_v1', 'category': 'UTILITY', 'components': [
        {'type': 'HEADER', 'format': 'IMAGE'},
        {'type': 'BODY', 'text': 'FTI has received your fastener order request. Your selected drawing is attached.' + DETAILS + '\nFTI will contact you to confirm availability, pricing and delivery. This acknowledgment does not confirm the order.', 'example': {'body_text': [EXAMPLE]}},
    ]},
    {'name': 'fti_fastener_admin_v1', 'category': 'UTILITY', 'components': [
        {'type': 'HEADER', 'format': 'IMAGE'},
        {'type': 'BODY', 'text': 'FTI staff notification: a new fastener order request has been submitted. The selected drawing is attached.' + DETAILS + '\nPlease review the drawing and contact the buyer to confirm availability, pricing and delivery.', 'example': {'body_text': [EXAMPLE]}},
    ]},
]

def main():
    cfg = settings()
    token = cfg['WHATSAPP_ACCESS_TOKEN']
    base = 'https://graph.facebook.com/' + cfg['WHATSAPP_GRAPH_VERSION']
    endpoint = base + '/' + cfg['WHATSAPP_BUSINESS_ID'] + '/message_templates'
    output = ROOT / 'deployment/fastener-orders/template-status.json'
    (output.parent / 'templates.json').write_text(json.dumps(TEMPLATES, indent=2)+'\n', encoding='utf-8')
    records = []
    handle = None
    for template in TEMPLATES:
        query = urllib.parse.urlencode({'name':template['name'], 'fields':'id,name,status,language,category,components', 'limit':100})
        data = call(endpoint+'?'+query, token)
        existing = next((r for r in data.get('data',[]) if r.get('name')==template['name'] and r.get('language')==cfg['WHATSAPP_TEMPLATE_LANGUAGE']), None)
        if existing:
            parts = existing.get('components',[])
            if not any(p.get('type')=='HEADER' and p.get('format')=='IMAGE' for p in parts) or not any(p.get('type')=='BODY' and p.get('text')==template['components'][1]['text'] for p in parts):
                raise RuntimeError('Existing template differs; no changes made')
            result, action = existing, 'existing'
        else:
            if handle is None:
                app_id = cfg.get('WHATSAPP_APP_ID') or cfg.get('META_APP_ID')
                if not app_id:
                    app_id = call(base+'/app?fields=id', token).get('id')
                if not isinstance(app_id,str) or not app_id.isdigit():
                    raise RuntimeError('Could not identify the application for sample upload')
                content = (ROOT/'deployment/fastener-orders/sample-drawing.png').read_bytes()
                if not content.startswith(b'\x89PNG\r\n\x1a\n') or len(content)>5*1024*1024:
                    raise RuntimeError('Invalid PNG sample')
                params = urllib.parse.urlencode({'file_name':'fastener-drawing.png','file_length':len(content),'file_type':'image/png'})
                upload = call(base+'/'+app_id+'/uploads?'+params,token,{}).get('id')
                if not isinstance(upload,str) or not upload.startswith('upload:'):
                    raise RuntimeError('No sample upload session returned')
                request = urllib.request.Request(base+'/'+upload,data=content,headers={'Authorization':'OAuth '+token,'file_offset':'0','Content-Type':'image/png'},method='POST')
                with urllib.request.urlopen(request,timeout=30) as response:
                    handle = json.load(response).get('h')
                if not handle: raise RuntimeError('No image sample handle returned')
            payload = json.loads(json.dumps(template))
            payload['language'] = cfg['WHATSAPP_TEMPLATE_LANGUAGE']
            payload['components'][0]['example'] = {'header_handle':[handle]}
            result = call(endpoint,token,payload)
            if not result.get('id'): raise RuntimeError('No template ID returned; inspect Meta before retrying')
            action = 'submitted'
        record = {'name':template['name'],'id':result.get('id'),'status':result.get('status'),'category':result.get('category'),'language':cfg['WHATSAPP_TEMPLATE_LANGUAGE'],'action':action,'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
        records.append(record)
        output.write_text(json.dumps(records,indent=2)+'\n',encoding='utf-8')
        print(json.dumps(record),flush=True)

if __name__=='__main__':
    try: main()
    except Exception as error:
        # Credentials and resumable-upload URLs must never appear in logs.
        print('Template submission stopped: '+type(error).__name__+'. Check recorded status before retrying.')
        raise SystemExit(1)
