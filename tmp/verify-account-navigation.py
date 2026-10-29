from pathlib import Path

# Reuse the existing isolated account fixture; no live account data is changed.
fixture = Path('scripts/account-setup-browser.py').read_text(encoding='utf-8')
exec(fixture.split('with sync_playwright() as p:')[0])

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    page.route('https://*.supabase.co/**', api)
    page.add_init_script('localStorage.setItem("fti-auth-v2", ' + json.dumps(json.dumps(session)) + ')')
    page.goto('http://127.0.0.1:8097/account', timeout=120000)
    page.wait_for_load_state('networkidle', timeout=60000)
    for width in [1440, 390]:
        page.set_viewport_size({'width': width, 'height': 938})
        if width < 1000:
            page.get_by_role('button', name='Open navigation', exact=True).click()
        profile = page.get_by_role('link', name='Personal profile', exact=True)
        expect(profile).to_be_visible()
        assert profile.evaluate('(el) => getComputedStyle(el.firstElementChild).color') == 'rgb(255, 255, 255)'
        back = page.get_by_role('link', name='Back to marketplace', exact=True)
        assert back.evaluate('(el) => getComputedStyle(el.firstElementChild).color') == 'rgb(148, 163, 184)'
        page.screenshot(path=f'artifacts/account-navigation-{width}.png')
        profile.click()
        expect(page.get_by_role('textbox', name='Full name', exact=True)).to_be_visible()
        if width < 1000:
            expect(profile).not_to_be_visible()
            page.get_by_role('button', name='Open navigation', exact=True).click()
        expect(profile).to_have_attribute('aria-selected', 'true')
        assert profile.evaluate('(el) => getComputedStyle(el.firstElementChild).color') == 'rgb(167, 1, 1)'
        page.get_by_role('link', name='Account overview', exact=True).click()
    browser.close()
print('Desktop and mobile: link contrast, section navigation, selected state, and drawer dismissal passed.')
