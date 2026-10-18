"""Staff rendering regression. Start Expo on port 8094; all API calls are intercepted."""
import base64
import json
import time
import sys
import re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

actor = '00000000-0000-0000-0000-000000000001'
def enc(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
token = enc({'alg': 'HS256', 'typ': 'JWT'}) + '.' + enc({'sub': actor, 'role': 'authenticated', 'aud': 'authenticated', 'aal': 'aal2', 'iat': int(time.time()), 'exp': int(time.time()) + 3600}) + '.isolated'
user = {'id': actor, 'aud': 'authenticated', 'role': 'authenticated', 'phone': '919000000001', 'app_metadata': {}, 'user_metadata': {}}
session = {'access_token': token, 'refresh_token': 'isolated', 'expires_at': int(time.time()) + 3600, 'expires_in': 3600, 'token_type': 'bearer', 'user': user}
identity = {'profile': {'id': actor, 'full_name': 'Isolated staff', 'account_status': 'active'}, 'roles': ['super_admin'], 'permissions': ['staff.access', 'sales.manage', 'inventory.manage', 'payment.review', 'order.manage'], 'businesses': [], 'deletion_requested': False}
errors = []
warnings = []
operations = []
def api(route):
    request = route.request
    result = []
    if request.method != 'OPTIONS':
        if '/auth/v1/user' in request.url:
            result = user
        elif '/functions/v1/' in request.url:
            body = request.post_data_json or {}
            op = body.get('operation', '')
            operations.append(op)
            if op == 'fti_identity_me': result = identity
            elif op == 'fti_commerce_stock': result = {'locations': [], 'inventory': []}
            elif op == 'fti_commerce_policy_get': result = None
            elif op == 'fti_catalog_admin_list': result = {'categories': [], 'products': []}
            elif op == 'fti_pricing_admin': result = {'markets': [], 'drafts': []}
            elif op == 'fti_operations_report': result = {'orders_by_status': {}, 'open_tickets': 0, 'transfers_awaiting_review': 0, 'failed_outbox_events': 0}
            elif op == 'fti_operations_daily': result = {'orders': [], 'tickets': [], 'payments': []}
            elif '/catalog' in request.url: result = {'items': [], 'total': 0}
            result = {'data': result}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(result), headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'})

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.route('https://*.supabase.co/**', api)
    page.add_init_script('localStorage.setItem("fti-auth-v2", ' + json.dumps(json.dumps(session)) + ')')
    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
    page.on('console', lambda message: warnings.append(message.text) if message.type == 'warning' and ('GoTrueClient' in message.text or 'lock' in message.text) else None)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:' + (sys.argv[1] if len(sys.argv) > 1 else '8094') + '/admin', timeout=60000)
    expect(page.get_by_text('No sales requests', exact=True)).to_be_visible()
    expect(page.get_by_text('No transfers awaiting review.', exact=True)).to_have_count(0)
    assert 'fti_commerce_stock' not in operations
    assert 'fti_commerce_payment_queue' not in operations
    expect(page.get_by_role('link',name='Pricing',exact=True)).to_have_count(0)
    page.get_by_role('link',name='Payment review',exact=True).click()
    expect(page.get_by_text('No transfers awaiting review.', exact=True)).to_be_visible()
    expect(page.get_by_text('No sales requests', exact=True)).to_have_count(0)
    expect(page).to_have_url(re.compile(r'section=payments'))
    page.reload()
    expect(page.get_by_text('No transfers awaiting review.', exact=True)).to_be_visible()
    page.get_by_role('link',name='FTI inventory',exact=True).click()
    expect(page.get_by_text('No tracked stock yet.', exact=True)).to_be_visible()
    expect(page.get_by_text('No transfers awaiting review.', exact=True)).to_have_count(0)
    page.set_viewport_size({'width':390,'height':844})
    page.get_by_role('button',name='Open navigation',exact=True).click()
    page.get_by_role('link',name='RFQs & quotations',exact=True).click()
    expect(page.get_by_text('No sales requests',exact=True)).to_be_visible()
    expect(page.get_by_role('link',name='Payment review',exact=True)).to_have_count(0)
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    output = Path('test-results'); output.mkdir(exist_ok=True)
    page.get_by_role('button',name='Open navigation',exact=True).click()
    page.screenshot(path=str(output / 'staff-navigation-mobile.png'),full_page=True)
    page.get_by_role('link',name='Payment review',exact=True).click()
    identity['permissions'] += ['business.review','catalog.manage','price.manage','price.publish','order.policy','operations.manage','support.manage','content.manage','stock.review']
    page.set_viewport_size({'width':1440,'height':1080})
    base='http://127.0.0.1:' + (sys.argv[1] if len(sys.argv) > 1 else '8094')
    page.goto(base+'/admin?section=businesses')
    expected_sections = [
      ('Business approvals','No pending applications'),('FTI catalogue','No catalogue records'),
      ('Pricing','No drafts on this page.'),('RFQs & quotations','No sales requests'),
      ('FTI inventory','No tracked stock yet.'),('Payment review','No transfers awaiting review.'),
      ('Order settings','No duration approved. Order placement is blocked.'),('Order reservations','Expired reservations'),
      ('Dispatch & delivery','No confirmed orders ready for tracking.'),('Support tickets','No tickets yet.'),
      ('Reports & audit','No orders in this period.'),('Background jobs','No failed events.'),
      ('Announcements','No announcements yet.'),('Business stock review','No business stock awaiting review.')]
    for label,content in expected_sections:
        page.get_by_role('link',name=label,exact=True).click()
        try:
            expect(page.get_by_text(content,exact=True)).to_be_visible()
        except AssertionError:
            print(json.dumps({'failed_section':label,'operations':operations[-8:],'body':page.locator('body').inner_text()[-1200:]}))
            raise
    page.screenshot(path=str(output / 'staff-navigation-desktop.png'),full_page=True)
    page.wait_for_load_state('networkidle')
    output = Path('test-results')
    output.mkdir(exist_ok=True)
    (output / 'staff-console-errors.json').write_text(json.dumps(errors, indent=2))
    page.screenshot(path=str(output / 'staff-console.png'), full_page=True)
    print(json.dumps({'staff_panels_rendered': True, 'errors': errors, 'auth_warnings': warnings}, indent=2))
    browser.close()
assert not errors, errors
assert not warnings, warnings
