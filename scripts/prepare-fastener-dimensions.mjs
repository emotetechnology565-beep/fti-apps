import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import './prepare-hex-publish.mjs';
const root = 'deployment/fastener-dimensions';
mkdirSync(root, { recursive: true });
for (const [from, to] of [
  ['supabase/migrations/202610260001_fastener_dimensions.sql', '01_dimension_library.sql'],
  ['supabase/functions/catalog/index.ts', '03_catalog.ts'],
  ['supabase/migrations/202610260002_drawing_families.sql', '04_drawing_families.sql'],
  ['supabase/migrations/202610260003_fastener_subcategories.sql', '05_fastener_subcategories.sql'],
  ['supabase/migrations/202610260004_fastener_photos.sql', '06_fastener_photos.sql'],
  ['supabase/migrations/202610260005_fastener_shape_mapping.sql', '10_fastener_shape_mapping.sql'],
  ['supabase/migrations/202610260006_fastener_entry_save.sql', '11_fastener_entry_save.sql'],
  ['supabase/migrations/202610260007_coach_screw_tolerances.sql', '12_coach_screw_tolerances.sql'],
  ['supabase/migrations/202610260008_hex_fasteners.sql', '14_hex_fasteners.sql'],
]) writeFileSync(`${root}/${to}`, readFileSync(from));
const files = ['01_dimension_library.sql', '02_scan_drafts.sql', '03_catalog.ts', '04_drawing_families.sql', '05_fastener_subcategories.sql', '06_fastener_photos.sql', '07_publish_assigned_photos.sql', '08_add_fastener_entries.sql', '09_delete_old_imports.sql', '10_fastener_shape_mapping.sql', '11_fastener_entry_save.sql', '12_coach_screw_tolerances.sql', '13_coach_screw_table.sql', '14_hex_fasteners.sql', '15_hex_table_drafts.sql', '15_hex_table_publish.sql', 'hex-source-definitions.json', 'source-definitions.json'];
writeFileSync(`${root}/manifest.json`, JSON.stringify(files.map(file => ({ file, sha256: createHash('sha256').update(readFileSync(`${root}/${file}`)).digest('hex') })), null, 2) + '\n');
console.log(`Prepared ${root}`);
