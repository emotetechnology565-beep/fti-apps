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

### Hex bolt, screw, nut and lock nut

`15_hex_table_publish.sql` is the self-contained SQL Editor script for the supplied IS 1363:1967 table. It installs the hex schema and updated dimensional validator, imports 55 definitions, and directly publishes matching entries in the existing `hex-bolt` and `hex-nut` subcategories. The existing filename `15_hex_table_drafts.sql` now runs the same direct-publication script. No separate run of `14_hex_fasteners.sql` is needed when using either combined file. Keep the earlier identity/catalogue and drawing-library migrations installed.

Expected published counts are 15 hex bolts (M6–M39), 10 hex screws (M6–M24), 15 hex nuts and 15 lock nuts (M6–M39). Reruns do not duplicate entries or increment already published revisions. Existing manually changed dimensions are preserved and reported as `unchanged_manual_drafts`, rather than being overwritten. The final query returns counts after commit. The disposable-database test reproduces the older validator's `drawing_definitions_check` error, then verifies the combined script repairs it and publishes all 55 rows.

The bolt thread minimum is 2d+6 for L≤130, 2d+12 for 130<L≤200, and 2d+25 for L>200, with the printed +0/+2P allowance. Screw b1 uses its per-size L-minus-offset values. Overall bolt/screw length is customer input; nut height comes from the table. Drawings use maximum head/shank envelope dimensions and schematic thread/chamfer detail. No dimensions are assigned to Heavy Hex categories. No prices, product stock or photo assignments are created by this script.

### Coach screw table

The existing `coach-screw` subcategory contains IS 1120:1975 sizes No. 10, 14, 18, 24, 28 and 32. Apply `12_coach_screw_tolerances.sql`, then `13_coach_screw_table.sql` to add the supplied shank/head tolerance limits, minimum across corners and maximum under-head radius. The import adds missing fields, preserves existing dimension values and published snapshots, and is repeatable without duplicate rows. Review and publish the updated definitions in admin. Overall screw length must be entered because this table does not provide length options.

No. 14 retains the printed nominal head thickness 4.00 and limits 4.38–4.62; the app flags this discrepancy for confirmation. No replacement values are inferred. The reaffirmation year 1988 does not replace the standard edition 1975.

- `npm run typecheck`, `npm run lint`, `npm run build`
- `node_modules/.bin/tsx --test tests/fastener-drawings-db.test.ts tests/architecture.test.ts`
- `python scripts/fastener-dimensions-browser.py` after web export: intercepted API checks for customer cascade, SVG display, invalid dimensions, and staff save/publish; no remote records are modified.

The database tests use disposable PGlite databases and real identity/catalogue SQL. The browser tests use source-transcribed fixtures; they do not prove hosted deployment.

Generate dashboard copies and SHA-256 manifest using `node scripts/prepare-fastener-dimensions.mjs` after source changes. Canonical backend source is in `supabase/`; edit source rather than generated copies.

## IS 1363:1992 Table 3
Run `16_hex_1992_table_publish.sql` to directly publish 60 entries (15 each: hex bolts, hex screws, hex nuts, lock nuts; M5?M36). Includes hex validator repair; existing dimension library migrations are required. Re-running preserves manual edits and does not duplicate entries. Existing 1967 rows remain separate. Deploy the app update for the edition-specific 125 mm bolt thread cutoff before using the 1992 edition. Values are transcribed as printed, including unusual M18 major diameters, M22 across-corners and M36 bore limits; not silently corrected. No prices or photos are changed.

## IS 1364:1967 Table 4
Run `17_hex_1364_table_publish.sql` for direct publication of 60 entries, M6?M39: 15 each of hex bolts, screws, nuts and lock nuts. Existing IS 1363 editions remain separate. Hex bolt and Hex nut categories are reused. Includes validator repair; requires the existing dimension library migrations. Repeat-safe and preserves manual edits. Deploy the app update to enable the IS 1364 bolt thread rule (130 mm cutoff). External/internal thread classes are 6g/6H; dimensions are from the supplied table, not copied from IS 1363. No price or photo changes.

## IS 1364:1992 Table 5
Run `18_hex_1364_1992_table_publish.sql` for direct publication of 52 entries (M1.6?M16, four mapped shapes); the supplied page continues onto another table for larger sizes, so M24+ are not included in this page import. Uses existing Hex bolt and Hex nut categories. Hex bolt/screw thread rules follow Table 5 allowances, including per-size screw b1 offsets. Thin lock nut m1 thickness is separate. The unchamfered thin-nut variation is not represented as a separate shape. Repeat-safe and preserves manual edits. Requires app update for IS 1364:1992 thread cutoff.
