"""Home image/navigation regression using isolated catalogue and CDN fixtures."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = 'http://127.0.0.1:' + (sys.argv[1] if len(sys.argv) > 1 else '8106')
OUT = Path('artifacts/home-product-images')
OUT.mkdir(parents=True, exist_ok=True)
CDN = 'https://ftis.b-cdn.net/home-image-test/'
version = '1'
offsets = []
errors = []
missing_steel_photos = False
categories = ['Round Bar As Rolled', 'Round Bright Bar', 'Sheet', 'Flat', 'Square', 'TMT']

def product(number, kind, category):
    return {'id': f'00000000-0000-0000-0000-{number:012d}', 'slug': f'product-{number}',
            'name': f'{category} product {number}', 'category': category, 'category_id': category,
            'product_kind': kind, 'status': 'published', 'purchase_mode': 'rfq',
            'description': None, 'variants': []}

products = [product(n, 'steel', categories[n % 6]) for n in range(1, 51)]
products += [product(51, 'tractor_part', 'Agricultural Parts'), product(52, 'fastener', 'Fasteners')]
gear = Path('deployment/website-products/images/930003d4-69f2-5bad-a80b-7f5b4058a407.jpg').read_bytes()
bolt = Path('assets/fastener-uploads/hex-bolt-black.jpg').read_bytes()
steel = Path('assets/materials/round-bar-as-rolled.jpg').read_bytes()

def api(route):
    result = []
    request = route.request
    if request.method != 'OPTIONS' and '/functions/v1/' in request.url:
        body = request.post_data_json or {}
        op = body.get('operation')
        args = body.get('arguments', {})
        if op == 'fti_catalog_filtered_list':
            offset = args.get('p_offset', 0)
            offsets.append(offset)
            result = {'items': products[offset:offset + args.get('p_limit', 50)],
                      'total': len(products), 'categories': [], 'grades': []}
        elif op == 'fti_catalog_media_public':
            result = [{'id': p['id'], 'product_id': p['id'], 'mime_type': 'image/jpeg',
                       'url': CDN + p['product_kind'] + '-' + version + '.jpg'}
                      for p in products if p['id'] in args.get('p_product_ids', [])
                      and not (missing_steel_photos and p['product_kind'] == 'steel')]
        elif op == 'fti_catalog_fastener_photos':
            result = [{'slug': 'hex-bolt', 'label': 'Hex bolt', 'image_url': CDN + 'fastener-' + version + '.jpg'}]
        elif op == 'fti_catalog_selection_options':
            result = {'categories': [], 'category': None, 'sizes': [], 'options': []}
        result = {'data': result}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(result),
                  headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'})

def cdn(route):
    body = gear if 'tractor_part' in route.request.url else bolt if 'fastener' in route.request.url else steel
    route.fulfill(status=200, content_type='image/jpeg', body=body)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    if '--live' in sys.argv:
        for width, height in [(390, 844), (1440, 1000)]:
            page = browser.new_page(viewport={'width': width, 'height': height})
            page.goto(BASE, wait_until='networkidle')
            for label in ['Shop fasteners', 'Shop tractor parts', 'Shop Round bars', 'Shop Bright bars', 'Shop Sheets', 'Shop Flat bars', 'Shop Square bars', 'Shop TMT bars']:
                image = page.get_by_role('link', name=label, exact=True).get_by_role('img')
                expect(image).to_have_attribute('src', __import__('re').compile(r'^https://'))
                expect(image).to_have_js_property('complete', True)
                assert image.evaluate('(img) => img.naturalWidth > 0'), label
            page.screenshot(path=str(OUT / f'live-home-{width}.png'), full_page=True)
            page.get_by_role('link', name='Browse tractor parts', exact=True).scroll_into_view_if_needed()
            page.screenshot(path=str(OUT / f'live-tractor-{width}.png'), full_page=True)
            page.close()
        browser.close()
        print('PASS: live published fastener/tractor photos and all six cloud material photos load at mobile/desktop widths')
        sys.exit(0)
    for width, height in [(320, 740), (390, 844), (1440, 1000)]:
        context = browser.new_context(viewport={'width': width, 'height': height})
        context.route('https://*.supabase.co/**', api)
        context.route(CDN + '**', cdn)
        context.route('https://ftis.b-cdn.net/home-category-images/**', cdn)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE, wait_until='networkidle')
        expect(page.get_by_text('Shop by category', exact=True)).to_be_visible()
        for label, kind in [('Fasteners', 'fastener'), ('Tractor parts', 'tractor_part')]:
            card = page.get_by_role('link', name='Shop ' + label.lower(), exact=True)
            expect(card).to_be_visible()
            img = card.get_by_role('img')
            expect(img).to_have_attribute('src', CDN + kind + '-' + version + '.jpg')
            assert img.evaluate('(img) => img.complete && img.naturalWidth > 0')
        home_images = page.locator('img[alt$="product photo"]')
        assert home_images.count() == 11
        assert all(url.startswith(CDN) for url in home_images.evaluate_all('(imgs) => imgs.map(i => i.src)'))
        assert 50 in offsets, 'Must find tractor parts beyond the first catalogue page'
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=str(OUT / f'home-{width}.png'), full_page=True)
        page.get_by_role('link', name='Browse tractor parts', exact=True).scroll_into_view_if_needed()
        page.screenshot(path=str(OUT / f'tractor-banner-{width}.png'), full_page=True)
        for label, kind in [('Shop tractor parts', 'tractor_part'), ('Shop fasteners', 'fastener')]:
            page.goto(BASE, wait_until='networkidle')
            page.get_by_role('link', name=label, exact=True).click()
            expect(page).to_have_url(BASE + '/products?kind=' + kind)
            expect(page.get_by_role('heading', name='Tractor parts' if kind == 'tractor_part' else 'Fasteners', exact=True)).to_be_visible()
        version = '2'
        page.goto(BASE, wait_until='networkidle')
        expect(page.get_by_role('link', name='Shop tractor parts', exact=True).get_by_role('img')).to_have_attribute('src', CDN + 'tractor_part-2.jpg')
        expect(page.get_by_role('link', name='Shop fasteners', exact=True).get_by_role('img')).to_have_attribute('src', CDN + 'fastener-2.jpg')
        missing_steel_photos = True
        page.reload(wait_until='networkidle')
        for label in ['Round bars', 'Bright bars', 'Sheets', 'Flat bars', 'Square bars', 'TMT bars']:
            image = page.get_by_role('link', name='Shop ' + label, exact=True).get_by_role('img')
            expect(image).to_have_attribute('src', __import__('re').compile(r'^https://ftis\.b-cdn\.net/home-category-images/'))
            assert image.evaluate('(img) => img.complete && img.naturalWidth > 0')
        missing_steel_photos = False
        context.close()
    browser.close()
assert not errors, errors
print('PASS: remote product photos, catalogue pagination, admin photo replacement, category routes, 320/390/1440px; no runtime errors')
