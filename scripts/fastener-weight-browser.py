"""Exercise customer weight calculations with workbook fixtures and isolated APIs."""
import csv
import json
import threading
from decimal import Decimal, InvalidOperation
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from openpyxl import load_workbook
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results/fastener-weight'
OUT.mkdir(parents=True, exist_ok=True)
definitions = []
for name in ['hex-source-definitions.json', 'hex-1992-source-definitions.json', 'hex-1364-source-definitions.json']:
    definitions += json.loads((ROOT / 'deployment/fastener-dimensions' / name).read_text())
for i, row in enumerate(definitions):
    row.update(id=f'00000000-0000-0000-0000-{i+1:012d}', revision=1, published_revision=1)
workbook = load_workbook(ROOT / 'exports/ita-weight-chart/ITA_Fasteners_Weight_Charts.xlsx', read_only=True, data_only=True)
weights = []
for i, row in enumerate(list(workbook['All Values'].values)[1:], 2):
    chart, product, spec, unit, label, column, value, printed, line = row
    try:
        number = Decimal(str(printed).replace(',', ''))
    except InvalidOperation:
        continue
    if not number.is_finite() or number <= 0: continue
    basis = '100_pieces' if '100NOS' in unit.upper().replace(' ', '') else 'metre' if 'PERMETRE' in unit.upper().replace(' ', '') else 'piece'
    weights.append(dict(chart=chart, row_label=label, column_label=column, weight_basis=basis,
                        weight_kg_per_piece=str(number / 100 if basis == '100_pieces' else number) if basis != 'metre' else None,
                        weight_kg_per_metre=str(number) if basis == 'metre' else None))
workbook.close()
fail_weights = False
weight_calls = []
def api(route):
    global fail_weights
    request = route.request
    headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'}
    if request.method == 'OPTIONS':
        route.fulfill(status=204, headers=headers); return
    if '/rest/v1/fastener_weight_reference' in request.url:
        assert request.method == 'GET'
        weight_calls.append(request.url)
        if fail_weights:
            route.fulfill(status=503, headers=headers, content_type='application/json', body='{"message":"unavailable"}'); return
        query = parse_qs(urlparse(request.url).query)
        rows = weights
        for key in ['chart', 'row_label', 'column_label']:
            if key not in query: continue
            expression = query[key][0]
            allowed = next(csv.reader([expression[4:-1]])) if expression.startswith('in.(') else [expression[3:]]
            rows = [row for row in rows if row[key] in allowed]
        start = int(query.get('offset', ['0'])[0]); limit = int(query.get('limit', ['1000'])[0])
        route.fulfill(status=200, headers=headers, content_type='application/json', body=json.dumps(rows[start:start+limit])); return
    if '/rest/v1/fastener_grade_rates' in request.url:
        route.fulfill(status=200, headers=headers, content_type='application/json', body=json.dumps([{'grade':'MS','bolt_rate':105,'nut_rate':110,'revision':1}]))
        return
    body = request.post_data_json or {}
    operation = body.get('operation')
    result = []
    if operation == 'fti_catalog_drawing_list': result = definitions
    elif operation in ['fti_catalog_list', 'fti_catalog_filtered_list']: result = {'items': [], 'total': 0, 'categories': []}
    elif operation == 'fti_catalog_selection_options': result = {'categories': [], 'sizes': [], 'options': []}
    route.fulfill(status=200, headers=headers, content_type='application/json', body=json.dumps({'data': result}))

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if not Path(self.translate_path(self.path.split('?')[0])).is_file() and '.' not in self.path.split('?')[0].rsplit('/', 1)[-1]: self.path = '/index.html'
        super().do_GET()
    def log_message(self, *args): pass

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT/'dist')))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    page.route('https://*.supabase.co/**', api)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    def choose(label, value):
        page.get_by_role('button', name=__import__('re').compile('^'+label+':')).click()
        page.get_by_role('radio', name=value, exact=True).click()
        expect(page.get_by_role('button', name='Close filter', exact=True)).to_be_hidden()
    page.goto(base+'/fastener/hex-bolt', wait_until='networkidle')
    choose('IS standard', 'IS 1363:1967'); choose('Shape', 'Hex bolt'); choose('Size', 'M6')
    length = page.get_by_role('textbox', name='Length L (mm)', exact=True)
    length.fill('25')
    try:
        expect(page.get_by_text('Weight per piece:', exact=False)).to_be_visible()
    except Exception:
        page.screenshot(path=str(OUT/'failure.png'), full_page=True)
        print(page.locator('body').inner_text().encode('ascii', errors='replace').decode())
        print('Weight calls:', weight_calls)
        raise
    drawing = page.get_by_alt_text(__import__('re').compile('Schematic drawing'))
    for width in [320, 390]:
        page.set_viewport_size({'width': width, 'height': 844})
        drawing.scroll_into_view_if_needed()
        box = drawing.bounding_box()
        assert box and box['x'] >= 0 and box['x'] + box['width'] <= width, box
    page.screenshot(path=str(OUT/'drawing-fit-mobile.png'))
    with page.expect_download() as pending_download:
        page.get_by_role('button', name='Download drawing', exact=True).click()
    download = pending_download.value
    assert download.suggested_filename == 'FTI-IS-1363-1967-hex-bolt-M6-L25.png'
    download.save_as(str(OUT/'downloaded-drawing.png'))
    exported = (OUT/'downloaded-drawing.png').read_bytes()
    assert exported[:8] == b'\x89PNG\r\n\x1a\n'
    assert __import__('struct').unpack('>II', exported[16:24]) == (1440, 896)
    page.get_by_role('button', name='Enlarge drawing', exact=True).click()
    expect(page.get_by_role('button', name='Fit drawing to screen', exact=True)).to_be_visible()
    assert drawing.bounding_box()['width'] == 720
    page.get_by_role('button', name='Fit drawing to screen', exact=True).click()
    assert drawing.bounding_box()['width'] < 390
    choose('Order grade', 'MS')
    choose('Bolt supply', 'With nut')
    page.get_by_role('textbox', name='Quantity (pieces)', exact=True).fill('250')
    expect(page.get_by_text('Approximate total weight: 2.2425 kg', exact=True)).to_be_visible()
    expect(page.get_by_text('Estimated price:', exact=False)).to_be_visible()
    expect(page.get_by_role('button',name='Sign in to order fastener')).to_be_visible()
    page.get_by_text('Approximate total weight: 2.2425 kg', exact=True).scroll_into_view_if_needed()
    page.screenshot(path=str(OUT/'bolt-mobile.png'))
    page.get_by_role('textbox', name='Quantity (pieces)', exact=True).fill('2.5')
    expect(page.get_by_text('Enter a whole number from 1 to 1,000,000.', exact=True)).to_be_visible()
    expect(page.get_by_text('Approximate total weight:', exact=False)).to_have_count(0)
    length.fill('21')
    expect(page.get_by_text('Weight available on request for this size.', exact=True)).to_be_visible()
    expect(page.get_by_text('Approximate total weight:', exact=False)).to_have_count(0)
    choose('IS standard', 'IS 1364:1967'); choose('Shape', 'Hex bolt'); choose('Size', 'M6')
    page.get_by_role('textbox', name='Length L (mm)', exact=True).fill('20')
    expect(page.get_by_text('Weight available on request for this standard and size.', exact=True)).to_be_visible()
    page.goto(base+'/fastener/hex-nut', wait_until='networkidle')
    choose('IS standard', 'IS 1363:1992'); choose('Shape', 'Hex nut'); choose('Size', 'M10')
    page.get_by_role('textbox', name='Quantity (pieces)', exact=True).fill('100')
    expect(page.get_by_text('Approximate total weight: 0.909 kg', exact=True)).to_be_visible()
    page.goto(base+'/fastener/plain-washer', wait_until='networkidle')
    choose('Weight specification', 'PLAIN PUNCHED WASHER / IS:2016')
    choose('Weight size', 'M-6')
    expect(page.get_by_text('Weight per piece:', exact=False)).to_be_visible()
    page.get_by_role('textbox', name='Quantity (pieces)', exact=True).fill('100')
    page.get_by_text('Approximate total weight:', exact=False).scroll_into_view_if_needed()
    page.screenshot(path=str(OUT/'washer-mobile.png'))
    fail_weights = True
    page.reload(wait_until='networkidle')
    # Supabase retries transient GET failures before React Query reports failure.
    expect(page.get_by_text('Weight lookup is temporarily unavailable.', exact=True)).to_be_visible(timeout=30000)
    expect(page.get_by_text('Approximate total weight:', exact=False)).to_have_count(0)
    fail_weights = False
    page.get_by_role('button', name='Retry weight lookup', exact=True).click()
    expect(page.get_by_role('button', name=__import__('re').compile('^Weight specification:'))).to_be_visible()
    assert not errors, errors
    assert weight_calls
    browser.close()
server.shutdown()
print('PASS: complete mobile drawing, PNG download, weights, assembly selection, quantity, missing sizes, unsupported standards, nuts, washers and retry')

