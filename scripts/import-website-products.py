"""Prepare a repeatable dashboard import of FTI's real website products.

Run with --fetch to refresh source files and --upload to copy photos to Bunny.
Without either flag, regenerate SQL using the downloaded manifest (offline).
Credentials are read locally and never included in the generated package.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import re
import urllib.request
from urllib.parse import urlparse
import uuid

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'deployment' / 'website-products'
SITE = 'https://www.fti.co.in'
NAMESPACE = uuid.UUID('e4861ba1-8eb9-4ea1-b68d-d1c915ea781a')

def read_url(url, headers=None, data=None, method=None):
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers or {}, data=data, method=method), timeout=45) as response:
        return response.read()

def quoted(value):
    return "'" + str(value).replace("'", "''") + "'"

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fetch', action='store_true')
    parser.add_argument('--upload', action='store_true')
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    images = OUT / 'images'
    images.mkdir(exist_ok=True)
    manifest = OUT / 'products.json'
    if args.fetch:
        html = read_url(SITE + '/products').decode()
        script = re.search(r'<script[^>]+src="([^"]+)"', html).group(1)
        source = read_url(SITE + script).decode()
        records = re.findall(r'\{name:"([^"]+)",image:([\w$]+),category:"(fasteners|agricultural)"\}', source)
        if not records:
            raise RuntimeError('Website structure changed: no catalogue records found.')
        products = []
        for name, variable, category in records:
            image = re.search(re.escape(variable) + r'="([^"]+)"', source).group(1)
            slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
            product_id = str(uuid.uuid5(NAMESPACE, 'product:' + slug))
            asset_id = str(uuid.uuid5(NAMESPACE, 'image:' + image))
            products.append(dict(name=name, slug=slug, category=category, id=product_id,
                image_id=asset_id, source_url=SITE + '/products', source_image_url=SITE + image,
                object_key=f'product-images/{product_id}/{asset_id}.jpg'))
        if len({item['slug'] for item in products}) != len(products):
            raise RuntimeError('Duplicate source product slugs.')
        def download(item):
            data = read_url(item['source_image_url'])
            if not data.startswith(b'\xff\xd8\xff') or not 0 < len(data) <= 3145728:
                raise RuntimeError('Invalid website JPEG: ' + item['name'])
            (images / (item['image_id'] + '.jpg')).write_bytes(data)
            item.update(size_bytes=len(data), sha256_hex=hashlib.sha256(data).hexdigest())
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(download, products))
        manifest.write_text(json.dumps(products, indent=2) + '\n', encoding='utf-8')
    products = json.loads(manifest.read_text(encoding='utf-8'))
    if args.upload:
        env = {}
        for line in (ROOT / '.env').read_text(encoding='utf-8-sig').splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                key, value = line.split('=', 1)
                env[key.strip()] = value.strip().strip('\"\'')
        for key in ['BUNNY_STORAGE_ENDPOINT', 'BUNNY_STORAGE_ZONE', 'BUNNY_STORAGE_ACCESS_KEY', 'BUNNY_CDN_BASE_URL']:
            if not env.get(key):
                raise RuntimeError('Missing environment variable: ' + key)
        endpoint = env['BUNNY_STORAGE_ENDPOINT'].rstrip('/')
        if not endpoint.startswith('https://'):
            endpoint = 'https://' + endpoint
        host = urlparse(endpoint).hostname or ''
        if host != 'storage.bunnycdn.com' and not host.endswith('.storage.bunnycdn.com'):
            raise RuntimeError('Unexpected Bunny storage endpoint.')
        def upload(item):
            data = (images / (item['image_id'] + '.jpg')).read_bytes()
            if hashlib.sha256(data).hexdigest() != item['sha256_hex']:
                raise RuntimeError('Image hash mismatch: ' + item['name'])
            remote = endpoint + '/' + env['BUNNY_STORAGE_ZONE'] + '/' + item['object_key']
            read_url(remote, {'AccessKey': env['BUNNY_STORAGE_ACCESS_KEY'], 'Content-Type': 'image/jpeg'}, data, 'PUT')
            # Verify the CDN returns the exact source image before emitting its SQL record.
            cdn = env['BUNNY_CDN_BASE_URL'].rstrip('/') + '/' + item['object_key']
            check = read_url(cdn)
            if hashlib.sha256(check).hexdigest() != item['sha256_hex']:
                raise RuntimeError('CDN image verification failed: ' + item['name'])
            item.update(cdn_url=cdn, storage_zone=env['BUNNY_STORAGE_ZONE'])
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(upload, products))
        manifest.write_text(json.dumps(products, indent=2) + '\n', encoding='utf-8')
    if any(not item.get('cdn_url') for item in products):
        raise RuntimeError('Photos downloaded. Run with --upload before preparing SQL.')
    payload = quoted(json.dumps(products))
    sql = f"""-- Real products from https://www.fti.co.in/products; no fabricated commercial data.
-- Run in the FTI Supabase dashboard SQL editor. Repeated execution preserves existing records.
begin;
create temporary table fti_website_import on commit drop as
select * from jsonb_to_recordset({payload}::jsonb) as x(
 id uuid, image_id uuid, name text, slug text, category text, source_url text,
 source_image_url text, object_key text, size_bytes bigint, sha256_hex text, cdn_url text, storage_zone text);
insert into catalog.categories(slug,name)
values ('fasteners','Industrial Fasteners'),('agricultural','Agricultural Parts')
on conflict(slug) do nothing;
insert into catalog.products(id,category_id,slug,name,description,product_kind,purchase_mode,status)
select x.id,c.id,x.slug,x.name,null,
 case when x.category='fasteners' then 'fastener' else 'tractor_part' end,'rfq','draft'
from fti_website_import x join catalog.categories c on c.slug=x.category
on conflict(slug) do nothing;
insert into platform.media_assets(id,entity_type,entity_id,object_key,mime_type,size_bytes,
 visibility,upload_status,sha256_hex,cdn_url,storage_zone)
select x.image_id,'product',p.id,x.object_key,'image/jpeg',x.size_bytes,
 'public','verified',x.sha256_hex,x.cdn_url,x.storage_zone
from fti_website_import x join catalog.products p on p.id=x.id and p.slug=x.slug
on conflict(object_key) do nothing;
insert into platform.audit_logs(action,resource_type,resource_id,after_data)
select 'catalog.website.import','product',p.id,
 jsonb_build_object('source_url',x.source_url,'source_image_url',x.source_image_url)
from fti_website_import x join catalog.products p on p.id=x.id
where not exists(select 1 from platform.audit_logs a
 where a.resource_id=p.id and a.action='catalog.website.import');
select x.name,p.status,
 case when p.id=x.id then 'Imported' else 'Existing slug preserved; review manually' end as result
from fti_website_import x join catalog.products p on p.slug=x.slug order by x.name;
commit;
"""
    (OUT / '01_import_products.sql').write_text(sql, encoding='utf-8')
    print(f'Prepared {len(products)} real products and verified Bunny photos. Database import requires dashboard SQL execution.')

if __name__ == '__main__':
    main()
