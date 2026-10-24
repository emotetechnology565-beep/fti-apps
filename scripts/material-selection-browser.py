"""Customer selection acceptance. All auth, catalogue and submission traffic is mocked."""
import base64
import copy
import json
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

actor = '00000000-0000-0000-0000-000000000001'
encode = lambda value: base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
token = encode({'alg': 'HS256'}) + '.' + encode({'sub': actor, 'role': 'authenticated', 'aud': 'authenticated', 'aal': 'aal1', 'iat': int(time.time()), 'exp': int(time.time()) + 3600}) + '.isolated'
user = {'id': actor, 'aud': 'authenticated', 'role': 'authenticated', 'phone': '919000000001', 'app_metadata': {}, 'user_metadata': {}}
session = {'access_token': token, 'refresh_token': 'isolated', 'expires_at': int(time.time()) + 3600, 'expires_in': 3600, 'token_type': 'bearer', 'user': user}
identity = {'profile': {'id': actor, 'full_name': 'Test Buyer', 'phone': '+919000000001', 'account_status': 'active'}, 'roles': ['buyer'], 'permissions': [], 'businesses': [], 'deletion_requested': False}
categories = [
    {'id': 'category-round', 'slug': 'round-bar-as-rolled', 'name': 'As Rolled Round Bar', 'product_kind': 'steel', 'dimension_label': 'Diameter (mm)', 'dimension_keys': ['diameter_mm']},
    {'id': 'category-bright', 'slug': 'round-bright-bar', 'name': 'Round Bright Bar', 'product_kind': 'steel', 'dimension_label': 'Diameter (mm)', 'dimension_keys': ['diameter_mm']},
    {'id': 'category-tmt', 'slug': 'tmt', 'name': 'TMT Bar', 'product_kind': 'steel', 'dimension_label': 'Diameter (mm)', 'dimension_keys': ['diameter_mm']},
    {'id': 'category-sheet', 'slug': 'sheet', 'name': 'Sheet', 'product_kind': 'steel', 'dimension_label': 'Thickness (mm)', 'dimension_keys': ['thickness_mm']},
    {'id': 'category-flat', 'slug': 'flat', 'name': 'Flat', 'product_kind': 'steel', 'dimension_label': 'Width × Thickness (mm)', 'dimension_keys': ['width_mm', 'thickness_mm']},
    {'id': 'category-square', 'slug': 'square', 'name': 'Square', 'product_kind': 'steel', 'dimension_label': 'Side (mm)', 'dimension_keys': ['side_mm']},
]
sizes = {
    'round-bar-as-rolled': [{'id': 'round-8', 'label': '8 mm', 'dimensions': {'diameter_mm': 8}}, {'id': 'round-16', 'label': '16 mm', 'dimensions': {'diameter_mm': 16}}],
    'round-bright-bar': [{'id': 'bright-16', 'label': '16 mm', 'dimensions': {'diameter_mm': 16}}],
    'tmt': [{'id': 'tmt-12', 'label': '12 mm', 'dimensions': {'diameter_mm': 12}}],
    'sheet': [{'id': 'sheet-2.5', 'label': '2.5 mm', 'dimensions': {'thickness_mm': 2.5}}],
    'flat': [{'id': 'flat-40-5', 'label': '40 × 5 mm', 'dimensions': {'width_mm': 40, 'thickness_mm': 5}}],
    'square': [],
}


def option(id, product, name, grade, unit='MT', minimum=1, price=None):
    return {'id': id, 'product_id': product, 'product_name': name, 'grade': grade, 'uom': unit, 'min_order_qty': minimum, 'variant_id': None,
            'attributes': {'grade': grade, **({'grade_list_price': price, 'grade_list_gst_included': False} if price else {'quote_only': True})}}


options = {
    'round-8': [option('option-round-8', 'product-round', 'As Rolled Round Bar', 'EN-8D')],
    'round-16': [option('option-round-16', 'product-round', 'As Rolled Round Bar', 'EN-8D', price='13500')],
    'bright-16': [option('option-bright-16', 'product-bright', 'Round Bright Bar', 'EN-8D', price='21500')],
    'tmt-12': [option('option-tmt-12', 'product-tmt', 'TMT Bar', 'FE-500')],
    'sheet-2.5': [option('option-sheet-a', 'product-sheet-a', 'Sheet A', 'MS', 'kg', 100), option('option-sheet-b', 'product-sheet-b', 'Sheet B', 'MS', 'kg', 50)],
    'flat-40-5': [option('option-flat', 'product-flat', 'Flat', 'MS', 'kg', 10)],
}
options['sheet-2.5'][1]['attributes'] = {'grade': 'MS', 'sheet_flat_net_prate': '65000'}
product_categories = {entry['product_id']: slug for slug, values in sizes.items() for size in values for entry in options.get(size['id'], [])}
base = 'http://127.0.0.1:' + (sys.argv[1] if len(sys.argv) > 1 else '8152')


def run(context, width):
    submissions, errors = [], []
    failure = {'mode': 'ambiguous'}

    def api(route):
        req = route.request
        result, status = [], 200
        if req.method == 'OPTIONS':
            route.fulfill(status=204, headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'})
            return
        if '/auth/v1/verify' in req.url:
            result = session
        elif '/auth/v1/user' in req.url:
            result = user
        elif '/auth/v1/otp' in req.url:
            result = {}
        elif '/functions/v1/' in req.url or '/rest/v1/rpc/' in req.url:
            body = req.post_data_json or {}
            direct = '/rest/v1/rpc/' in req.url
            op, args = (req.url.rsplit('/', 1)[-1], body) if direct else (body.get('operation'), body.get('arguments', {}))
            if op == 'fti_identity_me':
                result = identity
            elif op == 'fti_catalog_selection_options':
                slug = args.get('p_category') or product_categories.get(args.get('p_product'))
                cat = next((c for c in categories if c['slug'] == slug), None)
                available = options.get(args.get('p_size_id'), [])
                if args.get('p_product'):
                    available = [o for o in available if o['product_id'] == args['p_product']]
                result = {'categories': categories, 'category': cat, 'sizes': sizes.get(slug, []), 'options': available}
            elif op == 'fti_catalog_selection_request_submit':
                submissions.append(copy.deepcopy(args))
                if failure['mode'] == 'ambiguous':
                    failure['mode'] = 'ok'
                    route.fulfill(status=503, content_type='application/json', body=json.dumps({'code': 'UNAVAILABLE', 'message': 'Request response interrupted. Please retry.'}), headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'})
                    return
                if failure['mode'] == 'validation':
                    failure['mode'] = 'ok'
                    route.fulfill(status=422, content_type='application/json', body=json.dumps({'code': '22023', 'message': 'Availability changed. Please review your selection.'}), headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'})
                    return
                result = {'id': args['p_id'], 'reference': 'FTI-RM-TEST-SELECTION', 'replayed': len(submissions) > 1}
            elif op == 'fti_catalog_product_get':
                pid = args['p_id']
                cat = next(c for c in categories if c['slug'] == product_categories[pid])
                result = {'id': pid, 'name': cat['name'], 'slug': cat['slug'], 'category': cat['name'], 'category_id': cat['id'], 'description': '', 'product_kind': 'steel', 'purchase_mode': 'rfq', 'status': 'published', 'variants': []}
            elif op == 'fti_catalog_filtered_list':
                result = {'items': [], 'total': 0, 'categories': [], 'grades': []}
            if not direct:
                result = {'data': result}
        route.fulfill(status=status, content_type='application/json', body=json.dumps(result), headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'})

    context.route('https://*.supabase.co/**', api)
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))

    def choose(label, name):
        if label == 'Category' and name not in ('Raw Materials', 'Fasteners', 'Tractor Parts'):
            choose('Category', 'Raw Materials')
            choose('Raw material category', name)
            return
        page.get_by_role('button', name=label + ':', exact=False).click()
        page.get_by_role('radio', name=name, exact=True).click()
        expect(page.get_by_role('button', name='Close filter', exact=True)).to_have_count(0)

    page.goto(base + '/products')
    expect(page.get_by_role('button', name='Category: Choose category', exact=True)).to_be_visible(timeout=30000)
    expect(page.get_by_label('Search catalogue', exact=True)).to_have_count(0)
    expect(page.get_by_text('SOURCED RIGHT. SUPPLIED RIGHT.', exact=True)).to_have_count(0)
    choose('Category', 'Sheet')
    choose('Thickness (mm)', '2.5 mm')
    choose('Grade', 'MS')
    expect(page.get_by_role('textbox', name='Quantity', exact=True)).not_to_be_editable()
    choose('Product', 'Sheet B · kg')
    quantity = page.get_by_role('textbox', name='Quantity (kg, minimum 50)', exact=True)
    quantity.fill('20')
    expect(page.get_by_text('Minimum quantity is 50 kg.', exact=True)).to_be_visible()
    expect(page.get_by_role('button', name='Sign in to continue', exact=True)).to_be_disabled()
    quantity.fill('50.125')
    expect(page.get_by_text('INR 65,000 / PMT', exact=True)).to_be_visible()
    page.get_by_role('button', name='Sign in to continue', exact=True).click()
    expect(page).to_have_url(base + '/login?returnTo=material-selection')
    page.get_by_role('textbox', name='WhatsApp number with country code', exact=True).fill('+919000000001')
    page.get_by_text('Send my verification code on WhatsApp', exact=True).click()
    page.get_by_role('button', name='Send WhatsApp code', exact=True).click()
    page.get_by_role('textbox', name='Six-digit WhatsApp code', exact=True).fill('123456')
    page.get_by_role('button', name='Verify and sign in', exact=True).click()
    expect(page).to_have_url(base + '/products')
    expect(page.get_by_role('textbox', name='Buyer name', exact=True)).to_be_visible(timeout=30000)
    expect(page.get_by_role('textbox', name='Quantity (kg, minimum 50)', exact=True)).to_have_value('50.125')
    expect(page.get_by_role('textbox', name='Buyer name', exact=True)).to_have_value('Test Buyer')
    page.get_by_role('textbox', name='Business / buyer type', exact=True).fill('Test Engineering')
    page.get_by_role('textbox', name='Delivery location (up to 100 characters)', exact=True).fill('Pune, Maharashtra 411001')
    page.get_by_text('Send me WhatsApp updates for this request', exact=True).click()
    page.screenshot(path=f'artifacts/material-selection-review-{width}.png', full_page=True)
    page.get_by_role('button', name='Submit request', exact=True).click()
    expect(page.get_by_role('button', name='Retry request', exact=True)).to_be_visible()
    expect(page.get_by_role('textbox', name='Quantity (kg, minimum 50)', exact=True)).not_to_be_editable()
    page.get_by_role('button', name='Retry request', exact=True).click()
    expect(page.get_by_text('Request received', exact=True)).to_be_visible()
    assert submissions[0] == submissions[1]
    assert submissions[0]['p_quantity'] == '50.125' and submissions[0]['p_option_id'] == 'option-sheet-b'
    assert 'p_size' not in submissions[0]
    assert 'Test Engineering' not in page.url
    page.get_by_role('button', name='Start another request', exact=True).click()
    choose('Category', 'Square')
    expect(page.get_by_text('No sizes currently available in this category.', exact=False)).to_be_visible()
    choose('Category', 'Flat')
    choose('Width × Thickness (mm)', '40 × 5 mm')
    choose('Grade', 'MS')
    page.get_by_role('textbox', name='Quantity (kg, minimum 10)', exact=True).fill('10')
    page.get_by_role('button', name='Review request', exact=True).click()
    page.get_by_text('Send me WhatsApp updates for this request', exact=True).click()
    failure['mode'] = 'validation'
    page.get_by_role('button', name='Submit request', exact=True).click()
    expect(page.get_by_text('Availability changed. Please review your selection.', exact=True)).to_be_visible()
    expect(page.get_by_role('textbox', name='Quantity (kg, minimum 10)', exact=True)).to_be_editable()
    page.get_by_role('button', name='Edit selection', exact=True).click()
    choose('Category', 'TMT Bar')
    choose('Diameter (mm)', '12 mm')
    choose('Grade', 'FE-500')
    expect(page.get_by_role('textbox', name='Quantity (MT, minimum 1)', exact=True)).to_have_value('')
    choose('Category', 'As Rolled Round Bar')
    choose('Diameter (mm)', '8 mm')
    choose('Grade', 'EN-8D')
    expect(page.get_by_text('Request quote', exact=True)).to_be_visible()
    choose('Category', 'Round Bright Bar')
    choose('Diameter (mm)', '16 mm')
    choose('Grade', 'EN-8D')
    expect(page.get_by_text('INR 21,500 / PMT', exact=True)).to_be_visible()
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    page.screenshot(path=f'artifacts/material-selection-priced-{width}.png', full_page=True)
    choose('Category', 'Fasteners')
    expect(page.get_by_placeholder('Search fasteners', exact=True)).to_be_visible()
    choose('Category', 'Tractor Parts')
    expect(page.get_by_placeholder('Search tractor parts', exact=True)).to_be_visible()
    page.goto(base + '/product/product-round?size=16&grade=EN-8D')
    expect(page.get_by_text('INR 13,500 / PMT', exact=True)).to_be_visible(timeout=30000)
    expect(page.get_by_role('button', name='Grade:', exact=False)).to_have_count(1)
    expect(page.get_by_role('button', name='Order grade:', exact=False)).to_have_count(0)
    assert not errors, errors
    page.close()


Path('artifacts').mkdir(exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width, height in ((390, 844), (1366, 1000)):
        context = browser.new_context(viewport={'width': width, 'height': height})
        run(context, width)
        context.close()
    browser.close()
print('PASS: category-specific dimensions, product disambiguation, quantity/MOQ, guest sign-in return, review, retry deduplication, validation recovery, adapters and shared detail form at mobile/desktop widths.')
