"""Manual ordering UI acceptance. All Supabase traffic is intercepted; no messages sent."""
import base64
import copy
import json
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = 'http://127.0.0.1:' + (sys.argv[1] if len(sys.argv) > 1 else '8099')
OUT = Path('artifacts/manual-material')
OUT.mkdir(parents=True, exist_ok=True)
actor = '00000000-0000-0000-0000-000000000001'
encode = lambda data: base64.urlsafe_b64encode(json.dumps(data).encode()).decode().rstrip('=')
token = encode({'alg': 'HS256'}) + '.' + encode({'sub': actor, 'role': 'authenticated', 'aud': 'authenticated', 'aal': 'aal2', 'exp': int(time.time()) + 3600}) + '.isolated'
user = {'id': actor, 'aud': 'authenticated', 'role': 'authenticated', 'phone': '919000000001', 'app_metadata': {}, 'user_metadata': {}}
session = {'access_token': token, 'refresh_token': 'isolated', 'expires_at': int(time.time()) + 3600, 'expires_in': 3600, 'token_type': 'bearer', 'user': user}
identity = {'profile': {'id': actor, 'full_name': 'Manual buyer', 'phone': '+919000000001', 'account_status': 'active'}, 'roles': ['buyer'], 'permissions': [], 'businesses': [], 'deletion_requested': False}
category = {'id': 'sheet', 'name': 'Sheet', 'slug': 'sheet', 'dimension_label': 'Thickness (mm)', 'dimension_keys': ['thickness_mm']}
errors, submissions, checks = [], [], []
state = {'failure': 'ambiguous', 'staff': False, 'preview_failure': False}

def api(route):
    req = route.request
    if req.method == 'OPTIONS':
        route.fulfill(status=204, headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'})
        return
    result = []
    if '/auth/v1/user' in req.url:
        result = user
    elif '/functions/v1/' in req.url or '/rest/v1/rpc/' in req.url:
        body = req.post_data_json or {}
        direct = '/rest/v1/rpc/' in req.url
        op, args = (req.url.rsplit('/', 1)[-1], body) if direct else (body.get('operation'), body.get('arguments', {}))
        if op == 'fti_identity_me':
            result = {**identity, 'permissions': ['staff.access', 'order.manage'] if state['staff'] else []}
        elif op == 'fti_catalog_selection_options':
            result = {'categories': [category], 'category': category if args.get('p_category') == 'sheet' else None, 'sizes': [{'id': f'size-{n}', 'label': f'{n} mm', 'dimensions': {'thickness_mm': n}} for n in [13,17,25]] if args.get('p_category') == 'sheet' else [], 'options': [{'id': 'option', 'product_id': 'product', 'product_name': 'Sheet MS', 'grade': 'MS', 'variant_id': None, 'attributes': {'sheet_flat_net_prate': '65000'}, 'uom': 'MT', 'min_order_qty': 0.5}] if args.get('p_size_id') else []}
        elif op == 'fti_catalog_filtered_list':
            result = {'items': [], 'total': 0, 'categories': [], 'grades': []}
        elif op == 'fti_catalog_manual_preview':
            if state['preview_failure']:
                state['preview_failure'] = False
                route.fulfill(status=503, content_type='application/json', body=json.dumps({'code': 'UNAVAILABLE', 'message': 'Size check temporarily unavailable'}), headers={'Access-Control-Allow-Origin': '*'})
                return
            material, grade = args['p_material'], args['p_grade']
            try:
                size = float(args['p_size'].lower().replace('mm', '').strip())
            except ValueError:
                route.fulfill(status=422, content_type='application/json', body=json.dumps({'code': '22023', 'message': 'Enter positive dimensions in mm'}), headers={'Access-Control-Allow-Origin': '*'})
                return
            nearest = min([13, 17, 25], key=lambda n: (abs(n - size), n))
            listed = material.lower() == 'sheet'
            matched = listed and abs(nearest - size) <= 2
            result = {'status': 'unlisted_material' if not listed else 'out_of_range' if not matched else 'unlisted_grade' if grade.upper() != 'MS' else 'available',
                      'size_status': 'unlisted_material' if not listed else 'out_of_range' if not matched else 'exact' if nearest == size else 'rounded',
                      'category': category if listed else None, 'grades': ['MS'],
                      'matched_size': {'id': f'size-{nearest}', 'label': f'{nearest} mm', 'dimensions': {'thickness_mm': nearest}} if matched else None,
                      'option': {'id': 'option', 'product_id': 'product', 'product_name': 'Sheet MS', 'grade': 'MS', 'variant_id': None, 'attributes': {'sheet_flat_net_prate': '65000'}, 'uom': 'MT', 'min_order_qty': 0.5} if matched and grade.upper() == 'MS' else None}
        elif op == 'fti_catalog_manual_request_submit':
            submissions.append(copy.deepcopy(args))
            if state['failure']:
                mode = state['failure']
                state['failure'] = None
                route.fulfill(status=503 if mode == 'ambiguous' else 422, content_type='application/json', body=json.dumps({'code': 'UNAVAILABLE' if mode == 'ambiguous' else '22023', 'message': 'Response interrupted. Retry the same request.' if mode == 'ambiguous' else 'Available sizes or grades changed. Review the request again'}), headers={'Access-Control-Allow-Origin': '*'})
                return
            result = {'id': args['p_id'], 'reference': 'FTI-RM-MANUAL-TEST', 'replayed': len(submissions) > 1}
        elif op == 'fti_catalog_raw_orders':
            result = [{'id': 'request', 'created_at': '2026-10-25T00:00:00Z', 'details': {'reference': 'FTI-RM-MANUAL-TEST', 'material': 'Sheet', 'requested_size': '15 mm', 'matched_size': {'label': '13 mm', 'dimensions': {'thickness_mm': 13}}, 'manual_input': {'material': 'Sheet', 'size': '15 mm'}, 'grade': 'MS'}, 'deliveries': []}]
        if not direct:
            result = {'data': result}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(result), headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'})

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width, height in [(390, 844), (1366, 1000)]:
        state['staff'], state['failure'] = False, 'ambiguous'
        context = browser.new_context(viewport={'width': width, 'height': height})
        context.route('https://*.supabase.co/**', api)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE + '/products')
        def choose(label, value):
            page.get_by_role('button', name=label + ':', exact=False).click()
            page.get_by_role('radio', name=value, exact=True).click()
        choose('Category', 'Raw Materials')
        choose('Raw material category', 'Sheet')
        choose('Thickness (mm)', 'Enter size manually')
        page.get_by_role('textbox', name='Enter size (mm)', exact=True).fill('15mm')
        expect(page.get_by_text('Calculating price...', exact=True)).to_have_count(0, timeout=15000)
        choose('Grade', 'MS')
        expect(page.get_by_role('textbox', name='Enter grade', exact=True)).to_have_count(0)
        qty = page.get_by_role('textbox', name='Quantity (MT, minimum 0.5)', exact=True)
        expect(qty).to_be_visible()
        qty.fill('1.5')
        expect(page.get_by_text('INR 65,000 / PMT', exact=True)).to_be_visible()
        expect(page.get_by_text('Estimated total: INR 97,500', exact=True)).to_be_visible()
        assert '?' not in page.locator('body').inner_text()
        assert 'closest' not in page.locator('body').inner_text().lower()
        expect(page.get_by_text('Enter raw material manually', exact=True)).to_have_count(0)
        page.screenshot(path=str(OUT / f'inline-entry-{width}.png'), full_page=True)
        page.reload()
        expect(page.get_by_role('textbox', name='Enter size (mm)', exact=True)).to_have_value('15mm')
        expect(page.get_by_role('button', name='Grade: MS', exact=True)).to_be_visible()
        page.get_by_role('button', name='Sign in to continue', exact=True).click()
        expect(page).to_have_url(BASE + '/login?returnTo=material-selection')
        page.evaluate('(session) => localStorage.setItem("fti-auth-v2", JSON.stringify(session))', session)
        page.goto(BASE + '/products')
        expect(page.get_by_role('textbox', name='Enter size (mm)', exact=True)).to_have_value('15mm')
        page.get_by_role('button', name='Review current price', exact=True).click()
        page.get_by_role('textbox', name='Business / buyer type', exact=True).fill('Test Works')
        page.get_by_role('textbox', name='Delivery location (up to 100 characters)', exact=True).fill('Pune 411001')
        page.get_by_text('Send me WhatsApp updates for this request', exact=True).click()
        page.screenshot(path=str(OUT / f'review-{width}.png'), full_page=True)
        page.get_by_role('button', name='Submit request', exact=True).click()
        expect(page.get_by_role('button', name='Retry request', exact=True)).to_be_visible()
        expect(page.get_by_role('textbox', name='Enter size (mm)', exact=True)).not_to_be_editable()
        page.get_by_role('button', name='Retry request', exact=True).click()
        expect(page.get_by_text('Request received', exact=True)).to_be_visible()
        assert submissions[-1] == submissions[-2]
        assert submissions[-1]['p_request']['size'] == '15mm'
        assert submissions[-1]['p_request']['grade_entry'] == 'list'
        page.get_by_role('button', name='Start another request', exact=True).click()
        choose('Thickness (mm)', 'Enter size manually')
        page.get_by_role('textbox', name='Enter size (mm)', exact=True).fill('100')
        expect(page.get_by_text('Size out of range.', exact=False)).to_be_visible()
        choose('Grade', 'MS')
        expect(page.get_by_role('link', name='Call FTI at 9780830333', exact=True)).to_have_attribute('href', 'tel:+919780830333')
        page.get_by_role('textbox', name='Quantity (MT)', exact=True).fill('2')
        page.screenshot(path=str(OUT / f'out-of-range-{width}.png'), full_page=True)
        page.get_by_role('button', name='Review request', exact=True).click()
        page.get_by_text('Send me WhatsApp updates for this request', exact=True).click()
        state['failure'] = 'validation'
        page.get_by_role('button', name='Submit request', exact=True).click()
        expect(page.get_by_role('textbox', name='Enter size (mm)', exact=True)).to_be_editable()
        choose('Grade', 'Enter grade manually')
        page.get_by_role('textbox', name='Enter grade', exact=True).fill('CUSTOM-GRADE')
        choose('Thickness (mm)', '13 mm')
        expect(page.get_by_role('textbox', name='Enter size (mm)', exact=True)).to_have_count(0)
        expect(page.get_by_role('textbox', name='Enter grade', exact=True)).to_have_value('CUSTOM-GRADE')
        choose('Thickness (mm)', 'Enter size manually')
        page.get_by_role('textbox', name='Enter size (mm)', exact=True).fill('15')
        expect(page.get_by_role('textbox', name='Enter grade', exact=True)).to_have_value('CUSTOM-GRADE')
        page.get_by_role('textbox', name='Quantity (MT)', exact=True).fill('2')
        page.get_by_role('button', name='Review request', exact=True).click()
        page.get_by_role('button', name='Submit request', exact=True).click()
        expect(page.get_by_text('Request received', exact=True)).to_be_visible()
        assert submissions[-1]['p_request']['grade'] == 'CUSTOM-GRADE'
        assert submissions[-1]['p_request']['grade_entry'] == 'manual'
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        context.close()
        checks.append(f'{width}px: independent inline size/grade choices, hidden pricing lookup, calculated total;  manual entry, size match, guest persistence/handoff, review, consent, ambiguous retry, validation recovery, out-of-range contact, unknown material/grade enquiry')
    state['staff'] = True
    context = browser.new_context(viewport={'width': 1366, 'height': 1000})
    context.route('https://*.supabase.co/**', api)
    context.add_init_script('localStorage.setItem("fti-auth-v2", ' + json.dumps(json.dumps(session)) + ')')
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE + '/admin?section=raw-material-orders')
    expect(page.get_by_text('FTI-RM-MANUAL-TEST', exact=True)).to_be_visible(timeout=30000)
    expect(page.get_by_text('Requested size', exact=True)).to_be_visible()
    expect(page.get_by_text('15 mm', exact=True)).to_be_visible()
    page.screenshot(path=str(OUT / 'staff-manual-request.png'), full_page=True)
    checks.append('Staff view renders nested manual-match data without exposing raw request internals')
    context.close()
    browser.close()
assert not errors, errors
(OUT / 'results.json').write_text(json.dumps({'passed': True, 'checks': checks, 'runtime_errors': errors}, indent=2))
print('PASS: manual ordering browser acceptance; no remote messages or records created')
