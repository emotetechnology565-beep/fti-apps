import json
from playwright.sync_api import sync_playwright, expect

slugs = ['tmt', 'flat', 'round-bar-as-rolled', 'round-bright-bar', 'sheet', 'square']
names = ['TMT Bar', 'Flat', 'As Rolled Round Bar', 'Round Bright Bar', 'Sheet', 'Square']
categories = [dict(id=s, slug=s, name=n) for s, n in zip(slugs, names)]
products = [dict(id=s, slug=s, name=n, category=n, category_id=s, product_kind='steel', status='published', purchase_mode='rfq', description=None, variants=[]) for s, n in zip(slugs, names)]

def api(route):
    body = route.request.post_data_json or {} if route.request.method == 'POST' else {}
    op = body.get('operation')
    result = []
    if op == 'fti_catalog_filtered_list':
        result = dict(items=products, total=6, categories=categories)
    elif op == 'fti_catalog_media_public':
        # Deliberately missing photos for four categories and a wrong round-bar photo.
        result = [dict(id='wrong', product_id='round-bar-as-rolled', mime_type='image/jpeg', url='https://invalid.example/tmt.jpg')]
    route.fulfill(status=200, content_type='application/json', body=json.dumps(dict(data=result)), headers={'Access-Control-Allow-Origin': '*'})

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.route('https://*.supabase.co/**', api)
    for width in [1440, 390]:
        page.set_viewport_size(dict(width=width, height=1000))
        page.goto('http://127.0.0.1:8097/', timeout=60000)
        for name in names:
            img = page.get_by_role('img', name=name, exact=True)
            expect(img).to_be_visible(timeout=60000)
            img.evaluate('(el) => el.decode()')
            assert img.evaluate('(el) => el.naturalWidth > 0')
        round_src = page.get_by_role('img', name='As Rolled Round Bar', exact=True).get_attribute('src')
        assert 'round-bar-as-rolled' in round_src
        page.screenshot(path=f'artifacts/home-category-images-{width}.png', full_page=True)
    browser.close()
print('All six category photos loaded on desktop and mobile; round bar uses the correct asset.')
