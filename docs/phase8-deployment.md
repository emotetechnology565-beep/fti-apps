# Phase 8 - Business stock deployment

Phase 8 adds a separate marketplace for business-owned stock. It does not add demo records or merge seller stock into FTI inventory.

## Dashboard deployment

1. Open the **FTI** Supabase project. Phase 2 identity, the source blueprint and the catalogue media migration must already be applied. Phase 8 is additive to the existing app.
2. In SQL Editor run `deployment/phase8/01_business_stock.sql`, then `02_stock_media.sql`. Run each entire file once. Do not rerun the source blueprint or earlier migrations.
3. Create an Edge Function named exactly **business-stock**, with the complete contents of `03_business-stock.ts` as its entry point. Disable platform **Verify JWT**. The function verifies the signed-in user and passes their JWT into permission-checked database RPCs.
4. Create **business-stock-media** using the complete single-file `04_business-stock-media.ts`. Disable platform **Verify JWT**. It verifies the user before allowing uploads or decrypting files.
5. Confirm these existing server secrets are present: `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_ACCESS_KEY`, `BUNNY_STORAGE_ENDPOINT`, `BUNNY_MEDIA_ENCRYPTION_KEY`. Reuse the same Bunny zone and encryption key from prior phases. Default `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are supplied by Supabase. No new variables are needed in `.env` and no Supabase Storage bucket is used.
6. Reload the web app or build a new Android/iOS preview to include the new screens. Existing super admins and sales executives receive `stock.review` through the migration. Staff must complete MFA before reviewing stock or reading enquiry oversight.

The generated folder and `deployment/phase8-dashboard.zip` contain SQL, dashboard-ready functions, this guide, and a SHA-256 manifest. Regenerate the folder using `node scripts/prepare-phase8.mjs` after source changes, then recreate the ZIP.

## Seller and buyer workflow

- In Material catalogue, use **Stock source** to switch between **FTI stock** and **Business stock**. These use separate routes and data sources.
- **My stock & enquiries** opens the seller workspace. Active members of verified businesses can create real drafts. Save material details, stock condition, quantity/unit, asking price/unit, location, and an explicit future availability expiry with timezone.
- Attach JPEG/PNG photos and PDF/JPEG/PNG certificates, each up to 3 MB, with at most 10 active attachments per listing. Uploads must finish before submission. All files are encrypted before upload to Bunny. Photos are available to signed-in viewers of approved available listings; certificates are restricted to the seller, MFA reviewers and buyers who have submitted an enquiry.
- Submit the draft for FTI review. Another authorized staff member reviews the material and attachments, adds a note, and approves or rejects it. Sellers see rejection feedback. Staff cannot approve their own listing.
- Approved listings appear only while availability is current and the seller/business/membership remain active and verified. Sellers edit stock and availability by saving a new draft, which removes it from discovery until reviewed again. Sellers can withdraw a listing or permanently mark published stock sold. Withdrawn listings can be edited back into drafts.
- Buyers send a positive quantity-based enquiry and track conversations under **Buying enquiries**. Sellers reply under **Selling enquiries**. Each enquiry retains the material, price/unit and available quantity snapshot at the time of enquiry. Either party can close it with a reply. FTI has MFA-protected enquiry oversight.
- Enquiries do not reserve stock, place orders, charge fees or take payment. The commercial model, invoice authority, tax/freight, fees, fulfilment and dispute rules in the Phase 8 plan still need approval before transaction automation.

## Staging acceptance

Use authorized staging accounts and real staging documents. Do not create demo records in production.

1. Verify the dropdown on mobile and desktop: FTI stock never appears in business discovery, and business cards/detail screens show **Business stock** and the seller's legal name.
2. Use two verified businesses and a third unrelated buyer. Verify that unverified businesses cannot create/submit stock, seller drafts remain private, and one seller cannot edit or withdraw another seller's listing.
3. Submit stock, check that staff without MFA cannot review it, then reject and resubmit with feedback. Approve from a different staff account. Verify that only approved, unexpired stock is discoverable.
4. Upload a photo and certificate to the existing Bunny zone. Verify that raw stored bytes are ciphertext. A signed-in buyer can view approved photos but cannot access certificates until enquiring; unrelated buyers remain denied. Confirm removal revokes further access.
5. Create an enquiry, retry the same request, exchange replies and close it. Verify no duplicate enquiry or message, no stock reservation, no cross-buyer thread access, and retention of the original material/price/unit snapshot after seller edits.
6. Open two seller tabs and verify stale edits/actions fail with a refresh message. Edit a published listing and confirm it disappears until reapproval. Withdraw, mark sold, expire stock and revoke business verification; confirm new enquiries are denied.

## Verification evidence

Local automated evidence covers SQL authorization/transitions/concurrency guards, Edge Function authorization and encrypted-media handling, plus browser flows with intercepted APIs. Dashboard deployment and signed-in device acceptance must be recorded separately; local checks do not prove deployment.

## Rollback

Disable the two Phase 8 functions and hide Phase 8 entry points if needed. Preserve listing, enquiry, message, media and audit history. Apply a reviewed follow-up migration rather than dropping business records. Keep the Bunny encryption key backed up for existing attachments.
