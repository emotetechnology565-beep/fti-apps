# Exclude GST from Sheet MS and Flat

Run `publish.sql` in the project's Supabase SQL Editor as the database administrator.
It recalculates existing MS rates in the Sheet and Flat categories from Base Rate + Vadha,
sets included GST to zero, and corrects the GST flag recorded on new manual requests.
It preserves product/variant IDs, other material rates and historical request snapshots.
Re-running does not remove GST twice. No schema columns or admin fields are added.

Examples (INR per metric tonne): Sheet MS 2 mm becomes 56,200 instead of 66,316;
Flat MS 5 mm becomes 59,000 instead of 69,620.
GST is excluded and will be added during order confirmation.

The app's Sheet/Flat editor and `scripts/publish-sheet-flat-rates.sql` also save exclusive rates.
Existing unconverted prices retain their inclusive labels until this SQL is applied.
This package has been prepared locally; a database publishing connection is not configured.
