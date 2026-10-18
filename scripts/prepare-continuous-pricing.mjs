import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const directory = 'deployment/continuous-pricing';
await mkdir(directory, { recursive: true });
const files = {
  '01_continuous_pricing.sql': 'supabase/migrations/202610180003_continuous_pricing.sql',
  '02_grade_base_pricing.sql': 'supabase/migrations/202610180004_grade_base_pricing.sql',
  '03_pricing.ts': 'supabase/functions/pricing/index.ts',
  'README.md': 'docs/continuous-pricing-deployment.md',
};
const manifest = {};
for (const [name, path] of Object.entries(files)) {
  const content = (await readFile(path, 'utf8')).replace(/^\uFEFF/, '');
  await writeFile(`${directory}/${name}`, content);
  manifest[name] = createHash('sha256').update(content).digest('hex');
}
await writeFile(`${directory}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log('Prepared continuous-pricing SQL and deployment instructions. No credentials or sample prices included.');
