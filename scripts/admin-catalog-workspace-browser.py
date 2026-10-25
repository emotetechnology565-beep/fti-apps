"""Category workspace acceptance checks. All Supabase requests are mocked."""
import base64
import copy
import json
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

actor = '00000000-0000-0000-0000-000000000001'
encode = lambda value: base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
token = encode({'alg': 'HS256'}) + '.' + encode({'sub': actor, 'role': 'authenticated', 'aud': 'authenticated', 'aal': 'aal2', 'iat': int(time.time()), 'exp': int(time.time()) + 3600}) + '.isolated'
user = {'id': actor, 'aud': 'authenticated', 'role': 'authenticated', 'phone': '919000000001', 'app_metadata': {}, 'user_metadata': {}}
session = {'access_token': token, 'refresh_token': 'isolated', 'expires_at': int(time.time()) + 3600, 'expires_in': 3600, 'token_type': 'bearer', 'user': user}
identity = {'profile': {'id': actor, 'full_name': 'Isolated staff', 'account_status': 'active'}, 'roles': ['super_admin'], 'permissions': ['staff.access', 'catalog.manage', 'price.manage', 'price.publish'], 'businesses': [], 'deletion_requested': False}

def category(id, name, active=True):
    return {'id': id, 'name': name, 'slug': id, 'is_active': active, 'sort_order': 0}

def product(id, cat, kind='steel', status='draft'):
    return {'id': id, 'category_id': cat, 'category': cat, 'name': 'Product ' + id, 'slug': 'product-' + id,
            'description': 'Existing description', 'product_kind': kind, 'purchase_mode': 'rfq', 'status': status,
            'variants': [{'id': 'variant-' + id, 'sku': 'SKU-' + id, 'size_label': '16MM', 'uom': 'MT', 'min_order_qty': 1,
                          'is_active': True, 'attributes': {'grade': 'EN8', 'brand': 'Test brand', 'preserve': 'custom attribute'}}]}

base_categories = [category('round-bright-bar', 'Round Bright Bar'), category('sheet', 'Sheet'),
                   category('bolts', 'Hex Bolts'), category('parts', 'Tractor Parts'),
                   category('empty', 'Empty Category'), category('inactive', 'Inactive Material', False)]
base_products = [product(str(i), 'round-bright-bar', status='published' if i % 2 else 'draft') for i in range(13)]
base_products += [product('sheet', 'sheet'), product('bolt', 'bolts', 'fastener'), product('part', 'parts', 'tractor_part'), product('inactive', 'inactive')]
base_sheet = {'category_id': 'round-bright-bar', 'product_id': '0', 'product_kind': 'steel', 'uom': 'MT',
              'min_order_qty': '1', 'revision': 1, 'published_revision': 1, 'product_status': 'published',
              'rows': [{'grade': 'EN8', 'base_price': '50000', 'base_charge': '0', 'profile': '0', 'rolling': '0',
                        'size_groups': [{'label': 'All sizes', 'add_price': '0'}]}]}

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width in (390, 1440):
        categories, products, sheet = copy.deepcopy(base_categories), copy.deepcopy(base_products), copy.deepcopy(base_sheet)
        calls, errors = [], []
        spec = {'category_id': 'round-bright-bar', 'dimension_label': 'Diameter', 'dimension_keys': ['diameter_mm'], 'enabled': True}

        def api(route):
            req = route.request
            result = []
            headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'}
            if req.method != 'OPTIONS':
                if '/auth/v1/user' in req.url:
                    result = user
                elif '/functions/v1/' in req.url:
                    body = req.post_data_json or {}
                    operation, args = body.get('operation'), body.get('arguments', {})
                    calls.append((operation, args))
                    if operation == 'fti_identity_me': result = identity
                    elif operation == 'fti_catalog_admin_list': result = {'categories': categories, 'products': products}
                    elif operation == 'fti_catalog_grade_sheet_get': result = sheet
                    elif operation == 'fti_catalog_grade_sheet_save':
                        assert args['p_category'] == 'round-bright-bar'
                        sheet.update(args['p_sheet'], revision=2)
                        result = sheet
                    elif operation == 'fti_catalog_selection_admin':
                        assert args['p_category'] == 'round-bright-bar'
                        result = {'spec': spec, 'sizes': [], 'options': [], 'products': [x for x in products if x['category_id'] == args['p_category']]}
                    elif operation == 'fti_catalog_selection_spec_save':
                        assert args['p_category'] == 'round-bright-bar'
                        spec.update(dimension_label=args['p_dimension_label'], dimension_keys=args['p_dimension_keys'])
                    elif operation == 'fti_catalog_media_admin':
                        assert args['p_product_id'] == '0'
                    elif operation == 'fti_catalog_product_upsert':
                        saved = args['p_product']
                        assert saved['category_id'] == 'round-bright-bar' and saved['product_kind'] == 'steel'
                        variant = args['p_variants'][0]
                        assert variant['attributes']['preserve'] == 'custom attribute'
                        target = next(x for x in products if x['id'] == saved['id'])
                        target.update(saved)
                        target['variants'][0].update(variant)
                        result = target['id']
                    elif operation == 'fti_catalog_category_upsert':
                        saved = args['p_category']
                        if saved.get('id'):
                            target = next(x for x in categories if x['id'] == saved['id'])
                            target.update(saved)
                        else:
                            target = {**saved, 'id': 'created'}
                            categories.append(target)
                        result = target['id']
                    elif operation == 'fti_catalog_product_status':
                        target = next(x for x in products if x['id'] == args['p_id'])
                        target['status'] = args['p_status']
                    result = {'data': result}
            route.fulfill(status=200, content_type='application/json', body=json.dumps(result), headers=headers)

        context = browser.new_context(viewport={'width': width, 'height': 950})
        context.route('https://*.supabase.co/**', api)
        context.add_init_script('localStorage.setItem("fti-auth-v2", ' + json.dumps(json.dumps(session)) + ')')
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto('http://127.0.0.1:' + (sys.argv[1] if len(sys.argv) > 1 else '8101') + '/admin?section=catalogue')
        page.wait_for_load_state('networkidle')

        def button(name): return page.get_by_role('button', name=name, exact=True)
        def open_category(id): page.get_by_test_id('catalog-category-' + id).get_by_role('button', name='Open category').click()
        def no_overflow(): assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width

        expect(button('Open category')).to_have_count(4)
        expect(page.get_by_text('Product 0', exact=True)).to_have_count(0)
        expect(page.get_by_test_id('catalog-category-bolts')).to_have_count(0)
        Path('artifacts').mkdir(exist_ok=True)
        page.screenshot(path='artifacts/admin-categories-' + str(width) + '.png', full_page=True)
        no_overflow()
        page.get_by_role('textbox', name='Search categories', exact=True).fill('bright')
        expect(button('Open category')).to_have_count(1)
        open_category('round-bright-bar')
        expect(page.get_by_test_id('catalog-product-0')).to_be_visible()
        expect(page.get_by_test_id('catalog-product-10')).to_have_count(0)
        button('Next products').click()
        expect(page.get_by_test_id('catalog-product-12')).to_be_visible()
        search = page.get_by_role('textbox', name='Search products', exact=True)
        search.fill('SKU-0')
        expect(page.get_by_test_id('catalog-product-0')).to_be_visible()
        expect(page.get_by_test_id('catalog-product-1')).to_have_count(0)
        search.fill('EN8')
        expect(button('Next products')).to_be_visible()
        search.fill('')
        button('Product status: All statuses').click()
        page.get_by_role('radio', name='Published', exact=True).click()
        expect(page.get_by_test_id('catalog-product-0')).to_have_count(0)
        expect(page.get_by_test_id('catalog-product-1')).to_be_visible()
        button('Product status: Published').click()
        page.get_by_role('radio', name='All statuses', exact=True).click()
        page.screenshot(path='artifacts/admin-category-products-' + str(width) + '.png', full_page=True)
        no_overflow()

        card = page.get_by_test_id('catalog-product-0')
        card.get_by_role('button', name='Manage product', exact=True).click()
        card.get_by_role('button', name='Edit variant', exact=True).click()
        field = page.get_by_role('textbox', name='Product name', exact=True)
        field.fill('Updated material')
        button('Photos').click()
        button('Products').click()
        expect(field).to_have_value('Updated material')
        button('Back to categories').click()
        expect(page.get_by_text('Leave unsaved edits?', exact=True)).to_be_visible()
        button('Keep editing').click()
        button('Save product and variant').click()
        expect(page.get_by_text('Product and variant saved as catalogue data.', exact=True)).to_be_visible()
        expect(card.get_by_text('Updated material', exact=True)).to_be_visible()
        card.get_by_role('button', name='Publish', exact=True).click()
        expect(card.get_by_role('button', name='Unpublish', exact=True)).to_be_visible()

        button('Prices').click()
        price = page.get_by_role('textbox', name='Base price — entry 1 (INR / PMT)', exact=True)
        expect(price).to_be_visible()
        price.fill('51000')
        button('Products').click()
        button('Prices').click()
        expect(price).to_have_value('51000')
        button('Back to categories').click()
        expect(page.get_by_text('Leave unsaved edits?', exact=True)).to_be_visible()
        button('Keep editing').click()
        button('Save draft').click()
        expect(page.get_by_text('Draft saved. Review and publish when all prices are complete.', exact=True)).to_be_visible()

        button('Sizes & Grades').click()
        dimension = page.get_by_role('textbox', name='Customer size field label', exact=True)
        expect(dimension).to_have_value('Diameter')
        dimension.fill('Diameter in mm')
        button('Products').click()
        button('Sizes & Grades').click()
        expect(dimension).to_have_value('Diameter in mm')
        button('Back to categories').click()
        expect(page.get_by_text('Leave unsaved edits?', exact=True)).to_be_visible()
        button('Keep editing').click()
        button('Save dimension settings').click()
        expect(page.get_by_text('Category dimensions saved.', exact=True)).to_be_visible()

        button('Photos').click()
        page.get_by_test_id('catalog-product-0').get_by_role('button', name='Manage photos', exact=True).click()
        expect(page.get_by_text('Product photos (0/8)', exact=True)).to_be_visible()
        no_overflow()
        button('Back to categories').click()
        expect(page.get_by_role('textbox', name='Search categories', exact=True)).to_be_visible()
        button('Fasteners').click()
        open_category('bolts')
        expect(page.get_by_test_id('catalog-product-bolt')).to_be_visible()
        expect(button('Sizes & Grades')).to_have_count(0)
        button('Tractor Parts').click()
        open_category('parts')
        expect(page.get_by_test_id('catalog-product-part')).to_be_visible()
        expect(button('Prices')).to_have_count(0)
        button('Raw Materials').click()
        open_category('inactive')
        page.get_by_test_id('catalog-product-inactive').get_by_role('button', name='Manage product', exact=True).click()
        button('Publish').click()
        expect(page.get_by_text('Activate this product’s category before publishing.', exact=True)).to_be_visible()
        button('Category settings').click()
        page.get_by_role('textbox', name='Category name', exact=True).fill('Renamed inactive material')
        button('Save category').click()
        expect(page.get_by_text('Category saved.', exact=True)).to_be_visible()
        assert not next(x for x in categories if x['id'] == 'inactive')['is_active']
        button('Back to categories').click()
        button('Add category').click()
        page.get_by_role('textbox', name='Category name', exact=True).fill('New material category')
        button('Create category').click()
        expect(page.get_by_text('No products in this category', exact=True)).to_be_visible()
        button('Add product').click()
        page.get_by_role('textbox', name='Product name', exact=True).fill('Unsaved new material')
        button('Fasteners').click()
        button('Discard edits and continue').click()
        expect(page.get_by_text('Fasteners categories', exact=True)).to_be_visible()
        assert not errors, errors
        assert sum(op == 'fti_catalog_product_upsert' for op, _ in calls) == 1
        no_overflow()
        context.close()
        print('Workspace passed at width', width)
    browser.close()
