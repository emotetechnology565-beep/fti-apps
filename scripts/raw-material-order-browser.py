"""Raw-material order and multiple-recipient acceptance; all backend calls mocked."""
import base64
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
identity = {'profile': {'id': actor, 'full_name': 'Test Buyer', 'phone': '+919000000001', 'account_status': 'active'}, 'roles': ['super_admin'], 'permissions': ['staff.access', 'order.manage'], 'businesses': [], 'deletion_requested': False}
variant = {'id': '00000000-0000-0000-0000-000000000003', 'sku': 'ROUND-MS', 'size_label': '16MM TO 50MM', 'diameter_mm': None, 'length_mm': None, 'uom': 'MT', 'min_order_qty': 1, 'pack_qty': None, 'attributes': {'grade': 'MS', 'size_group': '16MM TO 50MM', 'grade_list_price': '65000'}}
product = {'id': '00000000-0000-0000-0000-000000000002', 'name': 'Round MS', 'category_id': '00000000-0000-0000-0000-000000000004', 'category': 'As Rolled Round Bar', 'slug': 'round-ms', 'description': '', 'product_kind': 'steel', 'purchase_mode': 'rfq', 'status': 'published', 'variants': [variant]}
recipients, submissions, errors, direct_calls = [], [], [], []
legacy_gateway = '--legacy-gateway' in sys.argv

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
            if legacy_gateway and not direct and str(op).startswith('fti_catalog_raw_'):
                route.fulfill(status=400, content_type='application/json', body=json.dumps({'code': 'INVALID_OPERATION', 'message': 'Unsupported operation'}), headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'})
                return
            if direct:
                assert req.headers.get('authorization') == 'Bearer ' + token
                direct_calls.append(op)
            if op == 'fti_identity_me': result = identity
            elif op == 'fti_catalog_product_get': result = product
            elif op == 'fti_catalog_raw_order_submit':
                submissions.append(args)
                result = {'reference': 'FTI-RM-TEST1001', 'id': args['p_id'], 'replayed': False}
            elif op == 'fti_catalog_raw_recipients': result = recipients
            elif op == 'fti_catalog_raw_recipient_save':
                recipients[:] = [r for r in recipients if r['phone'] != args['p_phone']]
                recipients.append({'phone': args['p_phone'], 'label': args['p_label'], 'enabled': args['p_enabled']})
                result = None
            elif op == 'fti_catalog_raw_recipient_remove':
                recipients[:] = [r for r in recipients if r['phone'] != args['p_phone']]
                result = None
            if not direct:
                result = {'data': result}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(result), headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'})

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 390, 'height': 844})
    context.route('https://*.supabase.co/**', api)
    context.add_init_script('localStorage.setItem("fti-auth-v2", ' + json.dumps(json.dumps(session)) + ')')
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    base = 'http://127.0.0.1:' + (sys.argv[1] if len(sys.argv) > 1 else '8137')
    page.goto(base + '/product/' + product['id'], timeout=60000)
    expect(page.get_by_text('Order raw material', exact=True)).to_be_visible(timeout=30000)
    expect(page.get_by_role('button', name='Browse quotation requests')).to_have_count(0)
    page.get_by_role('button', name='Order size (mm): Choose size', exact=True).click()
    page.get_by_role('radio', name='20 mm', exact=True).click()
    page.get_by_role('button', name='Order grade: Choose grade', exact=True).click()
    page.get_by_role('radio', name='MS', exact=True).click()
    page.get_by_label('Quantity (MT, minimum 1)', exact=True).fill('2')
    page.get_by_label('Business / buyer type', exact=True).fill('Test Engineering')
    page.get_by_label('Delivery location (up to 100 characters)', exact=True).fill('Pune, Maharashtra 411001')
    page.get_by_text('Send me WhatsApp updates for this order request', exact=True).click()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    Path('artifacts').mkdir(exist_ok=True)
    page.screenshot(path='artifacts/raw-material-order-mobile.png', full_page=True)
    page.get_by_role('button', name='Submit order request', exact=True).click()
    expect(page.get_by_text('Order request received:', exact=False)).to_be_visible()
    assert len(submissions) == 1
    assert submissions[0]['p_size'] == 20 and submissions[0]['p_quantity'] == '2'
    assert submissions[0]['p_buyer']['business'] == 'Test Engineering'
    page.goto(base + '/admin?section=raw-material-orders')
    expect(page.get_by_text('Raw-material notification numbers', exact=True)).to_be_visible(timeout=30000)
    expect(page.get_by_label('WhatsApp number with country code', exact=True)).to_have_value('+919000000001')
    page.get_by_role('button', name='Add notification number', exact=True).click()
    expect(page.get_by_role('button', name='Remove Test Buyer', exact=True)).to_be_visible()
    page.get_by_label('Recipient name', exact=True).fill('Sales desk')
    page.get_by_label('WhatsApp number with country code', exact=True).fill('+919000000002,invalid')
    page.get_by_role('button', name='Add notification number', exact=True).click()
    expect(page.get_by_text('Enter valid WhatsApp numbers with +country code, separated by commas.', exact=True)).to_be_visible()
    assert len(recipients) == 1
    page.get_by_label('WhatsApp number with country code', exact=True).fill('+919000000002,+919000000003,+919000000002')
    page.get_by_role('button', name='Add notification number', exact=True).click()
    expect(page.get_by_role('button', name='Remove Sales desk', exact=True)).to_have_count(2)
    assert len(recipients) == 3
    expect(page.get_by_text('Saved 2 notification numbers.', exact=True)).to_be_visible()
    page.get_by_role('button', name='Disable', exact=True).first.click()
    expect(page.get_by_role('button', name='Enable', exact=True)).to_be_visible()
    page.get_by_role('button', name='Remove Sales desk', exact=True).first.click()
    expect(page.get_by_role('button', name='Remove Sales desk', exact=True)).to_have_count(1)
    assert len(recipients) == 2
    page.set_viewport_size({'width': 1366, 'height': 900})
    page.screenshot(path='artifacts/raw-material-admin-desktop.png', full_page=True)
    assert not errors, errors
    if legacy_gateway:
        assert {'fti_catalog_raw_order_submit', 'fti_catalog_raw_recipients', 'fti_catalog_raw_orders', 'fti_catalog_raw_recipient_save', 'fti_catalog_raw_recipient_remove'}.issubset(set(direct_calls))
    print(json.dumps({'passed': True, 'legacy_gateway': legacy_gateway, 'browser_errors': errors}), flush=True)
    browser.close()
