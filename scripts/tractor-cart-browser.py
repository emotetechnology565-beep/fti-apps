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
identity = {'profile': {'id': actor, 'full_name': 'Isolated buyer', 'account_status': 'active'}, 'roles': ['super_admin'], 'permissions': ['staff.access', 'order.manage'], 'businesses': [], 'deletion_requested': False}
category = {'id': 'category', 'slug': 'agricultural', 'name': 'Agricultural Parts'}
variant = {'id': '00000000-0000-0000-0000-000000000002', 'sku': 'KIT-1', 'uom': 'piece', 'min_order_qty': 1, 'size_label': 'Standard kit', 'attributes': {'base_price': '1000', 'discounted_price': '800'}}
product = {'id': '00000000-0000-0000-0000-000000000003', 'category_id': category['id'], 'category': category['name'], 'slug': 'steering-kit', 'name': 'Power steering kit', 'description': 'Tractor steering seal kit', 'product_kind': 'tractor_part', 'purchase_mode': 'rfq', 'status': 'published', 'variants': [variant]}
address = {'id': '00000000-0000-0000-0000-000000000004', 'business_id': None, 'label': 'shipping', 'line1': 'Industrial Road', 'city': 'Delhi', 'state': 'Delhi', 'pincode': '110001'}
order = {'id': '00000000-0000-0000-0000-000000000005', 'order_no': 'FTI-O-ISOLATED', 'status': 'pending_confirmation', 'subtotal': '1600.00', 'grand_total': '1600.00', 'amount_due': '0.00', 'created_at': '2026-10-21T10:00:00Z', 'updated_at': '2026-10-21T10:00:00Z', 'quotation_revision_id': None, 'reservation_expires_at': None, 'delivery_address_snapshot': address, 'gst_total': '0.00', 'freight_total': '0.00', 'discount_total': '0.00', 'loading_total': '0.00', 'payments': [], 'items': [{'id': '00000000-0000-0000-0000-000000000006', 'sku': 'KIT-1', 'name': 'Power steering kit', 'qty': '2', 'uom': 'piece', 'unit_price': '800.00', 'line_total': '1600.00', 'reservation_expires_at': None}]}
submitted = []
confirmed = []
errors = []
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
            if operation == 'fti_identity_me': result = identity
            elif operation == 'fti_catalog_list': result = {'items': [product], 'total': 1, 'categories': [category]}
            elif operation == 'fti_catalog_product_get': result = product
            elif operation == 'fti_operations_notifications': result = [{'id': 'notice', 'read_at': None, 'created_at': order['created_at'], 'payload': {'title': 'New order request', 'request_type': 'order', 'request_state': 'new', 'entity_id': order['id']}}] if submitted else []
            elif operation == 'fti_commerce_addresses': result = [address]
            elif operation == 'fti_commerce_cart_order':
                submitted.append(args)
                result = {'id': order['id'], 'replayed': False}
            elif operation == 'fti_commerce_my': result = [order] if submitted else []
            elif operation == 'fti_commerce_detail': result = order
            elif operation == 'fti_commerce_cart_queue': result = [order] if order['status'] == 'pending_confirmation' else []
            elif operation == 'fti_commerce_cart_confirm':
                confirmed.append(args)
                order.update(status='pending_payment', gst_total='288.00', freight_total='100.00', grand_total='1988.00', amount_due='1988.00')
                result = None
            result = {'data': result}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(result), headers=headers)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 390, 'height': 844})
    context.route('https://*.supabase.co/**', api)
    context.add_init_script('localStorage.setItem("fti-auth-v2", ' + json.dumps(json.dumps(session)) + ')')
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    base = 'http://127.0.0.1:' + (sys.argv[1] if len(sys.argv) > 1 else '8081')
    page.goto(base + '/products', timeout=60000)
    page.wait_for_load_state('networkidle', timeout=60000)
    expect(page.get_by_role('button', name='Add to cart', exact=True)).to_be_visible(timeout=60000)
    page.get_by_role('button', name='Add to cart', exact=True).click()
    expect(page.get_by_text('1 piece in cart', exact=True)).to_be_visible()
    page.get_by_role('button', name='View cart', exact=True).click()
    expect(page.get_by_text('Quantity: 1 piece', exact=True)).to_be_visible()
    page.get_by_role('button', name='Increase', exact=True).click()
    expect(page.get_by_text('Quantity: 2 piece', exact=True)).to_be_visible()
    page.reload()
    expect(page.get_by_text('Quantity: 2 piece', exact=True)).to_be_visible(timeout=60000)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    Path('artifacts').mkdir(exist_ok=True)
    page.screenshot(path='artifacts/tractor-cart-mobile.png', full_page=True)
    page.get_by_role('button', name='Proceed to checkout', exact=True).click()
    expect(page.get_by_role('button', name='Submit order for confirmation', exact=True)).to_be_disabled()
    page.get_by_text('Industrial Road, Delhi 110001', exact=True).click()
    page.get_by_role('button', name='Submit order for confirmation', exact=True).click()
    expect(page.get_by_text('Order submitted', exact=True)).to_be_visible()
    assert len(submitted) == 1
    assert submitted[0]['p_lines'] == [{'variant_id': variant['id'], 'qty': '2'}]
    page.get_by_role('button', name='View orders', exact=True).click()
    expect(page.get_by_role('alert').filter(has_text='1 new order alert')).to_be_visible(timeout=15000)
    expect(page.get_by_text('Item prices, GST and delivery charges awaiting admin confirmation', exact=True)).to_be_visible()
    page.get_by_role('button', name='View order and payment', exact=True).click()
    expect(page.get_by_text('Your order is with our team', exact=True)).to_be_visible()
    expect(page.get_by_text('No payment is due yet.', exact=True)).to_be_visible()
    expect(page.get_by_role('textbox', name='Bank UTR / transfer reference', exact=True)).to_have_count(0)
    page.goto(base + '/admin?section=tractor-orders', timeout=60000)
    expect(page.get_by_text('Tractor orders awaiting confirmation', exact=True)).to_be_visible(timeout=60000)
    expect(page.get_by_role('button', name='Review final total', exact=True)).to_be_disabled()
    page.get_by_role('textbox', name='GST amount (INR)', exact=True).fill('288')
    page.get_by_role('textbox', name='Delivery charge (INR)', exact=True).fill('100')
    expect(page.get_by_text('Final total INR 1988.00', exact=True)).to_be_visible()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path='artifacts/tractor-order-admin-mobile.png', full_page=True)
    page.get_by_role('button', name='Review final total', exact=True).click()
    page.get_by_role('button', name='Confirm charges and order', exact=True).click()
    expect(page.get_by_text('No tractor orders awaiting confirmation.', exact=True)).to_be_visible()
    assert len(confirmed) == 1
    assert confirmed[0]['p_gst'] == '288'
    assert confirmed[0]['p_delivery'] == '100'
    page.goto(base + '/orders', timeout=60000)
    expect(page.get_by_text('INR 1988.00 \u00b7 Due INR 1988.00', exact=True)).to_be_visible(timeout=60000)
    assert not errors, errors
    browser.close()
    print('PASS: cart reload, quantity, checkout submission, pending payment block, admin charges, final payable total; no browser errors')
