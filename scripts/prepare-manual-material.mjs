import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const folder = 'deployment/manual-material';
await mkdir(folder, { recursive: true });
const files = {
  '01_manual_material_requests.sql': 'supabase/migrations/202610250001_manual_material_requests.sql',
  '02_supabase_queues.sql': 'supabase/migrations/202610250002_raw_material_supabase_queues.sql',
  '03_catalog.ts': 'supabase/functions/catalog/index.ts',
  'README.md': 'docs/manual-material-deployment.md',
};
const manifest = {};
for (const [name, source] of Object.entries(files)) {
  const body = (await readFile(source, 'utf8')).replace(/^\uFEFF/, '');
  await writeFile(`${folder}/${name}`, body);
  manifest[name] = createHash('sha256').update(body).digest('hex');
}
const checks = `-- Read-only hosted checks, after applying both migrations.
select extversion from pg_extension where extname='pgmq';
select * from pgmq.metrics('fti_raw_material_buyer');
select * from pgmq.metrics('fti_raw_material_staff');
select template,status,count(*) from sales.raw_material_jobs group by template,status order by template,status;
select count(*) as pending_without_queue from sales.raw_material_jobs where status='pending' and queue_message_id is null;
select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('fti_catalog_manual_preview','fti_catalog_manual_request_submit','fti_raw_material_claim','fti_raw_material_finish');
`;
await writeFile(`${folder}/04_verify.sql`, checks);
manifest['04_verify.sql'] = createHash('sha256').update(checks).digest('hex');
await writeFile(`${folder}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log('Prepared manual-entry and Supabase Queues dashboard bundle; no credentials included.');
