# Phase 6 dashboard deployment

Run `01_commerce.sql` in Supabase SQL Editor after the baseline and Phases 2, 3 and 5. Create Edge Function **`commerce`** from `02_commerce.ts` with dashboard JWT verification disabled. The function validates the bearer token and restricted database RPCs enforce buyer ownership and staff MFA. Supabase default `SUPABASE_URL` and `SUPABASE_ANON_KEY` are sufficient. No demo data or gateway credentials are included.

The app supports accepted-quote orders and full bank-transfer claims with manual accounts review. A super-admin must enter an FTI-approved reservation duration in the staff console before order placement. Order managers must create real stock locations and record verified on-hand stock. Direct cart checkout, gateway charging, partial payments, credit and refunds are not enabled without approved policies.

See `docs/phase6-deployment.md` in the repository for detailed deployment order and acceptance checks. SHA-256 hashes are in `manifest.json`.
