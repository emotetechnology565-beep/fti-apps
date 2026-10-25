# Raw Materials → Square → Square Bar

Run `publish.sql` in Supabase SQL Editor as the database administrator, after the material-selection migration.
It publishes one Square Bar product in the existing `square` raw-material category,
with 40 sizes from 10 × 10 through 150 × 150 mm and MS / Alloy options.
All 80 variants request a quotation because both rate columns in the source are blank.
The minimum order is the catalogue default of 1 MT; confirm availability and grade when quoting.

Source cross-sectional areas (mm²) and approximate weights (kg/m) are retained as printed.
The app shows the chart when selecting Square under Raw Materials and on Square product pages.
Size/grade selection uses the existing catalogue filters. No database or admin columns are added.
Re-running preserves variant IDs and any prices subsequently entered by staff.

Data: `src/features/catalog/data/square-bar-sizes.json`.
Source image: `docs/square-bar-sizes-source.png`.
Regenerate the import with `python scripts/prepare-square-bars.py`.

Prepared and tested locally. Live publication requires a database publishing connection,
which is not configured in this workspace.
