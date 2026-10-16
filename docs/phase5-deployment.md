# Phase 5 — RFQs and quotations

Phase 5 adds multi-item RFQ submission, a staff sales queue, manually priced quotation revisions, buyer revision requests and one-time acceptance. RFQ attachments are encrypted before being stored in the existing Bunny Storage Zone. No business records or demo data are inserted. Acceptance of a quotation does not create an order or charge a payment; those belong to Phase 6.

The dashboard-ready copies and SHA-256 manifest are in `deployment/phase5` and `deployment/phase5-dashboard.zip`.

## Deploy in this order

1. Confirm the original schema blueprint, Phase 2 identity migration, Phase 3 catalogue migration, and the catalogue-media metadata migration are already applied. Existing real catalogue variants must be active and published before buyers can submit RFQs.
2. In Supabase SQL Editor, run `01_sales.sql`, then `02_private_media.sql`. Both are additive. The first adds sales RPCs and permissions; the second adds private attachment RPCs. Neither inserts sample RFQs or quotations.
3. In Supabase Edge Functions, create function **`sales`** from `03_sales.ts` and function **`sales-media`** from `04_sales-media.ts`. Disable the platform JWT verification setting for both: each function verifies the bearer token against Supabase Auth and database functions enforce ownership and staff MFA.
4. Keep the existing Bunny Storage Zone and its four public-photo secrets. The attachment function uses `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_ACCESS_KEY`, and `BUNNY_STORAGE_ENDPOINT` for the same zone, but uploads only AES-256-GCM ciphertext. The public Pull Zone may expose the encrypted bytes, so the decryption key must stay server-side.
5. Add `BUNNY_MEDIA_ENCRYPTION_KEY` to Supabase Edge Function Secrets with the exact 32-byte base64 value in the local `.env`. Keep a secure backup of that value: changing or losing it makes existing attachments unreadable. Redeploy **`sales-media`** using the updated `04_sales-media.ts` after saving the secret. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are Supabase's reserved server-side secrets. Never put the encryption key, storage key or service-role key in an `EXPO_PUBLIC_` variable.
6. Assign the existing `sales_executive` role to a real staff user through the approved admin process. `super_admin` also receives `sales.manage`. Staff must complete TOTP MFA before using the sales queue or opening documents. Buyers can only access their own RFQs and attachments.

## Acceptance checks

- Buyer: submit one RFQ containing two published variants and approved quantities; refresh and confirm the same RFQ appears once. Reusing its request ID with changed details must return a conflict.
- Staff: assign the request, open attachments, enter approved line rates, an explicit expiry, discount, GST, freight and terms, then issue a quotation. Rates and tax are entered manually; the app does not infer business policy.
- Buyer: view the revision, request a change, then accept the latest unexpired revision once. An older revision or a second acceptance must fail.
- Documents: upload a PDF or image up to 3 MB, open it as the buyer and authorized staff, then confirm another buyer and an unauthenticated user cannot retrieve the plaintext. A direct public CDN request for the attachment path may return ciphertext; it must never return a readable PDF or image.

The app has no Supabase Storage integration for these files. The SQL stores metadata only; the Edge Function encrypts and decrypts the bytes while using Bunny's Storage API. Decryption is allowed only after the database ownership or MFA staff check.
