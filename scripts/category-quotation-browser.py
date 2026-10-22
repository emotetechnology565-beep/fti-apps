"""Isolated browser acceptance; every Supabase request is mocked."""
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
identity = {'profile': {'id': actor, 'full_name': 'Isolated buyer', 'account_status': 'active'}, 'roles': ['super_admin'], 'permissions': ['staff.access', 'sales.manage'], 'businesses': [], 'deletion_requested': False}

import binascii
category_id = '00000000-0000-0000-0000-000000000002'
asset_id = '00000000-0000-0000-0000-000000000003'
category = {'id': category_id, 'name': 'Hex bolts', 'asset_id': None, 'updated_at': None}
requests = []
uploads = []
calls = []
errors = []
pdf = Path('deployment/category-quotations/sample-quotation.pdf').read_bytes()
product = {'id': '00000000-0000-0000-0000-000000000004', 'category_id': category_id, 'category': 'Hex bolts', 'slug': 'csk-screw', 'name': 'CSK Screw', 'description': None, 'product_kind': 'fastener', 'purchase_mode': 'rfq', 'status': 'published', 'variants': [{'id': '00000000-0000-0000-0000-000000000005', 'sku': 'CSK-M12-50', 'size_label': 'M12 x 50', 'uom': 'piece', 'min_order_qty': 1, 'attributes': {}}]}
def api(route):
    req = route.request
    result = []
    headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'}
    if req.method != 'OPTIONS':
        if '/auth/v1/user' in req.url: result = user
        elif '/functions/v1/' in req.url:
            body = req.post_data_json or {}
            operation = body.get('operation')
            args = body.get('arguments', {})
            calls.append(operation)
            if operation == 'fti_identity_me': result = identity
            elif operation == 'fti_catalog_product_get': result = product
            elif operation == 'fti_sales_category_quote_catalog': result = [category]
            elif operation == 'fti_sales_category_quote_requests': result = requests
            elif operation == 'fti_sales_category_quote_request':
                assert args['p_category'] == category_id
                requests.append({'id': 'request-1', 'category': 'Hex bolts', 'asset_id': category['asset_id'], 'created_at': '2026-10-21T14:00:00Z', 'buyer_phone': '+919000000001', 'delivery_status': 'pending' if category['asset_id'] else 'awaiting_pdf'})
                result = {'id': 'request-1', 'queued': bool(category['asset_id']), 'replayed': False}
            elif body.get('operation') == 'category_upload':
                assert body['categoryId'] == category_id
                assert body['mimeType'] == 'application/pdf'
                assert base64.b64decode(body['base64']).startswith(b'%PDF-')
                uploads.append(body)
                category.update(asset_id=asset_id, updated_at='2026-10-21T15:00:00Z')
                for item in requests: item.update(asset_id=asset_id, delivery_status='pending')
                result = {'id': asset_id}
            elif body.get('operation') == 'category_download': result = {'mimeType': 'application/pdf', 'base64': base64.b64encode(pdf).decode()}
            result = {'data': result}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(result), headers=headers)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 390, 'height': 844})
    context.route('https://*.supabase.co/**', api)
    context.add_init_script('localStorage.setItem("fti-auth-v2", ' + json.dumps(json.dumps(session)) + ')')
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    base = 'http://127.0.0.1:' + (sys.argv[1] if len(sys.argv) > 1 else '8101')
    page.goto(base + '/rfqs', timeout=60000)
    page.wait_for_load_state('networkidle', timeout=60000)
    expect(page.get_by_text('Get a fastener quotation PDF', exact=True)).to_be_visible(timeout=60000)
    page.get_by_text('Hex bolts', exact=True).click()
    expect(page.get_by_text('No PDF uploaded yet. Staff can still receive your request.', exact=True)).to_be_visible()
    page.get_by_role('button', name='Get quotation on WhatsApp', exact=True).click()
    expect(page.get_by_text('Staff have been notified. Your PDF will be sent automatically when it is uploaded.', exact=True)).to_be_visible()
    expect(page.get_by_role('button', name='Requested on WhatsApp', exact=True)).to_be_disabled()
    assert len(requests) == 1
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    Path('artifacts').mkdir(exist_ok=True)
    page.screenshot(path='artifacts/category-quotation-buyer-mobile.png', full_page=True)
    page.goto(base + '/admin?section=sales', timeout=60000)
    expect(page.get_by_text('Fastener category quotation PDFs', exact=True)).to_be_visible(timeout=60000)
    page.get_by_text('Hex bolts', exact=True).first.click()
    with page.expect_file_chooser() as picker:
        page.get_by_role('button', name='Upload category PDF', exact=True).click()
    picker.value.set_files('deployment/category-quotations/sample-quotation.pdf')
    expect(page.get_by_text('Category quotation PDF uploaded. New requests use this version; waiting requests are queued for delivery.', exact=True)).to_be_visible(timeout=30000)
    expect(page.get_by_text('WhatsApp delivery queued', exact=True)).to_be_visible()
    expect(page.get_by_role('button', name='Replace category PDF', exact=True)).to_be_visible()
    assert len(uploads) == 1
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path='artifacts/category-quotation-admin-mobile.png', full_page=True)
    with page.expect_download() as download:
        page.get_by_role('button', name='Open current PDF', exact=True).click()
    assert download.value.suggested_filename == 'FTI-quotation.pdf'
    page.goto(base + '/product/' + product['id'], timeout=60000)
    button = page.get_by_role('button', name='Get quotation on WhatsApp', exact=True)
    expect(button).to_be_visible(timeout=60000)
    expect(page.get_by_role('button', name='Browse quotation requests', exact=True)).to_have_count(0)
    button.scroll_into_view_if_needed()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path='artifacts/product-whatsapp-button-mobile.png', full_page=True)
    page.set_viewport_size({'width': 1440, 'height': 1000})
    button.scroll_into_view_if_needed()
    page.screenshot(path='artifacts/product-whatsapp-button-desktop.png', full_page=True)
    button.click()
    expect(page.get_by_text('Quotation PDF queued for your verified WhatsApp number. FTI staff have been notified.', exact=True)).to_be_visible()
    expect(page.get_by_role('button', name='Requested on WhatsApp', exact=True)).to_be_disabled()
    assert len(requests) == 2

    assert not errors, errors
    browser.close()
    print('PASS: mobile category request, duplicate-click prevention, admin PDF upload/replacement, waiting delivery queue and private PDF download; no browser errors')
