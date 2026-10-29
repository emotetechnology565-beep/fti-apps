"""Copy only public client settings into the EAS preview environment."""
from pathlib import Path
import re
import shutil
import subprocess

allowed = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_WEB_APP_URL']
values = {}
for line in Path('.env').read_text(encoding='utf-8-sig').splitlines():
    match = re.match(r'^\s*(EXPO_PUBLIC_[A-Z_]+)\s*=\s*(.*?)\s*$', line)
    if match and match[1] in allowed:
        values[match[1]] = match[2].strip('"\'')
for name in allowed[:2]:
    if not values.get(name):
        raise SystemExit(f'Missing required public configuration: {name}')
for name in allowed:
    value = values.get(name)
    if not value:
        print(f'{name}: not configured locally')
        continue
    if any(character in value for character in '&|^%!\r\n<>'):
        raise SystemExit(f'Unsupported shell characters in {name}')
    result = subprocess.run([shutil.which('npx.cmd') or 'npx', 'eas-cli@latest', 'env:create', '--environment', 'preview', '--name', name, '--value', value, '--visibility', 'plaintext', '--non-interactive', '--force'], capture_output=True, text=True)
    print(f'{name}: {"configured" if result.returncode == 0 else "failed"}')
    if result.returncode:
        message = (result.stderr + result.stdout).replace(value, '[redacted]')
        print(message[-2000:])
        raise SystemExit(result.returncode)
