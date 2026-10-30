# Market Rates admin

Open `/admin?section=market-rates` with `staff.access` and `price.manage`, after staff MFA verification. Publishing also requires `price.publish`.

## Setup / upgrading an earlier SQL Editor run

Run the complete contents of `supabase/migrations/202610300010_market_rates_admin.sql` in Supabase SQL Editor, from `begin;` through `commit;`.

The script can be run again. Existing locations, published prices, edited notes and contact details are preserved. Missing objects are added and RPC functions are replaced. The original single-date history function is removed in favour of the date-range function. No rate tables should be dropped.

Deploy the updated `pricing` Edge Function as well. Its staff-only operation list now includes the five `fti_pricing_market_rates_*` operations. This is necessary for requests to reach the new SQL functions. Customer Market Rates screens are outside this change.

## Workflow

Choose Ingot, Scrap, Billet or Old Scrap, then a state and district. Locations are configured per category using “Add a district”. Historical source report rates are not seeded as current prices.

Base price + increase amount = sale price, in INR per metric tonne. Negative adjustments are allowed when the final price stays positive. Publishing uses server time; inputs from the latest rate are carried forward. A review step shows previous and proposed prices. Concurrent changes are rejected until the admin resets and refreshes.

Every publication appends a record containing all three values, location/category, timestamp and staff ID. Published records cannot be edited or deleted through admin or authenticated table access. History filters use inclusive India calendar dates and show every update, rather than daily closing values.

## History exports

Within the selected category/district:

- Export one individual update from its history row.
- Export one day by setting the same From and To date, or use Today.
- Use Last 7 days for today and the previous six India calendar dates.
- Set custom From/To dates and apply the range before exporting.
- All dates exports the entire history for that location.

CSV opens in Excel and includes category, state, district, IST timestamp, base, increase, sale price, record ID, staff ID and UTC timestamp. All matching updates are fetched in one consistent database read, independently of the visible 20-row history page. Exports exceeding 10,000 records are rejected with a request to narrow the range. CSV text is escaped against spreadsheet formula interpretation. Web downloads and native file sharing use existing dependencies.

Notes, support text, SMS numbers and WhatsApp numbers are shared settings for all four categories. Contact updates do not send alerts. Existing notes are preserved on rerunning setup; initial notes and numbers come from the supplied brief.

## Verification

`node node_modules/tsx/dist/cli.mjs --test tests/market-rates.test.ts` checks money calculations, input rejection, staff permissions, history immutability, optimistic concurrency, IST boundaries, complete exports beyond a page, CSV escaping and safe SQL reruns preserving data.

`scripts/market-rates-browser.py` checks a web export in `artifacts/market-rates-preview` with isolated API fixtures at phone and desktop sizes. It does not mutate live Supabase data. Native sharing requires device verification.
