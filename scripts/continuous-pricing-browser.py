"""Run against Expo on port 8081. All APIs are mocked; no real prices are published."""
import base64
import json
import re
import sys
import time
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

actor = '00000000-0000-0000-0000-000000000001'
variant = '00000000-0000-0000-0000-000000000002'
market = {'id': '00000000-0000-0000-0000-000000000003', 'code': 'DELHI', 'name': 'Delhi', 'state': 'Delhi'}
encode = lambda value: base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
token = encode({'alg': 'HS256', 'typ': 'JWT'}) + '.' + encode({'sub': actor, 'role': 'authenticated', 'aud': 'authenticated', 'aal': 'aal2', 'iat': int(time.time()), 'exp': int(time.time()) + 3600}) + '.isolated'
user = {'id': actor, 'aud': 'authenticated', 'role': 'authenticated', 'phone': '919000000001', 'app_metadata': {}, 'user_metadata': {}}
session = {'access_token': token, 'refresh_token': 'isolated', 'expires_at': int(time.time()) + 3600, 'expires_in': 3600, 'token_type': 'bearer', 'user': user}
identity = {'profile': {'id': actor, 'full_name': 'Pricing tester', 'phone': '+919000000001', 'account_status': 'active'}, 'roles': ['price_manager'], 'permissions': ['staff.access', 'price.manage', 'price.publish'], 'businesses': [], 'deletion_requested': False}
product = {'id': '00000000-0000-0000-0000-000000000004', 'category_id': 'category-1', 'category': 'Fasteners', 'name': 'Test bolt', 'slug': 'test-bolt', 'description': 'Test bolt', 'product_kind': 'fastener', 'purchase_mode': 'rfq', 'status': 'published', 'variants': [{'id': variant, 'sku': 'TEST-BOLT', 'size_label': 'M12', 'uom': 'kg', 'min_order_qty': 1, 'pack_qty': None, 'diameter_mm': 12, 'length_mm': 50, 'attributes': {}}]}
product['variants'][0]['attributes']['grade'] = 'MS'
drafts, current, publications, errors, bases = [], [], [], [], []


def api(route):
    req = route.request
    result = []
    if req.method != 'OPTIONS':
        if '/auth/v1/user' in req.url:
            result = user
        elif '/functions/v1/' in req.url:
            body = req.post_data_json or {}
            op, args = body.get('operation'), body.get('arguments', {})
            if op == 'fti_identity_me': result = identity
            elif op == 'fti_catalog_list': result = {'items': [product], 'total': 1, 'categories': []}
            elif op == 'fti_pricing_markets': result = [market]
            elif op == 'fti_pricing_admin': result = {'markets': [market], 'drafts': drafts, 'current_rates': current, 'grade_bases': bases}
            elif op == 'fti_pricing_draft_save':
                assert args['p_expires'] is None
                assert req.headers['authorization'] == 'Bearer ' + token
                for item in args['p_items']:
                    subtotal = sum(Decimal(item[key]) for key in ['base_price', 'increased_price', 'rolling_price'])
                    profit = (subtotal * Decimal(item['profit_percent']) / 100).quantize(Decimal('.0001'), rounding=ROUND_HALF_UP)
                    assert Decimal(item['amount']) == subtotal + profit
                saved = {**args['p_items'][0], 'sku': 'TEST-BOLT', 'uom': 'kg', 'grade_code': 'MS'}
                result = 'draft-' + str(len(publications) + 1)
                drafts[:] = [{'id': result, 'market_id': market['id'], 'title': args['p_title'], 'revision': 1, 'updated_at': datetime.now(timezone.utc).isoformat(), 'items': [saved]}]
            elif op == 'fti_pricing_publish':
                saved = drafts.pop()
                assert args == {'p_id': saved['id'], 'p_revision': 1}
                stamp = datetime.now(timezone.utc).isoformat()
                version = {**saved['items'][0], 'id': saved['id'], 'name': 'Test bolt', 'market_id': market['id'], 'effective_at': stamp, 'revision': len(publications) + 1}
                current[:] = [version]
                publications.insert(0, {key: version[key] for key in ['id', 'variant_id', 'name', 'sku', 'amount', 'uom', 'effective_at', 'revision']})
                result = saved['id']
            elif op == 'fti_pricing_grade_base_update':
                assert req.headers['authorization'] == 'Bearer ' + token
                assert args == {'p_market': market['id'], 'p_grade': 'MS', 'p_uom': 'kg', 'p_base_price': '80.0000', 'p_revision': None}
                stamp = datetime.now(timezone.utc).isoformat()
                bases[:] = [{'id': 'base-ms', 'market_id': market['id'], 'grade_code': 'MS', 'uom': 'kg', 'base_price': '80.0000', 'revision': 1, 'updated_at': stamp}]
                existing = current[0]
                subtotal = Decimal('80') + Decimal(existing['increased_price']) + Decimal(existing['rolling_price'])
                amount = subtotal + (subtotal * Decimal(existing['profit_percent']) / 100).quantize(Decimal('.0001'))
                version = {**existing, 'id': 'base-update-1', 'base_price': '80.0000', 'amount': format(amount, '.4f'), 'effective_at': stamp, 'revision': existing['revision'] + 1}
                current[:] = [version]
                publications.insert(0, {key: version[key] for key in ['id', 'variant_id', 'name', 'sku', 'amount', 'uom', 'effective_at', 'revision']})
                result = {**bases[0], 'updated_products': 1}
            elif op == 'fti_pricing_rates':
                result = {'items': [{**publications[0], 'currency_code': 'INR', 'previous_amount': publications[1]['amount'] if len(publications) > 1 else None, 'previous_effective_at': publications[1]['effective_at'] if len(publications) > 1 else None}] if publications else [], 'total': len(current), 'server_time': datetime.now(timezone.utc).isoformat(), 'disclosure': 'Rates stay active until replaced. GST and freight are excluded.'}
            elif op == 'fti_pricing_history': result = publications
            result = {'data': result}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(result), headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'})


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    page.route('https://*.supabase.co/**', api)
    page.add_init_script('localStorage.setItem("fti-auth-v2", ' + json.dumps(json.dumps(session)) + ')')
    page.on('pageerror', lambda error: errors.append(str(error)))
    base = 'http://127.0.0.1:' + (sys.argv[1] if len(sys.argv) > 1 else '8081')
    page.goto(base + '/admin?section=pricing', timeout=60000)
    page.wait_for_load_state('networkidle')
    expect(page.get_by_role('button', name='Choose rate expiry', exact=True)).to_have_count(0)
    page.get_by_role('button', name='Delhi', exact=True).last.click()
    page.get_by_role('textbox', name='Draft title', exact=True).fill('Delhi bolt rates')
    page.get_by_role('button', name=re.compile('TEST-BOLT.*kg')).click()
    fields = [('Base price (INR per kg)', '70'), ('Increased price (INR per kg)', '2'), ('Rolling charge (INR per kg)', '3'), ('Profit (% of subtotal)', '10')]
    for label, value in fields:
        page.get_by_role('textbox', name=label, exact=True).fill(value)
    expect(page.get_by_text('Calculated selling rate: INR 82.5000 / kg', exact=True)).to_be_visible()
    page.get_by_role('textbox', name='Profit (% of subtotal)', exact=True).scroll_into_view_if_needed()
    output = Path('test-results'); output.mkdir(exist_ok=True)
    page.screenshot(path=str(output / 'continuous-pricing-editor-mobile.png'), full_page=True)
    page.get_by_role('button', name='Add or replace draft item', exact=True).click()
    page.get_by_role('button', name='Save draft for review', exact=True).click()
    expect(page.get_by_text('Draft saved. Review it below before publishing.', exact=True)).to_be_visible()
    assert not publications
    page.get_by_role('button', name='Review publication', exact=True).click()
    page.get_by_role('button', name='Confirm and publish', exact=True).click()
    expect(page.get_by_text('Rates published. Public rates have been refreshed.', exact=True)).to_be_visible()
    assert len(publications) == 1
    page.get_by_role('button', name='Update TEST-BOLT', exact=True).click()
    page.get_by_role('button', name='Edit breakdown for TEST-BOLT', exact=True).click()
    for label, value in fields:
        expect(page.get_by_role('textbox', name=label, exact=True)).to_have_value(value)
    page.get_by_role('textbox', name='Increased price (INR per kg)', exact=True).fill('7')
    page.get_by_role('textbox', name='Profit (% of subtotal)', exact=True).fill('12.5')
    expect(page.get_by_text('Calculated selling rate: INR 90.0000 / kg', exact=True)).to_be_visible()
    page.get_by_role('button', name='Add or replace draft item', exact=True).click()
    page.get_by_role('button', name='Save draft for review', exact=True).click()
    expect(page.get_by_role('button', name='Review publication', exact=True)).to_be_visible()
    page.get_by_role('button', name='Review publication', exact=True).click()
    page.get_by_role('button', name='Confirm and publish', exact=True).click()
    expect(page.get_by_role('button', name='Update TEST-BOLT', exact=True)).to_be_visible()
    assert len(publications) == 2 and publications[0]['amount'] == '90.0000'
    page.get_by_role('button', name='Delhi', exact=True).first.click()
    page.get_by_role('textbox', name='MS base price (INR per kg)', exact=True).fill('80')
    page.get_by_role('button', name='Review material base update', exact=True).click()
    assert len(publications) == 2
    page.get_by_role('button', name='Confirm MS base update', exact=True).click()
    expect(page.get_by_text('MS base price updated. 1 product rates recalculated.', exact=True)).to_be_visible()
    assert len(publications) == 3 and publications[0]['amount'] == '101.2500'
    page.get_by_role('button', name='Update TEST-BOLT', exact=True).click()
    page.get_by_role('button', name='Edit breakdown for TEST-BOLT', exact=True).click()
    expect(page.get_by_text('Shared MS base: INR 80.0000 / kg. Update it under Shared material base prices.', exact=True)).to_be_visible()
    expect(page.get_by_role('textbox', name='Base price (INR per kg)', exact=True)).to_have_count(0)
    expect(page.get_by_role('textbox', name='Profit (% of subtotal)', exact=True)).to_have_value('12.5')
    expect(page.get_by_text('Calculated selling rate: INR 101.2500 / kg', exact=True)).to_be_visible()
    page.screenshot(path=str(output / 'shared-grade-base-mobile.png'), full_page=True)
    page.goto(base + '/rates')
    page.get_by_role('button', name=re.compile('Delhi.*Delhi')).click()
    expect(page.get_by_text('INR 101.25 / kg', exact=True)).to_be_visible()
    expect(page.get_by_text(re.compile('Last updated:.*IST'))).to_be_visible()
    expect(page.get_by_text('Active until the next price update', exact=False)).to_be_visible()
    page.get_by_role('button', name='View price history', exact=True).click()
    expect(page.get_by_text(re.compile('INR 82.5 / kg')).last).to_be_visible()
    assert 'Profit:' not in page.locator('body').inner_text()
    assert 'Base INR' not in page.locator('body').inner_text()
    assert 'Valid until' not in page.locator('body').inner_text()
    page.screenshot(path=str(output / 'continuous-pricing-rates-mobile.png'), full_page=True)
    page.set_viewport_size({'width': 1440, 'height': 1000})
    page.goto(base + '/admin?section=pricing')
    expect(page.get_by_role('button', name='Update TEST-BOLT', exact=True)).to_be_visible()
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    assert not errors, errors
    browser.close()
    print('PASS: percentage pricing, draft review/publication, current-rate replacement, automatic timestamps, public history/cost isolation, and mobile/desktop layout. All APIs mocked; no live rates published.')
