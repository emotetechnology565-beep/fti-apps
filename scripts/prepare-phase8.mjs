import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const clean = text => text.replace(/^\uFEFF/, '');
const directory = 'deployment/phase8';
await mkdir(directory, {recursive: true});
const files = {
  '01_business_stock.sql': clean(await readFile('supabase/migrations/202610170001_phase8_business_stock.sql','utf8')),
  '02_stock_media.sql': clean(await readFile('supabase/migrations/202610170002_phase8_stock_media.sql','utf8')),
  '03_business-stock.ts': clean(await readFile('supabase/functions/business-stock/index.ts','utf8')),
  '04_business-stock-media.ts': clean(await readFile('supabase/functions/business-stock-media/crypto.ts','utf8')) + '\n' + clean(await readFile('supabase/functions/business-stock-media/index.ts','utf8')).replace(/^import \{ importDocumentKey, openDocument, sealDocument \} from '\.\/crypto\.ts';\s*/, ''),
  'README.md': clean(await readFile('docs/phase8-deployment.md','utf8')),
};
const manifest = {};
for (const [name, content] of Object.entries(files)) {
  await writeFile(`${directory}/${name}`, content);
  manifest[name] = createHash('sha256').update(content).digest('hex');
}
await writeFile(`${directory}/manifest.json`, JSON.stringify(manifest,null,2) + '\n');
console.log('Prepared Phase 8 dashboard files without secrets or business records.');
