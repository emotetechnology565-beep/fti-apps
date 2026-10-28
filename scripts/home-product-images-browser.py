"""Home product rows, cloud imagery and navigation; isolated fixtures or --live."""
import json
import re
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
fasteners = [('hex-bolt', 'Hex bolt'), ('hex-nut', 'Hex nut'), ('u-bolt', 'U bolt')]

def product(number, kind, category, name=None):
    return {'id': f'00000000-0000-0000-0000-{number:012d}', 'slug': f'product-{number}',
            'name': name or f'{category} product {number}', 'category': category, 'category_id': category,
            'product_kind': kind, 'status': 'published', 'purchase_mode': 'rfq',
            'description': None, 'variants': []}

# All eight representative category images exist on page one. Later tractor
# products must still be fetched, rather than stopping once banners are filled.
products = [product(n, 'steel', categories[n % 6]) for n in range(1, 49)]
products += [product(49, 'tractor_part', 'Agricultural Parts', 'J-Type Blade'),
             product(50, 'fastener', 'Fasteners'),
             product(51, 'tractor_part', 'Agricultural Parts', 'RTV Gear Set'),
             product(52, 'tractor_part', 'Agricultural Parts', 'Stub Axle')]
gear = Path('deployment/website-products/images/930003d4-69f2-5bad-a80b-7f5b4058a407.jpg').read_bytes()
bolt = Path('assets/fastener-uploads/hex-bolt-black.jpg').read_bytes()
steel = Path('assets/materials/round-bar-as-rolled.jpg').read_bytes()

def image_url(item):
    return CDN + item['product_kind'] + '-' + item['id'] + '-' + version + '.jpg'

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
            result = [{'id': item['id'], 'product_id': item['id'], 'mime_type': 'image/jpeg',
                       'url': image_url(item)} for item in products
                      if item['id'] in args.get('p_product_ids', [])
                      and not (missing_steel_photos and item['product_kind'] == 'steel')]
        elif op == 'fti_catalog_fastener_photos':
            result = [{'slug': slug, 'label': label, 'image_url': CDN + slug + '-' + version + '.jpg'}
                      for slug, label in fasteners]
        elif op == 'fti_catalog_product_get':
            result = next((item for item in products if item['id'] == args.get('p_id')), None)
        elif op == 'fti_catalog_selection_options':
            result = {'categories': [], 'category': None, 'sizes': [], 'options': []}
        result = {'data': result}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(result),
                  headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'})

def cdn(route):
    body = gear if 'tractor_part' in route.request.url else steel if 'steel-' in route.request.url else bolt
    route.fulfill(status=200, content_type='image/jpeg', body=body)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width, height in [(320, 740), (390, 844), (1440, 1000)]:
        context = browser.new_context(viewport={'width': width, 'height': height})
        if '--live' not in sys.argv:
            context.route('https://*.supabase.co/**', api)
            context.route(CDN + '**', cdn)
            context.route('https://ftis.b-cdn.net/home-category-images/**', cdn)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE, wait_until='networkidle')
        expect(page.get_by_text('Shop by category', exact=True)).to_be_visible()
        for title in ['Raw materials', 'Fasteners', 'Tractor parts']:
            expect(page.get_by_role('heading', name=title, exact=True)).to_have_count(1)
        expect(page.get_by_role('link', name='Shop fasteners', exact=True)).to_have_count(0)
        expect(page.get_by_role('link', name='Shop tractor parts', exact=True)).to_have_count(0)
        links = page.get_by_role('link', name=re.compile('^Shop '))
        if '--live' in sys.argv:
            assert links.count() > 12, 'Expected multiple actual product tiles in each division'
            for tile in links.all():
                tile.scroll_into_view_if_needed()
                image = tile.get_by_role('img')
                expect(image).to_have_attribute('src', re.compile(r'^https://'))
                expect(image).to_have_js_property('complete', True, timeout=15000)
                assert image.evaluate('(img) => img.naturalWidth > 0')
        else:
            expect(links).to_have_count(12)
            assert 50 in offsets, 'Later tractor products must not be skipped'
            for slug, label in fasteners:
                expect(page.get_by_role('link', name='Shop ' + label, exact=True).get_by_role('img')).to_have_attribute('src', CDN + slug + '-' + version + '.jpg')
            for item in products:
                if item['product_kind'] == 'tractor_part':
                    expect(page.get_by_role('link', name='Shop ' + item['name'], exact=True).get_by_role('img')).to_have_attribute('src', image_url(item))
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        prefix = 'live-' if '--live' in sys.argv else ''
        page.screenshot(path=str(OUT / f'{prefix}home-{width}.png'), full_page=True)
        page.get_by_role('heading', name='Tractor parts', exact=True).scroll_into_view_if_needed()
        page.screenshot(path=str(OUT / f'{prefix}category-rows-{width}.png'), full_page=True)
        if '--live' not in sys.argv:
            page.get_by_role('link', name='Shop Stub Axle', exact=True).click()
            expect(page).to_have_url(BASE + '/product/' + products[-1]['id'])
            expect(page.get_by_role('heading', name='Stub Axle', exact=True)).to_be_visible()
            for slug, label in fasteners:
                page.goto(BASE, wait_until='networkidle')
                page.get_by_role('link', name='Shop ' + label, exact=True).click()
                expect(page).to_have_url(BASE + '/fastener/' + slug)
            version = '2'
            missing_steel_photos = True
            page.goto(BASE, wait_until='networkidle')
            expect(page.get_by_role('link', name='Shop Hex nut', exact=True).get_by_role('img')).to_have_attribute('src', CDN + 'hex-nut-2.jpg')
            expect(page.get_by_role('link', name='Shop Stub Axle', exact=True).get_by_role('img')).to_have_attribute('src', image_url(products[-1]))
            for label in ['Round bars', 'Bright bars', 'Sheets', 'Flat bars', 'Square bars', 'TMT bars']:
                expect(page.get_by_role('link', name='Shop ' + label, exact=True).get_by_role('img')).to_have_attribute('src', re.compile(r'^https://ftis\.b-cdn\.net/home-category-images/'))
            missing_steel_photos = False
        context.close()
    browser.close()
assert not errors, errors
print('PASS: individual fastener/tractor tiles, cloud images, later catalogue pages, exact destinations, photo updates and 320/390/1440px layouts' + (' (live catalogue)' if '--live' in sys.argv else ''))
