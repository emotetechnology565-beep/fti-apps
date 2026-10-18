"""Isolated Phase 8 UI acceptance. Every Supabase request is intercepted."""
import argparse
import base64
import copy
import json
import time
import struct
import zlib
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=8093)
base = 'http://127.0.0.1:' + str(parser.parse_args().port)
ids = {role: '00000000-0000-0000-0000-' + str(n).zfill(12) for n, role in enumerate(['seller','buyer','staff'],1)}
business = '10000000-0000-4000-8000-000000000001'
listing = None
enquiries = []
messages = []
assets = []
errors = []
observed = []
checks = []
stock_service_failed = False
out=Path('test-results');out.mkdir(exist_ok=True)
def png():
    def chunk(name, data): return struct.pack('!I',len(data))+name+data+struct.pack('!I',zlib.crc32(name+data)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',2,2,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b'\x00\x80\x80\x80\xa0\xa0\xa0'*2))+chunk(b'IEND',b'')
def enc(value): return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
def session(role):
    user = {'id': ids[role], 'aud': 'authenticated', 'role': 'authenticated', 'phone': '919000000001', 'app_metadata': {}, 'user_metadata': {}}
    token = enc({'alg':'HS256','typ':'JWT'}) + '.' + enc({'sub':ids[role],'aud':'authenticated','role':'authenticated','aal':'aal2' if role=='staff' else 'aal1','iat':int(time.time()),'exp':int(time.time())+3600}) + '.isolated'
    return {'user':user,'access_token':token,'refresh_token':'isolated','token_type':'bearer','expires_in':3600,'expires_at':int(time.time())+3600}
def card(role):
    return {**listing, 'is_seller': role=='seller', 'available': listing['status']=='published', 'can_certificates': role in ['seller','staff'] or bool(enquiries)}
def responder(role):
    def api(route):
        global listing
        request = route.request
        def send(data=None): route.fulfill(status=200,content_type='application/json',body=json.dumps({'data': data}),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'})
        if request.method=='OPTIONS': send(); return
        if '/auth/v1/user' in request.url:
            route.fulfill(status=200,content_type='application/json',body=json.dumps(session(role)['user'])); return
        body = request.post_data_json or {}
        op = body.get('operation',''); args = body.get('arguments',{})
        observed.append(op)
        if stock_service_failed and op=='fti_stock_list':
            route.fulfill(status=503,content_type='application/json',body=json.dumps({'message':'Isolated stock service unavailable'}),headers={'Access-Control-Allow-Origin':'*'}); return
        if '/business-stock-media' in request.url:
            if op=='upload':
                assert not body['base64'].startswith('data:'), 'API requires raw base64'
                raw = base64.b64decode(body['base64'])
                assert raw.startswith(b'%PDF-') if body['kind']=='stock_certificate' else raw.startswith(b'\x89PNG')
                assets.append({'id':'40000000-0000-4000-8000-'+str(len(assets)+1).zfill(12),'kind':body['kind'],'mime_type':body['mimeType'],'size_bytes':len(raw),'created_at':'2026-10-17T10:00:00Z','base64':body['base64']})
                listing['version'] += 1
                send({'id':assets[-1]['id']}); return
            if op=='download':
                asset=next(a for a in assets if a['id']==body['assetId'])
                send({'mimeType':asset['mime_type'],'base64':asset['base64']}); return
        if op=='fti_identity_me':
            send({'profile':{'id':ids[role],'full_name':role,'phone':'919000000001','account_status':'active'},'roles':['super_admin'] if role=='staff' else [],'permissions':['stock.review','staff.access'] if role=='staff' else [],'businesses':[{'id':business,'legal_name':'Isolated seller business','verification_status':'verified','addresses':[]}] if role=='seller' else [],'deletion_requested':False}); return
        if op=='fti_catalog_list': send({'items':[],'total':0,'categories':[]}); return
        if op=='fti_stock_save':
            listing = {**args['p_fields'],'id':args['p_id'],'business_id':business,'business_name':'Isolated seller business','status':'draft','version':1 if listing is None else listing['version']+1,'updated_at':'2026-10-17T10:00:00Z','review_note':None}
            send(listing['id']); return
        if op=='fti_stock_list':
            scope = args['p_scope']
            include = listing and (scope=='mine' and role=='seller' or scope=='browse' and listing['status']=='published' or scope=='review' and listing['status']=='submitted')
            send([card(role)] if include else []); return
        if op=='fti_stock_detail': send(card(role)); return
        if op=='fti_stock_transition':
            assert args['p_version']==listing['version']
            listing['status'] = {'submit':'submitted','approve':'published','reject':'rejected','withdraw':'withdrawn','sold':'sold'}[args['p_action']]
            listing['version'] += 1
            if args['p_note']: listing['review_note']=args['p_note']
            send(); return
        if op=='fti_stock_media_list': send([a for a in assets if a['kind']==args['p_kind']]); return
        if op=='fti_stock_enquire':
            enquiries.append({'id':args['p_id'],'listing_id':listing['id'],'material':listing['material'],'business_name':listing['business_name'],'buyer_name':'buyer','quantity':args['p_quantity'],'uom':listing['uom'],'status':'open','version':1,'updated_at':'2026-10-17T10:00:00Z','listing_snapshot':copy.deepcopy(card(role))})
            messages.append({'id':args['p_id'],'body':args['p_message'],'author_name':'buyer','created_at':'2026-10-17T10:00:00Z'})
            send(args['p_id']); return
        if op=='fti_stock_enquiries': send(enquiries); return
        if op=='fti_stock_thread': send([{**m,'is_mine':m['author_name']==role} for m in messages]); return
        if op=='fti_stock_reply':
            enquiries[0]['version'] += 1
            if args['p_close']: enquiries[0]['status']='closed'
            messages.append({'id':args['p_message_id'],'body':args['p_body'],'author_name':role,'created_at':'2026-10-17T11:00:00Z'})
            send(); return
        send([])
    return api

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    def page_for(role, mobile=False):
        context = browser.new_context(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 1080},accept_downloads=True)
        context.route('https://*.supabase.co/**',responder(role))
        context.add_init_script('localStorage.setItem("fti-auth-v2",' + json.dumps(json.dumps(session(role))) + ')')
        page = context.new_page()
        page.on('pageerror',lambda error: errors.append(str(error)))
        page.on('console',lambda message: errors.append(message.text) if message.type=='error' and 'status of 503' not in message.text else None)
        return page
    seller=page_for('seller')
    seller.goto(base+'/products')
    seller.get_by_role('button',name='Stock source: FTI stock',exact=True).click()
    seller.get_by_role('button',name='Business stock',exact=True).click()
    expect(seller).to_have_url(base+'/business-stock')
    expect(seller.get_by_text('No business stock found',exact=True)).to_be_visible()
    stock_service_failed = True
    seller.get_by_role('button',name='Refresh business stock',exact=True).click()
    expect(seller.get_by_text('Business stock unavailable',exact=True)).to_be_visible()
    stock_service_failed = False
    seller.get_by_role('button',name='Retry business stock',exact=True).click()
    expect(seller.get_by_text('No business stock found',exact=True)).to_be_visible()
    checks.append('stock dropdown switches to separate business discovery with empty state')
    checks.append('stock service failure displays a retry and recovers')
    seller.get_by_role('button',name='Sell your stock',exact=True).click()
    seller.get_by_role('button',name='Create stock listing',exact=True).click()
    seller.set_viewport_size({'width':390,'height':844})
    for label,value in [('Material name','Isolated steel angles'),('Grade / standard','IS 2062'),('Dimensions and specification','50 x 50 x 6 mm'),('Available quantity','100'),('Asking price in INR','52.50'),('Stock city','Kanpur'),('Stock state','Uttar Pradesh'),('Stock PIN code','208001'),('Available until with timezone (YYYY-MM-DDTHH:mm:ss+05:30)','2099-01-01T00:00:00Z')]:
        seller.get_by_role('textbox',name=label,exact=True).fill(value)
    seller.get_by_role('button',name='Save stock draft',exact=True).click()
    expect(seller.get_by_text('Owned and offered by Isolated seller business',exact=True)).to_be_visible()
    assert seller.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'seller form mobile overflow'
    with seller.expect_file_chooser() as chooser:
        seller.get_by_role('button',name='Add certificate',exact=True).click()
    chooser.value.set_files({'name':'isolated.pdf','mimeType':'application/pdf','buffer':b'%PDF-1.7\nIsolated UI upload'})
    expect(seller.get_by_text('Attachment upload finished.',exact=True)).to_be_visible()
    with seller.expect_file_chooser() as chooser:
        seller.get_by_role('button',name='Add stock photo',exact=True).click()
    chooser.value.set_files({'name':'isolated.png','mimeType':'image/png','buffer':png()})
    expect(seller.get_by_role('img',name='Photo of seller-owned stock',exact=True)).to_be_visible()
    seller.screenshot(path=str(out/'phase8-seller-draft.png'),full_page=True)
    seller.set_viewport_size({'width':1440,'height':1080})
    seller.get_by_role('button',name='Submit for FTI review',exact=True).click()
    seller.get_by_role('button',name='Confirm listing action',exact=True).click()
    expect(seller.get_by_text('Status: submitted',exact=True)).to_be_visible()
    checks.append('verified seller saves draft, uploads certificate with raw base64 and submits')
    staff=page_for('staff');staff.goto(base+'/admin')
    staff.get_by_role('button',name='Review stock submission',exact=True).click()
    staff.get_by_role('textbox',name='Listing review note (5-1000 characters)',exact=True).fill('Reviewed uploaded certificate and stock')
    staff.get_by_role('button',name='Approve for publication',exact=True).click()
    staff.get_by_role('button',name='Confirm listing action',exact=True).click()
    expect(staff.get_by_text('Status: published',exact=True)).to_be_visible()
    checks.append('MFA staff review publishes submitted stock')
    buyer=page_for('buyer',True);buyer.goto(base+'/business-stock')
    expect(buyer.get_by_text('Owned by Isolated seller business',exact=True)).to_be_visible()
    buyer.get_by_role('button',name='Stock source: Business stock',exact=True).click()
    buyer.get_by_role('button',name='FTI stock',exact=True).click()
    expect(buyer).to_have_url(base+'/products')
    expect(buyer.get_by_text('Owned by Isolated seller business',exact=True)).to_have_count(0)
    buyer.get_by_role('button',name='Stock source: FTI stock',exact=True).click()
    buyer.get_by_role('button',name='Business stock',exact=True).click()
    checks.append('returning to FTI stock never mixes seller-owned materials into results')
    expect(buyer.get_by_text('Owned by Isolated seller business',exact=True)).to_be_visible()
    buyer.get_by_text('Owned by Isolated seller business',exact=True).scroll_into_view_if_needed()
    buyer.screenshot(path=str(out/'phase8-business-stock-mobile.png'),full_page=True)
    buyer.get_by_role('button',name='View business stock',exact=True).click()
    expect(buyer.get_by_role('img',name='Photo of seller-owned stock',exact=True)).to_be_visible()
    checks.append('mobile seller form, photo upload and approved photo display')
    expect(buyer.get_by_text('Submit an enquiry to access supporting certificates.',exact=True)).to_be_visible()
    buyer.get_by_role('textbox',name='Requested quantity (kg)',exact=True).fill('50')
    buyer.get_by_role('textbox',name='Message to seller',exact=True).fill('Please confirm delivery availability')
    buyer.get_by_role('button',name='Send stock enquiry',exact=True).click()
    expect(buyer.get_by_text('Enquiry submitted. Track the conversation in My stock workspace.',exact=True)).to_be_visible()
    assert buyer.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'mobile overflow'
    buyer.get_by_role('button',name='View my enquiries',exact=True).click()
    expect(buyer.get_by_text('Verify your business to sell stock',exact=True)).to_be_visible()
    expect(buyer.get_by_role('button',name='Create stock listing',exact=True)).to_have_count(0)
    buyer.get_by_role('button',name='Buying enquiries',exact=True).click()
    buyer.get_by_role('button',name='Open conversation',exact=True).click()
    expect(buyer.get_by_text('Please confirm delivery availability',exact=True)).to_be_visible()
    expect(buyer.get_by_role('button',name='Open certificate',exact=True)).to_be_visible()
    with buyer.expect_download(): buyer.get_by_role('button',name='Open certificate',exact=True).click()
    checks.append('mobile ownership labels, enquiry submission/tracking and certificate download')
    seller.goto(base+'/sell-stock')
    seller.get_by_role('button',name='Selling enquiries',exact=True).click()
    seller.get_by_role('button',name='Open conversation',exact=True).click()
    seller.get_by_role('textbox',name='Enquiry reply',exact=True).fill('Stock is ready for inspection')
    seller.get_by_role('button',name='Send enquiry reply',exact=True).click()
    expect(seller.get_by_text('Stock is ready for inspection',exact=True)).to_be_visible()
    seller.get_by_role('button',name='My stock listings',exact=True).click()
    seller.get_by_role('button',name='Manage listing',exact=True).click()
    seller.get_by_role('button',name='Edit details and availability',exact=True).click()
    seller.get_by_role('textbox',name='Available quantity',exact=True).fill('80')
    seller.get_by_role('button',name='Save stock draft',exact=True).click()
    expect(seller.get_by_text('Status: draft',exact=True)).to_be_visible()
    buyer.goto(base+'/business-stock')
    expect(buyer.get_by_text('No business stock found',exact=True)).to_be_visible()
    checks.append('seller conversation and availability edits require reapproval before rediscovery')
    out=Path('test-results');out.mkdir(exist_ok=True)
    (out/'phase8-browser-results.json').write_text(json.dumps({'checks':checks,'errors':errors,'mode':'isolated intercepted APIs; no remote records or messages'},indent=2))
    buyer.screenshot(path=str(out/'phase8-mobile.png'),full_page=True)
    browser.close()
assert not errors,errors
print('Phase 8 browser checks passed:',len(checks))
