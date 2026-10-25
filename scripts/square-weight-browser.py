"""Verify the solid square steel formula in the calculator without live API calls."""
import json
import re
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width in (390, 1440):
        context = browser.new_context(viewport={'width': width, 'height': 950})
        context.route('https://*.supabase.co/**', lambda route: route.fulfill(
            status=200, content_type='application/json', body=json.dumps({'data': []}),
            headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'}))
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto('http://127.0.0.1:' + (sys.argv[1] if len(sys.argv) > 1 else '8101') + '/calculator')
        page.wait_for_load_state('networkidle')
        page.get_by_role('button', name='Square bar', exact=True).click()
        page.get_by_role('textbox', name='Side (mm)', exact=True).fill('50')
        page.get_by_role('textbox', name='Length (m)', exact=True).fill('6')
        page.get_by_role('textbox', name='Number of pieces', exact=True).fill('1')
        expect(page.get_by_text('Weight per metre: 19.625 kg/m', exact=True)).to_be_visible()
        expect(page.get_by_text(re.compile(r'^117\.75\s*kg$'))).to_be_visible()
        expect(page.get_by_text('Weight (kg/m) = S × S × 0.00785', exact=True)).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        Path('artifacts').mkdir(exist_ok=True)
        page.screenshot(path='artifacts/square-weight-' + str(width) + '.png', full_page=True)
        page.get_by_role('textbox', name='Number of pieces', exact=True).fill('2')
        expect(page.get_by_text(re.compile(r'^235\.5\s*kg$'))).to_be_visible()
        page.get_by_role('textbox', name='Number of pieces', exact=True).fill('1.5')
        expect(page.get_by_text('Enter valid dimensions', exact=True)).to_be_visible()
        assert not errors, errors
        context.close()
        print('Square weight calculator passed at width', width)
    browser.close()
