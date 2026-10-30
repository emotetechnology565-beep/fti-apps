"""Mobile reference captures and live-route checkout acceptance using isolated API fixtures."""
import base64
import json
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

out = Path('artifacts/raw-material-review')
out.mkdir(parents=True, exist_ok=True)
actor = '00000000-0000-0000-0000-000000000001'
enc = lambda value: base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
token = enc({'alg':'HS256'}) + '.' + enc({'sub':actor,'role':'authenticated','aud':'authenticated','aal':'aal1','iat':int(time.time()),'exp':int(time.time())+3600}) + '.isolated'
user = {'id':actor,'aud':'authenticated','role':'authenticated','phone':'919000000001','app_metadata':{},'user_metadata':{}}
session = {'access_token':token,'refresh_token':'isolated','expires_at':int(time.time())+3600,'expires_in':3600,'token_type':'bearer','user':user}
identity = {'profile':{'id':actor,'full_name':'Test Buyer','phone':'+919000000001','account_status':'active'},'roles':['customer'],'permissions':[],'businesses':[],'deletion_requested':False}
product = {'id':'bright-product','slug':'round-bright-bar','name':'Round Bright Bar','category':'round-bright-bar','category_id':'bright','product_kind':'steel','purchase_mode':'both','status':'published','description':'Bright round bars in MS and alloy steel.','variants':[]}
category = {'id':'bright','slug':'round-bright-bar','name':'Round Bright Bar','product_kind':'steel','dimension_label':'Diameter (mm)'}
size = {'id':'size40','label':'40 mm','dimensions':{'diameter_mm':40}}
option = {'id':'option40','product_id':product['id'],'product_name':product['name'],'grade':'EN-8','uom':'kg','min_order_qty':100,'variant_id':None,'attributes':{'grade_list_price':'72000','sheet_flat_net_prate':'72000','sheet_flat_gst_included':False}}
line = {'productId':product['id'],'variantId':'basket40','quantity':500,'material':{'key':'basket40','name':product['name'],'size':'40 mm','grade':'EN-8','unit':'kg','minimum':100,'optionId':'option40','indicativePrice':{'amount':999999,'unit':'kg','tax':'cached price must never be displayed'}}}
errors=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    for width in (390, 360):
        context=browser.new_context(viewport={'width':width,'height':900})
        context.add_init_script('if (!localStorage.getItem("fti-auth-v2")) localStorage.setItem("fti-auth-v2", '+json.dumps(json.dumps(session))+');')
        context.add_init_script('if (!localStorage.getItem("fti-workspace-v2-'+actor+'")) localStorage.setItem("fti-workspace-v2-'+actor+'", '+json.dumps(json.dumps({'state':{'cart':[line],'saved':[],'market':''},'version':0}))+');')
        submissions=[]
        def api(route):
            req=route.request
            result=[]
            if req.method!='OPTIONS':
                if '/auth/v1/user' in req.url: result=user
                else:
                    body=req.post_data_json or {}
                    direct='/rest/v1/rpc/' in req.url
                    op=req.url.rsplit('/',1)[-1] if direct else body.get('operation')
                    args=body if direct else body.get('arguments',{})
                    if op=='fti_identity_me': result=identity
                    elif op=='fti_subscription_status': result={'active':False,'expires_at':None,'amount_paise':10000,'revision':1,'currency':'INR','purchases':[]}
                    elif op=='fti_catalog_product_get': result=product
                    elif op=='fti_catalog_selection_options': result={'categories':[category],'category':category,'sizes':[size],'options':[option] if args.get('p_size_id') else []}
                    elif op=='fti_commerce_addresses': result=[{'id':'address1','business_id':None,'line1':'1 Factory Road','city':'Ludhiana','state':'Punjab','pincode':'141001'}]
                    elif op=='fti_catalog_selection_request_submit':
                        submissions.append(args)
                        result={'id':args['p_id'],'reference':'FTI-RM-TEST-001','replayed':False}
                    elif op in ('fti_catalog_filtered_list','fti_catalog_list'): result={'items':[],'total':0,'categories':[]}
                    elif op=='fti_customer_orders': result={'orders':[],'total':0}
                    if not direct: result={'data':result}
            route.fulfill(status=200,content_type='application/json',body=json.dumps(result),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'})
        context.route('https://*.supabase.co/**',api)
        page=context.new_page()
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto('http://127.0.0.1:8175/cart',wait_until='domcontentloaded')
        expect(page.get_by_role('header',name='Your Cart')).to_be_visible(timeout=30000) if False else expect(page.get_by_text('Your Cart',exact=True)).to_be_visible(timeout=30000)
        assert '999999' not in page.locator('body').inner_text()
        page.screenshot(path=str(out/f'live-cart-{width}.png'),full_page=True)
        page.get_by_role('button',name='Request quotation',exact=True).click()
        expect(page.get_by_text('Delivery Address',exact=True)).to_be_visible(timeout=15000)
        page.get_by_label('Company / buyer name *',exact=True).fill('Test Engineering')
        page.screenshot(path=str(out/f'live-address-{width}.png'),full_page=True)
        page.get_by_role('button',name='Save & Continue').click()
        expect(page.get_by_text('Delivery Options',exact=True)).to_be_visible()
        page.screenshot(path=str(out/f'live-delivery-{width}.png'),full_page=True)
        page.get_by_role('button',name='Continue to Review').click()
        expect(page.get_by_text('Review Quotation Request',exact=True)).to_be_visible()
        assert '999999' not in page.locator('body').inner_text()
        page.screenshot(path=str(out/f'live-review-{width}.png'),full_page=True)
        page.get_by_role('checkbox').first.click()
        page.get_by_role('button',name='Submit Quotation Request').click()
        expect(page.get_by_text('FTI-RM-TEST-001',exact=True)).to_be_visible(timeout=15000)
        assert len(submissions)==1
        page.screenshot(path=str(out/f'live-acknowledgement-{width}.png'),full_page=True)
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'horizontal overflow'
        context.close()
    browser.close()
assert not errors,errors
print('PASS: actual mobile cart -> delivery address -> delivery options -> review -> acknowledgement; hidden prices, isolated submission, no horizontal overflow at 360/390.')
