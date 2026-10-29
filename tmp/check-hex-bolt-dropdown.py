import json
from playwright.sync_api import sync_playwright, expect

def api(route):
    body = route.request.post_data_json or {} if route.request.method == 'POST' else {}
    op = body.get('operation')
    result = []
    if op == 'fti_catalog_fastener_photos':
        result = [{'slug': slug, 'label': name, 'image_url': None} for slug, name in [('hex-bolt', 'Hex bolt'), ('hex-nut', 'Hex nut')]]
    route.fulfill(status=200, content_type='application/json', body=json.dumps({'data': result}), headers={'Access-Control-Allow-Origin': '*'})

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width in [1440, 390]:
        context = browser.new_context(viewport={'width': width, 'height': 1000})
        context.route('https://*.supabase.co/**', api)
        page = context.new_page()
        page.goto('http://127.0.0.1:8097/products?kind=fastener', timeout=60000)
        toggle = page.get_by_role('button', name='Hex bolt manufacturing details', exact=True)
        expect(toggle).to_have_count(1)
        expect(page.get_by_text('Finishing facilities', exact=True)).to_have_count(0)
        toggle.click()
        for label in ['Material used', 'Material grades', 'Cold forging', 'Hot forging', 'Threading capacity', 'Threads available', 'Manufacturing process', 'Inspection', 'Facilities available', 'Finishing facilities']:
            expect(page.get_by_text(label, exact=True)).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=f'artifacts/hex-bolt-dropdown-{width}.png', full_page=True)
        toggle.click()
        expect(page.get_by_text('Finishing facilities', exact=True)).to_have_count(0)
        context.close()
    browser.close()
print('Hex bolt dropdown expands/collapses all 10 detail groups on desktop and mobile; no horizontal overflow.')
