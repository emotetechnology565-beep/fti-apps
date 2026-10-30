"""Isolated admin overview acceptance: no live backend calls or order mutations."""
import base64
import json
import threading
import time
from datetime import datetime, timedelta
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from openpyxl import load_workbook
from playwright.sync_api import sync_playwright, expect

root = Path.cwd()
directory = root / 'artifacts/admin-orders-preview'
out = root / 'artifacts/order-payments'
out.mkdir(exist_ok=True)

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if not Path(self.translate_path(self.path.split('?')[0])).is_file() and '.' not in self.path.split('?')[0].rsplit('/', 1)[-1]:
            self.path = '/index.html'
        super().do_GET()
    def log_message(self, *args):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(directory)))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'
actor = '00000000-0000-4000-8000-000000000001'
enc = lambda value: base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
user = {'id': actor, 'aud': 'authenticated', 'role': 'authenticated', 'phone': '919000000001', 'app_metadata': {}, 'user_metadata': {}}
session = {'user': user, 'access_token': enc({'alg': 'HS256'}) + '.' + enc({'sub': actor, 'aud': 'authenticated', 'role': 'authenticated', 'aal': 'aal2', 'exp': int(time.time()) + 3600}) + '.isolated', 'refresh_token': 'isolated', 'expires_at': int(time.time()) + 3600, 'expires_in': 3600, 'token_type': 'bearer'}
identity = {'profile': {'id': actor, 'full_name': 'Preview staff', 'phone': '+919000000001', 'account_status': 'active'}, 'roles': ['super_admin'], 'permissions': ['staff.access', 'order.manage', 'operations.manage'], 'businesses': [], 'deletion_requested': False}
rows = []
for index in range(31):
    kind = ['material', 'fastener', 'commerce'][index % 3]
    status = ['pending_confirmation', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'rejected'][index % 7]
    created = datetime(2026, 10, 30, 10) - timedelta(days=index % 8)
    rows.append({'id': f'10000000-0000-4000-8000-{index+1:012}', 'kind': kind, 'reference': {'material': 'RM', 'fastener': 'FN', 'commerce': 'O'}[kind] + f'-{index+1:06}', 'status': status, 'created_at': created.isoformat() + 'Z', 'buyer_name': 'Sample buyer', 'phone': '+919876543210', 'business': 'Sample Engineering', 'location': 'Industrial Road, Ludhiana, Punjab', 'material': 'Bright steel bar' if kind == 'material' else 'Hex bolt M12' if kind == 'fastener' else 'Tractor parts', 'quantity': '500 kg' if kind == 'material' else '40 pieces', 'grade': 'EN8', 'size': '40 mm', 'total': '47000', 'amount_due': None, 'closure_note': None, 'fulfillment': {'status': status, 'revision': 2, 'confirmed_total': '47000', 'confirmation_note': 'Availability and delivery terms agreed.', 'history': [], 'carrier': None}})
requests, errors = [], []
mode = {'fail': False, 'overflow': False}

def api(route):
    req = route.request
    body = (req.post_data_json or {}) if req.method == 'POST' else {}
    direct = '/rest/v1/rpc/' in req.url
    op = req.url.rsplit('/', 1)[-1] if direct else body.get('operation')
    args = body if direct else body.get('arguments', {})
    result = []
    if '/auth/v1/user' in req.url:
        result = user
    elif op == 'fti_identity_me':
        result = identity
    elif op == 'fti_order_payments':
        row = next(r for r in rows if r['id'] == args['p_id'])
        result = {'total': row['total'] if row['status'] != 'pending_confirmation' else None, 'paid': '0', 'remaining': row['total'] if row['status'] != 'pending_confirmation' else None, 'status': row['status'], 'receipts': []}
    elif op == 'fti_admin_orders':
        requests.append(args)
        if mode['fail']:
            return route.fulfill(status=500, content_type='application/json', body=json.dumps({'message': 'Preview service unavailable'}), headers={'Access-Control-Allow-Origin': '*'})
        data = [r for r in rows if args.get('p_kind', 'all') in ['all', r['kind']] and args.get('p_status', 'all') in ['all', r['status']]]
        search = args.get('p_search', '').lower()
        data = [r for r in data if not search or search in json.dumps(r).lower()]
        data = [r for r in data if (not args.get('p_from') or r['created_at'][:10] >= args['p_from']) and (not args.get('p_to') or r['created_at'][:10] <= args['p_to'])]
        summary = {'total': len(data), 'active': sum(r['status'] not in ['delivered', 'cancelled', 'rejected'] for r in data), 'awaiting': sum(r['status'] in ['pending_confirmation', 'pending_payment'] for r in data), 'processing': sum(r['status'] == 'processing' for r in data), 'shipped': sum(r['status'] == 'shipped' for r in data), 'delivered': sum(r['status'] == 'delivered' for r in data), 'cancelled': sum(r['status'] == 'cancelled' for r in data), 'rejected': sum(r['status'] == 'rejected' for r in data), 'confirmed_value': str(sum(47000 for r in data if r['status'] in ['confirmed', 'processing', 'shipped', 'delivered']))}
        if mode['overflow']:
            summary['total'] = 10001
        offset = args.get('p_offset', 0)
        result = {'orders': data[offset:offset + args.get('p_limit', 24)], 'summary': summary}
    if '/functions/v1/' in req.url:
        result = {'data': result}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(result), headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'})


from decimal import Decimal
from copy import deepcopy
base_api = api
identity['permissions'].append('payment.review')
rows[:] = [rows[0]]
row = rows[0]
summary = {}
step_requests = []

def add_receipt(details):
    if not details.get('payment_amount'):
        return
    paid = Decimal(summary['paid']) + Decimal(details['payment_amount'])
    summary['paid'] = str(paid.quantize(Decimal('.01')))
    summary['remaining'] = str((Decimal(summary['total']) - paid).quantize(Decimal('.01')))
    summary['receipts'].append({'id': details['payment_id'], 'amount': details['payment_amount'], 'reference': details['payment_reference'], 'at': '2026-10-30T10:00:00Z'})

def payment_api(route):
    req = route.request
    body = (req.post_data_json or {}) if req.method == 'POST' else {}
    direct = '/rest/v1/rpc/' in req.url
    op = req.url.rsplit('/', 1)[-1] if direct else body.get('operation')
    args = body if direct else body.get('arguments', {})
    if op == 'fti_order_payments':
        result = summary
    elif op == 'fti_request_fulfillment_update':
        details = args['p_details']
        step_requests.append(deepcopy(args))
        if args['p_status'] == 'confirmed':
            row['total'] = details['confirmed_total']
            summary['total'] = details['confirmed_total']
            summary['remaining'] = details['confirmed_total']
        add_receipt(details)
        row['status'] = args['p_status']
        summary['status'] = row['status']
        row['fulfillment'].update({key: value for key, value in details.items() if not key.startswith('payment_') and value})
        row['fulfillment']['status'] = row['status']
        row['fulfillment']['revision'] += 1
        result = row['fulfillment']
    elif op == 'fti_order_receipt_record':
        add_receipt(args['p_details'])
        result = summary
    else:
        return base_api(route)
    route.fulfill(status=200, content_type='application/json', body=json.dumps(result), headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'})

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for width in [390, 1440]:
            summary.clear()
            summary.update({'total': None, 'paid': '0', 'remaining': None, 'status': 'pending_confirmation', 'receipts': []})
            row['status'] = 'pending_confirmation'
            row['total'] = None
            row['fulfillment'] = {'status': 'pending_confirmation', 'revision': 0, 'history': []}
            row['payment_summary'] = summary
            step_requests.clear()
            context = browser.new_context(viewport={'width': width, 'height': 1000})
            context.route('https://*.supabase.co/**', payment_api)
            context.add_init_script('localStorage.setItem("fti-auth-v2",' + json.dumps(json.dumps(session)) + ')')
            page = context.new_page()
            page.set_default_timeout(15000)
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(base + '/admin?section=orders-overview', wait_until='networkidle')
            page.get_by_role('button', name='View order RM-000001', exact=True).click()
            page.get_by_role('button', name='Confirm order', exact=True).click()
            page.get_by_label('Agreed order total (INR)', exact=True).fill('10000')
            page.get_by_label('Order confirmation note', exact=True).fill('Availability and terms agreed')
            amount = page.get_by_label('Payment received at this step (INR, optional)', exact=True)
            amount.fill('10001')
            page.get_by_label('Payment / receipt reference', exact=True).fill('RECEIPT-001')
            expect(page.get_by_text('Payment exceeds the remaining amount.', exact=True)).to_be_visible()
            expect(page.get_by_role('button', name='Review confirmed', exact=True)).to_be_disabled()
            amount.fill('3000')
            page.get_by_role('button', name='Review confirmed', exact=True).click()
            expect(page.get_by_text('Record INR 3000 received against RECEIPT-001.', exact=True)).to_be_visible()
            page.get_by_role('button', name='Save confirmed', exact=True).click()
            expect(page.get_by_text('Remaining amount: \u20b97,000.00', exact=True).last).to_be_visible()
            assert step_requests[-1]['p_details']['payment_amount'] == '3000'
            page.get_by_role('button', name='Start processing', exact=True).click()
            page.get_by_label('Payment received at this step (INR, optional)', exact=True).fill('2000')
            page.get_by_label('Payment / receipt reference', exact=True).fill('RECEIPT-002')
            expect(page.get_by_text('Remaining after this payment: \u20b95,000.00', exact=True)).to_be_visible()
            page.get_by_role('button', name='Review processing', exact=True).click()
            page.get_by_role('button', name='Save processing', exact=True).click()
            expect(page.get_by_text('Payment received: \u20b95,000.00', exact=True).last).to_be_visible()
            expect(page.get_by_text('Remaining amount: \u20b95,000.00', exact=True).last).to_be_visible()
            page.get_by_text('Payment tracking', exact=True).scroll_into_view_if_needed()
            page.screenshot(path=str(out / f'partial-payment-{width}.png'))
            page.get_by_role('button', name='Record dispatch', exact=True).click()
            page.get_by_label('Transporter / carrier', exact=True).fill('Punjab Transport')
            page.get_by_label('LR / tracking reference', exact=True).fill('LR-001')
            expect(page.get_by_label('Payment received at this step (INR, optional)', exact=True)).to_have_value('')
            page.get_by_role('button', name='Review dispatched', exact=True).click()
            page.get_by_role('button', name='Save dispatched', exact=True).click()
            expect(page.get_by_text('Remaining amount: \u20b95,000.00', exact=True).last).to_be_visible()
            assert step_requests[-1]['p_details']['payment_amount'] == ''
            page.get_by_role('button', name='Mark delivered', exact=True).click()
            page.get_by_label('Delivery evidence / recipient confirmation', exact=True).fill('Recipient signed POD-001')
            page.get_by_label('Payment received at this step (INR, optional)', exact=True).fill('1000')
            page.get_by_label('Payment / receipt reference', exact=True).fill('RECEIPT-003')
            page.get_by_role('button', name='Review delivered', exact=True).click()
            page.get_by_role('button', name='Save delivered', exact=True).click()
            expect(page.get_by_text('Remaining amount: \u20b94,000.00', exact=True).last).to_be_visible()
            page.get_by_role('button', name='Record a payment', exact=True).click()
            page.get_by_label('Payment received at this step (INR, optional)', exact=True).fill('4000')
            page.get_by_label('Payment / receipt reference', exact=True).fill('RECEIPT-004')
            page.get_by_role('button', name='Review payment', exact=True).click()
            page.get_by_role('button', name='Confirm payment received', exact=True).click()
            expect(page.get_by_text('Remaining amount: \u20b90.00', exact=True).last).to_be_visible()
            expect(page.get_by_text('Payment received: \u20b910,000.00', exact=True).last).to_be_visible()
            assert len(summary['receipts']) == 4
            assert len(step_requests) == 4
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.get_by_text('Payment tracking', exact=True).scroll_into_view_if_needed()
            page.screenshot(path=str(out / f'fully-paid-{width}.png'))
            context.close()
        browser.close()
    assert not errors, errors
    print('PASS: optional payments at all four fulfillment steps, overpayment validation, projected/recorded balances, blank optional step, receipt history and post-delivery payment at 390/1440px')
finally:
    server.shutdown()
