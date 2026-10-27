"""Prepare an owner-deployed bundle, including the worker's required static assets."""
from pathlib import Path
import hashlib
import json
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'deployment/fastener-orders'
OUT.mkdir(parents=True, exist_ok=True)
for name, source in {
    '01_grade_rates.sql': 'supabase/migrations/202610260010_fastener_grade_rates.sql',
    '02_fastener_orders.sql': 'supabase/migrations/202610260011_fastener_orders.sql',
    '03_fix_optional_dimensions.sql': 'supabase/migrations/202610270001_fastener_optional_dimensions.sql',
}.items():
    shutil.copy2(ROOT/source, OUT/name)

worker = OUT/'supabase/functions/operations-whatsapp'
shutil.copytree(ROOT/'supabase/functions/operations-whatsapp', worker, dirs_exist_ok=True)
(OUT/'supabase/config.toml').write_text('''project_id = "fti-fastener-orders-deployment"
[functions.operations-whatsapp]
verify_jwt = false
static_files = ["./functions/operations-whatsapp/fastener-renderer/assets/*.wasm", "./functions/operations-whatsapp/fastener-renderer/assets/*.ttf"]
''', encoding='utf-8')

with zipfile.ZipFile(OUT/'web-build.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted((ROOT/'dist').rglob('*')):
        if path.is_file():
            archive.write(path, path.relative_to(ROOT/'dist'))

manifest = {}
for path in sorted(OUT.rglob('*')):
    if path.is_file() and path.name != 'manifest.json':
        manifest[str(path.relative_to(OUT)).replace('\\','/')] = {
            'bytes':path.stat().st_size,
            'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
        }
(OUT/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
with zipfile.ZipFile(ROOT/'deployment/fastener-orders.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(OUT.rglob('*')):
        if path.is_file():
            archive.write(path, Path('fastener-orders')/path.relative_to(OUT))
print('Prepared deployment/fastener-orders. No credentials were copied.')
