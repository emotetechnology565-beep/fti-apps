# Annual rate subscriptions

Implemented: one user, all material categories, INR 1,200 initially, one calendar year, manual renewal only. No recurring Razorpay mandate or subscription is created. Early renewal extends the existing expiry; expired access starts from payment confirmation. Quotations and orders retain their existing access rules.

## Deployment

1. Apply migrations through `202610290003_rate_subscriptions.sql` in order, including `202610290002_public_price_restrictions.sql`. The subscription migration depends on its internal unredacted functions. Do not reapply older price restriction migrations after this migration.
2. Deploy the `subscriptions` Edge Function with `index.ts` and `handler.ts`. Disable gateway JWT verification as specified in `supabase/config.toml`; the handler verifies checkout JWTs through Supabase Auth and webhook bodies through Razorpay HMAC.
3. Development uses **Razorpay Test Mode**. Set **server-only** secrets `RAZORPAY_MODE=test`, `RAZORPAY_KEY_ID=rzp_test_...`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` from the Test Mode dashboard. Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The handler defaults to test mode and rejects mismatched key prefixes; real charges require explicitly setting `RAZORPAY_MODE=live` and live keys. Never put secrets in the client bundle. Use a separate development Supabase project: simulated successful payments grant real application entitlements in the connected database and must not be mixed with production subscriptions.
4. Configure automatic capture in Razorpay **Test Mode**. Register `https://<development-project>.supabase.co/functions/v1/subscriptions?webhook=1` for `payment.captured` and `order.paid`, with the same test webhook secret. Test and live webhook settings are separate. The webhook recovers payments if the browser closes before client confirmation. Unknown orders from other integrations are ignored. Test payments simulate success/failure without moving real money.
5. Set `EXPO_PUBLIC_WEB_APP_URL` to the HTTPS origin of the deployed FTI web app and rebuild mobile/web bundles. Native checkout opens `/account?section=subscription` in the browser. The buyer signs in with the same phone number; no bearer token is passed through the URL. Mobile web browsers use Razorpay checkout directly. Return to the app and refresh; foreground and 30-second refreshes also update access.
6. Sign in as a super administrator, complete MFA and open **Admin → Subscriptions**. Price changes affect subsequently created checkout orders; existing orders retain their snapshot and paid access keeps its expiry. Concurrent stale price edits and stale checkout prices are rejected. The new permission is `subscription.manage`.

## Acceptance checks before live sales

- Test successful, failed and dismissed Razorpay checkout on desktop/mobile web; verify only captured payments unlock rates.
- Close the browser after payment and confirm the signed webhook activates the same user on iOS/Android.
- Retry callback/webhook delivery; confirm no duplicate extension. Attempt wrong-account and tampered-amount/signature requests.
- Test early and expired renewal, blocked accounts, sign-out, and changing accounts. Guests and expired users must receive redacted catalogue data and empty rates/history from the server.
- Change the price in admin; verify refreshed web/native displays and new checkout totals, while pre-existing checkout amounts remain unchanged.
- Confirm the live advertised amount and tax/invoice treatment with FTI before publishing. Checkout charges exactly the configured INR amount; it does not add tax or generate invoices.
- Refunds and disputes are not automated in this phase. Reconcile these operationally and adjust access through a controlled database operation when required. Monitor undelivered webhooks and captured payments that have not been applied; retry signed provider delivery after resolving failures.

## UPI and QR during development

Standard Checkout uses Razorpay's default available methods; this app does not hide UPI or force card-only checkout. Razorpay documents UPI Intent and QR payment testing in Live Mode, not Test Mode. Its newer UPI Collect deprecation guidance also removes manual UPI ID entry from Standard Checkout, so older instructions suggesting `success@razorpay` may not match the methods actually shown for the account. Do not force the deprecated flow or switch development to live keys to make an option appear. Use simulated card/netbanking payments to test activation, renewal and failure handling. Confirm account eligibility and current Test Mode UPI support with Razorpay if UPI is absent. Live mobile intent/desktop QR acceptance remains a separate release check.

References: [Standard Checkout testing](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/), [UPI transition FAQ](https://razorpay.com/docs/payments/payment-methods/upi/faqs/).

## Store distribution requirements

The requested external web checkout is implemented. It is not a claim of App Store or Google Play acceptance. Digital-content purchase links are restricted depending on storefront, enrollment and distribution method. Review the applicable store policy and enrolled programs before shipping this build. If the distribution requires native billing, that integration is still required; this implementation does not include Apple/Google purchase products.

References: [Razorpay integration](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/), [webhook validation](https://razorpay.com/docs/webhooks/validate-test/), [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/), [Google Play payments](https://support.google.com/googleplay/android-developer/answer/9858738).

Local verification does not deploy SQL/functions, configure credentials, charge a payment, or prove live-device acceptance.
