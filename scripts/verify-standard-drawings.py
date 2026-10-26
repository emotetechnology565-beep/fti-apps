"""Browser acceptance checks for the offline standard-driven HTML example."""
from pathlib import Path
import json
import re
import xml.etree.ElementTree as ET
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results' / 'standard-drawings'
OUT.mkdir(parents=True, exist_ok=True)


def values(page, selector):
    return page.locator(selector + ' option').evaluate_all('(options) => options.map(o => o.value)')


def valid_drawing(page):
    assert page.locator('#drawing svg').count() == 1
    assert page.locator('#download').is_enabled()
    svg = page.locator('#drawing svg').evaluate('(svg) => svg.outerHTML')
    assert not re.search(r'NaN|Infinity|undefined', svg)
    ET.fromstring(svg)
    family = page.locator('#family').input_value()
    if family != 'coach':
        assert page.locator('#drawing .nut-assembly').count() == (2 if family == 'u' else 1)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width':1440, 'height':1000}, accept_downloads=True)
    page.set_default_timeout(10000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto((ROOT / 'index.html').as_uri(), wait_until='networkidle')
    valid_drawing(page)
    assert page.locator('#family-drawings button svg').count() == 3
    assert page.locator('#subtype-drawings button svg').count() == 2
    assert page.locator('#summary-standard').inner_text() == 'IS 730:1978'
    assert page.locator('#summary-thread').inner_text() == '25 + 2P'
    page.screenshot(path=str(OUT / 'desktop-j.png'), full_page=True)
    original = page.locator('#drawing .bolt-body').get_attribute('d')
    page.fill('#angle', '40')
    valid_drawing(page)
    assert page.locator('#drawing .bolt-body').get_attribute('d') != original
    assert '40°' in page.locator('#drawing svg').text_content()
    page.fill('#angle', '0')
    assert page.locator('#download').is_disabled()
    page.fill('#angle', '25')
    valid_drawing(page)

    # Every displayed hook-bolt combination has a finite, exportable drawing.
    checked = 0
    for family in ['j', 'l', 'u']:
        page.select_option('#family', family)
        for size in values(page, '#size'):
            page.select_option('#size', size)
            for width in values(page, '#width'):
                if page.locator('#width').is_visible():
                    page.select_option('#width', width)
                lengths = values(page, '#length')
                assert lengths
                if family == 'j':
                    assert lengths[0] == '70'
                    assert lengths[-1] == ('150' if size == 'M6' else '200')
                if family == 'u':
                    assert lengths == (['225'] if width == '90' else ['150','160','170','180','190','200'])
                if family == 'l' and width == '110':
                    assert lengths == ['180','190','200','225']
                for length in lengths:
                    page.select_option('#length', length)
                    valid_drawing(page)
                    checked += 1
    page.screenshot(path=str(OUT / 'desktop-u.png'), full_page=True)

    # Both U forms and both J forms must select different geometry.
    assert values(page, '#subtype') == ['square', 'round']
    page.select_option('#subtype', 'round')
    assert page.locator('#radius-field').is_visible()
    valid_drawing(page)
    assert page.locator('#round-example-note').is_visible()
    page.fill('#radius', '')
    assert page.locator('#download').is_disabled()
    page.fill('#radius', '25')
    page.fill('#custom-length', '150')
    valid_drawing(page)
    assert 'Round bend' in page.locator('#description').inner_text()
    assert '2 × R1' in page.locator('#dimension-rows').inner_text()
    round_svg = page.locator('#drawing svg').evaluate('(svg)=>svg.outerHTML')
    page.screenshot(path=str(OUT / 'desktop-u-round.png'), full_page=True)
    page.fill('#radius', '200')
    assert page.locator('#download').is_disabled()
    page.fill('#radius', '25')
    valid_drawing(page)
    page.select_option('#subtype', 'square')
    valid_drawing(page)
    assert page.locator('#radius-field').is_hidden()
    assert round_svg != page.locator('#drawing svg').evaluate('(svg)=>svg.outerHTML')
    page.select_option('#family', 'j')
    assert values(page, '#subtype') == ['type-i','type-ii']
    page.select_option('#subtype', 'type-ii')
    valid_drawing(page)
    page.fill('#return-height', '')
    page.fill('#radius', '20')
    page.fill('#custom-length', str(float(page.locator('#custom-length').input_value()) + 20))
    assert page.locator('#download').is_disabled()
    page.fill('#return-height', '60')
    valid_drawing(page)
    assert 'Type II' in page.locator('#description').inner_text()
    page.screenshot(path=str(OUT / 'desktop-j-type-ii.png'), full_page=True)
    page.fill('#return-height', '15')
    assert page.locator('#download').is_disabled()
    page.select_option('#subtype', 'type-i')
    valid_drawing(page)
    page.select_option('#size', 'M8')
    page.fill('#pitch', '1.25')
    assert page.locator('#summary-thread').inner_text() == '27.5 mm'
    page.fill('#pitch', '0')
    assert page.locator('#input-error').is_visible()
    assert page.locator('#drawing svg').count() == 0
    assert page.locator('#download').is_disabled()
    page.fill('#pitch', '')
    valid_drawing(page)

    # Number parsing supports common entry styles and refuses unsupported editions.
    for entry in ['730','IS730','is 730','IS:730:1978']:
        page.fill('#standard', entry)
        valid_drawing(page)
    for entry in ['IS 9999','IS 730:2000','<img src=x onerror=alert(1)>','']:
        page.fill('#standard', entry)
        assert page.locator('#standard-error').is_visible()
        assert page.locator('#family').is_disabled()
        assert page.locator('#drawing svg').count() == 0
        assert page.locator('#download').is_disabled()
        assert page.locator('#dimension-rows tr').count() == 0

    page.fill('#standard', 'IS 1120')
    assert values(page, '#size') == ['No. 10','No. 14','No. 18','No. 24','No. 28','No. 32']
    assert page.locator('#pitch-field').is_hidden()
    assert page.locator('#custom-length-field').is_visible()
    assert '4.88' in page.locator('#dimension-rows').inner_text()
    for size in values(page, '#size'):
        page.select_option('#size', size)
        valid_drawing(page)
    page.select_option('#size', 'No. 14')
    assert 'Source inconsistency' in page.locator('#dimension-rows').inner_text()
    page.select_option('#size', 'No. 10')
    page.screenshot(path=str(OUT / 'desktop-coach.png'), full_page=True)
    before = page.locator('#drawing svg').evaluate('(svg)=>svg.outerHTML')
    page.fill('#custom-length', '120')
    assert page.locator('#drawing svg').evaluate('(svg)=>svg.outerHTML') != before
    page.fill('#custom-length', '')
    assert page.locator('#download').is_disabled()
    page.fill('#custom-length', '501')
    assert page.locator('#download').is_disabled()
    page.click('#reset-example')
    valid_drawing(page)
    assert page.locator('#summary-standard').inner_text() == 'IS 730:1978'
    page.locator('#subtype-drawings button[data-value="type-ii"]').click()
    valid_drawing(page)
    page.locator('#family-drawings button[data-value="u"]').click()
    page.locator('#subtype-drawings button[data-value="round"]').click()
    valid_drawing(page)
    assert page.locator('#drawing .nut-assembly').count() == 2
    page.locator('#family-drawings button[data-value="j"]').click()
    valid_drawing(page)

    # Export the actual rendered SVG and parse it independently.
    with page.expect_download() as event:
        page.click('#download')
    download = event.value
    assert download.suggested_filename == 'fti-is-730-j-type-i-M8-120mm.svg'
    download.save_as(str(OUT / download.suggested_filename))
    ET.parse(OUT / download.suggested_filename)
    page.pdf(path=str(OUT / 'print-preview.pdf'), print_background=True)

    # The drawing can scroll inside its frame, but the page itself must fit the phone.
    for width in [390, 320]:
        page.set_viewport_size({'width':width,'height':844})
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        page.screenshot(path=str(OUT / f'mobile-{width}.png'), full_page=True)
    page.set_viewport_size({'width':390,'height':844})
    page.fill('#standard','IS 1120')
    valid_drawing(page)
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    assert not errors, errors
    browser.close()
    result = {'hook_combinations_checked':checked,'coach_sizes_checked':6,
              'checked':['standard lookup','unsupported edition / standard','dependent size choices','both J and U forms','nut assemblies','adjustable tilted return',
                         'scan-specific length combinations','blank and entered pitch','input validation',
                         'source inconsistency label','reset','SVG export','print PDF','320/390px page fit'],
              'browser_errors':errors}
    (OUT / 'results.json').write_text(json.dumps(result,indent=2), encoding='utf-8')
    print(json.dumps(result))
