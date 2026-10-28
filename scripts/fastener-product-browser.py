"""Local fixture test for shared raw-material/fastener layout and staged cart."""
import json, threading, re
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright, expect
root=Path.cwd()
directory=root/'artifacts/fastener-preview'
assert (directory/'index.html').exists(), str(directory)
class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if not Path(self.translate_path(self.path.split('?')[0])).is_file() and '.' not in self.path.split('?')[0].rsplit('/',1)[-1]: self.path='/index.html'
        super().do_GET()
    def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(directory)))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
definition=json.loads((root/'deployment/fastener-dimensions/hex-source-definitions.json').read_text())[0]
definition.update(id='00000000-0000-4000-8000-000000000001',revision=1,published_revision=1)
definition['dimensions']['lengths']=[60]
errors=[]
def api(route):
    result=[]
    req=route.request
    if '/rest/v1/fastener_grade_rates' in req.url: result=[{'grade':'8.8','bolt_rate':90,'nut_rate':95,'revision':1}]
    elif req.method!='OPTIONS' and '/functions/v1/' in req.url:
        op=(req.post_data_json or {}).get('operation')
        if op=='fti_catalog_drawing_list': result=[definition]
        elif op=='fti_catalog_fastener_photos': result=[]
        elif op=='fti_catalog_filtered_list': result={'items':[],'total':0,'categories':[{'id':'fasteners','slug':'fasteners','name':'Industrial Fasteners'}],'grades':[]}
        result={'data':result}
    route.fulfill(status=200,content_type='application/json',body=json.dumps(result),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'})
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    for width in [320,390,1440]:
        context=browser.new_context(viewport={'width':width,'height':1000})
        context.route('https://*.supabase.co/**',api)
        page=context.new_page(); page.on('pageerror',lambda error: errors.append(str(error)))
        page.goto(base+'/products?category=fasteners',wait_until='networkidle')
        expect(page.get_by_role('button',name='Hex bolt',exact=True)).to_be_visible()
        page.get_by_role('button',name='Hex bolt',exact=True).click()
        expect(page.get_by_text('Product Specification Detail',exact=True)).to_be_visible()
        expect(page.get_by_text('1. Standard & size specifications',exact=True)).to_be_visible()
        expect(page.get_by_text('2. Consignment Quantity',exact=True)).to_be_visible()
        page.get_by_role('radio',name='8.8',exact=True).click()
        page.get_by_role('textbox',name='Quantity in piece',exact=True).fill('10')
        page.get_by_role('button',name='Add to Cart',exact=True).click()
        expect(page.get_by_text('Added to cart. Choose another size or proceed from your cart.',exact=True)).to_be_visible()
        assert page.get_by_role('textbox',name='Buyer name',exact=True).count()==0
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=str(root/f'artifacts/fastener-product-{width}.png'),full_page=True)
        page.get_by_role('button',name='View cart',exact=True).click()
        expect(page.get_by_text('Quantity: 10 piece',exact=True)).to_be_visible()
        expect(page.get_by_text(re.compile(r'IS 1363:1967 / M6 / L 60 mm.*8[.]8'))).to_be_visible()
        context.close()
    browser.close()
server.shutdown()
assert not errors, errors
print('PASS: Fastener navigation, shared layout, grade/quantity selection, add to cart, retained configuration and no dispatch form; 320/390/1440px')
