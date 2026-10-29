"""Read-only browser checks plus a reversible local basket addition; no order submission."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path('artifacts/mobile-commerce')
out.mkdir(parents=True, exist_ok=True)
results = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width in [360, 390, 430]:
        context = browser.new_context(viewport={'width': width, 'height': 844})
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto('http://localhost:8081/')
        page.get_by_role('link', name='Browse ', exact=False).first.wait_for(timeout=90000)
        page.screenshot(path=str(out / f'home-{width}.png'), full_page=True)
        assert page.locator('body').evaluate('(e) => e.scrollWidth <= window.innerWidth'), 'Home overflows'
        page.goto('http://localhost:8081/products')
        size = page.get_by_role('button', name='Choose size for AWADH TMT', exact=True)
        size.wait_for(timeout=90000)
        size.click()
        page.get_by_text('Use entered value', exact=True).wait_for()
        page.get_by_role('textbox', name='Enter size manually', exact=True).fill('13 mm')
        page.get_by_text('Use entered value', exact=True).click()
        assert size.inner_text().startswith('13 mm')
        size.click()
        page.get_by_text('8 mm', exact=True).last.click()
        grade = page.get_by_role('button', name='Choose brand for AWADH TMT', exact=True)
        grade.click()
        page.get_by_text('AWADH TMT', exact=True).last.click(timeout=90000)
        page.screenshot(path=str(out / f'catalogue-{width}.png'), full_page=True)
        assert page.locator('body').evaluate('(e) => e.scrollWidth <= window.innerWidth'), 'Catalogue overflows'
        page.get_by_role('button', name='Add AWADH TMT to quote', exact=True).click()
        page.get_by_text('Review requirement basket', exact=False).wait_for(timeout=90000)
        page.get_by_text('Review requirement basket', exact=False).click()
        page.get_by_text('Requirement Basket', exact=True).wait_for()
        page.screenshot(path=str(out / f'basket-{width}.png'), full_page=True)
        assert page.locator('body').evaluate('(e) => e.scrollWidth <= window.innerWidth'), 'Basket overflows'
        increase = page.get_by_role('button', name='Increase quantity for AWADH TMT', exact=True)
        increase.click()
        page.get_by_text('2 MT', exact=True).first.wait_for()
        page.get_by_role('textbox', name='Delivery pincode', exact=True).fill('123')
        page.get_by_role('button', name='Request quotation', exact=True).click()
        page.get_by_text('Enter a valid 6-digit delivery pincode.', exact=True).wait_for()
        page.get_by_role('button', name='Remove AWADH TMT', exact=True).click()
        page.get_by_text('Your basket is empty', exact=True).wait_for()
        page.goto('http://localhost:8081/products')
        page.get_by_text('AWADH TMT', exact=True).first.wait_for(timeout=90000)
        page.get_by_text('AWADH TMT', exact=True).first.click()
        page.get_by_text('Material documents', exact=False).wait_for(timeout=90000)
        page.screenshot(path=str(out / f'detail-{width}.png'), full_page=True)
        assert page.locator('body').evaluate('(e) => e.scrollWidth <= window.innerWidth'), 'Detail overflows'
        assert not errors, errors
        results.append({'width': width, 'screens': ['home', 'catalogue', 'detail', 'basket'], 'runtime_errors': errors, 'manual_size': True, 'add_remove_quantity': True, 'pincode_validation': True})
        context.close()
    browser.close()
(out / 'results.json').write_text(json.dumps(results, indent=2))
print(json.dumps(results))
