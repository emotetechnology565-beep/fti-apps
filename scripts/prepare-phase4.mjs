import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const directory = 'deployment/phase4';
await mkdir(directory, { recursive: true });
const files = {
  'README.md': '# Phase 4 - Pricing dashboard deployment\n\nThis package deploys the additive pricing migration and the pricing Edge Function. Apply Phase 2 and Phase 3 first. It creates no markets, prices, products, or sample records.\n\n## 1. Apply SQL\n\nIn Supabase Dashboard, open **SQL Editor**, create a new query, paste the complete contents of 01_phase4_pricing.sql, and run it. Check that it completes without an error.\n\n## 2. Deploy the Edge Function\n\nOpen **Edge Functions**, choose **Deploy a new function**, name it exactly pricing, and paste 02_pricing.ts as its entry point. Deploy it with JWT verification disabled: public reads are checked and writes are verified by the function and again by database permissions.\n\nRequired function defaults are already available: SUPABASE_URL and SUPABASE_ANON_KEY. No custom secrets are needed. Never add a service-role key to the app.\n\n## 3. Grant a staff role\n\nUse the dashboard SQL Editor while signed in with a trusted administrator. Replace the UUID with the actual staff profile auth user ID. This example grants the existing price_manager role; do not run it with a placeholder.\n\n    insert into identity.user_roles(user_id, role_code)\n    values (\'<staff-auth-user-uuid>\', \'price_manager\')\n    on conflict do nothing;\n\nThe staff member must complete staff TOTP MFA. Only price_manager and super_admin receive price.manage and price.publish from this migration.\n\n## 4. Enter real data\n\nCreate approved markets in the staff console, publish real catalogue products and variants in the catalogue section, then save rates with an explicit expiry and review before immediate publication. Rates are public, indicative INR; GST and freight are excluded. No customer-specific rate or checkout total is generated.\n\nThe SQL migration and Edge Function source are also in the archive root. SHA-256 hashes are listed in manifest.json.\n',
  '01_phase4_pricing.sql': (await readFile('supabase/migrations/202610160003_phase4_pricing.sql', 'utf8')).replace(/^\uFEFF/, ''),
  '02_pricing.ts': (await readFile('supabase/functions/pricing/index.ts', 'utf8')).replace(/^\uFEFF/, ''),
};
const manifest = {};
for (const [name, content] of Object.entries(files)) {
  await writeFile(`${directory}/${name}`, content);
  manifest[name] = createHash('sha256').update(content).digest('hex');
}
await writeFile(`${directory}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log('Prepared Phase 4 dashboard files without application data or secrets.');
