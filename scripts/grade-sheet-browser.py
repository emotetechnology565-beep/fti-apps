"""Category publishing acceptance. Supabase is mocked; no live writes."""
import base64
import copy
import json
import sys
import time
import uuid
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

actor = '00000000-0000-0000-0000-000000000001'
encode = lambda value: base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
token = encode({'alg': 'HS256'}) + '.' + encode({'sub': actor, 'role': 'authenticated', 'aud': 'authenticated', 'aal': 'aal2', 'iat': int(time.time()), 'exp': int(time.time()) + 3600}) + '.isolated'
user = {'id': actor, 'aud': 'authenticated', 'role': 'authenticated', 'phone': '919000000001', 'app_metadata': {}, 'user_metadata': {}}
session = {'access_token': token, 'refresh_token': 'isolated', 'expires_at': int(time.time()) + 3600, 'expires_in': 3600, 'token_type': 'bearer', 'user': user}
identity = {'profile': {'id': actor, 'full_name': 'Sheet tester', 'account_status': 'active'}, 'roles': ['super_admin'], 'permissions': ['staff.access', 'catalog.manage', 'price.manage', 'price.publish'], 'businesses': [], 'deletion_requested': False}
categories = [{'id': str(uuid.uuid4()), 'name': name, 'slug': slug, 'is_active': True, 'sort_order': 0, 'parent_id': None} for name, slug in [('Fasteners', 'fasteners'), ('As Rolled Round Bar', 'round-bar-as-rolled'), ('Round Bright Bar', 'round-bright-bar'), ('Flat', 'flat'), ('Sheet', 'sheet'), ('Square', 'square'), ('TMT Bar', 'tmt')]]
sheets = {}
errors = []
writes = []
product = None

def api(route):
    global product
    req = route.request
    result = []
    if req.method != 'OPTIONS':
        if '/auth/v1/user' in req.url:
            result = user
        elif '/functions/v1/' in req.url:
            body = req.post_data_json or {}
            operation = body.get('operation')
            args = body.get('arguments', {})
            if operation == 'fti_identity_me': result = identity
            elif operation == 'fti_catalog_admin_list': result = {'categories': categories, 'products': []}
            elif operation == 'fti_catalog_grade_sheet_get': result = sheets.get(args['p_category'])
            elif operation == 'fti_catalog_grade_sheet_save':
                writes.append(operation)
                cid = args['p_category']
                old = sheets.get(cid, {})
                assert args['p_revision'] == old.get('revision')
                result = copy.deepcopy(args['p_sheet'])
                for row in result['rows']:
                    for group in row['size_groups']:
                        group.setdefault('id', str(uuid.uuid4()))
                result.update(category_id=cid, revision=old.get('revision', 0) + 1, product_id=old.get('product_id'), published_revision=old.get('published_revision'), product_status=old.get('product_status'))
                sheets[cid] = result
            elif operation == 'fti_catalog_grade_sheet_publish':
                writes.append(operation)
                result = sheets[args['p_category']]
                assert args['p_revision'] == result['revision']
                result.update(product_id=str(uuid.uuid4()), published_revision=result['revision'], product_status='published')
                product = {'id': result['product_id'], 'name': 'As Rolled Round Bar', 'category': 'As Rolled Round Bar', 'category_id': result['category_id'], 'slug': 'round-bar-grade-list', 'description': None, 'product_kind': 'steel', 'purchase_mode': 'rfq', 'status': 'published', 'variants': []}
                for row in result['rows']:
                    for group in row['size_groups']:
                        net = sum(float(row[key]) for key in ['base_price', 'base_charge', 'profile', 'rolling']) + float(group['add_price'])
                        product['variants'].append({'id': group['id'], 'sku': 'GL-' + group['id'], 'size_label': row['grade'] + ' / ' + group['label'], 'uom': result['uom'], 'min_order_qty': 1, 'attributes': {'grade': row['grade'], 'size_group': group['label'], 'grade_list_base_price': row['base_price'], 'grade_list_price': f'{net:.4f}'}})
            elif operation == 'fti_catalog_product_get': result = product
            elif operation == 'fti_catalog_selection_options':
                cat = next(item for item in categories if item['id'] == product['category_id'])
                selected_category = {**cat, 'product_kind': 'steel', 'dimension_label': 'Size group'}
                variants = product['variants']
                result = {'categories': [selected_category], 'category': selected_category,
                          'sizes': [{'id': item['id'], 'label': item['attributes']['size_group'], 'dimensions': {}} for item in variants],
                          'options': [{'id': item['id'], 'product_id': product['id'], 'product_name': product['name'],
                                       'grade': item['attributes']['grade'], 'uom': item['uom'], 'min_order_qty': item['min_order_qty'],
                                       'variant_id': item['id'], 'attributes': item['attributes']} for item in variants if item['id'] == args.get('p_size_id')]}
            result = {'data': result}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(result), headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'})

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 390, 'height': 844})
    context.route('https://*.supabase.co/**', api)
    context.add_init_script('localStorage.setItem("fti-auth-v2", ' + json.dumps(json.dumps(session)) + ')')
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    base = 'http://127.0.0.1:' + (sys.argv[1] if len(sys.argv) > 1 else '8102')
    page.goto(base + '/admin?section=catalogue', timeout=60000)
    def open_category(name):
        cid = next(item['id'] for item in categories if item['name'] == name)
        page.get_by_test_id('catalog-category-' + cid).get_by_role('button', name='Open category', exact=True).click()
        page.get_by_role('button', name='Prices', exact=True).click()
    open_category('As Rolled Round Bar')
    expect(page.get_by_label('Brand / grade 1', exact=True)).to_be_visible()
    page.get_by_label('Brand / grade 1', exact=True).fill('EN-8D')
    for name, value in [('Base price', '40000'), ('BASE charge', '4000'), ('Profile', '1000')]:
        page.get_by_label(f'{name} — entry 1 (INR / PMT)', exact=True).fill(value)
    page.get_by_label('Size group 1 — entry 1', exact=True).fill('16MM TO 50MM')
    page.get_by_label('Add price 1 — entry 1 (INR / PMT)', exact=True).fill('0')
    page.get_by_role('button', name='Save list draft', exact=True).click()
    expect(page.get_by_text('Draft saved. Review and publish when all prices are complete.', exact=True)).to_be_visible()
    page.get_by_role('button', name='Review publication', exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('Rolling needs')
    page.get_by_label('Rolling — entry 1 (INR / PMT)', exact=True).fill('8500')
    page.get_by_role('button', name='Add size group', exact=True).click()
    page.get_by_label('Size group 2 — entry 1', exact=True).fill('53MM TO 80MM')
    page.get_by_label('Add price 2 — entry 1 (INR / PMT)', exact=True).fill('1000')
    expect(page.get_by_text('Final price: INR 54500.0000 / PMT', exact=True)).to_be_visible()
    page.get_by_role('button', name='Back to categories', exact=True).click()
    expect(page.get_by_text('Leave unsaved edits?', exact=True)).to_be_visible()
    page.get_by_role('button', name='Keep editing', exact=True).click()
    expect(page.get_by_label('Rolling — entry 1 (INR / PMT)', exact=True)).to_have_value('8500')
    page.get_by_role('button', name='Save list draft', exact=True).click()
    expect(page.get_by_role('button', name='Save list draft', exact=True)).to_be_disabled()
    page.get_by_role('button', name='Review publication', exact=True).click()
    expect(page.get_by_text('Publish As Rolled Round Bar?', exact=True)).to_be_visible()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'mobile overflow'
    Path('artifacts').mkdir(exist_ok=True)
    page.screenshot(path='artifacts/category-grade-sheet-mobile.png', full_page=True)
    page.get_by_role('button', name='Publish category list', exact=True).click()
    expect(page.get_by_text('As Rolled Round Bar list published. Customers can see its grades, sizes, base prices and net prices.', exact=True)).to_be_visible()
    page.get_by_role('button', name='Back to categories', exact=True).click()
    open_category('TMT Bar')
    expect(page.get_by_label('Brand / grade 1', exact=True)).to_have_value('')
    page.get_by_role('button', name='Back to categories', exact=True).click()
    open_category('As Rolled Round Bar')
    expect(page.get_by_label('Brand / grade 1', exact=True)).to_have_value('EN-8D')
    expect(page.get_by_label('Add price 2 — entry 1 (INR / PMT)', exact=True)).to_have_value('1000')
    page.set_viewport_size({'width': 1366, 'height': 900})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'desktop overflow'
    page.screenshot(path='artifacts/category-grade-sheet-desktop.png', full_page=True)
    page.goto(base + '/product/' + product['id'], timeout=60000)
    page.get_by_role('button', name='Size group: Choose size', exact=True).click()
    page.get_by_role('radio', name='53MM TO 80MM', exact=True).click()
    page.get_by_role('button', name='Grade: Choose grade', exact=True).click()
    page.get_by_role('radio', name='EN-8D', exact=True).click()
    expect(page.get_by_text('INR 54,500 / PMT', exact=True)).to_be_visible()
    page.get_by_role('button', name='Size group: 53MM TO 80MM', exact=True).click()
    page.get_by_role('radio', name='16MM TO 50MM', exact=True).click()
    page.get_by_role('button', name='Grade: Choose grade', exact=True).click()
    page.get_by_role('radio', name='EN-8D', exact=True).click()
    expect(page.get_by_text('INR 53,500 / PMT', exact=True)).to_be_visible()
    assert not page.get_by_text('base charge', exact=True).count()
    assert writes.count('fti_catalog_grade_sheet_save') == 2
    assert writes.count('fti_catalog_grade_sheet_publish') == 1
    assert not errors, errors
    print(json.dumps({'passed': True, 'saves': 2, 'publications': 1, 'browser_errors': errors}))
    browser.close()
