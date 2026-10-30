"""Isolated Market Rates acceptance checks; API fixtures never reach the live backend."""
import base64
import json
import re
import threading
import time
from decimal import Decimal
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

root = Path.cwd()
out = root / 'artifacts/market-rates-admin'
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
enc = lambda v: base64.urlsafe_b64encode(json.dumps(v).encode()).decode().rstrip('=')
user = {'id':actor,'aud':'authenticated','role':'authenticated','phone':'919000000001','app_metadata':{},'user_metadata':{}}
session = {'user':user,'access_token':enc({'alg':'HS256'})+'.'+enc({'sub':actor,'aud':'authenticated','role':'authenticated','aal':'aal2','exp':int(time.time())+3600})+'.isolated','refresh_token':'isolated','expires_at':int(time.time())+3600,'expires_in':3600,'token_type':'bearer'}
identity = {'profile':{'id':actor,'full_name':'Preview staff','phone':'+919000000001','account_status':'active'},'roles':['super_admin'],'permissions':['staff.access','price.manage','price.publish'],'businesses':[],'deletion_requested':False}
categories = ['Ingot','Scrap','Billet','Old Scrap']
errors, calls = [], []
state = {}

def reset():
    state.clear()
    state.update({'locations':[{'id':str(i+1),'category':category,'state':'Punjab','district':'Ludhiana'} for i,category in enumerate(categories)],
                  'settings':{'revision':1,'notes':'All Rates Are Quoted, Estimated (As per Rumours)\nWe are not responsible for any profit or loss.','support':'Support 24×7 +91-9780830333','sms':'+91-9780830333','whatsapp':'+91-9780830333\n+91-9589971567'},
                  'rates':{},'fail':False,'conflict':False})
    state['locations'].extend([{'id':f'h-{i}','category':category,'state':'Haryana','district':'Hisar'} for i,category in enumerate(categories)])
    state['rates'] = {str(i+1):[{'id':f'initial-{i}','location_id':str(i+1),'base_price':'46300.00','increase_amount':'200.00','sale_price':'46500.00','published_at':'2026-10-28T06:30:00Z','published_by':actor}] for i in range(4)}
    state['rates'].update({f'h-{i}':[{'id':f'other-{i}','location_id':f'h-{i}','base_price':'45000.00','increase_amount':'100.00','sale_price':'45100.00','published_at':'2026-10-28T06:30:00Z','published_by':actor}] for i in range(4)})

def api(route):
    req = route.request
    body = req.post_data_json or {} if req.method == 'POST' else {}
    op = body.get('operation')
    args = body.get('arguments',{})
    status = 200
    if '/auth/v1/user' in req.url: result = user
    elif op == 'fti_identity_me': result = identity
    elif op == 'fti_pricing_market_rates_admin':
        if state['fail']:
            return route.fulfill(status=503,content_type='application/json',body=json.dumps({'message':'Fixture unavailable'}),headers={'Access-Control-Allow-Origin':'*'})
        result = {'locations':state['locations'],'settings':state['settings']}
    elif op == 'fti_pricing_market_rates_current':
        result = [{'location_id':id,'latest':state['rates'].get(id,[None])[0]} for id in args['p_locations']]
    elif op == 'fti_pricing_market_rates_bulk_publish':
        calls.append((op,args))
        if state['conflict']:
            return route.fulfill(status=422,content_type='application/json',body=json.dumps({'message':'Prices changed. Refresh this district and review the latest price before publishing.'}),headers={'Access-Control-Allow-Origin':'*'})
        for item in args['p_items']:
            state['rates'].setdefault(item['location_id'],[]).insert(0,{'id':f"bulk-{len(calls)}-{item['location_id']}",'location_id':item['location_id'],'base_price':str(Decimal(item['base']).quantize(Decimal('.01'))),'increase_amount':str(Decimal(item['increase']).quantize(Decimal('.01'))),'sale_price':str((Decimal(item['base'])+Decimal(item['increase'])).quantize(Decimal('.01'))),'published_at':'2026-10-30T06:30:00Z','published_by':actor})
        result = len(args['p_items'])
    elif op == 'fti_pricing_market_rates_history':
        result = state['rates'].get(args['p_location'],[])
        if args.get('p_from'): result = [r for r in result if r['published_at'][:10] >= args['p_from']]
        if args.get('p_to'): result = [r for r in result if r['published_at'][:10] <= args['p_to']]
        result = result[args.get('p_offset',0):args.get('p_offset',0)+args.get('p_limit',20)]
    elif op == 'fti_pricing_market_rates_publish':
        calls.append((op,args))
        if state['conflict']:
            return route.fulfill(status=422,content_type='application/json',body=json.dumps({'message':'Prices changed. Refresh this district and review the latest price before publishing.'}),headers={'Access-Control-Allow-Origin':'*'})
        result = f'new-{len(calls)}'
        state['rates'].setdefault(args['p_location'],[]).insert(0,{'id':result,'location_id':args['p_location'],'base_price':str(Decimal(args['p_base']).quantize(Decimal('.01'))),'increase_amount':str(Decimal(args['p_increase']).quantize(Decimal('.01'))),'sale_price':str((Decimal(args['p_base'])+Decimal(args['p_increase'])).quantize(Decimal('.01'))),'published_at':'2026-10-30T06:30:00Z','published_by':actor})
    elif op == 'fti_pricing_market_rates_location':
        result = f'loc-{len(state["locations"])}'
        state['locations'].append({'id':result,'category':args['p_category'],'state':args['p_state'],'district':args['p_district']})
    elif op == 'fti_pricing_market_rates_settings':
        calls.append((op,args))
        state['settings'].update({key:args[f'p_{key}'] for key in ['notes','support','sms','whatsapp']})
        state['settings']['revision'] += 1
        result = state['settings']['revision']
    else: result = []
    if '/functions/v1/' in req.url: result = {'data':result}
    route.fulfill(status=status,content_type='application/json',body=json.dumps(result),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'})

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--disable-gpu'])
        for width in [390,1440]:
            reset()
            context = browser.new_context(viewport={'width':width,'height':1000})
            context.route('https://*.supabase.co/**',api)
            context.add_init_script('localStorage.setItem("fti-auth-v2",'+json.dumps(json.dumps(session))+')')
            page = context.new_page()
            page.on('pageerror',lambda error: errors.append(str(error)))
            page.set_default_timeout(15000)
            page.goto(base+'/admin?section=market-rates',wait_until='networkidle')
            for category in categories:
                page.get_by_role('button',name=category,exact=True).click()
                page.get_by_role('button',name='States: Choose states',exact=True).click()
                page.get_by_role('checkbox',name='Punjab',exact=True).click()
                page.get_by_role('checkbox',name='Haryana',exact=True).click()
                page.get_by_role('button',name='Apply states',exact=True).click()
                page.get_by_role('button',name='Districts: Choose districts',exact=True).click()
                page.get_by_role('checkbox',name='Ludhiana · Punjab',exact=True).click()
                page.get_by_role('checkbox',name='Hisar · Haryana',exact=True).click()
                page.get_by_role('button',name='Apply districts',exact=True).click()
                expect(page.get_by_label('Base price — Ludhiana, Punjab',exact=True)).to_have_value('46300.00')
            page.get_by_role('button',name=re.compile('^States:')).click()
            page.get_by_label('Search states',exact=True).fill('Haryana')
            expect(page.get_by_role('checkbox',name='Punjab',exact=True)).to_have_count(0)
            expect(page.get_by_role('checkbox',name='Haryana',exact=True)).to_be_checked()
            page.screenshot(path=str(out/f'states-dropdown-{width}.png'))
            page.get_by_label('Search states',exact=True).fill('')
            page.get_by_role('checkbox',name='Haryana',exact=True).click()
            page.get_by_role('button',name='Apply states',exact=True).click()
            expect(page.get_by_label('Base price — Hisar, Haryana',exact=True)).to_have_count(0)
            page.get_by_role('button',name=re.compile('^States:')).click()
            page.get_by_role('checkbox',name='Haryana',exact=True).click()
            page.get_by_role('button',name='Apply states',exact=True).click()
            page.get_by_role('button',name='Districts: Ludhiana · Punjab',exact=True).click()
            page.get_by_role('button',name='Select all',exact=True).click()
            page.screenshot(path=str(out/f'districts-dropdown-{width}.png'))
            page.get_by_role('button',name='Apply districts',exact=True).click()
            expect(page.get_by_label('Base price — Hisar, Haryana',exact=True)).to_have_value('45000.00')
            page.get_by_label('Common increase amount (₹ / tonne)',exact=True).fill('150')
            page.get_by_role('button',name='Apply increase to selected districts',exact=True).click()
            expect(page.get_by_label('Increase amount — Ludhiana, Punjab',exact=True)).to_have_value('150')
            expect(page.get_by_label('Increase amount — Hisar, Haryana',exact=True)).to_have_value('150')
            page.get_by_role('button',name='Reset to saved prices',exact=True).click()
            page.get_by_label('Increase amount — Ludhiana, Punjab',exact=True).fill('-200')
            page.get_by_label('Increase amount — Hisar, Haryana',exact=True).fill('-100')
            expect(page.get_by_text('₹46,100.00',exact=True)).to_be_visible()
            page.get_by_role('button',name='Ingot',exact=True).click()
            expect(page.get_by_role('button',name='Discard changes',exact=True)).to_be_visible()
            page.get_by_role('button',name='Keep editing',exact=True).click()
            expect(page.get_by_label('Increase amount — Ludhiana, Punjab',exact=True)).to_have_value('-200')
            page.get_by_role('button',name='Review price updates',exact=True).click()
            page.get_by_role('button',name='Confirm & publish prices',exact=True).click()
            expect(page.get_by_text('District prices published. History has been updated.',exact=True).first).to_be_visible()
            assert calls[-1][1]['p_items'][0]['increase'] == '-200'
            assert len(calls[-1][1]['p_items']) == 2
            expect(page.get_by_text('₹46,100.00',exact=True)).to_have_count(2)
            page.get_by_label('From date (YYYY-MM-DD, IST)',exact=True).fill('2026-02-30')
            page.get_by_role('button',name='Apply date range',exact=True).click()
            expect(page.get_by_text('Enter valid dates as YYYY-MM-DD.',exact=True)).to_be_visible()
            page.get_by_role('button',name='All dates',exact=True).click()
            page.get_by_label('From date (YYYY-MM-DD, IST)',exact=True).fill('2026-10-28')
            page.get_by_label('To date (YYYY-MM-DD, IST)',exact=True).fill('2026-10-30')
            page.get_by_role('button',name='Apply date range',exact=True).click()
            with page.expect_download() as download:
                page.get_by_role('button',name='Export history CSV',exact=True).click()
            csv_path = out / f'history-{width}.csv'
            download.value.save_as(str(csv_path))
            import csv
            with csv_path.open(encoding='utf-8-sig',newline='') as f: exported = list(csv.DictReader(f))
            assert len(exported) == 2,exported
            assert exported[0]['Sale price (INR/tonne)'] == '46100'
            assert exported[0]['Published by (staff ID)'] == actor
            with page.expect_download() as download:
                page.get_by_role('button',name='Export this update',exact=True).first.click()
            download.value.save_as(str(out/f'single-update-{width}.csv'))
            page.get_by_role('button',name='Last 7 days',exact=True).click()
            page.get_by_role('button',name='All dates',exact=True).click()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.get_by_text('District prices, in one place.',exact=True).scroll_into_view_if_needed()
            page.screenshot(path=str(out/f'prices-{width}.png'),full_page=True)
            page.get_by_label('Base price — Ludhiana, Punjab',exact=True).scroll_into_view_if_needed()
            page.screenshot(path=str(out/f'price-editor-{width}.png'))
            page.get_by_text('Price history',exact=True).scroll_into_view_if_needed()
            page.screenshot(path=str(out/f'history-view-{width}.png'))
            state['conflict'] = True
            page.get_by_label('Base price — Ludhiana, Punjab',exact=True).fill('47000')
            page.get_by_role('button',name='Review price updates',exact=True).click()
            page.get_by_role('button',name='Confirm & publish prices',exact=True).click()
            expect(page.get_by_text('Prices changed.',exact=False)).to_be_visible()
            page.get_by_role('button',name='Reset to saved prices',exact=True).click()
            state['conflict'] = False
            page.get_by_role('button',name='Notes & contacts',exact=True).click()
            page.get_by_label('Market rate notes (one note per line)',exact=True).fill('Updated market disclaimer\nRates per metric tonne.')
            page.get_by_label('WhatsApp alert phone numbers (one per line)',exact=True).fill('+91-9780830333\n+91-9589971567')
            page.get_by_role('button',name='Save notes & contacts',exact=True).click()
            expect(page.get_by_text('Notes and alert contacts saved.',exact=True).first).to_be_visible()
            assert state['settings']['notes'].startswith('Updated market disclaimer')
            page.screenshot(path=str(out/f'notes-{width}.png'),full_page=True)
            page.get_by_role('button',name='Prices',exact=True).click()
            page.get_by_role('button',name='Add a district',exact=True).click()
            page.get_by_label('State name',exact=True).fill('Haryana')
            page.get_by_label('District name',exact=True).fill('Ambala')
            page.get_by_role('button',name='Add district to Old Scrap',exact=True).click()
            expect(page.get_by_text('No price published yet. Enter the first rate below.',exact=True)).to_be_visible()
            expect(page.get_by_label('Base price — Ambala, Haryana',exact=True)).to_have_value('')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            state['fail'] = True
            page.get_by_role('button',name='Refresh Market Rates',exact=True).click()
            expect(page.get_by_text('Market Rates unavailable',exact=True)).to_be_visible()
            state['fail'] = False
            page.get_by_role('button',name='Retry',exact=True).click()
            expect(page.get_by_role('button',name='Ingot',exact=True)).to_be_visible()
            context.close()
        browser.close()
    assert not errors,errors
    print(json.dumps({'widths':[390,1440],'browser_errors':errors,'checks':['four categories','multiple states and districts','search/select all','removing states prunes districts','common increase across districts','batch review/publish/history','negative increase','unsaved changes','stale update failure','day/week/custom ranges','full-range CSV download','single-update CSV download','date validation','notes/contact save','new location/empty rate','API failure/retry','no page overflow']}))
finally:
    server.shutdown()
