"""Isolated catalogue theme and interaction checks; no remote writes."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
out = Path('artifacts/catalogue-matrix')
out.mkdir(parents=True, exist_ok=True)
def product(n, name, kind, category, grade):
    return {'id': f'00000000-0000-4000-8000-{n:012d}', 'slug': category, 'name': name, 'category': category, 'category_id': category, 'description': 'Industrial steel supply', 'product_kind': kind, 'purchase_mode': 'rfq', 'status': 'published', 'variants': [{'id': f'v-{n}', 'sku': f'FTI-{n}', 'size_label': '12 mm', 'diameter_mm': 12, 'length_mm': 6000, 'uom': 'MT', 'min_order_qty': 1, 'pack_qty': None, 'attributes': {'grade': grade, 'grade_list_price': '52500', 'grade_list_gst_included': False}}]}
products = [product(1,'TMT Rebars','steel','tmt','FE-550D'), product(2,'Round Bright Bar','steel','round-bright-bar','EN8'), product(3,'Flat Bars','steel','flat','MS'), product(4,'Tractor Pin','tractor_part','tractor-pins','EN8')]
categories = [{'id': x, 'slug': x, 'name': y} for x,y in [('tmt','TMT'), ('round-bright-bar','Bright Bars'), ('flat','Flats'),('industrial-fasteners','Industrial Fasteners')]]
errors=[]
def api(route):
    result=[]
    if route.request.method != 'OPTIONS' and '/functions/v1/' in route.request.url:
        body=route.request.post_data_json or {}
        op=body.get('operation'); args=body.get('arguments',{})
        if op=='fti_catalog_filtered_list':
            items=[p for p in products if (not args.get('p_category') or args['p_category']==p['category']) and (not args.get('p_search') or args['p_search'].lower() in p['name'].lower()) and (not args.get('p_grade') or args['p_grade']==p['variants'][0]['attributes']['grade']) and (args.get('p_ids') is None or p['id'] in args['p_ids'])]
            result={'items':items,'total':len(items),'categories':categories,'grades':['FE-550D','EN8','MS']}
        elif op=='fti_catalog_product_get': result=next((p for p in products if p['id']==args.get('p_id')),None)
        elif op=='fti_catalog_selection_options': result={'categories':[],'category':None,'sizes':[],'options':[]}
        result={'data':result}
    route.fulfill(status=200,content_type='application/json',body=json.dumps(result),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'})
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    for width,height in [(320,740),(390,844),(1440,1000)]:
        context=browser.new_context(viewport={'width':width,'height':height})
        context.route('https://*.supabase.co/**',api)
        page=context.new_page()
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto('http://127.0.0.1:8099/products',wait_until='networkidle')
        print('PAGE:',page.inner_text('body')[:2500], 'ERRORS:', errors, flush=True)
        expect(page.get_by_role('link',name='View specifications for TMT Rebars',exact=True)).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),width
        page.screenshot(path=str(out/f'catalogue-{width}.png'),full_page=True)
        page.get_by_role('link',name='View specifications for TMT Rebars',exact=True).scroll_into_view_if_needed()
        page.screenshot(path=str(out/f'cards-{width}.png'),full_page=True)
        page.get_by_role('button',name='TMT',exact=True).click()
        expect(page.get_by_role('link',name='View specifications for Round Bright Bar',exact=True)).to_have_count(0)
        page.get_by_role('button',name='All categories',exact=True).click()
        page.get_by_role('button',name='EN8',exact=True).click()
        expect(page.get_by_role('link',name='View specifications for TMT Rebars',exact=True)).to_have_count(0)
        page.get_by_role('button',name='All grades',exact=True).click()
        page.get_by_role('button',name='Save TMT Rebars',exact=True).click()
        page.get_by_role('checkbox',name='Saved materials').click()
        expect(page.get_by_role('link',name='View specifications for Round Bright Bar',exact=True)).to_have_count(0)
        page.get_by_role('checkbox',name='Saved materials').click()
        search=page.get_by_role('textbox',name='Search catalogue',exact=True)
        search.fill('Bright')
        expect(page.get_by_role('link',name='View specifications for Round Bright Bar',exact=True)).to_be_visible()
        expect(page.get_by_role('link',name='View specifications for TMT Rebars',exact=True)).to_have_count(0)
        page.get_by_role('button',name='Clear search',exact=True).click()
        page.get_by_role('button',name='Fastener',exact=True).click()
        expect(page.get_by_role('tab',name='Fastener',exact=True)).to_have_attribute('aria-selected','true')
        expect(page.get_by_role('button',name='Hex bolt',exact=True)).to_be_visible()
        expect(page.get_by_text('No matching products',exact=True)).to_have_count(0)
        page.get_by_role('button',name='Hex bolt',exact=True).click()
        expect(page).to_have_url('http://127.0.0.1:8099/fastener/hex-bolt')
        page.goto('http://127.0.0.1:8099/products?category=industrial-fasteners',wait_until='networkidle')
        expect(page.get_by_role('tab',name='Fastener',exact=True)).to_have_attribute('aria-selected','true')
        expect(page.get_by_role('button',name='Hex bolt',exact=True)).to_be_visible()
        page.get_by_role('tab',name='Tractor Spares',exact=True).click()
        expect(page.get_by_role('link',name='View specifications for Tractor Pin',exact=True)).to_be_visible()
        page.get_by_role('tab',name='Raw Steel',exact=True).click()
        page.get_by_role('button',name='Filter specifications',exact=True).click()
        expect(page.get_by_text('Specification filters',exact=True)).to_be_visible()
        page.get_by_role('button',name='Close',exact=True).click()
        page.get_by_role('link',name='View specifications for TMT Rebars',exact=True).click()
        expect(page).to_have_url('http://127.0.0.1:8099/product/'+products[0]['id'])
        context.close()
    browser.close()
assert not errors,errors
print('PASS: mobile/desktop layout, search, tabs, saved filter, specifications drawer and detail navigation; no runtime errors')
