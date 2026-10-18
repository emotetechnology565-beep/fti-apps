"""Product reference regression using isolated browser accounts and mocked catalogue APIs."""
import base64
import json
from pathlib import Path
import sys
import time

from playwright.sync_api import sync_playwright, expect

actor = '00000000-0000-0000-0000-000000000001'


def encode(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')


token = encode({'alg': 'HS256', 'typ': 'JWT'}) + '.' + encode({'sub': actor, 'role': 'authenticated', 'aud': 'authenticated', 'aal': 'aal2', 'iat': int(time.time()), 'exp': int(time.time()) + 3600}) + '.isolated'
user = {'id': actor, 'aud': 'authenticated', 'role': 'authenticated', 'phone': '919000000001', 'app_metadata': {}, 'user_metadata': {}}
session = {'access_token': token, 'refresh_token': 'isolated', 'expires_at': int(time.time()) + 3600, 'expires_in': 3600, 'token_type': 'bearer', 'user': user}
identity = {'profile': {'id': actor, 'full_name': 'Isolated reviewer', 'account_status': 'active'}, 'roles': ['super_admin'], 'permissions': ['staff.access', 'catalog.manage'], 'businesses': [], 'deletion_requested': False}
manifest = json.loads(Path('deployment/website-products/products.json').read_text())
products = {}
for slug in ['half-thread-hex-bolt', 'full-thread-hex-screw', 'plain-washers', 'spring-washers', 'hsfg-hex-nut']:
    item = next(row for row in manifest if row['slug'] == slug)
    products[slug] = {**item, 'category_id': 'fasteners', 'category': 'Industrial Fasteners', 'description': None,
        'product_kind': 'fastener', 'purchase_mode': 'rfq', 'status': 'published', 'variants': [
            {'id': item['id'] + '-variant', 'sku': 'ISOLATED-' + slug, 'size_label': 'Reference test variant', 'uom': 'piece',
             'min_order_qty': 1, 'pack_qty': None, 'diameter_mm': None, 'length_mm': None, 'attributes': {}, 'is_active': True}]}
errors = []


def api(route):
    request = route.request
    result = []
    if request.method != 'OPTIONS':
        if '/auth/v1/user' in request.url:
            result = user
        elif '/functions/v1/' in request.url:
            body = request.post_data_json or {}
            operation = body.get('operation', '')
            if operation == 'fti_identity_me':
                result = identity
            elif operation == 'fti_catalog_product_get':
                result = next((p for p in products.values() if p['id'] == body['arguments']['p_id']), None)
            elif operation == 'fti_catalog_admin_list':
                result = {'categories': [{'id': 'fasteners', 'slug': 'fasteners', 'name': 'Industrial Fasteners', 'is_active': True, 'sort_order': 0}], 'products': list(products.values())}
            elif operation == 'fti_catalog_list':
                result = {'categories': [], 'items': list(products.values()), 'total': len(products)}
            elif operation == 'fti_operations_whatsapp_preferences':
                result = {'enabled': False}
            result = {'data': result}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(result), headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'})


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    context.route('https://*.supabase.co/**', api)
    context.add_init_script('localStorage.setItem("fti-auth-v2", ' + json.dumps(json.dumps(session)) + ')')
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    base = 'http://127.0.0.1:' + (sys.argv[1] if len(sys.argv) > 1 else '8100')

    def visit(slug):
        page.goto(base + '/product/' + products[slug]['id'], timeout=60000)
        page.wait_for_load_state('networkidle', timeout=60000)

    visit('half-thread-hex-bolt')
    expect(page.get_by_text('Dimensions & weight references', exact=True)).to_be_visible(timeout=60000)
    page.get_by_role('textbox', name='Reference size', exact=True).fill('M6')
    expect(page.get_by_text('1.00 mm', exact=True)).to_be_visible()
    page.get_by_role('button', name='Metric bolt and nut weights', exact=True).click()
    page.get_by_role('textbox', name='Reference size', exact=True).fill('M20')
    page.get_by_role('textbox', name='Reference length (mm)', exact=True).fill('100')
    expect(page.get_by_text('270.75 kg / 1,000 pcs', exact=True)).to_be_visible()
    expect(page.get_by_text('Needs confirmation', exact=False)).to_be_visible()
    page.get_by_role('button', name='Hex nuts', exact=True).click()
    page.get_by_role('textbox', name='Reference size', exact=True).fill('M10')
    expect(page.get_by_text('11.69 kg / 1,000 pcs', exact=True)).to_be_visible()
    expect(page.get_by_role('textbox', name='Reference length (mm)', exact=True)).to_have_count(0)
    page.get_by_role('button', name='UNC bolt and nut weights', exact=True).click()
    page.get_by_role('textbox', name='Reference size', exact=True).fill('1 1/4')
    page.get_by_role('textbox', name='Reference length (inches)', exact=True).fill('2 1/2')
    expect(page.get_by_text('1389.00 kg / 1,000 pcs', exact=True)).to_be_visible()
    page.get_by_role('textbox', name='Reference size', exact=True).fill('99')
    expect(page.get_by_text('No chart entry for this size and length. Blank source cells are not estimated.', exact=True)).to_be_visible()
    expect(page.get_by_role('button', name='Open original PDF', exact=True)).to_be_visible()

    page.set_viewport_size({'width': 390, 'height': 844})
    visit('plain-washers')
    page.get_by_role('textbox', name='Reference size', exact=True).fill('M10')
    expect(page.get_by_text('3.90 kg / 1,000 pcs', exact=True)).to_be_visible()
    page.get_by_role('button', name='Machined washers', exact=True).click()
    page.get_by_role('textbox', name='Reference size', exact=True).fill('M10')
    expect(page.get_by_text('4.00 kg / 1,000 pcs', exact=True)).to_be_visible()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Reference chart overflows mobile viewport'
    page.screenshot(path='test-results/product-references-mobile.png', full_page=True)
    visit('spring-washers')
    page.get_by_role('textbox', name='Reference size', exact=True).fill('M10')
    expect(page.get_by_text('2.50 kg / 1,000 pcs', exact=True)).to_be_visible()
    visit('hsfg-hex-nut')
    expect(page.get_by_text('Dimensions & weight references', exact=True)).to_have_count(0)

    page.set_viewport_size({'width': 1440, 'height': 1000})
    page.goto(base + '/admin?section=catalogue', timeout=60000)
    expect(page.get_by_text('Products (5)', exact=True)).to_be_visible(timeout=60000)
    expect(page.get_by_role('button', name='View reference charts', exact=True)).to_have_count(4)
    page.get_by_role('button', name='View reference charts', exact=True).first.click()
    expect(page.get_by_text('Dimensions & weight references', exact=True)).to_be_visible()
    page.get_by_role('button', name='Hide reference charts', exact=True).click()
    expect(page.get_by_text('Dimensions & weight references', exact=True)).to_have_count(0)
    assert not errors, errors
    browser.close()
    print('Product reference charts passed: units, filtering, source flags, UNC fractions, washers, unsupported products, mobile layout and staff preview.')
