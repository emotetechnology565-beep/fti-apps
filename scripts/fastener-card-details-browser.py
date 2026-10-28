"""Verify per-product details with isolated API fixtures; no remote writes."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

base = 'http://127.0.0.1:' + (sys.argv[1] if len(sys.argv) > 1 else '8096')
out = Path('artifacts/fastener-card-details')
out.mkdir(parents=True, exist_ok=True)
definitions = json.loads(Path('deployment/fastener-dimensions/source-definitions.json').read_text())
definitions += json.loads(Path('deployment/fastener-dimensions/hex-source-definitions.json').read_text())
for i, row in enumerate(definitions):
    row.update(id=str(i), revision=1, published_revision=1)
slugs = ['hex-bolt', 'hex-nut', 'u-bolt', 'plain-washer']
errors = []

def api(route):
    result = []
    request = route.request
    if request.method != 'OPTIONS' and '/functions/v1/' in request.url:
        op = (request.post_data_json or {}).get('operation')
        if op == 'fti_catalog_drawing_list':
            result = definitions
        elif op == 'fti_catalog_fastener_photos':
            result = [{'slug': slug, 'label': slug, 'image_url': 'https://fixture.test/fastener.svg'} for slug in slugs]
        elif op == 'fti_catalog_selection_options':
            result = {'categories': [], 'category': None, 'sizes': [], 'options': []}
        elif op == 'fti_catalog_filtered_list':
            result = {'items': [], 'total': 0, 'categories': [], 'grades': []}
        elif op == 'fti_pricing_rates':
            result = {'items': [], 'total': 0, 'disclosure': ''}
        result = {'data': result}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(result), headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'})

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width, height in [(320, 740), (390, 844), (1440, 1000)]:
        context = browser.new_context(viewport={'width': width, 'height': height})
        context.route('https://*.supabase.co/**', api)
        context.route('https://fixture.test/**', lambda route: route.fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="120" height="100"><path d="M40 10V65Q40 90 65 90Q90 90 90 65V10" fill="none" stroke="black" stroke-width="10"/></svg>'))
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(base + '/products', wait_until='networkidle')
        expect(page.get_by_role('button', name='Choose Hex bolt photo', exact=True)).to_be_visible()
        page.get_by_role('textbox', name='Search catalogue', exact=True).fill('hex nut')
        expect(page.get_by_role('button', name='Choose Hex nut photo', exact=True)).to_be_visible()
        expect(page.get_by_role('button', name='Choose Hex bolt photo', exact=True)).to_have_count(0)
        page.get_by_role('textbox', name='Search catalogue', exact=True).fill('')
        page.get_by_role('button', name='Fasteners', exact=True).click()
        hex_card = page.get_by_role('button', name='Choose Hex bolt photo', exact=True)
        expect(hex_card.get_by_text('Diameter 5–56 mm', exact=True)).to_be_visible()
        expect(hex_card.get_by_text('Cold forged', exact=True)).to_have_count(0)
        expect(hex_card.get_by_text('Finishes', exact=True)).to_have_count(0)
        expect(hex_card.get_by_text('Materials / steel grades', exact=True)).to_be_visible()
        nut_card = page.get_by_role('button', name='Choose Hex nut photo', exact=True)
        expect(nut_card.get_by_text('Size range', exact=True)).to_be_visible()
        expect(nut_card.get_by_text('Cold forged', exact=True)).to_have_count(0)
        washer = page.get_by_role('button', name='Choose Plain washer photo', exact=True)
        expect(washer.get_by_text('Available on enquiry', exact=True).first).to_be_visible()
        page.wait_for_function("""() => {
            const cards = [...document.querySelectorAll('[role="button"][aria-label^="Choose "][aria-label$=" photo"]')];
            const heights = cards.map(card => card.getBoundingClientRect().height);
            return heights.length === 4 && Math.max(...heights) - Math.min(...heights) < 2;
        }""")
        assert page.get_by_text('Hex bolts · Our manufacturing range', exact=True).count() == 0
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        hex_card.scroll_into_view_if_needed()
        page.screenshot(path=str(out / f'cards-{width}.png'), full_page=True)
        hex_card.click()
        expect(page).to_have_url(base + '/fastener/hex-bolt')
        expect(page.get_by_text('Hot forged', exact=True)).to_be_visible()
        expect(page.get_by_text('Finishes', exact=True)).to_be_visible()
        photo = page.get_by_role('img', name='Hex bolt product photo', exact=True)
        expect(photo).to_be_visible()
        assert photo.bounding_box()['width'] >= (180 if width >= 600 else 200)
        page.screenshot(path=str(out / f'detail-{width}.png'), full_page=True)
        expect(page.get_by_role('button', name='Choose Hex nut photo', exact=True).filter(visible=True)).to_have_count(0)
        context.close()
    browser.close()
assert not errors, errors
print('PASS: per-product ranges, hex materials and finishes, unknown-size fallback, card navigation, 320/390/1440px; no runtime errors')
