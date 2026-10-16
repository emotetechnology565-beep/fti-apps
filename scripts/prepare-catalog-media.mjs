import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const directory = 'deployment/catalog-media';
await mkdir(directory, { recursive: true });
const read = async path => (await readFile(path, 'utf8')).replace(/^\uFEFF/, '');
const handler = await read('supabase/functions/catalog-media/handler.ts');
const entry = (await read('supabase/functions/catalog-media/index.ts'))
  .replace("import { handleCatalogMedia } from './handler.ts';", '');
const files = {
  'README.md': await read('docs/catalog-media-deployment.md'),
  '01_catalog_media.sql': await read('supabase/migrations/202610160004_catalog_media.sql'),
  '02_catalog.ts': await read('supabase/functions/catalog/index.ts'),
  '03_catalog-media.ts': `${handler}\n${entry}`,
};
const manifest = {};
for (const [name, contents] of Object.entries(files)) {
  await writeFile(`${directory}/${name}`, contents);
  manifest[name] = createHash('sha256').update(contents).digest('hex');
}
await writeFile(`${directory}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log('Prepared catalogue media dashboard files without credentials or sample data.');
