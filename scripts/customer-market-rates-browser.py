"""Customer rate-board checks. All API traffic is intercepted with isolated fixtures."""
import base64
import json
import re
import threading
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

root = Path.cwd()
out = root / 'artifacts/customer-market-rates'
out.mkdir(exist_ok=True)

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if not Path(self.translate_path(self.path.split('?')[0])).is_file() and '.' not in self.path.split('?')[0].rsplit('/', 1)[-1]:
            self.path = '/index.html'
        super().do_GET()
    def log_message(self, *args): pass

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(root / 'artifacts/market-rates-preview')))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'
actor = '00000000-0000-4000-8000-000000000001'
enc = lambda value: base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
user = {'id':actor,'aud':'authenticated','role':'authenticated','phone':'919000000001','app_metadata':{},'user_metadata':{}}
session = {'user':user,'access_token':enc({'alg':'HS256'})+'.'+enc({'sub':actor,'aud':'authenticated','role':'authenticated','aal':'aal1','exp':int(time.time())+3600})+'.isolated','refresh_token':'isolated','expires_at':int(time.time())+3600,'expires_in':3600,'token_type':'bearer'}
identity = {'profile':{'id':actor,'full_name':'Preview customer','phone':'+919000000001','account_status':'active'},'roles':['buyer'],'permissions':[],'businesses':[],'deletion_requested':False}
quotes = [
    {'id':'q1','location_id':'l1','category':'Ingot','state':'Punjab','district':'Mandi Gobindgarh','sale_price':'46300.00','price_change':'-200.00','published_at':'2026-10-30T06:30:00Z'},
    {'id':'q2','location_id':'l2','category':'Ingot','state':'Punjab','district':'Ludhiana (EN8D)','sale_price':'46900.00','price_change':'100.00','published_at':'2026-10-30T06:30:00Z'},
    {'id':'q3','location_id':'l3','category':'Ingot','state':'Haryana','district':'Hisar','sale_price':'45000.00','price_change':'0.00','published_at':'2026-10-30T06:30:00Z'},
    {'id':'q4','location_id':'l4','category':'Ingot','state':'Uttar Pradesh','district':'Muzaffarnagar','sale_price':'44800.00','price_change':None,'published_at':'2026-10-30T06:30:00Z'},
    {'id':'q5','location_id':'l5','category':'Scrap','state':'West Bengal','district':'Durgapur','sale_price':'35800.00','price_change':'-1000.00','published_at':'2026-10-30T06:30:00Z'},
    {'id':'q6','location_id':'l6','category':'Billet','state':'Tamil Nadu','district':'Chennai','sale_price':'47000.00','price_change':'0.00','published_at':'2026-10-30T06:30:00Z'},
    {'id':'q7','location_id':'l7','category':'Old Scrap','state':'Punjab','district':'Mandi Gobindgarh','sale_price':'33600.00','price_change':'-300.00','published_at':'2026-10-30T06:30:00Z'},
]
settings = {'notes':'All Rates Are Quoted, Estimated (As per Rumours)\nAll Rates Are P.m.t, Spot & only information, not any offer for sale & purchase.\nWe are not responsible for any profit or loss.\n💯% Reliability and Top Service\nBest Service, Right Time, Right People','support':'Support 24×7 +91-9780830333','sms':'+91-9780830333','whatsapp':'+91-9780830333\n+91-9589971567'}
mode = {'subscribed':True,'fail':False,'many':False}
errors, requests = [], []

def api(route):
    req = route.request
    body = (req.post_data_json or {}) if req.method == 'POST' else {}
    direct = '/rest/v1/rpc/' in req.url
    operation = req.url.rsplit('/',1)[-1] if direct else body.get('operation')
    args = body if direct else body.get('arguments',{})
    if '/auth/v1/user' in req.url: result = user
    elif operation == 'fti_identity_me': result = identity
    elif operation == 'fti_subscription_status': result = {'active':mode['subscribed'],'expires_at':'2099-12-31T23:59:59Z' if mode['subscribed'] else None,'amount_paise':120000,'revision':1,'currency':'INR','purchases':[]}
    elif operation and operation.startswith('fti_pricing_market_customer_'):
        requests.append((operation,args))
        if not mode['subscribed']:
            return route.fulfill(status=403,content_type='application/json',body=json.dumps({'message':'An active price subscription is required.'}),headers={'Access-Control-Allow-Origin':'*'})
        if operation == 'fti_pricing_market_customer_options':
            result = {'locations':[{'id':q['location_id'],'category':q['category'],'state':q['state'],'district':q['district']} for q in quotes],'settings':settings}
        elif operation == 'fti_pricing_market_customer_board':
            if mode['fail']:
                return route.fulfill(status=503,content_type='application/json',body=json.dumps({'message':'Market prices temporarily unavailable'}),headers={'Access-Control-Allow-Origin':'*'})
            rows = [q for q in quotes if q['category']==args['p_category']]
            if mode['many'] and args['p_category']=='Ingot': rows += [{**quotes[0],'id':f'extra-{i}','location_id':f'loc-{i}','district':f'Example district {i+1}'} for i in range(24)]
            if args['p_states']: rows = [q for q in rows if q['state'] in args['p_states']]
            if args['p_districts']: rows = [q for q in rows if q['location_id'] in args['p_districts']]
            if args['p_search']: rows = [q for q in rows if args['p_search'].lower() in (q['state']+' '+q['district']).lower()]
            result = {'items':rows[args['p_offset']:args['p_offset']+24],'total':len(rows)}
        elif operation == 'fti_pricing_market_customer_history':
            quote = next(q for q in quotes if q['location_id']==args['p_location'])
            result = [
                {k:quote[k] for k in ['id','sale_price','price_change','published_at']},
                {'id':'old-1','sale_price':str(float(quote['sale_price'])+200),'price_change':'-100','published_at':'2026-10-29T06:30:00Z'},
                {'id':'old-2','sale_price':str(float(quote['sale_price'])+300),'price_change':None,'published_at':'2026-10-28T06:30:00Z'}]
            if args.get('p_from'): result = [q for q in result if q['published_at'][:10]>=args['p_from']]
            if args.get('p_to'): result = [q for q in result if q['published_at'][:10]<=args['p_to']]
            result = result[args['p_offset']:args['p_offset']+20]
    else: result = []
    if '/functions/v1/' in req.url: result = {'data':result}
    route.fulfill(status=200,content_type='application/json',body=json.dumps(result),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'})

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--disable-gpu'])
        for width in [390,1440]:
            mode.update({'subscribed':True,'fail':False,'many':False})
            settings['notes']='All Rates Are Quoted, Estimated (As per Rumours)\nWe are not responsible for any profit or loss.\nBest Service, Right Time, Right People'
            context = browser.new_context(viewport={'width':width,'height':1000})
            context.route('https://*.supabase.co/**',api)
            context.add_init_script('localStorage.setItem("fti-auth-v2",'+json.dumps(json.dumps(session))+')')
            page = context.new_page()
            page.on('pageerror',lambda error: errors.append(str(error)))
            page.set_default_timeout(15000)
            page.goto(base+'/rates',wait_until='networkidle')
            expect(page.get_by_text('₹46,300',exact=True)).to_be_visible()
            expect(page.get_by_label('Decreased by ₹200',exact=True)).to_be_visible()
            expect(page.get_by_label('Increased by ₹100',exact=True)).to_be_visible()
            expect(page.get_by_text('— No change',exact=True)).to_be_visible()
            assert page.get_by_text(re.compile('Base price|Increase amount|Rolling charge|Profit amount')).count()==0
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.screenshot(path=str(out/f'board-{width}.png'))
            for category,price in [('Scrap','₹35,800'),('Billet','₹47,000'),('Old Scrap','₹33,600')]:
                page.get_by_role('tab',name=category,exact=True).click()
                expect(page.get_by_text(price,exact=True)).to_be_visible()
            page.get_by_role('tab',name='Ingot',exact=True).click()
            page.get_by_role('button',name='View price history for Mandi Gobindgarh, Punjab',exact=True).click()
            expect(page.get_by_text('Sale price history',exact=True)).to_be_visible()
            page.get_by_label('History from (YYYY-MM-DD)',exact=True).fill('2026-10-29')
            page.get_by_label('History to (YYYY-MM-DD)',exact=True).fill('2026-10-29')
            page.get_by_role('button',name='Apply history dates',exact=True).click()
            expect(page.get_by_text('₹46,500',exact=True)).to_be_visible()
            page.get_by_text('Sale price history',exact=True).scroll_into_view_if_needed()
            page.screenshot(path=str(out/f'history-{width}.png'))
            page.get_by_role('button',name='Hide price history for Mandi Gobindgarh, Punjab',exact=True).click()
            page.get_by_role('button',name='Filter markets',exact=True).click()
            page.get_by_role('button',name='States: Choose states',exact=True).click()
            page.get_by_role('checkbox',name='Punjab',exact=True).click()
            page.get_by_role('checkbox',name='Haryana',exact=True).click()
            page.get_by_role('button',name='Apply states',exact=True).click()
            page.get_by_role('button',name='Districts: Choose districts',exact=True).click()
            page.get_by_role('checkbox',name='Mandi Gobindgarh · Punjab',exact=True).click()
            page.get_by_role('checkbox',name='Hisar · Haryana',exact=True).click()
            page.get_by_role('button',name='Apply districts',exact=True).click()
            expect(page.get_by_text('2 district quotes',exact=True)).to_be_visible()
            page.get_by_label('Search district or state',exact=True).fill('Hisar')
            page.get_by_role('button',name='Apply search',exact=True).click()
            expect(page.get_by_text('1 district quote',exact=True)).to_be_visible()
            page.get_by_label('Search district or state',exact=True).fill('does-not-exist')
            page.get_by_role('button',name='Apply search',exact=True).click()
            expect(page.get_by_text('No rates for this selection',exact=True)).to_be_visible()
            page.get_by_role('button',name='Clear market filters',exact=True).click()
            expect(page.get_by_text('₹46,300',exact=True)).to_be_visible()
            page.get_by_role('button',name='Filter markets',exact=True).click()
            page.get_by_text('Market notes',exact=True).scroll_into_view_if_needed()
            expect(page.get_by_text('SMS ALERTS',exact=True)).to_be_visible()
            expect(page.get_by_text('WHATSAPP ALERTS',exact=True)).to_be_visible()
            expect(page.get_by_text('Support 24×7 +91-9780830333',exact=True)).to_be_visible()
            page.screenshot(path=str(out/f'notes-alerts-{width}.png'))
            settings['notes']='Updated by admin: rates are indicative.'
            page.get_by_role('button',name='Refresh market prices',exact=True).click()
            expect(page.get_by_text(settings['notes'],exact=True)).to_be_visible()
            mode['fail']=True
            page.get_by_role('button',name='Refresh market prices',exact=True).click()
            expect(page.get_by_text('Prices unavailable',exact=True)).to_be_visible()
            mode['fail']=False
            page.get_by_role('button',name='Retry prices',exact=True).click()
            expect(page.get_by_text('₹46,300',exact=True)).to_be_visible()
            mode['many']=True
            page.get_by_role('button',name='Refresh market prices',exact=True).click()
            page.get_by_role('button',name='Next markets',exact=True).click()
            expect(page.get_by_text('25–28 of 28',exact=True)).to_be_visible()
            mode['subscribed']=False
            count = len(requests)
            page.reload(wait_until='networkidle')
            expect(page.get_by_text('Live prices for subscribers',exact=True)).to_be_visible()
            assert page.get_by_text('₹46,300',exact=True).count()==0
            assert len(requests)==count,'Locked screen requested price data'
            context.close()
        browser.close()
    assert not errors,errors
    print(json.dumps({'widths':[390,1440],'page_errors':errors,'checks':['sale-only prices','four categories','up/down/unchanged indicators','sale-only dated history','multi-state and district filters','search/empty state','admin notes and alert contacts','refreshing saved notes','error/retry','pagination','subscription gate','no page overflow']}))
finally:
    server.shutdown()
