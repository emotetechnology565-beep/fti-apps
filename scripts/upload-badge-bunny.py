import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
png_file = ROOT / "assets/icons/iso-9001-certified-badge.png"
svg_file = ROOT / "assets/icons/iso-9001-certified-badge.svg"

env = {}
for line in (ROOT / ".env").read_text(encoding="utf-8-sig").splitlines():
    if "=" in line and not line.lstrip().startswith("#"):
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")

endpoint = env.get("BUNNY_STORAGE_ENDPOINT", "").rstrip("/")
cdn = env.get("BUNNY_CDN_BASE_URL", "").rstrip("/")
zone = env.get("BUNNY_STORAGE_ZONE", "")
key = env.get("BUNNY_STORAGE_ACCESS_KEY", "")

uploads = [
    (png_file, "icons/iso-9001-certified-badge.png", "image/png"),
    (svg_file, "icons/iso-9001-certified-badge.svg", "image/svg+xml"),
]

urls = {}
for file_path, object_key, mime in uploads:
    if not file_path.exists():
        continue
    data = file_path.read_bytes()
    url = f"{endpoint}/{zone}/{object_key}"
    req = Request(
        url,
        data=data,
        method="PUT",
        headers={"AccessKey": key, "Content-Type": mime},
    )
    with urlopen(req, timeout=30) as resp:
        print(f"Uploaded {object_key}: status {resp.status}")
    cdn_url = f"{cdn}/{object_key}"
    urls[object_key] = cdn_url
    print(f"CDN: {cdn_url}")

# Update company-certificates.json with badge URLs
cfg_path = ROOT / "src/shared/config/company-certificates.json"
cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
cfg["badge_cdn_url"] = urls.get("icons/iso-9001-certified-badge.png")
cfg["badge_svg_cdn_url"] = urls.get("icons/iso-9001-certified-badge.svg")
cfg_path.write_text(json.dumps(cfg, indent=2) + "\n", encoding="utf-8")
print("Updated config with badge URLs.")

