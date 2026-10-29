"""Read-only visual checks using the live catalogue; never submits a requirement."""
from playwright.sync_api import sync_playwright, expect

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width in [1440, 390]:
        context = browser.new_context(viewport={'width': width, 'height': 1000})
        page = context.new_page()
        page.on('requestfailed', lambda request: print('Request failed:', request.url.split('?')[0], request.failure))
        page.goto('http://127.0.0.1:8097/fastener/hex-bolt', timeout=60000)
        try:
            expect(page.get_by_role('button', name='Configure requirement', exact=True)).to_be_visible(timeout=20000)
        except Exception:
            page.screenshot(path='artifacts/fastener-live-load-error.png', full_page=True)
            print(page.locator('body').inner_text()[:2000])
            raise
        expect(page.get_by_text('Wire and round bars', exact=True)).to_be_visible()
        expect(page.get_by_role('button', name='Configure requirement', exact=True)).to_be_enabled(timeout=60000)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=f'artifacts/fastener-live-details-{width}.png', full_page=True)
        page.get_by_role('button', name='Configure requirement', exact=True).click()
        expect(page.get_by_text('Step 1 of 6', exact=False)).to_be_visible()
        page.screenshot(path=f'artifacts/fastener-live-configure-{width}.png', full_page=True)
        context.close()
    browser.close()
print('PASS: live database-backed Hex Bolt details and wizard entry load on desktop/mobile; no submissions made.')
