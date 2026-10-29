from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    for path in ['/', '/products']:
        page.goto('http://127.0.0.1:8097' + path, timeout=60000)
        page.wait_for_load_state('networkidle', timeout=60000)
        page.get_by_text('As Rolled', exact=False).first.wait_for(timeout=60000)
        images = page.locator('img').evaluate_all('(els) => els.map(el => ({src: el.currentSrc || el.src, loaded: el.complete && el.naturalWidth > 0}))')
        materials = [img for img in images if '/materials/' in img['src']]
        assert materials, 'No bundled category images rendered'
        assert all(img['loaded'] for img in materials), materials
        assert any('round-bar-as-rolled' in img['src'] for img in materials), materials
        page.screenshot(path='artifacts/live-category-' + ('home' if path == '/' else 'catalogue') + '.png', full_page=True)
        print(path, ':', len(materials), 'category photos loaded with real catalogue data')
    browser.close()
