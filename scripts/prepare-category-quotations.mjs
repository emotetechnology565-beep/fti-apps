import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const folder = 'deployment/category-quotations';
await mkdir(folder, { recursive: true });
const files = {
  '01_category_quotation_pdfs.sql': 'supabase/migrations/202610210003_category_quotation_pdfs.sql',
  '02_sales.ts': 'supabase/functions/sales/index.ts',
  '03_sales-media.ts': 'supabase/functions/sales-media/index.ts',
  '04_operations-whatsapp.ts': 'supabase/functions/operations-whatsapp/index.ts',
  'README.md': 'docs/category-quotations-deployment.md',
};
const manifest = {};
for (const [name, source] of Object.entries(files)) {
  let body = (await readFile(source, 'utf8')).replace(/^\uFEFF/, '');
  if (/sales-media\/index|operations-whatsapp\/index/.test(source)) {
    const crypto = (await readFile(source.replace('index.ts', 'crypto.ts'), 'utf8')).replace(/export /g, '');
    body = crypto + '\n' + body.replace(/^import .*from '\.\/crypto\.ts';\r?\n/m, '');
  }
  await writeFile(`${folder}/${name}`, body);
  manifest[name] = createHash('sha256').update(body).digest('hex');
}
for (const name of ['template-draft.json', 'sample-quotation.pdf']) {
  manifest[name] = createHash('sha256').update(await readFile(`${folder}/${name}`)).digest('hex');
}
await writeFile(`${folder}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log('Prepared category quotation deployment files. No credentials included.');
