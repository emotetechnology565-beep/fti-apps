# FTI website product import

Source: https://www.fti.co.in/products (17 October 2026).

37 real products: 17 industrial fasteners and 20 agricultural parts. Original names are preserved, including spelling on the website. Photos are copied to the configured Bunny storage and checked against the source SHA-256 hashes.

1. Open the FTI Supabase project → SQL Editor → New query.
2. Paste and run `01_import_products.sql`.
3. Open the app → Staff console → FTI catalogue. The imported products appear as drafts, with photos available under Manage photos.
4. Choose Add first variant. Enter the actual SKU, size, unit and minimum order quantity, save, then Publish.

The source provides no prices, stock quantities, dimensions or minimum orders. None are invented. No variants, stock or prices are inserted, so these products remain hidden from the buyer catalogue until staff complete them. The purchase mode is RFQ.

The SQL runs in one transaction. Re-running it does not duplicate products, images or audit records and does not overwrite existing products sharing a slug. Its result reports any preserved slug collision for manual review. No credentials are included. No Edge Function deployment or schema changes are needed.

`products.json` records source URLs, IDs, photo hashes and Bunny URLs. `images/` contains the original JPEGs. To refresh deliberately, run `python scripts/import-website-products.py --fetch --upload`; this uploads the website photos using credentials from the local `.env`. Running without flags regenerates SQL offline from the verified manifest.
