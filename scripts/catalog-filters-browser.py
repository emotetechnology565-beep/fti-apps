"""Guest catalogue filter acceptance with isolated backend responses."""
import copy
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

categories = [
    {'id': '00000000-0000-0000-0000-000000000001', 'name': 'As Rolled Round Bar', 'slug': 'round-bar-as-rolled'},
    {'id': '00000000-0000-0000-0000-000000000002', 'name': 'TMT Bar', 'slug': 'tmt'},
    {'id': '00000000-0000-0000-0000-000000000005', 'name': 'Industrial Fasteners', 'slug': 'industrial-fasteners'},
    {'id': '00000000-0000-0000-0000-000000000006', 'name': 'Agricultural Parts', 'slug': 'agricultural-parts'},
]
def variant(number, grade, label, price):
    return {'id': f'00000000-0000-0000-0000-{number:012}', 'sku': f'ROUND-{number}', 'size_label': grade + ' / ' + label, 'diameter_mm': None, 'length_mm': None, 'uom': 'MT', 'min_order_qty': 1, 'pack_qty': None,
            'attributes': {'grade': grade, 'size_group': label, 'grade_list_base_price': '40000', 'grade_list_price': price}}
products = [
    {'id': '00000000-0000-0000-0000-000000000003', 'name': 'Round Bar', 'category_id': categories[0]['id'], 'category': 'As Rolled Round Bar', 'slug': 'round-bar-grade-list', 'product_kind': 'steel', 'purchase_mode': 'rfq', 'status': 'published', 'description': '',
     'variants': [variant(10, 'EN-8D', '16MM TO 50MM', '53500'), variant(11, 'EN-19', '53MM TO 80MM', '69000')]},
    {'id': '00000000-0000-0000-0000-000000000004', 'name': 'TMT', 'category_id': categories[1]['id'], 'category': 'TMT', 'slug': 'tmt-grade-list', 'product_kind': 'steel', 'purchase_mode': 'rfq', 'status': 'published', 'description': '',
     'variants': [variant(12, 'FE-500', '16MM TO 80MM', '64000')]},
]
calls, errors = [], []
for number, kind, name, category_index in [(7, 'fastener', 'Hex Bolt', 2), (8, 'tractor_part', 'Tractor Pin', 3)]:
    products.append({**products[0], 'id': f'00000000-0000-0000-0000-{number:012}',
        'name': name, 'product_kind': kind, 'category_id': categories[category_index]['id'],
        'category': categories[category_index]['name'], 'slug': name.lower().replace(' ', '-')})
def api(route):
    result = []
    if route.request.method != 'OPTIONS':
        body = route.request.post_data_json or {}
        op, args = body.get('operation'), body.get('arguments', {})
        if op in ['fti_catalog_list', 'fti_catalog_filtered_list']:
            calls.append(args)
            items = copy.deepcopy(products)
            if args.get('p_category'):
                cat = next(c for c in categories if c['slug'] == args['p_category'])
                items = [item for item in items if item['category_id'] == cat['id']]
            if args.get('p_size'):
                size = args['p_size']
                for item in items:
                    item['variants'] = [v for v in item['variants'] if int(v['attributes']['size_group'].split('MM')[0]) <= size <= int(v['attributes']['size_group'].split(' TO ')[1].split('MM')[0])]
            grades = ['MS', 'LC', 'FE-500', 'FE-550', 'FE-600', 'FE-600S', 'FE-550D', 'FE-650', 'FE-700', 'EN-8D', 'EN-19']
            if args.get('p_grade'):
                for item in items:
                    item['variants'] = [v for v in item['variants'] if v['attributes']['grade'] == args['p_grade']]
            items = [item for item in items if item['variants']]
            result = {'items': items, 'categories': categories, 'grades': grades, 'total': len(items)}
        elif op == 'fti_catalog_product_get': result = next(item for item in products if item['id'] == args['p_id'])
    route.fulfill(status=200, content_type='application/json', body=json.dumps({'data': result}), headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'})

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 390, 'height': 844})
    context.route('https://*.supabase.co/**', api)
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    base = 'http://127.0.0.1:' + (sys.argv[1] if len(sys.argv) > 1 else '8130')
    page.goto(base + '/products', timeout=60000)
    expect(page.get_by_role('button', name='1. Category: All categories', exact=True)).to_be_visible(timeout=30000)
    expect(page.get_by_role('button', name='2. Size (mm): All sizes', exact=True)).to_be_disabled()
    expect(page.get_by_role('tab', name='Raw Materials')).to_have_attribute('aria-selected', 'true')
    page.get_by_role('button', name='1. Category: All categories', exact=True).click()
    expect(page.get_by_role('radio', name='Industrial Fasteners', exact=True)).to_have_count(0)
    expect(page.get_by_role('radio', name='Agricultural Parts', exact=True)).to_have_count(0)
    page.get_by_role('radio', name='All categories', exact=True).click()
    page.get_by_role('tab', name='Fasteners', exact=True).click()
    expect(page.get_by_role('link', name='View Hex Bolt', exact=True)).to_be_visible()
    expect(page.get_by_role('link', name='View Round Bar', exact=True)).to_have_count(0)
    expect(page.get_by_role('button', name='1. Category: All categories', exact=True)).to_have_count(0)
    page.get_by_role('tab', name='Tractor Parts', exact=True).click()
    expect(page.get_by_role('link', name='View Tractor Pin', exact=True)).to_be_visible()
    expect(page.get_by_role('link', name='View Hex Bolt', exact=True)).to_have_count(0)
    page.get_by_role('tab', name='Raw Materials', exact=True).click()
    def choose(trigger, option):
        page.get_by_role('button', name=trigger, exact=True).click()
        page.get_by_role('radio', name=option, exact=True).click()
    choose('1. Category: All categories', 'As Rolled Round Bar')
    expect(page.get_by_role('button', name='1. Category: As Rolled Round Bar', exact=True)).to_be_visible()
    choose('2. Size (mm): All sizes', '53 mm')
    expect(page.get_by_role('button', name='3. Grade: All grades', exact=True)).to_be_enabled()
    page.get_by_role('button', name='3. Grade: All grades', exact=True).click()
    expect(page.get_by_role('radio', name='EN-19', exact=True)).to_be_visible()
    expect(page.get_by_role('radio', name='EN-8D', exact=True)).to_have_count(0)
    expect(page.get_by_role('radio', name='FE-500', exact=True)).to_have_count(0)
    page.get_by_role('radio', name='EN-19', exact=True).click()
    expect(page.get_by_role('button', name='3. Grade: EN-19', exact=True)).to_be_visible()
    expect(page.get_by_role('link', name='View Round Bar', exact=True)).to_be_visible()
    assert any(call.get('p_size') == 53 and call.get('p_grade') == 'EN-19' for call in calls)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    Path('artifacts').mkdir(exist_ok=True)
    page.screenshot(path='artifacts/catalogue-filters-mobile.png', full_page=True)
    page.get_by_role('link', name='View Round Bar', exact=True).click()
    expect(page.get_by_text('INR 69,000 / PMT', exact=True)).to_be_visible()
    expect(page.get_by_text('INR 53,500 / PMT', exact=True)).to_have_count(0)
    page.get_by_role('button', name='Show all variants', exact=True).click()
    expect(page.get_by_text('INR 53,500 / PMT', exact=True)).to_be_visible()
    page.goto(base + '/products')
    choose('1. Category: All categories', 'As Rolled Round Bar')
    page.get_by_role('button', name='2. Size (mm): All sizes', exact=True).click()
    expect(page.get_by_role('radio', name='51 mm', exact=True)).to_have_count(0)
    expect(page.get_by_role('radio', name='8 mm', exact=True)).to_have_count(0)
    expect(page.get_by_role('radio', name='16 mm', exact=True)).to_be_visible()
    page.get_by_role('radio', name='All sizes', exact=True).click()
    choose('1. Category: As Rolled Round Bar', 'TMT Bar')
    expect(page.get_by_role('button', name='2. Size (mm): All sizes', exact=True)).to_be_visible()
    expect(page.get_by_role('button', name='3. Grade: All grades', exact=True)).to_be_enabled()
    page.get_by_role('button', name='3. Grade: All grades', exact=True).click()
    expect(page.get_by_role('radio', name='FE-500', exact=True)).to_be_visible()
    expect(page.get_by_role('radio', name='EN-19', exact=True)).to_have_count(0)
    page.get_by_role('radio', name='FE-500', exact=True).click()
    page.set_viewport_size({'width': 1366, 'height': 900})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path='artifacts/catalogue-filters-desktop.png', full_page=True)
    assert not errors, errors
    print(json.dumps({'passed': True, 'browser_errors': errors}))
    browser.close()
