import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const directory='deployment/phase2';
await mkdir(directory,{recursive:true});
const read=async path=>(await readFile(path,'utf8')).replace(/^\uFEFF/,'');
const files={
 'README.md':await read('docs/phase2-deployment.md'),
 '01_identity.sql':await read('supabase/migrations/202610150001_phase2_identity.sql'),
 '02_identity.ts':await read('supabase/functions/identity/index.ts'),
 '03_whatsapp-otp.ts':(await read('supabase/functions/whatsapp-otp/handler.ts'))+'\n'+(await read('supabase/functions/whatsapp-otp/index.ts')).replace("import { handleWhatsAppHook } from './handler.ts';",''),
};
const manifest={};
for(const [name,content] of Object.entries(files)){await writeFile(`${directory}/${name}`,content);manifest[name]=createHash('sha256').update(content).digest('hex');}
await writeFile(`${directory}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
console.log('Prepared three dashboard files. No environment variables or credentials included.');
