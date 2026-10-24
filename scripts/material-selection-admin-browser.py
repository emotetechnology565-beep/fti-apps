"""Isolated staff availability editor acceptance; all Supabase calls mocked."""
import base64
import json
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

actor = '00000000-0000-0000-0000-000000000001'
category_id = '00000000-0000-0000-0000-000000000002'
product_id = '00000000-0000-0000-0000-000000000003'
size_id = '00000000-0000-0000-0000-000000000004'
option_id = '00000000-0000-0000-0000-000000000005'
encode = lambda value: base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
token = encode({'alg': 'HS256'}) + '.' + encode({'sub': actor, 'role': 'authenticated', 'aud': 'authenticated', 'aal': 'aal2', 'iat': int(time.time()), 'exp': int(time.time()) + 3600}) + '.isolated'
user = {'id': actor, 'aud': 'authenticated', 'role': 'authenticated', 'phone': '919000000001', 'app_metadata': {}, 'user_metadata': {}}
session = {'access_token': token, 'refresh_token': 'isolated', 'expires_at': int(time.time()) + 3600, 'expires_in': 3600, 'token_type': 'bearer', 'user': user}
identity = {'profile': {'id': actor, 'full_name': 'Availability Admin', 'phone': '+919000000001', 'account_status': 'active'}, 'roles': ['super_admin'], 'permissions': ['staff.access', 'catalog.manage'], 'businesses': [], 'deletion_requested': False}
category = {'id': category_id, 'slug': 'flat', 'name': 'Flat', 'sort_order': 1, 'is_active': True, 'parent_id': None}
product = {'id': product_id, 'category_id': category_id, 'category': 'Flat', 'slug': 'flat-ms', 'name': 'Flat MS', 'description': '', 'product_kind': 'steel', 'purchase_mode': 'rfq', 'status': 'published', 'variants': []}
sizes, options, writes, errors = [], [], [], []


def api(route):
    req = route.request
    result = []
    if req.method != 'OPTIONS':
        if '/auth/v1/user' in req.url:
            result = user
        elif '/functions/v1/' in req.url or '/rest/v1/rpc/' in req.url:
            body = req.post_data_json or {}
            direct = '/rest/v1/rpc/' in req.url
            op, args = (req.url.rsplit('/', 1)[-1], body) if direct else (body.get('operation'), body.get('arguments', {}))
            if op == 'fti_identity_me': result = identity
            elif op == 'fti_catalog_admin_list': result = {'categories': [category], 'products': [product]}
            elif op == 'fti_catalog_grade_sheet_get': result = None
            elif op == 'fti_catalog_selection_admin':
                result = {'spec': {'category_id': category_id, 'dimension_label': 'Thickness / width', 'dimension_keys': ['thickness_mm', 'width_mm'], 'enabled': True}, 'sizes': sizes, 'options': options, 'products': [product]}
            elif op == 'fti_catalog_selection_size_save':
                item = args['p_size']
                assert item['dimensions'] == {'thickness_mm': 2.5, 'width_mm': 25}
                sizes[:] = [{**item, 'id': size_id, 'category_id': category_id, 'sort_order': 0}]
                writes.append(op)
                result = size_id
            elif op == 'fti_catalog_selection_option_save':
                item = args['p_option']
                assert item['product_id'] == product_id and item['size_id'] == size_id
                assert item['grade'] == 'MS' and item['variant_id'] is None
                options[:] = [{**item, 'id': option_id, 'category_id': category_id, 'source': 'manual', 'source_active': True}]
                writes.append(op)
                result = option_id
            if not direct: result = {'data': result}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(result), headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'})


base = 'http://127.0.0.1:' + (sys.argv[1] if len(sys.argv) > 1 else '8149')
Path('artifacts').mkdir(exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 390, 'height': 844})
    context.route('https://*.supabase.co/**', api)
    context.add_init_script('localStorage.setItem("fti-auth-v2", ' + json.dumps(json.dumps(session)) + ')')
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(base + '/admin?section=catalogue', timeout=60000)
    page.get_by_role('button', name='Manage sizes and grades', exact=True).click()
    page.get_by_role('button', name='Availability category: Choose category', exact=True).click()
    page.get_by_role('radio', name='Flat', exact=True).click()
    expect(page.get_by_role('button', name='Close filter', exact=True)).to_have_count(0)
    page.get_by_role('textbox', name='Size label', exact=True).fill('25 × 2.5 mm')
    page.get_by_role('textbox', name='Thickness (mm)', exact=True).fill('2.5')
    page.get_by_role('textbox', name='Width (mm) (optional)', exact=True).fill('25')
    page.get_by_role('button', name='Add size', exact=True).click()
    expect(page.get_by_role('button', name='Availability size: 25 × 2.5 mm', exact=True)).to_be_visible()
    page.get_by_role('button', name='Availability product: Choose product', exact=True).click()
    page.get_by_role('radio', name='Flat MS', exact=True).click()
    expect(page.get_by_role('button', name='Close filter', exact=True)).to_have_count(0)
    page.get_by_role('textbox', name='Availability grade', exact=True).fill('MS')
    page.get_by_role('textbox', name='Minimum quantity', exact=True).fill('0.5')
    page.get_by_role('button', name='Save availability', exact=True).click()
    expect(page.get_by_role('button', name='Disable MS 25 × 2.5 mm', exact=True)).to_be_visible()
    page.get_by_role('button', name='Edit MS 25 × 2.5 mm', exact=True).click()
    expect(page.get_by_role('button', name='Availability product: Flat MS', exact=True)).to_be_disabled()
    expect(page.get_by_role('button', name='Availability size: 25 × 2.5 mm', exact=True)).to_be_disabled()
    expect(page.get_by_role('textbox', name='Availability grade', exact=True)).to_have_count(0)
    page.get_by_role('button', name='Cancel edit', exact=True).click()
    page.get_by_role('button', name='Disable MS 25 × 2.5 mm', exact=True).click()
    expect(page.get_by_role('button', name='Enable MS 25 × 2.5 mm', exact=True)).to_be_visible()
    assert options[0]['enabled'] is False
    assert writes == ['fti_catalog_selection_size_save', 'fti_catalog_selection_option_save', 'fti_catalog_selection_option_save']
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    page.screenshot(path='artifacts/material-selection-admin-mobile.png', full_page=True)
    page.set_viewport_size({'width': 1366, 'height': 900})
    page.screenshot(path='artifacts/material-selection-admin-desktop.png', full_page=True)
    assert not errors, errors
    browser.close()
print('PASS: staff created decimal Flat size, saved unpriced combination, immutable identity, disabled availability; no page errors.')
