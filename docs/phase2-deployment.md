# Phase 2 dashboard deployment

Target: FTI development/staging project `pumtrpgvpzrxdvyxbwvf`.
These files are prepared and locally tested. They have NOT been applied to the hosted project.
The original `14_PostgreSQL_Schema_Blueprint.sql` is already installed according to the project owner.

## 1. Add the identity migration

In the FTI Supabase dashboard, open SQL Editor, create a new query, paste **01_identity.sql**, and run it once. Save the query as `202610150001_phase2_identity`.

This adds profile/business fields, address handling, permissions and restricted account functions to the original blueprint. It revokes direct client access to identity tables; account access goes through the verified API. It does not create demo users, companies, products or prices. Roles and permission mappings are authorization configuration.

Do not rerun the original full blueprint. The migration is transactional; a failure rolls back its changes. Preserve existing data and investigate errors before proceeding.

## 2. Deploy the account API

In Edge Functions, create a function named exactly **identity** using the editor. Replace its `index.ts` with **02_identity.ts**, then deploy.

Disable the gateway's legacy JWT verification option for this function. The function explicitly verifies the bearer token against Supabase Auth and forwards that same token to restricted database functions; it does not use a service-role key. Browser CORS is supported, and responses are private/no-store.

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are provided by the hosted Edge Function environment. Do not replace them with a service-role key.

## 3. Deploy WhatsApp OTP delivery

Create a function named exactly **whatsapp-otp**. Replace `index.ts` with **03_whatsapp-otp.ts**, then deploy. This file includes its handler; no second editor file is needed.

Disable the gateway's legacy JWT verification option for this function too. It accepts only POST requests carrying a valid, recent Supabase Auth Hook signature. It is not a general message-sending endpoint.

Under Edge Function secrets, configure:

| Secret | Value to supply |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Meta system-user token authorized for your WhatsApp phone number |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta phone-number ID, not the phone number or WhatsApp Business Account ID |
| `WHATSAPP_AUTH_TEMPLATE` | Exact approved AUTHENTICATION template name, with a Copy Code button |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Exact approved template language/locale code |
| `WHATSAPP_GRAPH_VERSION` | Supported Graph API version for your Meta app, including `v`, such as `v23.0` only if supported by your app |
| `SEND_SMS_HOOK_SECRET` | The signing secret generated for the Auth Hook in the next step |

Never add these secrets to an `EXPO_PUBLIC_` variable. The deployment files contain no credentials.

## 4. Connect Supabase Auth to WhatsApp

In Authentication > Hooks, create an HTTP **Send SMS** hook pointing to:

`https://pumtrpgvpzrxdvyxbwvf.supabase.co/functions/v1/whatsapp-otp`

Generate the signing secret and put the same value in `SEND_SMS_HOOK_SECRET`. The handler accepts Supabase's `v1,whsec_...` form. Enable the hook and Phone authentication. Configure a six-digit OTP, expiry appropriate to your approved template, and server-side OTP request/verification rate limits. The app's resend timer is only a usability control, not rate limiting.

The Supabase feature is named “Send SMS”, but this custom hook sends through **Meta WhatsApp**. The app uses Supabase's phone OTP verification flow; no custom OTP database is maintained and no SMS fallback is implemented by the hook. Ensure the hook is enabled before allowing users to request codes.

The template sends the same code in the body and Copy Code button. Provider errors fail the request without logging phone numbers, OTPs or provider credentials. A provider acceptance response does not prove handset delivery; check Meta's delivery status during acceptance testing.

Reference: [Supabase Send SMS Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook).

## 5. Bootstrap the first staff account

First sign in through the app with the intended staff phone and save its personal profile. An authorized project owner must assign its role in SQL Editor. Never use editable Auth user metadata for roles.

Replace the placeholder with the **verified user's actual UUID** before running:

```sql
insert into identity.user_roles(user_id, role_code)
select id, 'super_admin'
from identity.profiles
where id = '<verified-staff-user-uuid>'::uuid
  and account_status = 'active'
on conflict do nothing;
```

No role is assigned automatically. Refresh the account or sign in again. Staff must enroll/verify an authenticator app (TOTP) before reviewing applications. Turn on TOTP MFA in Auth if it has been disabled. Do not approve your own business: database rules reject self-review.

Only super-admin has `business.review` in this phase. Other configured staff roles have `staff.access`; later phases add their business operations. Business verification grants neither staff access nor credit.

## 6. Verify the live integration

1. Request a code on your own WhatsApp number, verify it, reload/reopen the app and confirm the session restores.
2. Save your name and submit a real business application; confirm it remains pending. Supply only legitimate business data.
3. Use a separately authorized staff account with MFA to review the application and confirm the review event is recorded.
4. Verify a buyer cannot open the staff console or call review RPCs. Confirm a second account cannot retrieve the first account's business details.
5. Check invalid/expired OTP, resend limit, provider failure, logout and blocked-account behavior.
6. Verify the deletion request is recorded once; it is a request for staff processing, not immediate erasure.
7. Test Android and iOS session restoration and background/foreground refresh on real devices. SecureStore requires the installed native module/development build.

No real OTP delivery, hosted migration execution, hosted function call or native-device session was validated by the local test suite.

## Phase boundaries and current limits

Company/GSTIN/PAN fields receive format validation only; no government registry verification is claimed. Billing and delivery addresses are supported. Business review is manual and audited. Private certificate uploads/Bunny integration are part of the media phase and are not present here. Updating verified company data requires staff follow-up; a self-service change-review workflow is not included yet. New application lists are limited to the oldest 100 pending records; reviewed records leave the queue.

Guest data and user drafts use separate device storage namespaces. The old Phase 1 workspace remains untouched under its legacy key but is not shown inside authenticated accounts. Roles, business verification status and profiles come from the server. Previously cached native auth tokens are not migrated into the new secure session; sign in again.

To regenerate these files after source changes: `node scripts/prepare-phase2.mjs`. `manifest.json` contains SHA-256 checksums. The canonical migration/functions live under `supabase/`.
