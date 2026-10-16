# Catalogue photos: Bunny dashboard deployment

This add-on stores public product photos in Bunny Storage and serves them through your Bunny CDN Pull Zone. Supabase stores photo metadata and authorizes staff actions; it does not store image bytes. No products, photos or other sample data are included.

## 1. Add Bunny secrets

In your Supabase project, open **Edge Functions → Secrets**. Add these four custom secrets using the actual Bunny values:

| Secret name | Value |
| --- | --- |
| `BUNNY_STORAGE_ZONE` | Storage Zone Name |
| `BUNNY_STORAGE_ACCESS_KEY` | Password from Storage Zone → Access → API / HTTP |
| `BUNNY_STORAGE_ENDPOINT` | Full regional API endpoint, such as `https://storage.bunnycdn.com` |
| `BUNNY_CDN_BASE_URL` | Full Pull Zone URL, such as `https://your-zone.b-cdn.net` |

Find the storage API endpoint in **Bunny dashboard → Storage → your Storage Zone → Access**. It depends on the zone's primary region: Frankfurt uses `https://storage.bunnycdn.com`, Singapore uses `https://sg.storage.bunnycdn.com`, and Sydney uses `https://syd.storage.bunnycdn.com`. Copy the endpoint for your own zone, including `https://`, without the zone name or any file path.

The Bunny Storage password is different from the account API key. Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions as reserved defaults. Do not expose either service key or Bunny password through an `EXPO_PUBLIC_` variable.

The mobile app's local `.env` uses `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Those are app-side names, not the Edge Function secret names. The four `BUNNY_*` names must match exactly in the function secrets; values entered only in local `.env` do not reach dashboard-deployed functions. A `503 Image service is not configured` response means at least one required Edge value is missing or malformed. Check that `BUNNY_STORAGE_ENDPOINT` is the full HTTPS storage API URL and `BUNNY_CDN_BASE_URL` is the full HTTPS Pull Zone URL.

For `BUNNY_CDN_BASE_URL`, use the hostname of the Pull Zone connected to this Storage Zone, for example `https://your-pull-zone.b-cdn.net`. Find or create it under **Storage Zone → Connected Pull Zones**, then copy its hostname from the Pull Zone page. An S3 or Storage API hostname such as `https://de-s3.storage.bunnycdn.com` is not a CDN URL.

## 2. Run the migration

In **SQL Editor**, paste and run `01_catalog_media.sql`. It extends the existing `platform.media_assets` table and creates restricted metadata functions. It requires the original blueprint and Phase 2 and Phase 3 migrations. Existing products remain untouched.

## 3. Redeploy the catalogue function

Open the existing Edge Function named exactly `catalog`. Replace its entry point with `02_catalog.ts` and deploy. Keep JWT verification **off** because this function serves public catalogue reads; the database enforces staff writes and MFA. This revision allows the image metadata read operations used by the app.

## 4. Deploy the image function

Create a new Edge Function named exactly `catalog-media`. Paste `03_catalog-media.ts` as its entry point and deploy with JWT verification **off**. This function verifies the user's JWT itself and requires database staff permission plus AAL2 MFA before any upload or removal. The Bunny password stays inside the Edge Function.

## 5. Check with a real staff account

Sign in as a `super_admin` staff user, complete staff MFA, open **Staff console → Catalogue management → Manage photos**, and select a real product photo. The picker crops/converts it to JPEG. The function limits files to 3 MB and eight images per product. Product photos appear publicly only after Bunny confirms the upload and the metadata is marked verified.

Removal hides the image from catalogue results immediately and attempts to delete it from Bunny Storage. An existing direct CDN URL may continue to work until its cached copy expires; CDN purge and orphan cleanup remain operational follow-up work. Private business documents and invoices are outside this public-product-photo flow.

The dashboard files contain no Bunny password or other secrets. `manifest.json` lists SHA-256 checksums for the files in this package.
