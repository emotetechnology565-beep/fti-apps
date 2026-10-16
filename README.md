# FTI application - Phase 3 catalogue

Expo 57 / React Native / TypeScript application based on the supplied documentation and design references. Identity and business onboarding are deployed for live WhatsApp OTP acceptance. Phase 3 adds server-backed catalogue browse and MFA-protected staff catalogue management. No demo business data is bundled.

## Run

```powershell
cd D:\fti\fti-app
npm ci
npm run web
```

For a static browser preview, run `npm run build`, then `python scripts/serve.py` and open http://localhost:8081. `npm start` starts the mobile development workflow.

## Current behavior

- Responsive navigation with thin Expo Router routes and feature-owned screens, models, hooks and services.
- Server-backed catalogue search, category filters, pagination and product details. The catalogue starts empty; staff add real records and publish them.
- Markets, rates, orders and payments remain empty until their later phases.
- Server-backed personal profiles and business applications; separately scoped local RFQ drafts and preferences; theoretical steel-weight calculator.
- Existing Phase 1 device records preserved under their legacy key but not loaded into authenticated accounts. Each signed-in user has separate draft storage.
- No simulated checkout, dispatch, credit approvals or payment success.
- WhatsApp OTP login through Supabase Auth and a signed Meta delivery hook; session restoration, logout, native SecureStore, protected routes, manual business review with staff MFA, and account deletion requests.
- Server-enforced phone verification, account status, permissions, membership isolation and audited business review. No self-assigned staff roles or automatic credit approval.

The browser preview is a development tool. Android/iOS device behavior and store releases require later device testing. Native bundle exports do not produce an APK or IPA.

## Structure

- `src/app`: routes and root layout.
- `src/core`: providers, SDK configuration, layout and state composition.
- `src/features`: independent business modules with explicit public exports.
- `src/shared`: UI primitives, tokens and pure utilities.
- `tests`: architecture boundaries, dependency cycles, state and calculations.
- `scripts`: local preview and browser regression checks.

See [architecture](docs/architecture.md), [phase delivery status](docs/phases.md), [Phase 2 deployment](deployment/phase2/README.md) and [Phase 3 deployment](deployment/phase3/README.md). Source requirements remain unchanged in `../FTI_Implementation_Documentation_v2`.

## Configuration

`.env.example` lists public Supabase configuration. Never prefix service-role, payment, Bunny or WhatsApp secrets with `EXPO_PUBLIC_`. `.env` is ignored by Git. Adding Supabase credentials does not connect business services automatically. The owner reports applying the original documentation blueprint. The additive Phase 2 migration and functions are not deployed by this implementation. See [dashboard deployment instructions](deployment/phase2/README.md).

## Verification

```powershell
npm run typecheck
npm run lint
npm test
npm run build
# Start the preview server before the browser check:
python scripts/smoke.py
npx expo export --platform android --platform ios --output-dir dist-native
```

Browser checks intercept Supabase requests in an isolated browser; they create no remote users or messages. PostgreSQL tests run against disposable PGlite instances, both clean and with the original blueprint. Signed-hook tests verify forged/expired signatures and provider failures. Reports and screenshots are saved in `test-results`.

Verified: 14 automated tests, 8 browser scenarios, TypeScript, lint, web export, Android/iOS Hermes exports, and Deno type checks for the source and dashboard functions. Hosted deployment, real WhatsApp delivery, native device sessions and staff MFA with a real account remain acceptance steps.

Generate dashboard files with `node scripts/prepare-phase2.mjs`. This copies canonical migration/function sources into `deployment/phase2` without any `.env` values. Private certificate uploads are deferred to the media phase.

The initial dependency audit reported 29 advisories (18 high, 11 moderate) and an optional worklets peer warning. These are existing release-hardening items; no incompatible upgrades were forced during the structural refactor.
