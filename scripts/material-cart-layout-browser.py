"""Local fixture test for shared raw-material/fastener layout and staged cart."""
import json, threading, re
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright, expect
root=Path.cwd()
directory=root/'artifacts/tracking-preview'
assert (directory/'index.html').exists(), str(directory)
class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if not Path(self.translate_path(self.path.split('?')[0])).is_file() and '.' not in self.path.split('?')[0].rsplit('/',1)[-1]: self.path='/index.html'
        super().do_GET()
    def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(directory)))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
product={'id':'00000000-0000-4000-8000-000000000002','slug':'round-bar-as-rolled','name':'Round Bar As Rolled','category':'Round Bar As Rolled','category_id':'round','product_kind':'steel','purchase_mode':'rfq','status':'published','description':'Round bars','variants':[]}
category={'id':'round','slug':'round-bar-as-rolled','name':'Round Bars','product_kind':'steel','dimension_label':'Diameter (mm)'}
size={'id':'size12','label':'12 mm','dimensions':{'diameter_mm':12}}
option={'id':'option12','product_id':product['id'],'product_name':product['name'],'grade':'EN8','uom':'MT','min_order_qty':1,'variant_id':None,'attributes':{'grade_list_price':'19000'}}
errors=[]
def api(route):
    result=[];req=route.request
    if req.method!='OPTIONS' and '/functions/v1/' in req.url:
        body=req.post_data_json or {};op=body.get('operation');args=body.get('arguments',{})
        if op=='fti_catalog_product_get':result=product
        elif op=='fti_catalog_selection_options':result={'categories':[category],'category':category,'sizes':[size],'options':[option] if args.get('p_size_id') else []}
        result={'data':result}
    route.fulfill(status=200,content_type='application/json',body=json.dumps(result),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'})
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    for width in [390,1440]:
        context=browser.new_context(viewport={'width':width,'height':1000})
        context.route('https://*.supabase.co/**',api)
        page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto(base+'/product/'+product['id'],wait_until='networkidle')
        page.get_by_role('radio',name='12 mm',exact=True).click()
        page.get_by_role('radio',name='EN8',exact=True).click()
        page.get_by_role('textbox',name='Quantity in MT',exact=True).fill('3')
        button=page.get_by_role('button',name='Add to Cart',exact=False)
        button.click()
        notice=page.get_by_text('Added to cart. Choose another size or proceed from your cart.',exact=True)
        expect(notice).to_be_visible()
        assert notice.evaluate('el => getComputedStyle(el).color')=='rgb(22, 101, 52)'
        assert button.evaluate("el => {for(let n=el;n;n=n.parentElement){if(getComputedStyle(n).position==='fixed')return false;}return true;}")
        expect(page.get_by_text('Material specifications',exact=True)).to_have_count(0)
        expect(page.get_by_role('alert').filter(has_text='Added to cart')).to_have_count(0)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=str(root/f'artifacts/material-cart-fixed-{width}.png'),full_page=True)
        page.get_by_role('button',name='View cart',exact=True).click()
        expect(page.get_by_text('Quantity: 3 MT',exact=True)).to_be_visible()
        expect(page.get_by_text('Configured Lots',exact=True)).to_be_visible()
        expect(page.get_by_text('Commercial Breakdown',exact=True)).to_be_visible()
        page.get_by_role('button',name='Increase Round Bar As Rolled',exact=True).click()
        expect(page.get_by_text('Quantity: 4 MT',exact=True)).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.get_by_text('Commercial Breakdown',exact=True).scroll_into_view_if_needed()
        page.screenshot(path=str(root/f'artifacts/cart-theme-{width}.png'),full_page=True)
        page.get_by_role('button',name='Decrease Round Bar As Rolled',exact=True).click()
        expect(page.get_by_text('Quantity: 3 MT',exact=True)).to_be_visible()
        page.get_by_role('button',name='Remove Round Bar As Rolled',exact=True).click()
        expect(page.get_by_text('Your cart is empty',exact=True)).to_be_visible()
        context.close()
    browser.close()
server.shutdown();assert not errors,errors
print('PASS: inline cart action, green success status, no material specification panel, selected quantity retained in cart; mobile/desktop')
