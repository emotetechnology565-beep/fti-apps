"""Upload category fallback photos to Bunny; never changes catalogue records.

The home screen prefers published, admin-managed product photos over these URLs.
Object keys include content hashes, so existing remote images are not replaced.
"""
import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
files = {
    'round-bar-as-rolled': 'round-bar-as-rolled.jpg',
    'round-bright-bar': 'round-bright-bar.jpg',
    'sheet': 'steel-sheets.jpg',
    'flat': 'flat-bars.jpg',
    'square': 'square-bars.jpg',
    'tmt': '0.jpg',
}
env = {}
for line in (ROOT / '.env').read_text(encoding='utf-8-sig').splitlines():
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
for category, filename in files.items():
    data = (ROOT / 'assets/materials' / filename).read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    object_key = f'home-category-images/{category}-{digest[:16]}.jpg'
    request = Request(endpoint + '/' + env['BUNNY_STORAGE_ZONE'] + '/' + object_key,
                      data=data, method='PUT', headers={
                          'AccessKey': env['BUNNY_STORAGE_ACCESS_KEY'],
                          'Content-Type': 'image/jpeg'})
    with urlopen(request, timeout=45) as response:
        if response.status not in (200, 201):
            raise RuntimeError('Upload failed for ' + category)
    url = cdn + '/' + object_key
    with urlopen(url, timeout=45) as response:
        if hashlib.sha256(response.read()).hexdigest() != digest:
            raise RuntimeError('CDN verification failed for ' + category)
    urls[category] = url
    print('Uploaded and verified:', category)
output = ROOT / 'src/features/home/data/material-image-fallbacks.json'
output.write_text(json.dumps(urls, indent=2) + '\n', encoding='utf-8')
print('Saved cloud fallback URLs:', output.relative_to(ROOT))
