# FTI B2B marketplace app

Expo 57 / React Native / TypeScript app built from the FTI implementation documentation. The code is organized by business feature and uses Supabase for identity/data and Bunny for media. No demo business records are bundled.

## Run locally

```powershell
cd D:\fti\fti-app
npm ci
npm start
```

For a browser preview use `npm run web`; for a static export use `npm run build` followed by `python scripts/serve.py`. Local configuration names are in `.env.example`; `.env` is ignored by Git. Only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` belong in client builds. Service-role, Bunny and WhatsApp credentials belong in Supabase Edge Function Secrets.

Request confirmations, permission-routed staff alerts and decision updates cover all request workflows. All five new WhatsApp utility templates show APPROVED. The owner reports deployment complete, and the hosted worker rejects unauthenticated requests as expected; real-recipient delivery acceptance is pending. See [request notification deployment](docs/request-notifications-deployment.md). Users and staff can explicitly opt in under Account settings.

## Features

- WhatsApp OTP sign-in, profile and business onboarding, reviewed staff access and MFA.
- Real catalogue, Bunny images, market pricing, RFQs, encrypted quotation documents and accepted quotation ordering.
- Tracked inventory, reservation expiry and manual bank transfer claims verified by accounts staff.
- Manual dispatch/delivery, support tickets, encrypted POD/MTC/support documents, in-app and optional opt-in WhatsApp updates, audit/reporting, and operational announcements.
- Phase 8 business stock: FTI/business source dropdown, verified seller listings, encrypted Bunny photos/certificates, MFA review, and private buyer/seller enquiries. The owner reports dashboard deployment complete; both Edge Functions reject unauthenticated requests as expected. Signed-in device acceptance is pending. See [Phase 8 deployment](docs/phase8-deployment.md).

The app does not enable automated refunds, credit, tax/freight calculations, invoices, partial shipment or shipping-policy actions until FTI approves the corresponding rules. See [phase status](docs/phases.md), [Phase 7 deployment](docs/phase7-deployment.md), and [release checklist](docs/release-checklist.md). An earlier Phase 7 `operations` endpoint was live; the newer migrations/functions in this repo still require dashboard deployment and signed-in staging acceptance.

## Verify

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
npm audit --omit=dev --audit-level=high
```

The test suite uses disposable PGlite databases and the committed source blueprint at `supabase/baseline/blueprint.sql`; it creates no remote users or business data. `eas.json` defines preview and production build profiles. Internal Android/iOS builds, backup restore drills, legal review and store submission are release gates, not results of a web export.
