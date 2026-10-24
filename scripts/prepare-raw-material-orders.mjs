import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const folder = 'deployment/raw-material-orders';
await mkdir(folder, { recursive: true });
const files = {
  '01_raw_material_orders.sql': 'supabase/migrations/202610230001_raw_material_orders.sql',
  '02_catalog.ts': 'supabase/functions/catalog/index.ts',
  '03_operations-whatsapp.ts': 'supabase/functions/operations-whatsapp/index.ts',
  'README.md': 'docs/raw-material-orders-deployment.md',
};
const manifest = {};
for (const [name, source] of Object.entries(files)) {
  let body = (await readFile(source, 'utf8')).replace(/^\uFEFF/, '');
  if (source.endsWith('operations-whatsapp/index.ts')) {
    const crypto = (await readFile('supabase/functions/operations-whatsapp/crypto.ts', 'utf8')).replace(/export /g, '');
    body = crypto + '\n' + body.replace(/^import .*from '\.\/crypto\.ts';\r?\n/m, '');
  }
  await writeFile(`${folder}/${name}`, body);
  manifest[name] = createHash('sha256').update(body).digest('hex');
}
const checks = `-- Read-only checks. Run in the FTI Supabase SQL Editor.\nselect template,status,count(*) as messages,min(created_at) as oldest_job\nfrom sales.raw_material_jobs group by template,status order by template,status;\n\n-- This second check requires pg_cron, used by the existing notification schedule.\nselect jobid,jobname,schedule,active from cron.job\nwhere jobname='fti-operations-whatsapp' or command like '%operations-whatsapp%';\n`;
await writeFile(`${folder}/04_delivery_checks.sql`, checks);
manifest['04_delivery_checks.sql'] = createHash('sha256').update(checks).digest('hex');
await writeFile(`${folder}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log('Prepared SQL and single-file dashboard function updates; no credentials included.');
