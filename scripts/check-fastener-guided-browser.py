"""Full guided fastener flow against isolated API fixtures; no live submissions."""
import json
import re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

exec(Path('scripts/account-setup-browser.py').read_text(encoding='utf-8').split('with sync_playwright() as p:')[0])
definition = dict(id='00000000-0000-0000-0000-000000000012', subcategory='hex-bolt', family='hex',
                  standard='IS 1363', edition='1967', shape='hex-bolt', size='M12', source='Published test drawing',
                  notes='Published drawing note from database.', dimensions=dict(diameter=12, widths=[], lengths=[100, 120]), revision=1, published_revision=1)
detail = dict(subcategory='hex-bolt', title='Hex bolt', description='Database-owned hex bolt description.',
              specifications=[dict(label='Material used', value='Wire and round bars'), dict(label='Threading capacity', value='5–56 mm')],
              materials=['LC', 'MS', 'CHQ'], grades=['EN-8D', 'EN-19'], threads=['BSW', 'UNC', 'UNF'], finishes=['Auto black', 'Zinc plating'], revision=1)
submissions = []
page_errors = []

def fixture_api(route):
    request = route.request
    body = request.post_data_json or {} if request.method == 'POST' else {}
    result = []
    if '/auth/v1/user' in request.url:
        result = user
    elif '/rest/v1/rpc/fti_catalog_fastener_detail' in request.url:
        result = detail
    elif '/rest/v1/rpc/fti_catalog_fastener_requirement_submit' in request.url:
        submissions.append(body)
        result = dict(id=body['p_id'], reference='FTI-FN-' + str(len(submissions)), replayed=False)
    elif '/functions/v1/' in request.url:
        op = body.get('operation')
        if op == 'fti_identity_me': result = identity
        elif op == 'fti_catalog_drawing_list': result = [definition]
        elif op == 'fti_catalog_fastener_photos': result = [dict(slug='hex-bolt', label='Hex bolt', image_url=None)]
        elif op == 'fti_commerce_addresses': result = [dict(id='address-1', business_id=None, line1='1 Factory Road', city='Ludhiana', state='Punjab', pincode='141001')]
        elif op in ['fti_catalog_filtered_list', 'fti_catalog_list']: result = dict(items=[], total=0, categories=[])
        result = dict(data=result)
    route.fulfill(status=200, content_type='application/json', body=json.dumps(result), headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'})

def choose(page, label, value):
    page.get_by_role('button', name=re.compile('^' + re.escape(label).replace('/', r'\/') + ':')).click()
    page.get_by_role('radio', name=value, exact=True).click()
    expect(page.get_by_role('radio')).to_have_count(0)

def next_step(page):
    page.get_by_role('button', name='Continue', exact=True).click()

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width in [1440, 390]:
        submissions.clear()
        context = browser.new_context(viewport=dict(width=width, height=1000))
        context.route('https://*.supabase.co/**', fixture_api)
        context.add_init_script('localStorage.setItem("fti-auth-v2", ' + json.dumps(json.dumps(session)) + ')')
        page = context.new_page()
        page.on('pageerror', lambda error: page_errors.append(str(error)))
        page.goto('http://127.0.0.1:8097/fastener/hex-bolt', timeout=60000)
        expect(page.get_by_text('Database-owned hex bolt description.', exact=True)).to_be_visible(timeout=60000)
        expect(page.get_by_text('Wire and round bars', exact=True)).to_be_visible()
        expect(page.get_by_text('Step 1 of 6', exact=False)).to_have_count(0)
        page.get_by_role('button', name='Configure requirement', exact=True).click()
        next_step(page)
        expect(page.get_by_role('alert')).to_contain_text('Choose a standard')
        choose(page, 'Standard', 'IS 1363:1967'); next_step(page)
        choose(page, 'Drawing size / diameter', 'M12')
        page.get_by_role('textbox', name='Length (mm)', exact=True).fill('120')
        next_step(page)
        page.get_by_role('button', name='Back', exact=True).click()
        expect(page.get_by_role('textbox', name='Length (mm)', exact=True)).to_have_value('120')
        next_step(page)
        choose(page, 'Material', 'MS'); choose(page, 'Grade', 'EN-8D'); next_step(page)
        choose(page, 'Thread type', 'UNC'); choose(page, 'Finish', 'Zinc plating')
        page.get_by_role('textbox', name='Thread pitch (optional)', exact=True).fill('20 TPI')
        choose(page, 'Nut supply', 'With nut'); next_step(page)
        page.get_by_role('textbox', name='Quantity (pieces)', exact=True).fill('25')
        page.get_by_role('textbox', name='Additional requirement notes', exact=True).fill('For fixture assembly')
        next_step(page)
        expect(page.get_by_text('20 TPI', exact=True)).to_be_visible()
        page.get_by_role('button', name='Add to cart', exact=True).click()
        page.get_by_role('button', name='Review basket & request quotation', exact=True).click()
        page.get_by_role('link', name='Edit Hex bolt requirement', exact=True).click()
        for unused in range(4): next_step(page)
        expect(page.get_by_role('textbox', name='Quantity (pieces)', exact=True)).to_have_value('25')
        page.get_by_role('textbox', name='Quantity (pieces)', exact=True).fill('30'); next_step(page)
        page.get_by_role('button', name='Update cart item', exact=True).click()
        page.get_by_role('button', name='Review basket & request quotation', exact=True).click()
        expect(page.get_by_role('link', name='Edit Hex bolt requirement', exact=True)).to_have_count(1)
        page.goto('http://127.0.0.1:8097/fastener/hex-bolt')
        page.get_by_role('button', name='Configure requirement', exact=True).click()
        choose(page, 'Standard', 'Not sure / Custom requirement'); next_step(page); next_step(page)
        choose(page, 'Material', 'Not sure'); choose(page, 'Grade', 'Not sure'); next_step(page)
        choose(page, 'Thread type', 'Not sure'); choose(page, 'Finish', 'Not sure'); next_step(page)
        page.get_by_role('textbox', name='Quantity (pieces)', exact=True).fill('8')
        next_step(page)
        expect(page.get_by_role('alert')).to_contain_text('Describe your custom')
        page.get_by_role('textbox', name='Additional requirement notes', exact=True).fill('Please advise dimensions for my replacement bolt')
        next_step(page)
        page.get_by_role('button', name='Add to cart', exact=True).click()
        page.get_by_role('button', name='Review basket & request quotation', exact=True).click()
        expect(page.get_by_role('link', name='Edit Hex bolt requirement', exact=True)).to_have_count(2)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=f'artifacts/fastener-guided-basket-{width}.png', full_page=True)
        page.get_by_role('button', name='Request quotation', exact=True).click()
        page.get_by_role('textbox', name='Company name', exact=True).fill('Fixture Engineering')
        page.get_by_role('button', name='Request quotation', exact=True).click()
        expect(page.get_by_text('Quotation request submitted', exact=True)).to_be_visible(timeout=60000)
        expect(page.get_by_text('FTI-FN-1', exact=True)).to_be_visible()
        expect(page.get_by_text('FTI-FN-2', exact=True)).to_be_visible()
        assert len(submissions) == 2, submissions
        standard, custom = submissions
        assert standard['p_quantity'] == 30
        assert standard['p_requirement']['thread'] == 'UNC'
        assert standard['p_requirement']['finish'] == 'Zinc plating'
        assert standard['p_requirement']['pitch'] == '20 TPI'
        assert standard['p_requirement']['with_nut'] is True
        assert custom['p_requirement']['custom'] is True
        assert custom['p_requirement']['dimensions'] == {}
        assert custom['p_quantity'] == 8
        page.screenshot(path=f'artifacts/fastener-guided-success-{width}.png', full_page=True)
        context.close()
    browser.close()
assert not page_errors, page_errors
print('PASS: database details, six-step published/custom routes, validation, back preservation, editing, distinct cart lines, complete quotation payloads and references on desktop/mobile.')
