import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
cert_source = ROOT / "assets/fastener-uploads/WhatsApp Unknown 2026-10-28 at 8.28.19 AM/WhatsApp Image 2026-10-28 at 7.30.10 AM.jpeg"

if not cert_source.exists():
    raise FileNotFoundError(f"Source certificate not found: {cert_source}")

data = cert_source.read_bytes()
digest = hashlib.sha256(data).hexdigest()

# Also save a bundled local copy in assets/certificates/
cert_dir = ROOT / "assets/certificates"
cert_dir.mkdir(parents=True, exist_ok=True)
bundled_path = cert_dir / "iso-9001-certificate.jpg"
bundled_path.write_bytes(data)
print(f"Saved bundled copy to {bundled_path.relative_to(ROOT)}")

env = {}
env_path = ROOT / ".env"
if env_path.exists():
    for line in env_path.read_text(encoding="utf-8-sig").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")

endpoint = env.get("BUNNY_STORAGE_ENDPOINT", "").rstrip("/")
if endpoint and not endpoint.startswith("https://"):
    endpoint = "https://" + endpoint

cdn = env.get("BUNNY_CDN_BASE_URL", "").rstrip("/")
zone = env.get("BUNNY_STORAGE_ZONE", "")
key = env.get("BUNNY_STORAGE_ACCESS_KEY", "")

object_key = f"company-certificates/iso-9001-2015-qacs-ind-250321.jpg"

if endpoint and zone and key:
    try:
        url_upload = f"{endpoint}/{zone}/{object_key}"
        print(f"Uploading to Bunny: {url_upload}...")
        req = Request(
            url_upload,
            data=data,
            method="PUT",
            headers={"AccessKey": key, "Content-Type": "image/jpeg"},
        )
        with urlopen(req, timeout=30) as resp:
            print("Upload status:", resp.status)
        
        cdn_url = f"{cdn}/{object_key}"
        print("Bunny CDN URL:", cdn_url)
    except Exception as e:
        print("Bunny upload note/error:", e)
        cdn_url = f"https://your-zone.b-cdn.net/{object_key}"
else:
    print("Bunny credentials missing from .env")
    cdn_url = f"https://your-zone.b-cdn.net/{object_key}"

# Output config json
config = {
    "standard": "ISO 9001:2015",
    "scope": "Quality Management System",
    "organization": "FIELDFAST TECH INTERNATIONAL",
    "certificate_number": "QACS/IND/250321",
    "accreditation": "IAS Accredited (MSCB-196) & IAF MLA Member",
    "valid_until": "2028-03-03",
    "issuer": "QACS International",
    "verification_url": "https://www.qacscert.com",
    "cdn_url": cdn_url,
    "local_asset": "assets/certificates/iso-9001-certificate.jpg",
}

out_file = ROOT / "src/shared/config/company-certificates.json"
out_file.parent.mkdir(parents=True, exist_ok=True)
out_file.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
print(f"Saved config to {out_file.relative_to(ROOT)}")

