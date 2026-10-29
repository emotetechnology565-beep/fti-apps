"""Upload generated range banners to Bunny and verify their public bytes."""
import hashlib
import json
import ssl
import certifi
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

root = Path(__file__).resolve().parents[1]
env = {}
for line in (root / '.env').read_text(encoding='utf-8-sig').splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        key, value = line.split('=', 1)
        env[key.strip()] = value.strip().strip('"').strip("'")
endpoint = env['BUNNY_STORAGE_ENDPOINT'].rstrip('/')
if not endpoint.startswith('https://'):
    endpoint = 'https://' + endpoint
host = urlparse(endpoint).hostname or ''
if host != 'storage.bunnycdn.com' and not host.endswith('.storage.bunnycdn.com'):
    raise RuntimeError('Unexpected Bunny storage endpoint')
cdn = env['BUNNY_CDN_BASE_URL'].rstrip('/')
if urlparse(cdn).scheme != 'https':
    raise RuntimeError('Bunny CDN must use HTTPS')
urls = {}
context = ssl.create_default_context(cafile=certifi.where())
for name in ['fasteners', 'tractor-parts']:
    data = (root / f'assets/generated/home/{name}-category.png').read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    key = f'home-category-images/{name}-range-{digest[:16]}.png'
    request = Request(endpoint + '/' + env['BUNNY_STORAGE_ZONE'] + '/' + key,
                      data=data, method='PUT', headers={
                          'AccessKey': env['BUNNY_STORAGE_ACCESS_KEY'],
                          'Content-Type': 'image/png'})
    with urlopen(request, timeout=45, context=context) as response:
        if response.status not in (200, 201):
            raise RuntimeError('Upload failed: ' + name)
    url = cdn + '/' + key
    with urlopen(url, timeout=45, context=context) as response:
        if hashlib.sha256(response.read()).hexdigest() != digest:
            raise RuntimeError('CDN content mismatch: ' + name)
    urls[name] = url
    print('Uploaded and verified:', name)
(root / 'src/features/home/data/range-images.json').write_text(json.dumps(urls, indent=2) + '\n', encoding='utf-8')
