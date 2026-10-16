# Phase 6 — quote-based orders and manual bank review

This phase converts the latest accepted, unexpired quotation into one order. It snapshots the staff-approved prices, GST and freight, checks the buyer's delivery address, reserves tracked stock atomically, and records an outbox event. A buyer may submit a bank UTR for full-payment review; an MFA accounts user must verify the actual bank statement before confirming payment and consuming the reservation. No gateway charge, partial payment, credit, refund, invoice, or direct cart checkout is enabled while the corresponding FTI decisions remain pending.

No business records, inventory, stock locations, policy values, orders, or payments are seeded. The initial order policy is empty, so order placement is blocked until an authorized super-admin enters an approved reservation duration in the staff console. This prevents the app from inventing a stock-hold period.

## Dashboard deployment

1. Confirm the baseline schema and Phases 2, 3 and 5 are deployed. In Supabase SQL Editor, run the complete `01_commerce.sql` from `deployment/phase6` once. The migration adds restricted RPCs, policy, permissions and indexes. It does not change existing order or payment records.
2. In Edge Functions, create **`commerce`** using `02_commerce.ts`. Disable dashboard JWT verification for this function. It verifies the bearer token with Supabase Auth and all write permissions are enforced again in PostgreSQL. Supabase's default `SUPABASE_URL` and `SUPABASE_ANON_KEY` are sufficient; add no payment or service-role secret to the app.
3. Grant real staff users the existing `order_manager` and `accounts` roles through the approved role process. `order_manager` can manage stock and release expired reservations; `accounts` can review bank claims. `super_admin` can set the reservation policy. All staff actions require TOTP MFA.
4. Have FTI operations approve a reservation duration from 1 to 168 hours. A super-admin enters that duration in the staff console. Then create real stock locations and record verified stock receipts. Until these steps, quote-to-order correctly fails with a policy or stock message.

## Acceptance checks

- Buyer accepts an unexpired quotation, selects or creates a delivery address, and places an order. Repeating the same request ID and body returns the same order; changing the body or attempting to convert the quote again fails. The order total must match the quotation snapshot exactly.
- Two requests competing for the same tracked stock cannot both reserve more than available. Inventory adjustments cannot reduce on-hand below reserved stock.
- Buyer submits a real UTR only after transferring to FTI-supplied bank details. The app records a **claim awaiting review**, not a successful payment. A different UTR cannot replace an active claim.
- MFA accounts staff independently checks the bank statement, records a note, and approves or rejects. Approval once confirms the order, reduces on-hand and reserved stock, and records a movement. A repeated decision fails.
- MFA order staff runs the expired-reservation release. It cancels unpaid orders and releases stock; claims still awaiting bank review are excluded for manual resolution.
- Another buyer cannot read the order, and unauthenticated users cannot use the RPCs. No client has direct write access to commerce tables.

Until FTI approves D01, D03–D06 and gateway onboarding, direct cart checkout, automatically calculated GST, partial/advance payments, refunds and credit remain outside this narrow Phase 6 flow. The bank reference screen contains no bank-account details; FTI must provide them through an approved channel. Reservation release is a staff action in this phase; scheduling and operational automation belong to Phase 7.
