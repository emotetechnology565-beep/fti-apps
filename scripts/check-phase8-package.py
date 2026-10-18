"""Verify dashboard copies and ZIP contents against the current Phase 8 source."""
import hashlib
import json
import re
from pathlib import Path
from zipfile import ZipFile

root = Path(__file__).resolve().parents[1]
directory = root / 'deployment/phase8'
def read(path): return (root / path).read_text(encoding='utf-8-sig')
expected = {
    '01_business_stock.sql': read('supabase/migrations/202610170001_phase8_business_stock.sql'),
    '02_stock_media.sql': read('supabase/migrations/202610170002_phase8_stock_media.sql'),
    '03_business-stock.ts': read('supabase/functions/business-stock/index.ts'),
    '04_business-stock-media.ts': read('supabase/functions/business-stock-media/crypto.ts') + '\n' + re.sub(r"^import \{ importDocumentKey, openDocument, sealDocument \} from '\./crypto\.ts';\s*", '', read('supabase/functions/business-stock-media/index.ts')),
    'README.md': read('docs/phase8-deployment.md'),
}
manifest = json.loads((directory / 'manifest.json').read_text())
assert set(expected)==set(manifest)
with ZipFile(root / 'deployment/phase8-dashboard.zip') as archive:
    assert set(archive.namelist()) == set(expected) | {'manifest.json'}
    for name, source in expected.items():
        content = (directory / name).read_bytes()
        assert content.decode('utf-8').replace('\r\n','\n') == source, name + ' differs from source'
        assert hashlib.sha256(content).hexdigest()==manifest[name], name + ' checksum mismatch'
        assert archive.read(name)==content, name + ' ZIP differs from dashboard file'
    assert json.loads(archive.read('manifest.json')) == manifest
print('Phase 8 source copies, five checksums and six ZIP entries verified; no extra files.')
