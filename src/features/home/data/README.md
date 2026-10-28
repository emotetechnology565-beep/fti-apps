# Home product images

The home screen reads published products and public media through the catalogue
repository. It checks subsequent pages when needed and selects the first product
photo in each raw-material category. “Shop by category” has separate horizontal
rows for raw materials, fastener subcategories and tractor parts. Each fastener
subcategory comes from the published admin photo library and links to its own
dimensions screen. Every published tractor part has its own tile linking to
that product. All catalogue pages are read so later tractor parts are included.
The promotional banners keep using a representative photo for each division.

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
