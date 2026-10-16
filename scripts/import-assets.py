from pathlib import Path
import re
import urllib.request

root = Path(__file__).resolve().parents[2]
html = (root / 'stitch_fti_b2b_steel_marketplace_app/fti_industrial_marketplace_rates/code.html').read_text(encoding='utf-8')
images = re.findall(r'<img\b[^>]*\bsrc="([^"]+)"', html)
target = root / 'fti-app/assets/materials'
target.mkdir(parents=True, exist_ok=True)
for index, url in enumerate(images[2:7]):
    try:
        urllib.request.urlretrieve(url, target / f'{index}.jpg')
        print(f'Imported material photo {index}')
    except Exception as error:
        print(f'Photo {index}: {error}')
