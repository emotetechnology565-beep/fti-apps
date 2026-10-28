# Home product images

The home screen reads published products and public media through the catalogue
repository. It checks subsequent pages when needed and selects the first product
photo in each category. Fasteners prefer the published photo assignments from
the existing admin fastener photo library, sharing its query cache.

Admins can replace product photos in Catalogue → Photos, and fastener assignments
in the fastener photo manager. These actions invalidate the same query keys used
by Home. No product images are bundled into the home screen.

`material-image-fallbacks.json` contains Bunny CDN URLs for the six existing raw
material category photographs. They were uploaded and verified with
`scripts/upload-home-material-images.py`. These keep material categories visible
when no published product has a linked photo. A published product photo takes
priority, so admins can replace the displayed category photo through Catalogue.
The uploader uses content-addressed object keys and does not modify product rows.

Fasteners and tractor parts have no unrelated stock-image fallback. Missing or
failed photos show a neutral placeholder while keeping category links usable.
