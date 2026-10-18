# Phase 7 operations: dashboard deployment update

The owner previously deployed `01_operations.sql` and an earlier `operations` function. Apply only the new files in the order below. These changes add private Bunny documents, queued updates, optional WhatsApp utility messages, reporting, audit, and operational announcements. No demo business records are included.

## Apply and deploy

1. Run `03_private_documents.sql`, `04_outbox.sql`, `05_whatsapp.sql`, `10_reporting.sql`, and `11_announcements.sql` in the **FTI** Supabase SQL Editor, in that order. Each migration is transactional and additive. They depend on Phases 2-7 including Phase 5 private media and Phase 6 commerce.
2. Redeploy the Edge Function named exactly **`operations`** using `02_operations.ts`. Keep platform Verify JWT **off**; the function checks Supabase Auth and forwards the bearer JWT to permission-checked RPCs.
3. Create the Edge Function **`operations-media`** using the single paste-ready `06_operations-media.ts`. Set Verify JWT **off**. It reuses the existing `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_ACCESS_KEY`, `BUNNY_STORAGE_ENDPOINT`, `BUNNY_MEDIA_ENCRYPTION_KEY`, and default Supabase secrets. It stores only AES-GCM ciphertext in the same Bunny zone. No Supabase Storage is used.
4. Create the Edge Function **`operations-whatsapp`** using `07_operations-whatsapp.ts`. Set Verify JWT **off**. Add `OPERATIONS_WORKER_SECRET` to Supabase Edge Function Secrets; copy the generated value from local ignored `.env` without posting it in chat. Existing Meta credentials must also be in Edge Secrets: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_BUSINESS_ID`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_GRAPH_VERSION`, and `WHATSAPP_TEMPLATE_LANGUAGE`. Default Supabase URL and service role key are injected by Supabase.
5. Enable Supabase Cron and run `08_schedule_in_app.sql`. Confirm its job exists and that the outbox pending count drops after a minute. This worker creates one in-app notification per supported event and retries failures with backoff. Failed events appear in the staff console for audited replay.
6. In Supabase Vault, create two named secrets: `fti_project_url` = the FTI Supabase URL from `.env`, and `fti_operations_worker_secret` = the **same** value as `OPERATIONS_WORKER_SECRET`. Do not put either value in the SQL file. Enable `pg_net`. Run `09_schedule_whatsapp.sql` **only after** both templates show APPROVED in Meta and you have tested buyer opt-in. The worker checks approval on every run; it sends no messages for pending or rejected templates.
7. In EAS preview/production environments set only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` for the app. Never put Bunny or Meta secrets in public app variables. Build profiles are in `eas.json`.

The new Meta utility templates were submitted on 16 October 2026 and were PENDING at the last check: `fti_order_status_v1` (ID `1419982363006384`) and `fti_support_reply_v1` (ID `2186079525307477`). `Identity` remains the OTP template. Check status with `python scripts/meta_templates.py list`; do not schedule WhatsApp delivery before approval.

## Staging acceptance

- Two buyers, one MFA operations staff account and one MFA support staff account: verify ticket, shipment, notification and private document isolation. Check staff without MFA is denied.
- Upload one genuine PDF/JPEG/PNG POD, MTC and support document under 3 MB. Verify buyer access, second-buyer denial, ciphertext at the Bunny CDN URL, and tamper rejection.
- Confirmed fully paid order: dispatch, upload POD, record delivery evidence, inspect buyer notification and order history. Duplicate dispatch/delivery must fail.
- RFQ/order/payment events: run Cron and verify a single in-app notification per event even after manual replay. Create a controlled unsupported event in isolated staging only and verify retry/dead-letter/replay.
- Buyer opts into WhatsApp updates explicitly, then a real approved utility event sends once. Opt out and confirm no new jobs are sent. Test Meta 429, 5xx, timeout and manual-review reconciliation. Never replay an ambiguous provider result until Meta message logs show it was not delivered.
- Publish a reviewed informational announcement; verify buyer home and staff audit. Archive it and verify it disappears. Review daily totals against real staging records.
- Run the separate [release checklist](../../docs/release-checklist.md) on installed Android and iOS preview builds. Record evidence and owners.

## Business and release gates

FTI has not approved cancellation/refund, advance/credit, tax/freight, invoice authority, partial shipments, PIN eligibility or e-way rules. Their automated actions stay disabled. WhatsApp marketing campaigns, email and push need approved providers, consent and content. Store submission, device UAT, restore drills and production signoff require the named owners; no production completion is claimed.

To stop background delivery, unschedule the named Cron jobs using the comments in `08_schedule_in_app.sql` and `09_schedule_whatsapp.sql`. Preserve order, shipment, notification, media and audit rows. Roll forward with a reviewed migration; do not delete historical records as rollback.
