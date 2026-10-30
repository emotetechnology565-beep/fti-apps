from pathlib import Path
from playwright.sync_api import sync_playwright

folder = Path(__file__).resolve().parent
with sync_playwright() as p:
    browser = p.chromium.launch(args=['--disable-gpu'])
    page = browser.new_page(viewport={"width":1600,"height":2240}, device_scale_factor=1)
    page.set_content('<html><body style="margin:0">' + (folder / 'fti-market-rates-flow.svg').read_text(encoding='utf-8') + '</body></html>')
    page.screenshot(path=str(folder / 'fti-market-rates-flow.png'), full_page=True, timeout=15000)
    overflow = page.evaluate('''() => [...document.querySelectorAll('text')].filter(t => { const r=t.getBBox(); return r.x < 0 || r.x+r.width > 1560 || r.y+r.height > 2240; }).map(t=>t.textContent)''')
    print({"text_outside_page": overflow})
    browser.close()
