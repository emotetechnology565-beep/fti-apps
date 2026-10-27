"""Mocked browser acceptance for staff request fulfillment. No remote records or messages."""
from pathlib import Path
import copy
exec(Path('scripts/raw-material-order-browser.py').read_text(encoding='utf-8').split('with sync_playwright() as p:')[0])

original_api = api
identity['permissions'].append('operations.manage')
initial = {'status': 'pending_confirmation', 'revision': 0, 'history': []}
material = {'id': '00000000-0000-0000-0000-000000000011', 'created_at': '2026-10-27T10:30:00Z', 'details': {'reference': 'FTI-RM-PIPELINE', 'material': 'Round bar', 'grade': 'EN-8D', 'size': '32 mm', 'quantity': '2 MT', 'name': 'Sample buyer', 'business': 'Sample Engineering', 'phone': '+919000000001', 'location': 'Bagha Purana, Punjab 142038'}, 'deliveries': [], 'fulfillment': copy.deepcopy(initial)}
definition = json.loads(Path('deployment/fastener-dimensions/hex-source-definitions.json').read_text(encoding='utf-8'))[0]
fastener = {'id': '00000000-0000-0000-0000-000000000012', 'created_at': material['created_at'], 'details': dict(material['details'], reference='FTI-FS-PIPELINE', material='hex-bolt', quantity='100 pieces'), 'definition': definition, 'selection': {'input': {'length': 120}}, 'deliveries': [], 'fulfillment': copy.deepcopy(initial)}
changes = []
stale = False

def api(route):
    global stale
    req = route.request
    body = (req.post_data_json or {}) if req.method == 'POST' else {}
    direct = '/rest/v1/rpc/' in req.url
    op = req.url.rsplit('/', 1)[-1] if direct else body.get('operation')
    args = body if direct else body.get('arguments', {})
    result = None
    headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'}
    if op == 'fti_catalog_raw_orders': result = [material]
    elif op == 'fti_catalog_fastener_orders': result = [fastener]
    elif op == 'fti_request_fulfillment_update':
        row = material if args['p_kind'] == 'material' else fastener
        assert row['id'] == args['p_request']
        if stale:
            stale = False
            return route.fulfill(status=400, content_type='application/json', body=json.dumps({'code': '40001', 'message': 'Request changed. Refresh before continuing'}), headers=headers)
        assert args['p_revision'] == row['fulfillment']['revision']
        row['fulfillment'].update({key: value for key, value in args['p_details'].items() if value})
        row['fulfillment'].update(status=args['p_status'], revision=args['p_revision'] + 1)
        row['fulfillment']['history'].append({'status': args['p_status'], 'at': '2026-10-27T12:00:00Z', 'actor_id': actor})
        changes.append(args)
        result = row['fulfillment']
    else: return original_api(route)
    if not direct: result = {'data': result}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(result), headers=headers)

out = Path('artifacts/request-fulfillment')
out.mkdir(parents=True, exist_ok=True)
base = 'http://127.0.0.1:' + (sys.argv[1] if len(sys.argv) > 1 else '8087')
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width in [390, 1366]:
        for kind in ['material', 'fastener']:
            row = material if kind == 'material' else fastener
            row['fulfillment'] = copy.deepcopy(initial)
            context = browser.new_context(viewport={'width': width, 'height': 1000})
            context.route('https://*.supabase.co/**', api)
            context.add_init_script('localStorage.setItem("fti-auth-v2", ' + json.dumps(json.dumps(session)) + ')')
            page = context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(base + '/admin?section=raw-material-orders')
            if kind == 'fastener': page.get_by_role('tab', name='Fasteners', exact=True).click(timeout=30000)
            page.get_by_role('button', name='Confirm order', exact=True).click(timeout=30000)
            expect(page.get_by_role('button', name='Review confirmed', exact=True)).to_be_disabled()
            page.get_by_label('Agreed order total (INR)', exact=True).fill('12500.50')
            page.get_by_label('Order confirmation note', exact=True).fill('Availability, total and payment terms agreed with buyer.')
            before = len(changes)
            page.get_by_role('button', name='Review confirmed', exact=True).click()
            assert len(changes) == before
            if width == 390 and kind == 'material':
                stale = True
                page.get_by_role('button', name='Save confirmed', exact=True).click()
                expect(page.get_by_role('alert').filter(has_text='Another staff member')).to_be_visible()
                assert row['fulfillment']['status'] == 'pending_confirmation'
            page.get_by_role('button', name='Save confirmed', exact=True).click()
            page.get_by_role('button', name='Start processing', exact=True).click()
            page.get_by_role('button', name='Review processing', exact=True).click()
            page.get_by_role('button', name='Save processing', exact=True).click()
            page.get_by_role('button', name='Record dispatch', exact=True).click()
            expect(page.get_by_role('button', name='Review dispatched', exact=True)).to_be_disabled()
            page.get_by_label('Transporter / carrier', exact=True).fill('Sample Transport')
            page.get_by_label('LR / tracking reference', exact=True).fill('LR-12345')
            page.get_by_label('Vehicle number (optional)', exact=True).fill('PB01AB1234')
            page.get_by_role('button', name='Review dispatched', exact=True).click()
            # Editing a reviewed value must require another review.
            page.get_by_label('LR / tracking reference', exact=True).fill('LR-54321')
            expect(page.get_by_role('button', name='Save dispatched', exact=True)).to_have_count(0)
            page.get_by_role('button', name='Review dispatched', exact=True).click()
            page.get_by_role('button', name='Save dispatched', exact=True).click()
            page.get_by_role('button', name='Mark delivered', exact=True).click()
            expect(page.get_by_role('button', name='Review delivered', exact=True)).to_be_disabled()
            page.get_by_label('Delivery evidence / recipient confirmation', exact=True).fill('Signed POD-12345 received from buyer')
            page.get_by_role('button', name='Review delivered', exact=True).click()
            page.get_by_role('button', name='Save delivered', exact=True).click()
            expect(page.get_by_text('Delivery confirmation: Signed POD-12345 received from buyer', exact=True)).to_be_visible()
            assert row['fulfillment']['revision'] == 4
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.reload()
            if kind == 'fastener': page.get_by_role('tab', name='Fasteners', exact=True).click(timeout=30000)
            expect(page.get_by_text('LR / tracking: LR-54321', exact=True)).to_be_visible(timeout=30000)
            expect(page.get_by_role('button', name='Mark delivered', exact=True)).to_have_count(0)
            panel = page.get_by_text('Order fulfillment', exact=True).locator('../..')
            panel.screenshot(path=str(out / f'{kind}-{width}.png'))
            context.close()
    # Staff may confirm orders without being allowed to record dispatch.
    identity['permissions'].remove('operations.manage')
    material['fulfillment'] = dict(copy.deepcopy(initial), status='processing', revision=2)
    context = browser.new_context(viewport={'width': 390, 'height': 1000})
    context.route('https://*.supabase.co/**', api)
    context.add_init_script('localStorage.setItem("fti-auth-v2", ' + json.dumps(json.dumps(session)) + ')')
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(base + '/admin?section=raw-material-orders')
    expect(page.get_by_role('button', name='Record dispatch', exact=True)).to_be_disabled(timeout=30000)
    assert not errors, errors
    browser.close()
assert len(changes) == 16, len(changes)
print('PASS: material + fastener confirmation-to-delivery on mobile/desktop, review gates, stale-write failure, reload persistence, dispatch permission, no overflow/runtime errors')
