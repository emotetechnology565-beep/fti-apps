Run `supabase/migrations/202610260010_fastener_grade_rates.sql` once in the Supabase SQL Editor, then deploy the updated app. No Edge Function update is required.

Admin: open Fastener dimensions, then Fastener grade prices. Each grade has shared bolt and nut rates in INR/kg. Saving requires catalogue management permission and staff MFA. Concurrent edits are rejected; reload before retrying. Rerunning the SQL preserves edited rates.

Initial rates:
| Grade | Bolts ₹/kg | Nuts ₹/kg |
|---|---:|---:|
| MS | 105 | 110 |
| SPL 8.8 | 125 | 125 |
| SPL 10.9 | 135 | 140 |
| SPL 12.9 | 155 | 160 |

Customers choose a pricing grade after a weight is available. Total estimate = bolt weight × bolt rate + nut weight × nut rate, rounded to two decimal places at the end. For combined assemblies, the bolt-only weight is looked up separately and subtracted from the combined weight to obtain the nut component. Missing or inconsistent component weights suppress pricing.

The rates are shared across bolt and nut categories, independent of drawing standard. Automatic estimates remain limited to supported exact weight matches. Washers do not inherit nut prices. Pricing grade selection does not certify grade availability or change drawing standards. This is an estimate display; it does not set checkout/order prices or add tax/freight. Existing quotation confirmation remains applicable.
