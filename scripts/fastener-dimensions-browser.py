"""Local app acceptance with intercepted APIs; no remote business records are changed."""
import base64
import copy
import json
import re
import time
import threading
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results' / 'fastener-app'
OUT.mkdir(parents=True, exist_ok=True)
definitions = json.loads((ROOT / 'deployment/fastener-dimensions/source-definitions.json').read_text())
definitions += json.loads((ROOT / 'deployment/fastener-dimensions/hex-source-definitions.json').read_text())
for index, row in enumerate(definitions):
    row.update(id=f'00000000-0000-0000-0000-{index+10:012d}',revision=1,published_revision=1)
actor='00000000-0000-0000-0000-000000000001'
encode=lambda v:base64.urlsafe_b64encode(json.dumps(v).encode()).decode().rstrip('=')
token=encode({'alg':'HS256'})+'.'+encode({'sub':actor,'role':'authenticated','aal':'aal2','exp':int(time.time())+3600})+'.isolated'
user={'id':actor,'aud':'authenticated','role':'authenticated','phone':'919000000001','app_metadata':{},'user_metadata':{}}
session={'access_token':token,'refresh_token':'isolated','expires_at':int(time.time())+3600,'expires_in':3600,'token_type':'bearer','user':user}
identity={'profile':{'id':actor,'full_name':'Test Admin','phone':'+919000000001','account_status':'active'},'roles':['super_admin'],'permissions':['staff.access','catalog.manage'],'businesses':[],'deletion_requested':False}
writes=[]
photo_asset='00000000-0000-0000-0000-000000000099'
photo_image='https://images.example.test/u-bolt.jpg'
photo_cards=[{'slug':'u-bolt','label':'U bolt','image_url':photo_image,'asset_id':photo_asset,'published':True,'revision':1}]
def api(route):
    request=route.request
    result=[]
    if '/auth/v1/user' in request.url:result=user
    elif request.method!='OPTIONS':
        body=request.post_data_json or {}
        op=body.get('operation');args=body.get('arguments',{})
        if op=='fti_identity_me':result=identity
        elif op=='fti_catalog_admin_list':result={'categories':[{'id':'category-fasteners','name':'Industrial Fasteners','slug':'fasteners','is_active':True,'sort_order':0}],'products':[{'id':'product-u-bolt','category_id':'category-fasteners','name':'U bolt','slug':'u-bolt','description':'','product_kind':'fastener','purchase_mode':'rfq','status':'draft','variants':[]}]}
        elif op=='fti_catalog_selection_options':result={'categories':[],'sizes':[],'options':[]}
        elif op in ['fti_catalog_list','fti_catalog_filtered_list']:result={'items':[],'total':0,'categories':[]}
        elif op in ['fti_catalog_drawing_list','fti_catalog_drawing_admin']:result=copy.deepcopy(definitions)
        elif op=='fti_catalog_fastener_photos':result=[{'slug':r['slug'],'label':r['label'],'image_url':r['image_url']} for r in photo_cards if r['published']]
        elif op=='fti_catalog_fastener_photo_admin':result={'cards':copy.deepcopy(photo_cards),'photos':[{'id':photo_asset,'product_name':'U bolt','image_url':photo_image}]}
        elif op=='fti_catalog_fastener_photo_save':
            card=photo_cards[0]
            assert args['p_revision']==card['revision']
            card['asset_id']=args['p_asset_id'];card['published']=args['p_published'];card['revision']+=1
            writes.append(op);result=copy.deepcopy(card)
        elif op=='fti_catalog_drawing_subcategory_save':
            row=next(r for r in definitions if r['id']==args['p_id'])
            assert args['p_revision']==row['revision']
            row.update(args['p_definition']);row['revision']+=1
            writes.append(op);result=copy.deepcopy(row)
        elif op=='fti_catalog_drawing_publish':
            row=next(r for r in definitions if r['id']==args['p_id'])
            assert args['p_revision']==row['revision']
            row['revision']+=1;row['published_revision']=row['revision'] if args['p_visible'] else None
            writes.append(op);result=copy.deepcopy(row)
    route.fulfill(status=204 if request.method=='OPTIONS' else 200,content_type='application/json',headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'},body='' if request.method=='OPTIONS' else json.dumps(result if '/auth/' in request.url else {'data':result}))

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if not Path(self.translate_path(self.path.split('?')[0])).is_file() and '.' not in self.path.split('?')[0].rsplit('/',1)[-1]:self.path='/index.html'
        super().do_GET()
    def log_message(self,*args):pass

server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT/'dist')))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context=browser.new_context(viewport={'width':390,'height':844})
    context.route('https://*.supabase.co/**',api)
    context.route('https://images.example.test/**',lambda route:route.fulfill(status=200,content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="180" height="150"><rect width="180" height="150" fill="white"/><path d="M50 20V90Q50 130 90 130Q130 130 130 90V20" fill="none" stroke="black" stroke-width="12"/></svg>'))
    context.add_init_script('localStorage.setItem("fti-auth-v2",'+json.dumps(json.dumps(session))+')')
    page=context.new_page();errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(base+'/products',wait_until='networkidle')
    expect(page.get_by_role('button',name='Raw Materials',exact=True)).to_be_visible()
    expect(page.get_by_role('button',name='Fasteners',exact=True)).to_be_visible()
    expect(page.get_by_role('button',name='Tractor Parts',exact=True)).to_be_visible()
    expect(page.get_by_text('Fastener selection',exact=True)).to_have_count(0)
    expect(page.get_by_role('textbox',name='Search catalogue',exact=True)).to_be_visible()
    expect(page.get_by_text('15 products',exact=True)).to_have_count(0)
    page.get_by_role('button',name='Fasteners',exact=True).click()
    expect(page.get_by_text('Fastener selection',exact=True)).to_be_visible()
    expect(page.get_by_text('Fastener subcategory',exact=True)).to_be_visible()
    expect(page.get_by_role('button',name='Choose U bolt photo',exact=True)).to_be_visible()
    photo=page.get_by_role('img',name='U bolt product photo',exact=True)
    expect(photo).to_have_js_property('complete',True)
    assert photo.evaluate('(img)=>img.naturalWidth')>0
    expect(page.get_by_text('0 products',exact=True)).to_have_count(0)
    expect(page.get_by_text('No products available',exact=True)).to_have_count(0)
    expect(page.get_by_text('Page 1 of 1',exact=True)).to_have_count(0)
    expect(page.get_by_text('Fastener family',exact=True)).to_have_count(0)
    expect(page.get_by_text('Shape',exact=True)).to_have_count(0)
    expect(page.get_by_text('Drawing preview',exact=True)).to_have_count(0)
    expect(page.get_by_text('Find by IS standard (optional)',exact=True)).to_have_count(0)
    page.get_by_role('textbox',name='Search fasteners',exact=True).fill('U type')
    expect(page.get_by_role('button',name='Choose U bolt photo',exact=True)).to_be_visible()
    expect(page.get_by_role('button',name='Choose J type bolt photo',exact=True)).to_have_count(0)
    page.get_by_role('button',name='Fastener subcategory: Choose fastener subcategory',exact=True).click()
    assert page.get_by_role('radio',name='U bolt',exact=True).count()==1
    assert page.get_by_role('radio',name='Hex bolt',exact=True).count()==0
    page.get_by_role('button',name='Close filter',exact=True).click()
    page.get_by_role('textbox',name='Search fasteners',exact=True).fill('')
    page.get_by_role('button',name='Fastener subcategory: Choose fastener subcategory',exact=True).click()
    assert page.get_by_role('radio',name='Hex bolt',exact=True).count()==1
    assert page.get_by_role('radio',name='Sq.plate',exact=True).count()==1
    customer_names=page.get_by_role('radio').evaluate_all('(nodes)=>nodes.map(n=>n.getAttribute("aria-label"))')
    page.get_by_role('radio',name='Plain washer',exact=True).click()
    expect(page).to_have_url(base+'/fastener/plain-washer')
    expect(page.get_by_text('No published sizes or drawings are available for this subcategory yet. Contact FTI for a quotation.',exact=True)).to_be_visible()
    expect(page.get_by_role('button',name='Choose U bolt photo',exact=True)).to_have_count(0)
    page.get_by_role('button',name='Back to fasteners',exact=True).click()
    expect(page).to_have_url(base+'/products')
    page.get_by_role('button',name='Choose U bolt photo',exact=True).click()
    expect(page).to_have_url(base+'/fastener/u-bolt')
    expect(page.get_by_role('button',name='Choose J type bolt photo',exact=True)).to_have_count(0)
    expect(page.get_by_text('Size',exact=True)).to_have_count(0)
    expect(page.get_by_role('button',name='IS standard: IS 730:1978',exact=True)).to_be_visible()
    page.get_by_role('button',name='Shape: Choose shape',exact=True).click()
    page.get_by_role('radio',name=re.compile(r'^U .+ round bend$')).click()
    expect(page.get_by_text('Drawing preview',exact=True)).to_have_count(0)
    page.get_by_role('button',name='Size: Choose size',exact=True).click()
    page.get_by_role('radio',name='M8',exact=True).click()
    expect(page.get_by_role('textbox',name='Inside radius R1 (mm)',exact=True)).to_have_count(0)
    page.get_by_role('textbox',name='Length L (mm)',exact=True).fill('120')
    expect(page.get_by_role('textbox',name='Inside radius R1 (mm)',exact=True)).to_be_visible()
    image=page.get_by_role('img',name='IS 730:1978, M8. Length 120 mm. Schematic drawing.',exact=True)
    expect(image).to_be_visible()
    expect(image).to_have_js_property('complete',True)
    assert image.evaluate('(img)=>img.naturalWidth')>0
    page.screenshot(path=str(OUT/'customer-mobile.png'),full_page=True)
    page.get_by_role('textbox',name='Inside radius R1 (mm)',exact=True).fill('999')
    expect(page.get_by_text('Enter an inside radius that leaves a straight leg below length L.',exact=True)).to_be_visible()
    page.goto(base+'/fastener/l-bolt',wait_until='networkidle')
    expect(page.get_by_text('L type bolt',exact=True).first).to_be_visible()
    expect(page.get_by_role('button',name='Choose J type bolt photo',exact=True)).to_have_count(0)
    expect(page.get_by_role('button',name='Choose U bolt photo',exact=True)).to_have_count(0)
    expect(page.get_by_role('button',name='IS standard: IS 730:1978',exact=True)).to_be_visible()
    expect(page.get_by_role('button',name='Shape: Choose shape',exact=True)).to_have_count(0)
    page.goto(base+'/fastener/hex-bolt',wait_until='networkidle')
    expect(page.get_by_role('button',name='IS standard: IS 1363:1967',exact=True)).to_be_visible()
    page.get_by_role('button',name='Shape: Choose shape',exact=True).click()
    page.get_by_role('radio',name='Hex bolt',exact=True).click()
    page.get_by_role('button',name='Size: Choose size',exact=True).click()
    page.get_by_role('radio',name='M6',exact=True).click()
    page.get_by_role('textbox',name='Length L (mm)',exact=True).fill('120')
    expect(page.get_by_role('img',name='IS 1363:1967, M6. Length 120 mm. Schematic drawing.',exact=True)).to_be_visible()
    page.screenshot(path=str(OUT/'hex-bolt-mobile.png'),full_page=True)
    page.goto(base+'/fastener/hex-nut',wait_until='networkidle')
    page.get_by_role('button',name='Shape: Choose shape',exact=True).click()
    page.get_by_role('radio',name='Hex nut',exact=True).click()
    page.get_by_role('button',name='Size: Choose size',exact=True).click()
    page.get_by_role('radio',name='M6',exact=True).click()
    expect(page.get_by_role('textbox',name='Length L (mm)',exact=True)).to_have_count(0)
    expect(page.get_by_role('img',name='IS 1363:1967, M6. Thickness 5.38 mm. Schematic drawing.',exact=True)).to_be_visible()
    page.screenshot(path=str(OUT/'hex-nut-mobile.png'),full_page=True)
    page.goto(base+'/admin?section=catalogue',wait_until='networkidle')
    page.get_by_role('button',name='Fasteners',exact=True).click()
    page.get_by_role('button',name='Manage fastener dimensions',exact=True).click()
    page.get_by_role('button',name='Choose',exact=True).click()
    page.get_by_role('radio',name='U bolt',exact=True).click()
    page.get_by_role('button',name='Publish subcategory photo',exact=True).click()
    expect(page.get_by_text('Subcategory photo published.',exact=True)).to_be_visible()
    page.get_by_role('button',name='Edit dimensions',exact=True).first.click()
    expect(page.get_by_text('Fastener family',exact=True)).to_have_count(0)
    expect(page.get_by_role('textbox',name='Head height (mm)',exact=True)).to_have_count(0)
    page.get_by_role('button',name='J type bolt',exact=True).click()
    admin_names=page.get_by_role('radio').evaluate_all('(nodes)=>nodes.map(n=>n.getAttribute("aria-label"))')
    assert set(customer_names[1:]).issubset(set(admin_names)),(customer_names,admin_names)
    page.get_by_role('radio',name='J type bolt',exact=True).click()
    page.get_by_role('textbox',name='Diameter (mm)',exact=True).fill('9')
    page.get_by_role('button',name='Save dimension draft',exact=True).click()
    expect(page.get_by_text('Draft saved. Publish it when ready for customers.',exact=True)).to_be_visible()
    page.get_by_role('button',name='Close dimension editor',exact=True).click()
    page.get_by_role('button',name='Publish dimensions',exact=True).first.click()
    page.get_by_role('button',name='Confirm dimension visibility',exact=True).click()
    expect(page.get_by_role('button',name='Confirm dimension visibility',exact=True)).to_have_count(0)
    page.get_by_role('button',name='Add dimension definition',exact=True).click()
    page.get_by_role('button',name='J type bolt',exact=True).click()
    page.get_by_role('radio',name='Square washer',exact=True).click()
    expect(page.get_by_role('button',name='Save dimension draft',exact=True)).to_be_disabled()
    expect(page.get_by_role('textbox',name='Diameter (mm)',exact=True)).to_have_count(0)
    page.get_by_role('button',name='Close dimension editor',exact=True).click()
    page.get_by_role('button',name='Close fastener dimensions',exact=True).click()
    page.get_by_role('button',name='Open category',exact=True).click()
    page.get_by_role('button',name='Manage product',exact=True).click()
    page.get_by_role('button',name='Edit fastener entry',exact=True).click()
    page.get_by_role('button',name='Fastener subcategory: U bolt',exact=True).click()
    product_names=page.get_by_role('radio').evaluate_all('(nodes)=>nodes.map(n=>n.getAttribute("aria-label"))')
    assert set(customer_names[1:]).issubset(set(product_names)),(customer_names,product_names)
    for label in customer_names[1:]:
        assert page.get_by_role('radio',name=label,exact=True).count()==1,label
    page.get_by_role('radio',name='U bolt',exact=True).click()
    expect(page.get_by_role('textbox',name='Product name',exact=True)).to_have_count(0)
    for label in ['Variant SKU','Size / variant label','Unit of measure','Minimum order quantity','Diameter (mm)','Length (mm)','Grade','Brand']:
        expect(page.get_by_text(label,exact=True)).to_have_count(0)
    page.get_by_role('button',name='Manage customer filters and drawings',exact=True).click()
    expect(page.get_by_role('button',name='Edit dimensions',exact=True)).to_have_count(6)
    page.get_by_role('button',name='Edit dimensions',exact=True).first.click()
    expect(page.get_by_text('Shape',exact=True)).to_be_visible()
    expect(page.get_by_role('textbox',name='Hook depth (mm)',exact=True)).to_have_count(0)
    expect(page.get_by_role('textbox',name='Head height (mm)',exact=True)).to_have_count(0)
    page.screenshot(path=str(OUT/'admin-product-filters-mobile.png'),full_page=True)
    page.get_by_role('button',name='Close dimension editor',exact=True).click()
    page.screenshot(path=str(OUT/'admin-mobile.png'),full_page=True)
    assert writes==['fti_catalog_fastener_photo_save','fti_catalog_drawing_subcategory_save','fti_catalog_drawing_publish'],writes
    assert not errors,errors
    browser.close()
server.shutdown()
(OUT/'results.json').write_text(json.dumps({'passed':True,'writes':writes,'browser_errors':errors},indent=2))
print('PASS: nested fastener selection, SVG image, round input validation, admin edit/save/publish on mobile')
