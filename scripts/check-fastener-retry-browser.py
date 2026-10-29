"""Simulate partial success and ambiguous failure using only intercepted API calls."""
from pathlib import Path
exec(Path('scripts/check-fastener-guided-browser.py').read_text(encoding='utf-8').rsplit('with sync_playwright() as p:', 1)[0])

attempts = []
def retry_api(route):
    if '/rest/v1/rpc/fti_catalog_fastener_requirement_submit' not in route.request.url:
        return fixture_api(route)
    body = route.request.post_data_json
    attempts.append(body)
    if len(attempts) == 2:
        route.fulfill(status=503, content_type='application/json', body=json.dumps({'code': 'XX000', 'message': 'Temporary quotation outage'}), headers={'Access-Control-Allow-Origin': '*'})
    else:
        route.fulfill(status=200, content_type='application/json', body=json.dumps({'id': body['p_id'], 'reference': 'FTI-FN-1' if len(attempts) == 1 else 'FTI-FN-2', 'replayed': len(attempts) > 2}), headers={'Access-Control-Allow-Origin': '*'})

cart = []
for number, count in [(1, 5), (2, 8)]:
    requirement = dict(subcategory='hex-bolt', definition_id=None, revision=None, standard='Not sure / Custom requirement', shape='hex-bolt', dimensions={}, material='Not sure', grade='Not sure', thread='Not sure', pitch='Not sure', finish='Not sure', with_nut=False, notes=f'Custom replacement requirement {number}', custom=True)
    key = f'fixture-requirement-{number}'
    cart.append(dict(productId='fastener:hex-bolt', variantId=key, quantity=count, material=dict(key=key, name='Hex bolt', size='Custom requirement', grade='Not sure', unit='piece', minimum=1, fastenerRequirement=requirement)))

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport=dict(width=390, height=1000))
    context.route('https://*.supabase.co/**', retry_api)
    context.add_init_script('localStorage.setItem("fti-auth-v2", ' + json.dumps(json.dumps(session)) + '); if (!localStorage.getItem("fti-workspace-v2-' + actor + '")) localStorage.setItem("fti-workspace-v2-' + actor + '", ' + json.dumps(json.dumps({'state': {'cart': cart}, 'version': 0})) + ');')
    page = context.new_page()
    page.goto('http://127.0.0.1:8097/checkout', timeout=60000)
    page.get_by_role('textbox', name='Company name', exact=True).fill('Fixture Engineering')
    page.get_by_role('button', name='Request quotation', exact=True).click()
    expect(page.get_by_text('Temporary quotation outage', exact=True)).to_be_visible(timeout=60000)
    assert len(attempts) == 2
    page.get_by_role('button', name='Back to cart', exact=True).click()
    expect(page.get_by_role('link', name='Edit Hex bolt requirement', exact=True)).to_have_count(1)
    page.get_by_role('button', name='Increase quantity for Hex bolt', exact=True).click()
    page.get_by_role('button', name='Request quotation', exact=True).click()
    page.get_by_role('textbox', name='Company name', exact=True).fill('Fixture Engineering')
    page.get_by_role('button', name='Request quotation', exact=True).click()
    expect(page.get_by_text('the earlier submission for 8 pieces has an unconfirmed outcome', exact=False)).to_be_visible()
    assert len(attempts) == 2
    page.get_by_role('button', name='Back to cart', exact=True).click()
    page.get_by_role('button', name='Decrease quantity for Hex bolt', exact=True).click()
    page.get_by_role('button', name='Request quotation', exact=True).click()
    page.get_by_role('textbox', name='Company name', exact=True).fill('Fixture Engineering')
    page.get_by_role('button', name='Request quotation', exact=True).click()
    expect(page.get_by_text('Quotation request submitted', exact=True)).to_be_visible(timeout=60000)
    expect(page.get_by_text('FTI-FN-1', exact=True)).to_be_visible()
    expect(page.get_by_text('FTI-FN-2', exact=True)).to_be_visible()
    assert len(attempts) == 3
    assert attempts[1]['p_id'] == attempts[2]['p_id']
    assert attempts[0]['p_id'] != attempts[2]['p_id']
    page.screenshot(path='artifacts/fastener-retry-success.png', full_page=True)
    browser.close()
print('PASS: acknowledged lines are not duplicated; changed pending quantities blocked; original retry reuses persisted UUID after navigation; all references retained.')
