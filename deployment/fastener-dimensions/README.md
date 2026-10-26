# Fastener dimension library

Customer path: Catalogue → Fasteners → J/L/U bolt type or coach screw → shape → standard edition → size → width/length → live drawing. The customer does not choose a foundation/roofing family. Optional standard-number filtering is available. Family metadata remains available to staff; foundation dimensions must be configured independently and IS 730 definitions remain classified as roofing hook bolts internally.

The first customer selector is now **Fastener subcategory**, with the 15 requested names (Hex bolt, Heavy Hex bolt, Hex nut, Heavy Hex nut, U bolt, J type bolt, J hook, Sq type J bolt, Plain washer, Machined washer, Spring washer, Square washer, DTI washer, Square nut, Sq.plate). Existing L-bolt/coach entries remain accessible when published. Categories without published dimension definitions show a quotation message and do not inherit another category's dimensions.

Existing deployments must also apply `05_fastener_subcategories.sql` and redeploy `03_catalog.ts`. This adds explicit admin mapping from each dimension definition to its subcategory, while preserving its published version until staff publish changes. J type bolt, J hook, and Sq type J bolt can be managed separately. Existing J definitions default to J type bolt; they are not automatically copied to other J categories. The current drawing engine supports its existing six shapes; listing a subcategory does not create a new nut, washer or plate drawing template, price or stock record.

Staff path: Staff console → FTI catalogue → Fasteners → Manage fastener dimensions. Catalogue permission and AAL2 MFA are required by the database. Admins can create definitions for supported drawing shapes, edit numeric dimensions and allowed size lists, preview drafts, publish, and withdraw. A source reference is required. Concurrent stale writes/publications are rejected; publication and audit entries commit atomically. Customer reads use the last published snapshot, even after later draft edits.

## Dashboard deployment

### Matching admin and customer fields

Both screens now use the same canonical subcategory names and Shape/Size labels. The internal foundation/roofing classification is no longer a visible admin selector. The admin dimension editor shows only fields relevant to the selected shape, and each subcategory has an explicit list of supported shapes. Photo cards use the same canonical names.

Apply `10_fastener_shape_mapping.sql` after migration 05 to enforce subcategory/shape compatibility for new saves and publications. Existing historical mappings are preserved for staff correction; invalid combinations are excluded from the customer drawing choices. Nut/washer/plate subcategories can publish photos, but cannot publish an unrelated hook drawing while their own drawing templates are unavailable. No source references are shown in either UI.

### Subcategory photo cards (no SKU required)

If the existing Fasteners product editor only contains the 17 original website imports, run `08_add_fastener_entries.sql` to add the 15 requested names there as photo-setup drafts. This preserves existing records, inserts no variants/prices/stock, and can be rerun without duplicating products. Open Industrial Fasteners → Photos to upload each real product photo, then assign/publish it using Subcategory photos. Draft product images are eligible for explicit photo-card assignment; they need no fabricated SKU.

Apply `06_fastener_photos.sql` after the existing catalogue/media migration, then redeploy `03_catalog.ts` and the updated app. In the staff catalogue's Fasteners → Manage fastener dimensions → Subcategory photos, choose a subcategory, select an existing verified fastener product photo, and click Publish subcategory photo. Photos from draft products are available here; neither product publication nor a variant is needed. Additional photos can be uploaded with the existing catalogue Photos editor. The image is explicitly assigned to the chosen subcategory; no image or stock is invented.

Published cards appear immediately after choosing Fasteners. Clicking a card selects that subcategory and opens its progressive filters. Where dimensions are not yet configured, the photo still appears and the customer sees a quotation message. Removing/rejecting an underlying media asset removes it from the public photo-card response. Staff changes require catalogue permission, MFA, and an exact current revision.

`07_publish_assigned_photos.sql` is an optional SQL Editor alternative for publishing cards whose images are already assigned. It does not assign photos or publish catalogue products. With no image assignments, it returns zero rows by design. The app's publishing button both assigns the selected photo and publishes the card.

Requires existing identity and catalogue migrations.

1. Apply `01_dimension_library.sql` in Supabase SQL Editor.
2. Apply `04_drawing_families.sql` (also required on existing deployments). It adds family separation and updates the save function. Then optionally apply `02_scan_drafts.sql`. It stages 24 roofing/coach definitions transcribed from the supplied scan. Re-running preserves existing edits; it never publishes or overwrites records. The JSON source is `source-definitions.json`.
3. Redeploy the existing `catalog` Edge Function from `03_catalog.ts`. Preserve its existing secrets and gateway configuration. No new secrets are required. The function verifies staff JWTs; SQL enforces permission and MFA independently.
4. Deploy the updated app. An authorized staff account should review the drafts and publish the intended rows. Until then, customers see no published definitions.
5. Verify signed-in staff save/publish/withdraw and public customer discovery on the hosted app. Test SVG rendering on installed Android/iOS devices. These live and installed-device checks have not been performed locally.

## Source handling

IS 730:1978 and IS 1120:1975 refer to the editions printed on `Whatsapp Scan 26 October 2026 at 09.37.15.pdf`, page 1. They are source identifiers, not a claim that every requirement of the complete standards is implemented. This feature does not consult external charts. The workbook remains authoritative for its commercial data; it is not imported or repriced here.

Square U and L entries retain width/length combinations, including width 90 U at length 225 and L M10 width 110 at the listed lengths. Round U and J II accept purchaser radius; J II additionally needs return height. Default radius/return/angle values are explicitly illustrative. Nut assemblies and thread profiles are schematic. The source's No.14 coach head-height inconsistency is retained in notes rather than silently corrected.

Definitions store source, edition, shape and dimensions; customer inputs affect only the preview, never persisted pricing or stock. Publication revisions are visible. Previously generated drawing documents are not order attachments or accepted manufacturing approvals.

## Verification

- `npm run typecheck`, `npm run lint`, `npm run build`
- `node_modules/.bin/tsx --test tests/fastener-drawings-db.test.ts tests/architecture.test.ts`
- `python scripts/fastener-dimensions-browser.py` after web export: intercepted API checks for customer cascade, SVG display, invalid dimensions, and staff save/publish; no remote records are modified.

The database tests use disposable PGlite databases and real identity/catalogue SQL. The browser tests use source-transcribed fixtures; they do not prove hosted deployment.

Generate dashboard copies and SHA-256 manifest using `node scripts/prepare-fastener-dimensions.mjs` after source changes. Canonical backend source is in `supabase/`; edit source rather than generated copies.
