"""Isolated customer order/dispatch acceptance. Every service request is mocked."""
import base64,json,time,threading
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright,expect
root=Path.cwd();directory=root/'artifacts/tracking-preview';out=root/'artifacts/customer-tracking';out.mkdir(exist_ok=True)
class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if not Path(self.translate_path(self.path.split('?')[0])).is_file() and '.' not in self.path.split('?')[0].rsplit('/',1)[-1]:self.path='/index.html'
        super().do_GET()
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(directory)))
threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}'
actor='00000000-0000-4000-8000-000000000001';oid='00000000-0000-4000-8000-000000000002'
enc=lambda value:base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
user={'id':actor,'aud':'authenticated','role':'authenticated','phone':'919000000001','app_metadata':{},'user_metadata':{}}
session={'user':user,'access_token':enc({'alg':'HS256'})+'.'+enc({'sub':actor,'aud':'authenticated','role':'authenticated','aal':'aal1','exp':int(time.time())+3600})+'.isolated','refresh_token':'isolated','expires_at':int(time.time())+3600,'expires_in':3600,'token_type':'bearer'}
order={'id':oid,'order_no':'FTI-TRACK-001','status':'shipped','grand_total':'11800','amount_due':'0','created_at':'2026-10-28T08:00:00Z','updated_at':'2026-10-28T10:00:00Z','reservation_expires_at':None,'quotation_revision_id':None,'subtotal':'10000','discount_total':'0','gst_total':'1800','freight_total':'0','loading_total':'0','currency_code':'INR','buyer_id':actor,'business_id':None,'delivery_address_snapshot':{'line1':'Industrial Road','line2':None,'city':'Ludhiana','state':'Punjab','pincode':'141003'},'items':[{'id':'item','variant_id':'variant','sku':'BAR-12','qty':'1','uom':'MT','unit_price':'10000','line_total':'10000','reservation_expires_at':None}],'payments':[]}
errors=[]
def api(route):
    req=route.request;result=[]
    if '/auth/v1/user' in req.url:result=user
    elif req.method!='OPTIONS' and '/functions/v1/' in req.url:
        body=req.post_data_json or {};op=body.get('operation')
        if op=='fti_identity_me':result={'profile':{'id':actor,'full_name':'Test Buyer','phone':'+919000000001','account_status':'active'},'roles':['buyer'],'permissions':[],'businesses':[],'deletion_requested':False}
        elif op=='fti_commerce_my':result=[order]
        elif op=='fti_commerce_detail':result=order
        elif op=='fti_operations_shipments':result=[] if order['status']=='pending_confirmation' else [{'id':'shipment','carrier':'Test Carrier','tracking_number':'LR-TRACK-001','vehicle_number':'PB10AB1234','status':'delivered' if order['status']=='delivered' else 'dispatched','delivery_note':'Signed POD received' if order['status']=='delivered' else None}]
        result={'data':result}
    route.fulfill(status=200,content_type='application/json',body=json.dumps(result),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'})
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    for width in [320,390,1440]:
        context=browser.new_context(viewport={'width':width,'height':1000})
        context.route('https://*.supabase.co/**',api)
        context.add_init_script('localStorage.setItem("fti-auth-v2",'+json.dumps(json.dumps(session))+')')
        page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
        order['status']='shipped'
        page.goto(base+'/orders',wait_until='networkidle')
        page.get_by_role('button',name='Track dispatch & view order',exact=True).click()
        expect(page.get_by_text('Test Carrier',exact=True)).to_be_visible()
        expect(page.get_by_text('LR-TRACK-001',exact=True)).to_be_visible()
        expect(page.get_by_text('Consignment Milestones',exact=True)).to_be_visible()
        expect(page.get_by_text('Digital Document Ledger',exact=True)).to_be_visible()
        expect(page.get_by_text('GPS tracking is not available',exact=True)).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.get_by_text('Fleet & Carrier Credentials',exact=True).scroll_into_view_if_needed()
        page.screenshot(path=str(out/f'dispatch-{width}.png'),full_page=True)
        page.get_by_role('button',name='Report a delivery delay or issue',exact=True).click()
        expect(page.get_by_role('textbox',name='Order ID (optional, from your order details)',exact=True)).to_have_value(oid)
        for status in ['delivered','pending_confirmation']:
            order['status']=status
            page.goto(base+'/orders',wait_until='networkidle')
            page.get_by_role('button',name='Track dispatch & view order',exact=True).click()
            expect(page.get_by_text('Signed POD received',exact=True) if status=='delivered' else page.get_by_text('No dispatch recorded.',exact=False)).to_be_visible()
        context.close()
    browser.close()
server.shutdown();assert not errors,errors
print('PASS: customer order list, shipped/delivered/pending tracking, carrier/LR, document ledger, support prefill, no horizontal overflow at 320/390/1440px')
