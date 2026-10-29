import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

definitions = []
for name in ['source-definitions.json', 'hex-source-definitions.json']:
    definitions += json.loads(Path('deployment/fastener-dimensions', name).read_text())
for index, row in enumerate(definitions):
    row.update(id=f'00000000-0000-0000-0000-{index+10:012d}', revision=1, published_revision=1)

def api(route):
    body = route.request.post_data_json or {} if route.request.method == 'POST' else {}
    result = definitions if body.get('operation') == 'fti_catalog_drawing_list' else []
    route.fulfill(status=200, content_type='application/json', body=json.dumps({'data': result}), headers={'Access-Control-Allow-Origin': '*'})

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width in [1440, 390]:
        context = browser.new_context(viewport={'width': width, 'height': 1000})
        context.route('https://*.supabase.co/**', api)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        for slug in ['hex-bolt', 'u-bolt']:
            page.goto('http://127.0.0.1:8097/fastener/' + slug, timeout=60000)
            expect(page.get_by_role('button', name='Back to catalogue', exact=True)).to_be_visible(timeout=60000)
            specs = page.get_by_role('tab', name='Specifications', exact=True)
            specs.scroll_into_view_if_needed()
            expect(specs).to_be_visible()
            page.get_by_role('tab', name='Description', exact=True).click()
            expect(page.get_by_text('Confirm your required material, grade, finish, quantity and availability when requesting a quote.', exact=True)).to_be_visible()
            specs.click()
            expect(page.get_by_text('Drawing standards', exact=True)).to_be_visible()
            if slug == 'hex-bolt':
                expect(page.get_by_text('Threading capacity', exact=True)).to_be_visible()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.screenshot(path=f'artifacts/fastener-details-{slug}-{width}.png', full_page=True)
            page.get_by_role('button', name='Back to catalogue', exact=True).click()
            page.wait_for_url('**/products?kind=fastener')
        assert not errors, errors
        context.close()
    browser.close()
print('Hex/U bolt pages: desktop/mobile tabs, specifications, back navigation and layout passed.')
