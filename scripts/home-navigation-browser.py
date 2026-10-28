"""Home navigation acceptance with isolated API fixtures; no remote writes."""
import base64
import json
import time
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = 'http://127.0.0.1:' + (sys.argv[1] if len(sys.argv) > 1 else '8099')
OUT = Path('artifacts/home-navigation')
OUT.mkdir(parents=True, exist_ok=True)
actor = '00000000-0000-0000-0000-000000000001'
user = {'id': actor, 'aud': 'authenticated', 'role': 'authenticated', 'app_metadata': {}, 'user_metadata': {}}

def encoded(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')

token = encoded({'alg': 'HS256', 'typ': 'JWT'}) + '.' + encoded({'sub': actor, 'role': 'authenticated', 'aud': 'authenticated', 'aal': 'aal1', 'exp': int(time.time()) + 3600}) + '.isolated'
session = {'access_token': token, 'refresh_token': 'isolated', 'expires_at': int(time.time()) + 3600, 'token_type': 'bearer', 'user': user}
identity = {'profile': {'id': actor, 'full_name': 'Home tester', 'account_status': 'active'}, 'roles': ['customer'], 'permissions': [], 'businesses': [], 'deletion_requested': False}
errors = []
checks = []
catalog_queries = []
market_fixtures = []

def api(route):
    result = []
    request = route.request
    if '/auth/v1/user' in request.url:
        result = user
    elif '/functions/v1/' in request.url and request.method != 'OPTIONS':
        op = (request.post_data_json or {}).get('operation')
        if op == 'fti_identity_me':
            result = identity
        elif op == 'fti_pricing_markets':
            result = market_fixtures
        elif op == 'fti_pricing_rates':
            result = {'items': [], 'total': 0, 'disclosure': ''}
        elif op == 'fti_catalog_filtered_list':
            catalog_queries.append(request.post_data_json['arguments'])
            result = {'items': [], 'total': 0, 'categories': [], 'grades': []}
        elif op == 'fti_catalog_selection_options':
            result = {'categories': [], 'category': None, 'sizes': [], 'options': []}
        result = {'data': result}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(result), headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'})

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width, height in [(320, 740), (390, 844), (768, 1024), (1440, 1000)]:
        context = browser.new_context(viewport={'width': width, 'height': height})
        context.route('https://*.supabase.co/**', api)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE)
        page.wait_for_load_state('networkidle')
        expect(page.get_by_text('Shop by material', exact=True)).to_be_visible()
        expect(page.get_by_role('link', name='Sign in to your FTI account', exact=True)).to_be_visible()
        for label, destination in [('Browse materials', '/products'), ('Market rates', '/rates'), ('Requests & quotations', '/rfqs'), ('Orders & dispatch', '/orders'), ('Weight calculator', '/calculator')]:
            link = page.get_by_role('link', name=label, exact=True).last
            box = link.bounding_box()
            assert box and box['height'] >= 44, (label, box)
            link.click()
            expect(page).to_have_url(BASE + destination)
            page.goto(BASE)
            expect(page.get_by_role('link', name='Browse materials', exact=True)).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        page.screenshot(path=str(OUT / f'home-{width}.png'), full_page=True)
        page.get_by_role('link', name='Sign in to your FTI account', exact=True).click()
        expect(page).to_have_url(BASE + '/login')
        if width < 1000:
            page.goto(BASE)
            page.get_by_role('button', name='Open navigation', exact=True).click()
            for label in ['My stock & enquiries', 'Payments & credit', 'Claims & certificates']:
                expect(page.get_by_role('link', name=label, exact=True)).to_be_visible()
            page.get_by_role('link', name='Weight calculator', exact=True).last.click()
            expect(page.get_by_text('Material weight calculator', exact=True)).to_be_visible()
            page.get_by_role('link', name='Home', exact=True).click()
            expect(page.get_by_role('link', name='Browse materials', exact=True)).to_be_visible()
        page.goto(BASE)
        page.get_by_role('textbox', name='Search materials', exact=True).fill('M12 bolt')
        page.get_by_role('button', name='Search catalogue', exact=True).click()
        expect(page).to_have_url(BASE + '/products?search=M12%20bolt')
        expect(page.get_by_role('textbox', name='Search catalogue', exact=True)).to_have_value('M12 bolt')
        expect(page.get_by_text('0 products',exact=True)).to_be_visible()
        assert any(q.get('p_search') == 'M12 bolt' for q in catalog_queries)
        page.goto(BASE)
        page.get_by_role('link', name='Shop Round bars', exact=True).click()
        expect(page).to_have_url(BASE + '/products?category=round-bar-as-rolled')
        expect(page.get_by_text('0 products',exact=True)).to_be_visible()
        assert any(q.get('p_category') == 'round-bar-as-rolled' for q in catalog_queries)
        page.goto(BASE)
        page.get_by_role('button', name='Select your home market', exact=True).click()
        expect(page.get_by_text('No markets available yet.', exact=True)).to_be_visible()
        page.get_by_role('button', name='Close markets', exact=True).click()
        checks.append(f'{width}px: routing, search and category queries, touch targets, market picker, guest sign-in, remaining navigation')
        context.close()

    context = browser.new_context(viewport={'width': 390, 'height': 844})
    context.route('https://*.supabase.co/**', api)
    context.add_init_script('localStorage.setItem("fti-auth-v2", ' + json.dumps(json.dumps(session)) + ')')
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    for status in [None, 'pending', 'verified', 'rejected']:
        identity['businesses'] = [] if status is None else [{'id': 'test-business', 'legal_name': 'Long business name for checking mobile wrapping and navigation', 'verification_status': status, 'customer_type': 'manufacturer', 'addresses': [], 'submitted_by': actor, 'revision': 1, 'review_note': None}]
        page.goto(BASE)
        page.wait_for_load_state('networkidle')
        expect(page.get_by_text('Shop by material', exact=True)).to_be_visible()
        account = page.get_by_role('link', name='Add your business details' if status is None else {'pending': 'Application under review', 'verified': 'Verified business', 'rejected': 'Application needs changes'}[status], exact=False)
        expect(account).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        page.screenshot(path=str(OUT / f'home-account-{status}.png'), full_page=True)
        account.click()
        expect(page).to_have_url(BASE + '/account?section=' + ('business' if status is None else 'profile'))
        checks.append(f'Account {status}: correct status and destination, long business name wraps')
    context.close()
    market_fixtures.append({'id': 'home-test-market', 'name': 'Delhi', 'state': 'Delhi'})
    context = browser.new_context(viewport={'width': 390, 'height': 844})
    context.route('https://*.supabase.co/**', api)
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE)
    page.get_by_role('button', name='Select your home market', exact=True).click()
    page.get_by_role('radio', name='Delhi', exact=True).click()
    expect(page.get_by_text('Your market: Delhi', exact=True)).to_be_visible()
    page.reload()
    expect(page.get_by_text('Your market: Delhi', exact=True)).to_be_visible()
    for label, path in [('Explore fastener dimensions', '/fastener/hex-bolt'), ('View business stock', '/business-stock')]:
        page.get_by_role('link', name=label, exact=True).click()
        expect(page).to_have_url(BASE + path)
        page.goto(BASE)
    context.close()
    checks.append('Market selection persists; fastener dimensions and business stock navigation work')
    browser.close()
assert not errors, errors
(OUT / 'results.json').write_text(json.dumps({'passed': True, 'checks': checks, 'runtime_errors': errors}, indent=2))
print('Home acceptance passed:', len(checks), 'checks; no browser runtime errors')
