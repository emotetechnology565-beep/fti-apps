from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
svg_file = ROOT / "assets/icons/iso-9001-certified-badge.svg"
png_file = ROOT / "assets/icons/iso-9001-certified-badge.png"
png_2x = ROOT / "assets/icons/iso-9001-certified-badge@2x.png"
png_3x = ROOT / "assets/icons/iso-9001-certified-badge@3x.png"

svg_data = svg_file.read_text(encoding="utf-8")

html_content = f"""
<!DOCTYPE html>
<html>
<head>
  <style>
    body {{
      margin: 0;
      padding: 0;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
    }}
    svg {{
      width: 400px;
      height: 160px;
      display: block;
    }}
  </style>
</head>
<body>
  {svg_data}
</body>
</html>
"""

with sync_playwright() as p:
    browser = p.chromium.launch()
    # 3x high-res
    page = browser.new_page(viewport={"width": 400, "height": 160}, device_scale_factor=3)
    page.set_content(html_content)
    page.screenshot(path=str(png_3x), omit_background=True)
    
    # 2x
    page_2x = browser.new_page(viewport={"width": 400, "height": 160}, device_scale_factor=2)
    page_2x.set_content(html_content)
    page_2x.screenshot(path=str(png_2x), omit_background=True)

    # 1x
    page_1x = browser.new_page(viewport={"width": 400, "height": 160}, device_scale_factor=1)
    page_1x.set_content(html_content)
    page_1x.screenshot(path=str(png_file), omit_background=True)

    browser.close()

print(f"Generated {png_file.relative_to(ROOT)}, @2x and @3x")

