from playwright.sync_api import sync_playwright, expect

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    for width in [1440, 390]:
        page.set_viewport_size({'width': width, 'height': 1000})
        page.goto('http://127.0.0.1:8097/', timeout=60000)
        names = ['Assorted bolts, nuts, washers and fasteners', 'Assorted tractor gears, bearing, shaft, hub and blade'] if width >= 1000 else ['Fasteners', 'Tractor parts']
        for name in names:
            img = page.get_by_role('img', name=name, exact=True)
            expect(img).to_be_visible(timeout=60000)
            img.evaluate('(el) => el.decode()')
            assert 'ftis.b-cdn.net/home-category-images/' in img.get_attribute('src')
            assert img.evaluate('(el) => el.naturalWidth > 0')
            img.scroll_into_view_if_needed()
        page.screenshot(path=f'artifacts/home-range-images-{width}.png', full_page=True)
        print(width, 'Both generated Bunny images loaded with live page data')
    browser.close()
