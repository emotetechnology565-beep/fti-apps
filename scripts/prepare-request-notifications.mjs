import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const directory = 'deployment/request-notifications';
await mkdir(directory, { recursive: true });
const sources = {
  '01_request_notifications.sql': 'supabase/migrations/202610180001_request_notifications.sql',
  '02_operations-whatsapp.ts': 'supabase/functions/operations-whatsapp/index.ts',
  '03_schedule_whatsapp.sql': 'deployment/phase7/09_schedule_whatsapp.sql',
  '04_whatsapp_phone_format.sql': 'supabase/migrations/202610180002_whatsapp_phone_format.sql',
  'README.md': 'docs/request-notifications-deployment.md',
};
const manifest = {};
for (const [name, path] of Object.entries(sources)) {
  const content = (await readFile(path, 'utf8')).replace(/^\uFEFF/, '');
  await writeFile(`${directory}/${name}`, content);
  manifest[name] = createHash('sha256').update(content).digest('hex');
}
await writeFile(`${directory}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log('Prepared request notification deployment files. No credentials included.');
