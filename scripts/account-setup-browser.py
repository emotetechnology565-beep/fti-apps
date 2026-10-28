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
identity = {'profile': {'id': actor, 'full_name': 'Isolated staff', 'phone': '+919000000001', 'account_status': 'active'}, 'roles': ['customer'], 'permissions': [], 'businesses': [], 'deletion_requested': False}
errors = []
warnings = []
operations = []
submission_attempts = 0
whatsapp_preference = {'enabled': False}
def api(route):
    global submission_attempts
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
            elif op == 'fti_save_profile':
                identity['profile']['full_name'] = body['arguments']['p_full_name']
                result = None
            elif op == 'fti_operations_notifications': result = []
            elif op == 'fti_operations_whatsapp_preferences': result = whatsapp_preference
            elif op == 'fti_operations_whatsapp_opt_in':
                whatsapp_preference['enabled'] = body['arguments']['p_enabled']
                result = None
            elif op == 'fti_apply_business':
                submission_attempts += 1
                if submission_attempts == 1:
                    route.fulfill(status=503, content_type='application/json', body=json.dumps({'message': 'Submission temporarily unavailable'}), headers={'Access-Control-Allow-Origin': '*'})
                    return
                application = body['arguments']['p_application']
                identity['businesses'] = [{
                    'id': '00000000-0000-0000-0000-000000000002',
                    'submitted_by': actor, 'verification_status': 'pending',
                    'revision': 1, 'review_note': None,
                    **{key: application[key] for key in ['legal_name', 'gstin', 'pan', 'customer_type']},
                    'addresses': [{**application[label], 'label': label} for label in ['billing', 'shipping']],
                }]
                result = identity['businesses'][0]['id']
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
    page = browser.new_page(viewport={'width':1440,'height':1000})
    page.route('https://*.supabase.co/**', api)
    page.add_init_script('localStorage.setItem("fti-auth-v2", ' + json.dumps(json.dumps(session)) + ')')
    page.on('pageerror', lambda error: errors.append(str(error)))
    base='http://127.0.0.1:' + (sys.argv[1] if len(sys.argv)>1 else '8095')
    page.goto(base+'/account', timeout=60000)
    page.wait_for_load_state('networkidle', timeout=60000)
    expect(page.get_by_text('COMING SOON', exact=True)).to_be_visible(timeout=60000)
    expect(page.get_by_role('link', name='Order history', exact=True)).to_be_visible()
    page.screenshot(path='artifacts/account-overview-desktop.png', full_page=True)
    page.get_by_role('link', name='Order history', exact=True).click()
    expect(page).to_have_url(re.compile(r'/orders$'))
    expect(page.get_by_text('No orders yet', exact=True)).to_be_visible()
    page.goto(base+'/account?section=subscription')
    expect(page.get_by_text('COMING SOON', exact=True)).to_be_visible()
    page.get_by_role('link', name='View current market rates', exact=True).click()
    expect(page).to_have_url(re.compile(r'/rates$'))
    page.goto(base+'/account')
    page.get_by_role('link', name='Edit personal profile', exact=True).click()
    expect(page.get_by_role('textbox',name='Full name',exact=True)).to_be_visible(timeout=60000)
    page.get_by_role('textbox',name='Full name',exact=True).fill('Account details tester')
    page.get_by_role('button',name='Save profile',exact=True).click()
    expect(page.get_by_text('Profile saved.',exact=True)).to_be_visible()
    expect(page.get_by_role('textbox',name='Legal business name',exact=True)).not_to_be_visible()
    page.get_by_role('link',name='Business details',exact=True).click()
    page.get_by_role('textbox',name='Legal business name',exact=True).fill('Isolated business')
    page.get_by_role('textbox',name='GSTIN (optional)',exact=True).fill('07ABCDE1234F1Z5')
    page.get_by_role('textbox',name='PAN (optional)',exact=True).fill('ABCDE1234F')
    page.get_by_role('link',name='Personal profile',exact=True).click()
    page.get_by_role('link',name='Business details',exact=True).click()
    expect(page.get_by_role('textbox',name='Legal business name',exact=True)).to_have_value('Isolated business')
    page.get_by_role('button',name='Continue to addresses',exact=True).click()
    for label,value in [('Billing address','123 Industrial Road'),('Billing city','Delhi'),('Billing state','Delhi'),('Billing pincode','110001')]:
        page.get_by_role('textbox',name=label,exact=True).fill(value)
    page.get_by_role('button',name='Review application',exact=True).click()
    expect(page.get_by_text('Isolated business',exact=True)).to_be_visible()
    expect(page.get_by_text('Delivery: Same as billing',exact=True)).to_be_visible()
    page.get_by_role('button',name='Submit business application',exact=True).click()
    assert 'fti_apply_business' not in operations
    page.get_by_text('I confirm these details are accurate and authorize verification',exact=True).click()
    page.get_by_role('button',name='Submit business application',exact=True).click()
    expect(page.get_by_text('Submission temporarily unavailable (HTTP 503)',exact=True)).to_be_visible()
    expect(page.get_by_text('Application submitted for review.',exact=True)).to_have_count(0)
    page.get_by_role('button',name='Submit business application',exact=True).click()
    expect(page.get_by_text('Application submitted for review.',exact=True)).to_be_visible()
    expect(page.get_by_text('PENDING',exact=True)).to_be_visible()
    expect(page.get_by_text('APPLICATION SUBMITTED',exact=True)).to_be_visible()
    assert submission_attempts == 2
    assert 'fti_apply_business' in operations
    page.get_by_role('link',name='Personal profile',exact=True).click()
    for detail in ['Saved account details','Full name: Account details tester','Verified phone: +919000000001',
                   'Isolated business','GSTIN: 07ABCDE1234F1Z5','PAN: ABCDE1234F',
                   'Billing address: 123 Industrial Road, Delhi, Delhi, 110001',
                   'Delivery address: 123 Industrial Road, Delhi, Delhi, 110001']:
        expect(page.get_by_text(detail,exact=True).last).to_be_visible()
    page.reload()
    expect(page.get_by_text('Full name: Account details tester',exact=True)).to_be_visible()
    expect(page.get_by_text('GSTIN: 07ABCDE1234F1Z5',exact=True)).to_be_visible()
    page.get_by_role('link',name='Account settings',exact=True).click()
    expect(page.get_by_role('button',name='Opt in to WhatsApp updates',exact=True)).to_be_visible()
    page.get_by_role('button',name='Opt in to WhatsApp updates',exact=True).click()
    expect(page.get_by_role('button',name='Turn off WhatsApp updates',exact=True)).to_be_visible()
    expect(page.get_by_role('button',name='Sign out on this device',exact=True)).to_be_visible()
    expect(page.get_by_role('button',name='Request account deletion',exact=True)).to_be_disabled()
    page.set_viewport_size({'width':390,'height':844})
    page.get_by_role('button',name='Open navigation',exact=True).click()
    page.get_by_role('link',name='Business addresses',exact=True).click()
    expect(page.get_by_role('textbox',name='Billing city',exact=True)).to_have_value('Delhi')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.reload()
    expect(page.get_by_role('textbox',name='Billing city',exact=True)).to_be_visible()
    page.goto(base+'/account')
    expect(page.get_by_text('COMING SOON',exact=True)).to_be_visible()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path='artifacts/account-overview-mobile.png', full_page=True)
    page.get_by_role('link',name='Saved business addresses',exact=True).click()
    expect(page.get_by_role('textbox',name='Billing city',exact=True)).to_be_visible()
    page.goto(base+'/account?section=settings')
    expect(page.get_by_role('link',name='Order history',exact=True)).to_be_visible()
    expect(page.get_by_text('COMING SOON',exact=True)).to_be_visible()
    page.get_by_role('button',name='Back to account overview',exact=True).click()
    expect(page.get_by_role('link',name='Edit personal profile',exact=True)).to_be_visible()
    page.get_by_role('link',name='Edit personal profile',exact=True).click()
    expect(page.get_by_role('textbox',name='Full name',exact=True)).to_be_visible()
    page.get_by_role('link',name='Account',exact=True).click()
    expect(page.get_by_role('link',name='Edit personal profile',exact=True)).to_be_visible()
    for shortcut, path in [('Order history','/orders'), ('View current market rates','/rates'), ('Help & support','/support')]:
        page.get_by_role('link',name=shortcut,exact=True).click()
        expect(page).to_have_url(re.compile(re.escape(path) + r'$'))
        page.go_back()
        expect(page.get_by_role('link',name='Edit personal profile',exact=True)).to_be_visible()
        page.get_by_role('link',name=shortcut,exact=True).click()
        expect(page).to_have_url(re.compile(re.escape(path) + r'$'))
        page.get_by_role('link',name='Account',exact=True).click()
        expect(page.get_by_role('link',name='Edit personal profile',exact=True)).to_be_visible()
    page.get_by_role('link',name='Notifications & account settings',exact=True).click()
    expect(page.get_by_role('button',name='Sign out on this device',exact=True)).to_be_visible()
    page.get_by_role('button',name='Back to account overview',exact=True).click()
    for section in ['Personal profile','Business details','Business addresses','Review & submit','Rate subscription','Account settings']:
        page.get_by_role('button',name='Open navigation',exact=True).click()
        page.get_by_role('dialog').get_by_role('link',name=section,exact=True).click()
        expect(page.get_by_role('button',name='Back to account overview',exact=True)).to_be_visible()
        expect(page.get_by_role('button',name='Close navigation',exact=True)).to_have_count(0)
        page.get_by_role('button',name='Back to account overview',exact=True).click()
        expect(page.get_by_role('link',name='Edit personal profile',exact=True)).to_be_visible()
    page.screenshot(path='artifacts/account-navigation-mobile.png', full_page=True)
    assert not errors, errors
    browser.close()
    print('Account navigation passed: customer sections, draft retention, review, consent, submission, settings, mobile and deep link.')
