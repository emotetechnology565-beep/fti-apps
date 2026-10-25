# TMT rates from the supplied sheet

Ready to publish: **10 brands × 7 sizes = 70 rates** in INR per metric tonne.
Sizes: 8, 10, 12, 16, 20, 25 and 32 mm. SUPER 600 XT is completely omitted.

Net price = basic rate + rolling + profile + loading.
GST and freight are excluded. Both will be added during order confirmation.
The rounded yellow selling-price column is not imported because it includes excluded charges.

`rates.csv` and `rates.json` contain the transcribed components and calculated net rates for review.
For ZARA TMT, the base is 41,500 for 8/10 mm and 41,400 for the other sizes.
Rolling is 8,000 for 8/32 mm and 6,000 otherwise. Profile is 2,000 and loading is 475.
The minimum order is 1 MT, following the existing category-list default.

Run the complete `publish.sql` in the project's **Supabase SQL Editor** as the database administrator.
This updates only the listed TMT brand SKUs, publishes products and connects the existing size/grade filters.
Re-running preserves existing variant IDs. Other catalogue records remain intact.
No database columns or admin fields are added. Cost components stay in the import source;
the customer catalogue receives base/net prices and the separate exclusion disclosure.

Regenerate the package with `python scripts/prepare-tmt-rates.py`.

Live publication has not been performed from this workspace: the configured service key cannot
write the private catalogue schema, and no database management connection is configured.
