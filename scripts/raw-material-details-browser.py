"""Isolated raw-material summary/detail checks. No remote records are changed."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

base = 'http://127.0.0.1:' + (sys.argv[1] if len(sys.argv) > 1 else '8098')
out = Path('artifacts/raw-material-details')
out.mkdir(parents=True, exist_ok=True)
products = {}
for slug, name, category in [('round-bright-bar', 'Round Bright Bar', 'Round Bright Bar'), ('square', 'Square Bar', 'Square'), ('flat', 'Flat Bar', 'Flat'), ('sheet', 'Steel Sheet', 'Sheet'), ('round-bar-as-rolled', 'As Rolled Round Bar', 'Round Bar As Rolled'), ('roof-sheet', 'Roof Sheet', 'Roof Sheets'), ('tmt', 'TMT Bars', 'TMT')]:
    products[slug] = {'id': slug, 'slug': slug, 'name': name, 'category': category, 'category_id': slug,
                      'description': None, 'product_kind': 'steel', 'purchase_mode': 'rfq', 'status': 'published', 'variants': []}
errors = []

def api(route):
    result = []
    request = route.request
    if request.method != 'OPTIONS' and '/functions/v1/' in request.url:
        body = request.post_data_json or {}
        op = body.get('operation')
        args = body.get('arguments', {})
        if op == 'fti_catalog_filtered_list':
            result = {'items': list(products.values()), 'total': len(products), 'categories': [], 'grades': []}
        elif op == 'fti_catalog_product_get':
            result = products.get(args.get('p_id'))
        elif op == 'fti_catalog_selection_options':
            result = {'categories': [], 'category': None, 'sizes': [], 'options': []}
        result = {'data': result}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(result), headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'})

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width, height in [(320, 740), (390, 844), (1440, 1000)]:
        context = browser.new_context(viewport={'width': width, 'height': height})
        context.route('https://*.supabase.co/**', api)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(base + '/products?search=steel', wait_until='networkidle')
        expect(page.get_by_text('Advertised size range', exact=True)).to_have_count(7)
        expect(page.get_by_text('Special-grade MOQ', exact=True)).to_have_count(7)
        expect(page.get_by_text('10 MT (special grade only)', exact=True)).to_have_count(3)
        expect(page.get_by_text('12–80 mm', exact=True)).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=str(out / f'cards-{width}.png'), full_page=True)
        page.get_by_role('link', name='View specifications for Round Bright Bar', exact=True).click()
        expect(page).to_have_url(base + '/product/round-bright-bar')
        expect(page.get_by_text('Material specifications', exact=True)).to_be_visible()
        expect(page.get_by_text('Advertised steel grades', exact=True)).to_be_visible()
        expect(page.get_by_text('Bright bar drawing', exact=True)).to_be_visible()
        expect(page.get_by_text('10 MT (special grade only)', exact=True).filter(visible=True)).to_have_count(0)
        page.screenshot(path=str(out / f'detail-{width}.png'), full_page=True)
        page.goto(base + '/product/roof-sheet')
        expect(page.get_by_text('1060–1142 mm', exact=True)).to_be_visible()
        expect(page.get_by_text('Advertised steel grades', exact=True).filter(visible=True)).to_have_count(0)
        page.goto(base + '/product/tmt')
        expect(page.get_by_text('Confirm required grade with FTI', exact=True)).to_be_visible()
        expect(page.get_by_text('10 MT (special grade only)', exact=True).filter(visible=True)).to_have_count(0)
        context.close()
    browser.close()
assert not errors, errors
print('PASS: 3 summary fields, full details on open, grade-list scope, special-grade MOQ scope, roof dimensions, TMT fallback, mobile/desktop; no runtime errors')
