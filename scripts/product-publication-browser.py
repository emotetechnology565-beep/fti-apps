"""Publishing regression: catalogue APIs are mocked and no real products are changed."""
import base64
import json
import sys
import time
from playwright.sync_api import sync_playwright, expect

actor = '00000000-0000-0000-0000-000000000001'
def encode(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
token = encode({'alg': 'HS256'}) + '.' + encode({'sub': actor, 'role': 'authenticated', 'aud': 'authenticated', 'aal': 'aal2', 'iat': int(time.time()), 'exp': int(time.time()) + 3600}) + '.isolated'
user = {'id': actor, 'aud': 'authenticated', 'role': 'authenticated', 'phone': '919000000001', 'app_metadata': {}, 'user_metadata': {}}
session = {'access_token': token, 'refresh_token': 'isolated', 'expires_at': int(time.time()) + 3600, 'expires_in': 3600, 'token_type': 'bearer', 'user': user}
identity = {'profile': {'id': actor, 'full_name': 'Isolated staff', 'account_status': 'active'}, 'roles': ['super_admin'], 'permissions': ['staff.access', 'catalog.manage'], 'businesses': [], 'deletion_requested': False}
categories = [{'id': 'active', 'slug': 'active', 'name': 'Active category', 'is_active': True, 'sort_order': 0},
              {'id': 'inactive', 'slug': 'inactive', 'name': 'Inactive category', 'is_active': False, 'sort_order': 0}]
products = []
for n, name in enumerate(['Imported product', 'Ready product', 'Inactive category product', 'New publish product']):
    products.append({'id': str(n), 'category_id': 'inactive' if n == 2 else 'active', 'category': 'Test category',
                     'slug': 'test-' + str(n), 'name': name, 'description': 'Preserve this description', 'product_kind': 'fastener',
                     'purchase_mode': 'rfq', 'status': 'draft', 'variants': [] if n in (0, 3) else [
                         {'id': str(n) + '-variant', 'sku': 'EXISTING-' + str(n), 'size_label': 'Existing size', 'uom': 'piece',
                          'min_order_qty': 5, 'is_active': True, 'attributes': {}}]})
calls = []
first_publish_rejected = True
errors = []

def api(route):
    global first_publish_rejected
    request = route.request
    result = []
    headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'}
    if request.method != 'OPTIONS':
        if '/auth/v1/user' in request.url:
            result = user
        elif '/functions/v1/' in request.url:
            body = request.post_data_json or {}
            operation = body.get('operation')
            args = body.get('arguments', {})
            calls.append((operation, args))
            if operation == 'fti_identity_me': result = identity
            elif operation == 'fti_catalog_admin_list': result = {'categories': categories, 'products': products}
            elif operation == 'fti_catalog_selection_options': result = {'categories': [], 'category': None, 'sizes': [], 'options': []}
            elif operation == 'fti_catalog_product_upsert':
                product = next(p for p in products if p['id'] == args['p_product']['id'])
                assert args['p_product']['description'] == 'Preserve this description'
                assert len(args['p_variants']) == 1
                variant = args['p_variants'][0]
                assert variant['sku'].strip() and variant['min_order_qty'] > 0
                assert variant['uom'] == 'piece'
                product['variants'].append({**variant, 'id': 'new-variant'})
                result = product['id']
            elif operation == 'fti_catalog_product_status':
                product = next(p for p in products if p['id'] == args['p_id'])
                if product['id'] == '0' and first_publish_rejected:
                    first_publish_rejected = False
                    route.fulfill(status=403, content_type='application/json', body=json.dumps({'message': 'Staff MFA verification required'}), headers=headers)
                    return
                product['status'] = args['p_status']
                result = None
            elif operation in ('fti_catalog_list', 'fti_catalog_filtered_list'):
                visible = [p for p in products if p['status'] == 'published']
                result = {'items': visible, 'total': len(visible), 'categories': categories}
            result = {'data': result}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(result), headers=headers)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 390, 'height': 844})
    context.route('https://*.supabase.co/**', api)
    context.add_init_script('localStorage.setItem("fti-auth-v2", ' + json.dumps(json.dumps(session)) + ')')
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    base = 'http://127.0.0.1:' + (sys.argv[1] if len(sys.argv) > 1 else '8101')
    page.goto(base + '/admin?section=catalogue', timeout=60000)
    page.wait_for_load_state('networkidle', timeout=60000)
    page.get_by_role('button', name='Fasteners', exact=True).click()
    def open_category(id):
        page.get_by_test_id('catalog-category-' + id).get_by_role('button', name='Open category', exact=True).click()
    def manage_product(id):
        page.get_by_test_id('catalog-product-' + id).get_by_role('button', name='Manage product', exact=True).click()
    open_category('active')
    manage_product('0')
    imported = page.get_by_test_id('product-publication-0')
    expect(imported.get_by_role('button', name='Publish', exact=True)).to_be_visible(timeout=60000)
    imported.get_by_role('button', name='Publish', exact=True).click()
    expect(imported.get_by_text('COMPLETE PRODUCT SETUP', exact=True)).to_be_visible()
    assert not any(op == 'fti_catalog_product_status' for op, _ in calls)
    imported.get_by_role('button', name='Save variant and publish', exact=True).click()
    expect(imported.get_by_text('Enter a SKU and a minimum order quantity', exact=False)).to_be_visible()
    assert not any(op == 'fti_catalog_product_upsert' for op, _ in calls)
    imported.get_by_role('textbox', name='SKU for Imported product', exact=True).fill('REAL-TEST-SKU')
    imported.get_by_role('textbox', name='Minimum order for Imported product', exact=True).fill('10')
    imported.get_by_role('button', name='Save variant and publish', exact=True).click()
    expect(imported.get_by_text('Variant saved. Publishing failed: Staff MFA verification required', exact=True)).to_be_visible()
    expect(imported.get_by_role('button', name='Save variant and publish', exact=True)).to_have_count(0)
    imported.get_by_role('button', name='Publish', exact=True).click()
    expect(imported.get_by_text('Imported product is now published and visible in the catalogue.', exact=True)).to_be_visible()
    expect(imported.get_by_role('button', name='Unpublish', exact=True)).to_be_visible()
    assert sum(op == 'fti_catalog_product_upsert' and args['p_product']['id'] == '0' for op, args in calls) == 1

    page.get_by_role('button', name='Back to categories', exact=True).click()
    open_category('inactive')
    manage_product('2')
    blocked = page.get_by_test_id('product-publication-2')
    blocked.get_by_role('button', name='Publish', exact=True).click()
    expect(blocked.get_by_text('Activate this product’s category before publishing.', exact=True)).to_be_visible()
    assert not any(op == 'fti_catalog_product_status' and args['p_id'] == '2' for op, args in calls)
    page.get_by_role('button', name='Back to categories', exact=True).click()
    open_category('active')
    manage_product('1')
    ready = page.get_by_test_id('product-publication-1')
    ready.get_by_role('button', name='Publish', exact=True).click()
    expect(ready.get_by_text('Ready product is now published and visible in the catalogue.', exact=True)).to_be_visible()
    assert not any(op == 'fti_catalog_product_upsert' and args['p_product']['id'] == '1' for op, args in calls)

    manage_product('3')
    fresh = page.get_by_test_id('product-publication-3')
    fresh.get_by_role('button', name='Publish', exact=True).click()
    fresh.get_by_role('textbox', name='SKU for New publish product', exact=True).fill('SECOND-TEST-SKU')
    fresh.get_by_role('textbox', name='Minimum order for New publish product', exact=True).fill('1')
    fresh.get_by_role('button', name='Save variant and publish', exact=True).click()
    expect(fresh.get_by_text('New publish product is now published and visible in the catalogue.', exact=True)).to_be_visible()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.goto(base + '/products', timeout=60000)
    page.get_by_role('button', name='Category: Choose category', exact=True).click()
    page.get_by_role('radio', name='Fasteners', exact=True).click()
    expect(page.get_by_text('Imported product', exact=True)).to_be_visible(timeout=60000)
    expect(page.get_by_text('Ready product', exact=True)).to_be_visible()
    expect(page.get_by_text('New publish product', exact=True)).to_be_visible()
    assert not errors, errors
    browser.close()
    print('Publishing passed: missing variants, inline validation, save-and-publish, permission errors, retry without duplication, inactive categories and public catalogue refresh.')
