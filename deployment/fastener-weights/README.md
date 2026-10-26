# Approximate weight

## Manual Edge Function deployment

1. In project `pumtrpgvpzrxdvyxbwvf`, open **SQL Editor** and run the small SQL
   files individually: `01_setup.sql`, then `02_import_part_01.sql` through
   `02_import_part_14.sql`, then `03_verify.sql`. Each file is under 80 KB.
   Replace the editor contents for each run; do not combine them into one query.
   The final result should show `import_complete = true`, `total_rows = 4925`,
   `charts = 26`, `numeric_weights = 4924`, and `review_rows = 1`.
2. Open **Edge Functions**, create a function named **fastener-weight** using
   the Dashboard editor, and replace `index.ts` with the complete contents of
   `fastener-weight.ts` in this folder. It is a standalone file with no imports.
3. Deploy it with **Verify JWT** disabled. This endpoint intentionally exposes only
   approximate weights, matching the catalogue. It uses the built-in
   `SUPABASE_URL` and `SUPABASE_ANON_KEY` and the table's read-only policy;
   no service-role secret needs to be pasted into the function.
4. In the function's Test panel, send POST with this JSON body:

```json
{
  "chart": "01 Half bolts+nuts Metric 1",
  "rowLabel": "16mm",
  "columnLabel": "DIAMETER / M 5",
  "quantity": 100
}
```

Expected: status 200, `unitWeightKg: 0.00448`, `unit: "kg/piece"`, and
`totalWeightKg` approximately `0.448`. Floating-point totals may contain extra digits.

Endpoint: `https://pumtrpgvpzrxdvyxbwvf.supabase.co/functions/v1/fastener-weight`.

For rods, use `chart: "16 Threaded rods"`, `rowLabel: "M2"`,
`columnLabel: "Weight per Metre"`, and optionally `lengthM: 2`.
Without length, a rod match returns its kg/metre value and `totalWeightKg: null`.
Quantity defaults to 1. Other charts reject `lengthM` to prevent double-counting.
Unknown sizes and the malformed source entry return 404; ambiguous entries return
409; missing SQL setup or database failure returns 503. There is no fuzzy matching.

App invocation (after deployment):

```ts
const { data, error } = await supabase.functions.invoke('fastener-weight', {
  body: {
    chart: '01 Half bolts+nuts Metric 1',
    rowLabel: '16mm',
    columnLabel: 'DIAMETER / M 5',
    quantity: 100,
  },
});
```

Regenerate the standalone function after handler changes with
`node scripts/prepare-fastener-weight-function.mjs`.
Dashboard deployment documentation: https://supabase.com/docs/guides/functions/quickstart-dashboard

## Database import

4,925 records across 26 charts; 4,924 numeric weights and one retained review record
(`18.6.` at workbook row 4698). Published weights are approximate.

For SQL Editor, use `01_setup.sql`, the 14 `02_import_part_*.sql` files, and
`03_verify.sql` in that order. The setup creates the reference table, read-only
access policies and indexed lookup function. Each data part commits independently.
If a part fails, fix the reported error and rerun that part before continuing.
Every part can be rerun without creating duplicate records. The ordered file list
and exact sizes are recorded in `sql-editor-files.json`.

`publish.sql` remains available for database clients that accept larger scripts;
it is about 1.1 MB and can exceed the SQL Editor's query size limit.
This package does not change product prices.

Regenerate with `python scripts/prepare-fastener-weights.py` (requires openpyxl).
The importer is specific to this workbook's All Values layout. Preserve that layout
and row identity when regenerating; a replacement/reordered source requires review.

Exact lookup from SQL:

```sql
select * from public.fti_fastener_weight_lookup(
  '01 Half bolts+nuts Metric 1', '16mm', 'DIAMETER / M 5'
);
```

From the existing app Supabase client:

```ts
const { data, error } = await supabase.rpc('fti_fastener_weight_lookup', {
  p_chart: '01 Half bolts+nuts Metric 1',
  p_row_label: '16mm',
  p_column_label: 'DIAMETER / M 5',
});
```

Use exact chart/axis labels from the workbook (or query the reference table for
available labels). Row and column meanings vary by chart: some use length across
columns, others diameter. Lookup returns all exact matches, never an arbitrary
first row or nearest size. Empty results mean no verified published value.
Keep the chart selected to distinguish standards and bolts with/without nuts.

`weight_kg_per_piece` converts per-100 values by dividing by 100; per-piece values
remain unchanged. Rods have only `weight_kg_per_metre`; multiply that by length in
metres before applying quantity. The published label is **Approximate weight**.
No source name or website is included in the SQL data or Edge Function responses.
The malformed source value is queryable for review but excluded from the lookup.

Service-role REST access can read/write an existing table, but cannot create this
schema or function. If the table is absent, apply SQL using SQL Editor or an
authorized database/management connection first. Never put the service key in the app.
