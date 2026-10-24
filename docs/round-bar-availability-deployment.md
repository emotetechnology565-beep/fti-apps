# Round bar size and grade availability

Apply `supabase/migrations/202610240001_round_bar_availability.sql` in the Supabase SQL editor after the existing migrations through `202610230001_raw_material_orders.sql`. Run the whole file as one transaction, then release the updated application.

Both As Rolled Round Bar and Round Bright Bar use the supplied 36 sizes and the 34 grades in the latest price sheet. This includes SAE-4130, SAE-4140, SAE-8620, SCM-420, SCM-435 and ST-52.3. MS and the FE grades are absent from this sheet and are excluded from these two categories. Size 19 mm is absent from the supplied size list; it remains available to other categories where configured.

Existing priced variants, price components, size additions and historical IDs stay intact. The migration deactivates excluded grades and removes them from these two private grade sheets. Missing size/grade pricing gets a separate request-quote option with an explicit size list and no fabricated price. Publishing either grade sheet refreshes those options. Customers select a size and grade before viewing the matching price or quote request.

The migration is rerunnable. It updates the catalogue filter and raw-material submission RPCs without changing their signatures, permissions or request delivery behavior. It requires existing round bar grade sheets; if either category has no sheet, create and publish its sheet to initialize the availability options.

Validation:

```powershell
$env:ROUND_BAR_BROWSER_FIXTURE='1'
node --import tsx --test tests/round-bar-availability-db.test.ts
python C:/Users/rahul/.agents/skills/webapp-testing/scripts/with_server.py --server "python scripts/serve.py --port 8141" --port 8141 -- python scripts/round-bar-availability-browser.py 8141
```

Build the web app with `npm run build` before running the browser check. Browser requests are mocked using fixtures produced by the database test; this check does not apply the migration to a hosted database.
