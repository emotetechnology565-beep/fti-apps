"""Isolated customer order/dispatch acceptance. Every service request is mocked."""
import base64,json,time,threading
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright,expect
root=Path.cwd();directory=root/'artifacts/timeline-preview';out=root/'artifacts/staff-timeline';out.mkdir(exist_ok=True)
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
    elif req.method!='OPTIONS':
        body=req.post_data_json or {};op=body.get('operation')
        if '/rest/v1/rpc/fti_customer_orders' in req.url:
            f={'carrier':'Punjab Road Transport','tracking_number':'LR-456','vehicle_number':'PB10AB1234','driver_name':'Gurpreet Singh','driver_phone':'+919876543210','history':[{'status':'confirmed','at':'2026-10-28T09:00:00Z'},{'status':'processing','at':'2026-10-28T10:00:00Z'},{'status':'shipped','at':'2026-10-29T08:00:00Z'}]}
            rows=[{'id':oid,'kind':'commerce','reference':order['order_no'],'status':order['status'],'created_at':order['created_at'],'total':'11800','amount_due':'0','details':{'material':'Bright steel bars','quantity':'1 MT','location':'Industrial Road, Ludhiana'},'fulfillment':{}},
                {'id':'material-order','kind':'material','reference':'FTI-RM-001','status':'shipped','created_at':order['created_at'],'total':'47000','amount_due':None,'details':{'material':'MS round bar','quantity':'500 kg','size':'40 mm','grade':'EN8'},'fulfillment':f}]
            result={'orders':rows,'total':len(rows)}
        elif op=='fti_identity_me':result={'profile':{'id':actor,'full_name':'Test Buyer','phone':'+919000000001','account_status':'active'},'roles':['buyer'],'permissions':[],'businesses':[],'deletion_requested':False}
        elif op=='fti_commerce_my':result=[order]
        elif op=='fti_commerce_detail':result=order
        elif op=='fti_operations_shipments':result=[] if order['status'] in ['pending_confirmation','processing','cancelled','expired'] else [{'id':'shipment','carrier':'Punjab Road Transport','tracking_number':'LR-TRACK-001','vehicle_number':'PB10AB1234','driver_name':'Gurpreet Singh','driver_phone':'+919876543210','dispatched_at':'2026-10-29T08:00:00Z','delivered_at':'2026-10-30T08:00:00Z' if order['status']=='delivered' else None,'status':'delivered' if order['status']=='delivered' else 'dispatched','delivery_note':'Signed POD received' if order['status']=='delivered' else None}]
        if '/functions/v1/' in req.url:result={'data':result}
    route.fulfill(status=200,content_type='application/json',body=json.dumps(result),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'})

customer_api = api
session['access_token']=enc({'alg':'HS256'})+'.'+enc({'sub':actor,'aud':'authenticated','role':'authenticated','aal':'aal2','exp':int(time.time())+3600})+'.isolated'
identity={'profile':{'id':actor,'full_name':'Test staff','phone':'+919000000001','account_status':'active'},'roles':['super_admin'],'permissions':['staff.access','order.manage','operations.manage','subscription.manage','business.review','catalog.manage','price.manage','sales.manage','inventory.manage','payment.review','order.policy','support.manage','content.manage','stock.review'],'businesses':[],'deletion_requested':False}
fulfillment={'status':'shipped','revision':3,'confirmed_total':'47000','confirmation_note':'Availability and delivery terms agreed.','carrier':'Punjab Road Transport','tracking_number':'LR-456','vehicle_number':'PB10AB1234','driver_name':'Gurpreet Singh','driver_phone':'+919876543210','history':[{'status':'confirmed','at':'2026-10-28T09:00:00Z','actor_id':actor},{'status':'processing','at':'2026-10-28T10:00:00Z','actor_id':actor},{'status':'shipped','at':'2026-10-29T08:00:00Z','actor_id':actor}]}
material={'id':'20000000-0000-0000-0000-000000000001','created_at':order['created_at'],'details':{'reference':'FTI-RM-001','material':'MS round bar','grade':'EN8','size':'40 mm','quantity':'500 kg','name':'Sample buyer','business':'Sample Engineering','location':'Ludhiana'},'fulfillment':fulfillment,'deliveries':[]}
def api(route):
    req=route.request
    body=(req.post_data_json or {}) if req.method=='POST' else {}
    direct='/rest/v1/rpc/' in req.url
    op=req.url.rsplit('/',1)[-1] if direct else body.get('operation')
    if op=='fti_identity_me':result=identity
    elif op=='fti_operations_orders':result=[{'id':oid,'order_no':order['order_no'],'status':order['status'],'created_at':order['created_at']}]
    elif op=='fti_catalog_raw_orders':result=[material]
    else:return customer_api(route)
    if not direct:result={'data':result}
    route.fulfill(status=200,content_type='application/json',body=json.dumps(result),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'})
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    for width in [390,1440]:
        print('Checking staff timeline at',width,flush=True)
        context=browser.new_context(viewport={'width':width,'height':1000})
        context.route('https://*.supabase.co/**',api)
        context.add_init_script('localStorage.setItem("fti-auth-v2",'+json.dumps(json.dumps(session))+')')
        page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
        page.set_default_timeout(15000)
        page.goto(base+'/admin?section=dispatch',wait_until='networkidle')
        page.get_by_role('button',name='View dispatch '+order['order_no'],exact=True).click()
        timeline=page.get_by_test_id('fulfillment-timeline')
        expect(timeline).to_have_count(1)
        expect(timeline.get_by_text('CURRENT',exact=True)).to_have_count(1)
        expect(timeline.get_by_text('Driver: Gurpreet Singh',exact=True)).to_be_visible()
        page.get_by_text('Order & dispatch timeline',exact=True).scroll_into_view_if_needed()
        page.screenshot(path=str(out/f'dispatch-{width}.png'))
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        if width==390:page.get_by_role('button',name='Open navigation',exact=True).click()
        link=page.get_by_role('link',name='Material & fastener orders',exact=True)
        expect(link).to_be_visible()
        color=link.get_by_text('Material & fastener orders',exact=True).evaluate('(el)=>getComputedStyle(el).color')
        assert color=='rgb(226, 232, 240)',color
        page.screenshot(path=str(out/f'navigation-{width}.png'))
        link.click()
        expect(page.get_by_test_id('fulfillment-timeline')).to_have_count(1)
        expect(page.get_by_text('LR / tracking: LR-456',exact=True)).to_be_visible()
        page.get_by_text('Order fulfillment',exact=True).scroll_into_view_if_needed()
        page.screenshot(path=str(out/f'orders-{width}.png'))
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        context.close()
    browser.close()
server.shutdown();assert not errors,errors
print('PASS: staff dispatch/order timelines, driver details, sidebar contrast and mobile navigation at 390/1440px')
