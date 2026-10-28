"""Read-only verification of the live local catalogue card layout."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect, TimeoutError
out=Path('artifacts/fastener-cards');out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    for kind,cardId in [('fastener','matrix-fastener-card'),('tractor_part','matrix-tractor-card')]:
      for width,height in [(390,1000),(1440,1000)]:
          page=browser.new_page(viewport={'width':width,'height':height})
          page.goto('http://localhost:8081/products?kind='+kind,wait_until='domcontentloaded')
          try: page.wait_for_load_state('networkidle',timeout=5000)
          except TimeoutError: pass
          cards=page.get_by_test_id(cardId)
          expect(cards.first).to_be_visible(timeout=20000)
          assert cards.count()>0
          assert cards.first.locator('img').count() > 0
          expect(page.get_by_role('button',name='All grades',exact=True)).to_have_count(0)
          cards.first.scroll_into_view_if_needed()
          assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
          page.screenshot(path=str(out/f'{kind}-{width}.png'),full_page=True)
          if kind == 'fastener':
              cards.first.get_by_role('button',name='Select size & grade',exact=True).click()
              expect(page.get_by_text('Product Specification Detail',exact=True)).to_be_visible(timeout=15000)
          page.close()
    browser.close()
print('PASS: live localhost:8081 fastener matrix cards, mobile/desktop, hidden steel filters, and detail navigation')
