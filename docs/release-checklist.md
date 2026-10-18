# FTI release checklist

This file records evidence; it is not a production release approval. Keep the checklist with the release commit and have the named owner record date and evidence for each gate.

## Automated gates

- [x] Local TypeScript typecheck, lint, full isolated tests, and web export (run for the latest Phase 7 changes before deployment).
- [x] Production dependency audit: `npm audit --omit=dev --json` reported zero advisories on 16 October 2026. Repeat in CI and before submission.
- [ ] GitHub Actions Verify app passed on the release commit. The workflow runs tests, migration integration tests, web export and dependency audit.
- [ ] `npx expo-doctor` checked against SDK 57 and any warnings resolved or documented.

## Environment and data

- [ ] Separate Supabase and Bunny resources configured for preview and production. No service role, Bunny write key or WhatsApp token in EAS public variables.
- [ ] Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in each EAS environment. Set non-public server secrets only in the corresponding Supabase project.
- [ ] Review app identifiers, signing credentials, privacy policy and store listing ownership before EAS builds.
- [ ] Confirm all migrations through Phase 7 have run on staging; compare schema and grants with source migration files.
- [ ] Staging backup and restore drill, including Supabase database and Bunny encrypted documents, with recovery time recorded.
- [ ] Verify `operations` and `operations-media` auth boundaries with two buyers and staff with/without MFA.
- [ ] Verify notification Cron execution, failed-event replay, WhatsApp opt-in/out, approved template status, and ambiguous provider response review.

## Device and business acceptance

- [ ] Android and iOS internal builds installed on real devices using `npx eas-cli@latest build --profile preview --platform all`; test OTP, RFQ, private files, payment claims, dispatch, support, accessibility and offline errors.
- [ ] Finance owner approves GST/freight/rounding, invoices, payment/refund and credit rules before enabling any automated financial actions.
- [ ] Logistics owner approves PIN/freight/e-way, partial shipment and carrier proof rules before enabling those features.
- [ ] Support owner approves claim, cancellation and return windows and disposition rules before enabling those actions.
- [ ] Product/legal owners approve privacy, retention, account deletion, WhatsApp consent language and store metadata.
- [ ] Operational alert owners monitor failed outbox events, WhatsApp manual-review jobs, OTP failures, API errors, Bunny upload failures and database health.
- [ ] Production release owner records signoff and EAS build IDs; store submission is a separate approved action.

## Recovery

Keep migrations additive and app versions compatible through rollout. For a failed operations release, disable Cron jobs and the affected Edge Functions, roll back the app build, and fix forward with an audited migration. Never delete shipment, support, payment or audit history as a rollback shortcut.
