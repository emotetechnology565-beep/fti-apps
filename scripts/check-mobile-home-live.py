"""Inspect the real mobile home with published API data; no fixtures or writes."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

out = Path('artifacts/mobile-home-live')
out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width in (390, 360):
        page = browser.new_page(viewport={'width': width, 'height': 900})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto('http://127.0.0.1:8175/', wait_until='domcontentloaded')
        expect(page.get_by_text('Industrial supplies\nfor your business', exact=True)).to_be_visible(timeout=30000)
        expect(page.get_by_text('Materials for\nyour next project', exact=True)).to_have_count(0)
        for tab in ('Raw Materials', 'Fasteners', 'Tractor Parts'):
            page.get_by_role('tab', name=tab, exact=True).click()
            expect(page.get_by_text('Loading uploaded catalogue…', exact=True)).to_have_count(0, timeout=45000)
            expect(page.get_by_text('Catalogue could not be loaded. Tap to retry.', exact=True)).to_have_count(0)
            page.wait_for_timeout(2000)
            page.screenshot(path=str(out / f'{tab.lower().replace(" ", "-")}-{width}.png'), full_page=True)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'horizontal overflow'
            assert 'DEMO SUBSCRIBER' not in page.locator('body').inner_text()
            assert '₹' not in page.locator('body').inner_text(), 'public prices must remain hidden without subscription'
        assert not errors, errors
        page.close()
    browser.close()
print('PASS: new live mobile home, three tabs, no mock data and no horizontal overflow at 360/390.')
