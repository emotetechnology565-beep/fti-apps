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

## Phase 3 - Catalogue: core and Bunny photo add-on deployed; staff acceptance pending

- Server-backed product browse, search, category filtering, detail and pagination.
- MFA-protected admin category/product/variant CRUD, product publication states and database audit entries.
- Product and variant records remain empty until authorized staff adds real catalogue information.
- Additive migration and dashboard deployment files in `deployment/phase3`.

Validation: TypeScript and lint checks. The owner reports the Phase 3 migration and catalogue function deployed. Staff-role acceptance remains pending. The product-photo add-on includes a Bunny upload Edge Function, restricted media metadata migration, staff photo controls and public product-image display. Its dashboard package is in `deployment/catalog-media`. A live public media metadata request returned 200, and the deployed `catalog-media` function returned the expected 401 for an unauthenticated request after Bunny secrets were configured. A read-only request to Bunny's HTTP Storage API with the configured zone credentials returned 200. A real staff upload and public CDN display still need acceptance testing. Private documents and CDN purge remain outside this add-on.

## Phase 4 - Pricing: deployed; staff acceptance pending

- Manual markets and staff-managed rate drafts; no generated or seeded rates.
- Staff MFA and price.manage/price.publish permissions for draft management and publication.
- Atomic immediate publication creates immutable indicative INR versions, revisioned current pointers, audit entries and outbox events.
- Public market rates and bounded historical pages exclude private tiers, future prices, expired current rates, inactive products and inactive markets.
- Explicit expiry, confirmation before publishing, and GST/freight disclosure. No customer-tier prices, automated adjustments, scheduled publication or payable totals.
- Dashboard copies and checksums in deployment/phase4; bundle at deployment/phase4-dashboard.zip.

Validation: database-level tests cover role enforcement, atomic rollback, replay rejection, immutable history, future/expired filtering and tier isolation; full app tests, typecheck, lint and web export. Live public calls to the deployed `pricing` Edge Function returned empty markets and empty rate pages without errors. Staff MFA, draft editing and publication with authorized real accounts still need acceptance testing.

The source decision register still leaves public versus dealer pricing, validity policy, discount behavior, GST, freight and rounding pending. Phase 4 uses public indicative rates with explicit expiry and immediate publication as the initial narrow workflow. Confirm business rules before building firm quotes or checkout.

## Phase 5 - RFQs and quotations: deployed; buyer and staff acceptance pending

- Buyers can submit multi-item RFQs against active published variants, track their requests, view quotation revisions, ask for changes, and accept the latest valid revision once.
- MFA-protected sales staff can claim requests, review details, enter manually approved line prices and totals, and issue numbered revisions. The app does not invent tax, freight or discount policy.
- PDF/JPEG/PNG attachments up to 3 MB are encrypted with AES-256-GCM before storage in the existing Bunny zone. The Edge Function checks authorization before upload or decryption. The public CDN may serve ciphertext only. Supabase stores metadata only; Supabase Storage is not used.
- Additive migrations and dashboard-ready Edge Function files are in `deployment/phase5`; see [deployment instructions](phase5-deployment.md). No sample sales data is inserted.

Validation: isolated database tests cover RFQ ownership, staff MFA, revision freshness, one-time acceptance, and attachment access. Encryption tests cover decryption, path binding and tamper rejection. Typecheck, lint and web export pass. The owner reports applying both migrations and deploying the `sales` and updated `sales-media` functions. Read-only live checks returned the expected 401 from `sales` and the function-level `UNAUTHENTICATED` response from `sales-media`, confirming the encryption configuration now loads. Buyer/staff workflows and real encrypted upload/download still need acceptance testing with authorized accounts.

Quotation acceptance records the buyer decision. Order creation, payment, inventory and final tax/freight reconciliation belong to Phase 6.

## Phase 6 - Quote-based orders and manual payments: implemented; dashboard deployment pending

- Accepted, unexpired quotations can become one order with an immutable price/tax/freight snapshot and a buyer-owned delivery address. Direct cart checkout remains disabled while D01 and D03 are pending.
- Orders reserve real tracked stock atomically. A super-admin must enter an approved reservation duration before ordering; no policy or stock is seeded. MFA order staff can record inventory movements and release expired unpaid reservations.
- Buyers submit a full bank UTR as a claim. MFA accounts staff verify it against the bank statement before an order is confirmed and reserved stock is consumed. There is no gateway charge, partial payment, credit, refund or invoice automation.
- The additive migration and dashboard-ready `commerce` Edge Function are in `deployment/phase6`; see [deployment instructions](phase6-deployment.md).

Validation: database tests cover authorization, policy gating, one-time quote conversion, idempotency, stock reservation and release, manual payment verification and replay rejection. Typecheck, lint, full app tests and web export pass. Live buyer/staff acceptance remains pending after deployment.

## Phase 7 - Operations implementation prepared; updated deployment and acceptance pending

- Manual whole-order dispatch/delivery, buyer support conversations, audit history and bounded daily reports.
- Encrypted private POD/MTC/support documents on the existing Bunny zone; ownership and MFA checks run before upload or download.
- Transactional outbox projection to in-app updates with idempotency, bounded retries, failed-event review and audited replay.
- Optional WhatsApp utility updates with explicit buyer opt-in, Meta template approval checks, service-only worker credentials and manual review for ambiguous provider responses. `fti_order_status_v1` and `fti_support_reply_v1` were submitted to Meta and were PENDING at the last check.
- Staff-authored operational announcements appear on buyer home only after publication. EAS build profiles, CI checks and release evidence checklist are prepared.
- Dashboard update: `deployment/phase7`; see [deployment instructions](phase7-deployment.md) and [release checklist](release-checklist.md). The earlier `operations` function was reachable by a live unauthenticated check, but new migrations/functions and signed-in staging workflows are not yet verified.

Policy-dependent cancellation/refund, credit, invoice, automated tax/freight, partial shipment, PIN/e-way and marketing features remain gated because the owner confirmed their rules are not approved. Android/iOS device UAT, backup restore, production configuration, store submission and owner signoff require external execution. No production completion is claimed.

Business-policy decisions in the source documentation remain pending; Phase 1 does not assume their answers.

## Phase 8 - Business stock selling: deployed; signed-in acceptance pending

- A stock navigation dropdown switches between **FTI stock** and **Business stock**, with separate results and clear ownership labels showing the selling business's name.
- Verified businesses can submit their own available steel stock for sale.
- Listings include material, grade, dimensions, available quantity/unit, asking price, location, photos and certificates using Bunny.
- Sellers manage their listings and availability; FTI staff review submissions before publication.
- Buyers browse approved listings and submit enquiries; sellers track enquiries and mark stock sold or withdraw it.
- The sales model (through FTI or directly between businesses), payment handling, fulfilment, fees and dispute rules must be decided before transaction automation.

Implemented in a dedicated business-stock feature with additive migrations, the `business-stock` and `business-stock-media` Edge Functions, buyer discovery/detail routes, seller workspace, and MFA staff review/oversight. All attachments use encrypted Bunny storage. Published edits require reapproval; expiry, business verification, seller membership and listing state are checked before discovery and enquiries. No demo business data is included. See [Phase 8 scope](phase8-plan.md) and [dashboard deployment](phase8-deployment.md). The owner reports deployment completed on 17 October 2026. Live unauthenticated checks returned function-level HTTP 401 `UNAUTHENTICATED` from both endpoints. These checks prove the functions are reachable and reject anonymous requests; signed-in workflows, database deployment and real Bunny uploads still require acceptance verification.

Validation: 33 local regression tests pass, including Phase 8 database isolation/lifecycle/media permissions, API allowlists/JWT forwarding and Bunny encryption/tamper checks. Eight intercepted-API browser checks pass for source switching, failure/retry recovery, mobile seller editing and uploads, MFA review, seller labels/photos, private enquiries and certificate downloads, and reapproval after changes. Typecheck, lint, web export and Android Hermes export pass. Dashboard source copies, manifest checksums and ZIP entries are verified. Database test concurrency is capped at two to avoid simultaneous embedded-database memory exhaustion.
