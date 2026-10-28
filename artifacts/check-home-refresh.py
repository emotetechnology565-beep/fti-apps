from pathlib import Path
import threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
exec(Path('scripts/home-navigation-browser.py').read_text().split('with sync_playwright() as p:')[0])
class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
    def do_GET(self):
        if '.' not in self.path.rsplit('/',1)[-1]: self.path='/index.html'
        super().do_GET()
server=ThreadingHTTPServer(('127.0.0.1',8121),partial(Handler,directory=str(Path('dist').resolve())))
threading.Thread(target=server.serve_forever,daemon=True).start()
BASE='http://127.0.0.1:8121'
def mock(route):
    if 'fti_customer_orders' in route.request.url:
        route.fulfill(status=200,content_type='application/json',headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'},body=json.dumps({'total':1,'orders':[{'id':'order-1','kind':'material','reference':'FTI-RM-TEST','status':'shipped','created_at':'2026-10-28T12:00:00Z','details':{'material':'Round bars'},'fulfillment':{}}]}))
    else: api(route)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    for width in [320,390,1440]:
        context=browser.new_context(viewport={'width':width,'height':950})
        context.route('https://*.supabase.co/**',mock)
        context.route('https://ftis.b-cdn.net/**',lambda r:r.fulfill(status=200,content_type='image/jpeg',body=Path('assets/materials/round-bar-as-rolled.jpg').read_bytes()))
        context.add_init_script('localStorage.setItem("fti-auth-v2",'+json.dumps(json.dumps(session))+');localStorage.setItem("fti-workspace-v2-'+actor+'",'+json.dumps(json.dumps({'state':{'cart':[{'productId':'test','quantity':2}]},'version':0}))+')')
        page=context.new_page()
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE,wait_until='networkidle')
        expect(page.get_by_text('FTI-RM-TEST',exact=True)).to_be_visible()
        expect(page.get_by_text('Continue your order',exact=True)).to_be_visible()
        expect(page.get_by_text('In transit',exact=True)).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=f'artifacts/home-refresh-{width}.png',full_page=True)
        page.get_by_role('textbox',name='Search products',exact=True).fill('M12')
        page.get_by_role('button',name='Search catalogue',exact=True).click()
        expect(page).to_have_url(BASE+'/products?search=M12')
        context.close()
    browser.close()
server.shutdown()
assert not errors,errors
print('PASS: 320/390/1440px, latest order, cart, search, no overflow or browser errors')
