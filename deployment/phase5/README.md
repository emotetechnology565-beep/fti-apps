# Phase 5 dashboard deployment

Apply `01_sales.sql` and then `02_private_media.sql` in Supabase SQL Editor. Prerequisites: the original blueprint, Phase 2 identity migration, Phase 3 catalogue migration, and the catalogue-media metadata migration. The SQL contains no demo data.

Create an Edge Function named exactly `sales` using `03_sales.ts`, and another named exactly `sales-media` using `04_sales-media.ts`. Disable the dashboard's JWT verification for both; the functions authenticate bearer tokens with Supabase Auth and the SQL enforces ownership and staff MFA.

Use the existing Bunny Storage Zone. RFQ attachment bytes are AES-256-GCM encrypted before upload, so the connected public Pull Zone can serve only ciphertext. Keep the existing `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_ACCESS_KEY`, and `BUNNY_STORAGE_ENDPOINT` secrets. Add one new Edge Function Secret:

    BUNNY_MEDIA_ENCRYPTION_KEY=<32-byte base64 key from local .env>

Back up this key securely: losing or rotating it makes uploaded attachments unreadable. Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. Do not copy the encryption key into the mobile app or any `EXPO_PUBLIC_` variable. If `sales-media` was deployed previously, replace its code with the updated `04_sales-media.ts` and redeploy it after setting the key.

Grant `sales_executive` to a real approved staff user through the existing role process; `super_admin` is also permitted. Staff must finish TOTP MFA. For full acceptance checks and limitations, see `docs/phase5-deployment.md` in the repository. Quotation acceptance does not create an order or payment.
