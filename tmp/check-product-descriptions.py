from pathlib import Path
fixture = Path('scripts/raw-material-details-browser.py').read_text(encoding='utf-8')
exec(fixture.split('with sync_playwright() as p:')[0])
products['round-bright-bar']['description'] = 'Existing product note retained.'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width in [1440, 390]:
        context = browser.new_context(viewport={'width': width, 'height': 1000})
        context.route('https://*.supabase.co/**', api)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        for slug, size in [('round-bright-bar', '12–80 mm'), ('round-bar-as-rolled', '12–250 mm'), ('square', '25 × 25 to 150 × 150 mm'), ('sheet', '2–25 mm'), ('flat', '2–80 mm'), ('roof-sheet', 'Thickness 0.35–0.80 mm')]:
            page.goto('http://127.0.0.1:8097/product/' + slug, timeout=60000)
            expect(page.get_by_text(size, exact=True)).to_be_visible(timeout=60000)
            if slug in ['square', 'flat', 'sheet']:
                expect(page.get_by_text('10 MT (special grade only)', exact=True)).to_be_visible()
            else:
                expect(page.get_by_text('Special-grade MOQ', exact=True)).to_have_count(0)
            if width >= 1000:
                page.get_by_role('tab', name='Description', exact=True).click()
            expect(page.get_by_text('when requesting a quote.', exact=False).first if slug == 'round-bright-bar' else page.get_by_text('Confirm', exact=False).first).to_be_visible()
            if slug == 'round-bright-bar':
                expect(page.get_by_text('Existing product note retained.', exact=True)).to_be_visible()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), slug
        page.screenshot(path=f'artifacts/product-descriptions-{width}.png', full_page=True)
        context.close()
    browser.close()
assert not errors, errors
print('Descriptions and specifications passed for six categories at desktop/mobile widths; existing note preserved; no runtime errors.')
