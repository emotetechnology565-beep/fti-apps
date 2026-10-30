# Short order references

Apply `supabase/migrations/202610300006_short_order_references.sql` after earlier migrations.

New material requests use `RM-000001`, fastener requests use `FN-000002`, and parts orders use `O-000003`. The number comes from one shared database sequence, so concurrent orders cannot generate the same reference. Gaps are normal after failed transactions. Numbers grow beyond six digits when needed.

Existing references remain unchanged so previously sent WhatsApp messages, documents and customer records remain consistent. New order responses, history and WhatsApp messages all use the shortened reference. Internal UUIDs and replay handling are unchanged.

The migration replaces only the reference-generation expressions in the seven current order submission functions. It fails transactionally if an expected function or expression is missing, preserving any existing validation and grants.

Verify with `node_modules/.bin/tsx --test tests/short-order-references.test.ts`, `npm run typecheck` and `npm run lint`.
