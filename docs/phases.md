# Phase delivery status

Implement one phase at a time. No demo business data in any phase.

## Phase 1 — Foundation: complete

- Feature-owned screens, models, state slices and data boundaries under `src/features`.
- Thin Expo routes under `src/app`; shared UI/theme/utilities and core providers/state/configuration separated.
- Architecture tests enforce import boundaries and detect runtime cycles.
- Empty initial business records and catalogue adapter. Removed bundled products, fabricated rates/market choices, financial balances, fake notifications and simulated commerce mutations.
- Categories derive from catalogue records. Real data integration is deferred to its owning phase.
- Existing device records preserved using the legacy storage key; old orders explicitly unverified. Local draft forms remain available.
- README and architecture documentation updated to describe actual implementation.
- Corrected the local service-role variable to remove its public prefix; generated web/native artifacts checked without exposing the value.

### Verification on 15 October 2026

- TypeScript: passed.
- ESLint, zero warnings: passed.
- Nine architecture/domain/state tests: passed.
- Web export: passed.
- Android and iOS Hermes exports: passed.
- Fourteen browser checks: passed, no uncaught runtime errors; desktop and 390px mobile layouts, navigation, empty states, calculator and user-entered draft persistence.
- Screenshots and browser result: `test-results/`.

Native exports are bundle checks, not installed-device tests or signed APK/IPA builds. Device testing, CI deployment, production configuration and release security validation remain later work. Existing dependency advisories remain documented in README.

The preview used for verification runs at http://localhost:8082 (`python scripts/serve.py --port 8082`). Default preview port remains 8081.

## Phase 2 - Identity: implemented and deployed, acceptance testing in progress

- WhatsApp OTP login with consent, phone validation, resend cooldown and account recovery through the same verified-number flow.
- Session restoration/logout, native SecureStore, account-scoped drafts and server-loaded permissions.
- Personal profiles, business applications with GSTIN/PAN fields and billing/delivery addresses, application status and deletion requests.
- Additive identity migration compatible with the original blueprint; restricted RPCs behind a user-authenticated Edge API.
- Staff reviews require server permissions and TOTP MFA. Decisions are audited; self-review and stale/repeated decisions are rejected.
- Signed Meta WhatsApp Auth Hook with signature checks, provider timeouts and sanitized errors.
- Single-file dashboard copies and checksums in `deployment/phase2`; see [deployment instructions](phase2-deployment.md).

Validation: 14 automated tests, 8 isolated browser scenarios, TypeScript, lint, web/Android/iOS bundle exports, and Deno checks. A live Supabase OTP request was accepted and delivered to the configured WhatsApp number. Native-device session restoration and staff MFA with real accounts still need acceptance testing.

The owner reports applying the additive migration and deploying the Auth functions. The deployed account function is named `Identity`; app calls use this exact name. Private document uploads are deferred to the media phase; business review is manual and does not claim registry validation.

## Phase 3 - Catalogue: core deployed; Bunny photo add-on ready for dashboard deployment

- Server-backed product browse, search, category filtering, detail and pagination.
- MFA-protected admin category/product/variant CRUD, product publication states and database audit entries.
- Product and variant records remain empty until authorized staff adds real catalogue information.
- Additive migration and dashboard deployment files in `deployment/phase3`.

Validation: TypeScript and lint checks. The owner reports the Phase 3 migration and catalogue function deployed. Staff-role acceptance remains pending. The product-photo add-on now includes a Bunny upload Edge Function, restricted media metadata migration, staff photo controls and public product-image display. Its dashboard package is in `deployment/catalog-media`. Live upload verification awaits populated Bunny secrets and add-on deployment. Private documents and CDN purge remain outside this add-on.

## Phase 4 - Pricing: deployed; staff acceptance pending

- Manual markets and staff-managed rate drafts; no generated or seeded rates.
- Staff MFA and price.manage/price.publish permissions for draft management and publication.
- Atomic immediate publication creates immutable indicative INR versions, revisioned current pointers, audit entries and outbox events.
- Public market rates and bounded historical pages exclude private tiers, future prices, expired current rates, inactive products and inactive markets.
- Explicit expiry, confirmation before publishing, and GST/freight disclosure. No customer-tier prices, automated adjustments, scheduled publication or payable totals.
- Dashboard copies and checksums in deployment/phase4; bundle at deployment/phase4-dashboard.zip.

Validation: database-level tests cover role enforcement, atomic rollback, replay rejection, immutable history, future/expired filtering and tier isolation; full app tests, typecheck, lint and web export. Live public calls to the deployed `pricing` Edge Function returned empty markets and empty rate pages without errors. Staff MFA, draft editing and publication with authorized real accounts still need acceptance testing.

The source decision register still leaves public versus dealer pricing, validity policy, discount behavior, GST, freight and rounding pending. Phase 4 uses public indicative rates with explicit expiry and immediate publication as the initial narrow workflow. Confirm business rules before building firm quotes or checkout.

## Later phases - not started

5. RFQs and quotations: multi-item requests, attachments, revisions and acceptance.
6. Orders and payments: inventory, authoritative totals, approved tax/freight rules and reconciliation.
7. Operations: dispatch, support, notifications, reporting, security/UAT and release.

Business-policy decisions in the source documentation remain pending; Phase 1 does not assume their answers.
