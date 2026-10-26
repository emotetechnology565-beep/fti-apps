import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import {
  definitionSchema,
  normalizeStandard,
} from '../src/features/drawings/model/validation';
import { drawingSvg } from '../src/features/drawings/model/render';
import { hexThreadLength } from '../src/features/drawings/model/hex-render';
import type { DrawingDefinition } from '../src/features/drawings/model/types';
import { drawingFamily } from '../src/features/drawings/model/types';
import {
  fastenerSubcategories,
  additionalSubcategories,
  drawingSubcategory,
} from '../src/features/drawings/model/subcategories';

const source = JSON.parse(
  readFileSync(
    'deployment/fastener-dimensions/source-definitions.json',
    'utf8',
  ),
) as DrawingDefinition[];
const hexSource = JSON.parse(
  readFileSync(
    'deployment/fastener-dimensions/hex-source-definitions.json',
    'utf8',
  ),
) as DrawingDefinition[];

test('IS 1364 precision table renders all sizes with separate limits', () => {
  const rows = JSON.parse(
    readFileSync(
      'deployment/fastener-dimensions/hex-1364-source-definitions.json',
      'utf8',
    ),
  ) as DrawingDefinition[];
  assert.equal(rows.length, 60);
  for (const row of rows) {
    definitionSchema.parse(row);
    const svg = drawingSvg(row, { length: 120 });
    assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
    assert.match(svg, /IS 1364:1967/);
  }
  const bolt = rows.find(
    (row) => row.shape === 'hex-bolt' && row.size === 'M6',
  )!;
  assert.equal(bolt.dimensions.diameter_min, 5.794);
  assert.deepEqual(
    [130, 131, 200, 201].map((length) => hexThreadLength(bolt, length)),
    [18, 24, 24, 37],
  );
  const screw = rows.find(
    (row) => row.shape === 'hex-screw' && row.size === 'M39',
  )!;
  assert.equal(hexThreadLength(screw, 120), 106);
});

test('1992 table retains its own limits and 125 mm thread boundary', () => {
  const rows = JSON.parse(
    readFileSync(
      'deployment/fastener-dimensions/hex-1992-source-definitions.json',
      'utf8',
    ),
  ) as DrawingDefinition[];
  assert.equal(rows.length, 60);
  for (const row of rows) {
    definitionSchema.parse(row);
    assert.doesNotMatch(
      drawingSvg(row, { length: 120 }),
      /NaN|Infinity|undefined/,
    );
  }
  const bolt = rows.find(
    (row) => row.shape === 'hex-bolt' && row.size === 'M10',
  )!;
  assert.equal(bolt.dimensions.head_width, 16);
  assert.deepEqual(
    [125, 126, 200, 201].map((length) => hexThreadLength(bolt, length)),
    [26, 32, 32, 45],
  );
  assert.equal(rows.filter((row) => row.shape === 'hex-screw').length, 15);
});

test('hex table covers the printed size ranges and thread rule boundaries', () => {
  assert.equal(hexSource.length, 55);
  for (const row of hexSource) {
    definitionSchema.parse(row);
    const svg = drawingSvg(row, { length: 120 });
    assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
    assert.match(svg, /IS 1363:1967/);
    assert.equal(
      (svg.match(/data-part="nut"/g) ?? []).length,
      row.shape === 'hex-nut' || row.shape === 'lock-nut' ? 1 : 0,
    );
  }
  const bolt = hexSource.find(
    (row) => row.shape === 'hex-bolt' && row.size === 'M6',
  )!;
  const boltView = drawingSvg(bolt, { length: 120 });
  for (const view of ['end', 'side', 'washer-face-option'])
    assert.match(boltView, new RegExp(`data-view="${view}"`));
  for (const dimension of ['L', 'b', 'k', 'd', 's', 'e'])
    assert.match(boltView, new RegExp(`data-dimension="${dimension}"`));
  assert.match(boltView, /thread-convention/);
  const nutView = drawingSvg(
    hexSource.find((row) => row.shape === 'hex-nut')!,
    { length: 0 },
  );
  for (const view of ['alternate-side', 'full-bearing-side', 'end'])
    assert.match(nutView, new RegExp(`data-view="${view}"`));
  assert.match(nutView, /fill="url\(#hatch\)"/);
  assert.equal(bolt.dimensions.diameter_min, 5.694);
  assert.deepEqual(
    [130, 131, 200, 201].map((length) => hexThreadLength(bolt, length)),
    [18, 24, 24, 37],
  );
  assert.throws(() => drawingSvg(bolt, { length: 10 }), /at least/);
  const screw = hexSource.find(
    (row) => row.shape === 'hex-screw' && row.size === 'M24',
  )!;
  assert.equal(hexThreadLength(screw, 100), 89);
  assert.equal(
    hexSource.some((row) => row.shape === 'hex-screw' && row.size === 'M27'),
    false,
  );
  assert.throws(() =>
    definitionSchema.parse({ ...bolt, subcategory: 'heavy-hex-bolt' }),
  );
});
test('source definitions validate and every template draws without unsafe markup or missing nuts', () => {
  assert.equal(drawingFamily({ shape: 'l' }), 'roofing');
  assert.equal(fastenerSubcategories.length, 15);
  assert.equal(
    drawingSubcategory({ shape: 'j-ii', subcategory: 'j-hook' }),
    'j-hook',
  );
  assert.equal(
    drawingFamily({ shape: 'l', family: 'foundation' }),
    'foundation',
  );
  assert.equal(source.length, 24);
  for (const row of source) {
    definitionSchema.parse(row);
    const svg = drawingSvg(row, {
      length: row.dimensions.lengths[0] ?? 120,
      width: row.dimensions.widths[0],
      radius: 25,
      returnHeight: 60,
      angle: 25,
    });
    assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
    assert.equal(
      (svg.match(/data-part="nut"/g) ?? []).length,
      row.shape === 'coach' ? 0 : row.shape.startsWith('u-') ? 2 : 1,
    );
  }
  const row = source.find((r) => r.shape === 'j-i')!;
  assert.notEqual(
    drawingSvg(row, { length: 120, angle: 25 }),
    drawingSvg(row, { length: 120, angle: 40 }),
  );
  assert.throws(() => drawingSvg(row, { length: 999 }), /listed/);
  assert.throws(() => drawingSvg(row, { length: 120, angle: 0 }), /angle/);
  assert.throws(
    () =>
      drawingSvg(
        source.find((r) => r.shape === 'j-ii')!,
        { length: 120, radius: 25, returnHeight: 10 },
      ),
    /Return height/,
  );
  assert.throws(() =>
    definitionSchema.parse({
      ...row,
      dimensions: { ...row.dimensions, diameter: -1 },
    }),
  );
  assert.match(
    drawingSvg({ ...row, size: '<script>alert(1)</script>' }, { length: 120 }),
    /&lt;script&gt;/,
  );
  assert.deepEqual(normalizeStandard('is730:1978'), {
    standard: 'IS 730',
    edition: '1978',
  });
  assert.equal(normalizeStandard('IS 730 garbage'), null);
});

test('dimension database guards MFA, draft privacy, atomic publication, withdrawal and stale edits', async () => {
  const db = new PGlite();
  const staff = '00000000-0000-0000-0000-000000000001',
    buyer = '00000000-0000-0000-0000-000000000002';
  const value = async <T>(sql: string, args: unknown[] = []) =>
    (await db.query<{ data: T }>(sql, args)).rows[0].data;
  const asUser = async (id: string, aal = 'aal2') => {
    await db.exec('reset role');
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
      [id, JSON.stringify({ aal })],
    );
    await db.exec('set role authenticated');
  };
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
      create table auth.users(id uuid primary key,phone text,phone_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      grant usage on schema auth to anon,authenticated;`);
    await db.exec(
      readFileSync('supabase/baseline/blueprint.sql', 'utf8').replace(
        'create extension if not exists pgcrypto;',
        '',
      ),
    );
    for (const file of [
      '202610150001_phase2_identity.sql',
      '202610160001_phase3_catalog.sql',
      '202610260001_fastener_dimensions.sql',
      '202610260002_drawing_families.sql',
      '202610260003_fastener_subcategories.sql',
      '202610160004_catalog_media.sql',
      '202610260004_fastener_photos.sql',
      '202610260005_fastener_shape_mapping.sql',
      '202610260006_fastener_entry_save.sql',
      '202610260007_coach_screw_tolerances.sql',
      '202610260008_hex_fasteners.sql',
    ])
      await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
    await db.exec(
      `insert into auth.users values('${staff}','+910000000001',now()),('${buyer}','+910000000002',now());`,
    );
    await asUser(staff);
    await value('select public.fti_identity_me() as data');
    await asUser(buyer);
    await value('select public.fti_identity_me() as data');
    await db.exec('reset role');
    await db.exec(
      `insert into identity.user_roles values('${staff}','super_admin');`,
    );
    await db.exec(
      readFileSync('deployment/fastener-dimensions/02_scan_drafts.sql', 'utf8'),
    );
    await db.exec('set role anon');
    assert.deepEqual(
      await value('select public.fti_catalog_drawing_list() as data'),
      [],
    );
    await assert.rejects(
      value('select public.fti_catalog_drawing_admin() as data'),
    );
    await assert.rejects(db.exec('select * from catalog.drawing_definitions'));
    await asUser(buyer);
    await assert.rejects(
      value('select public.fti_catalog_drawing_admin() as data'),
      /Permission/,
    );
    await asUser(staff, 'aal1');
    await assert.rejects(
      value('select public.fti_catalog_drawing_admin() as data'),
      /MFA/,
    );
    await asUser(staff);
    const drafts = await value<DrawingDefinition[]>(
      'select public.fti_catalog_drawing_admin() as data',
    );
    assert.equal(drafts.length, 24);
    await db.exec('reset role');
    const entryCategory = await value<string>(
      "insert into catalog.categories(slug,name) values('fastener-entry-test','Fastener entries') returning id as data",
    );
    await asUser(staff);
    const entry = await value<string>(
      'select public.fti_catalog_product_upsert($1,$2) as data',
      [
        JSON.stringify({
          category_id: entryCategory,
          slug: 'u-bolt-entry-test',
          name: 'U bolt',
          product_kind: 'fastener',
          purchase_mode: 'rfq',
        }),
        '[]',
      ],
    );
    await db.exec('reset role');
    assert.equal(
      await value<number>(
        'select count(*)::int as data from catalog.product_variants where product_id=$1',
        [entry],
      ),
      0,
    );
    await asUser(staff);
    await assert.rejects(
      value('select public.fti_catalog_product_upsert($1,$2) as data', [
        JSON.stringify({
          category_id: entryCategory,
          slug: 'steel-no-variant',
          name: 'Steel bar',
          product_kind: 'steel',
          purchase_mode: 'rfq',
        }),
        '[]',
      ]),
    );
    const original = drafts.find((r) => r.shape === 'j-i')!;
    const published = await value<DrawingDefinition>(
      'select public.fti_catalog_drawing_publish($1,$2,true) as data',
      [original.id, 1],
    );
    assert.equal(published.revision, 2);
    assert.equal(
      (
        await value<DrawingDefinition[]>(
          'select public.fti_catalog_drawing_list() as data',
        )
      )[0].revision,
      2,
    );
    const changed = {
      ...original,
      dimensions: { ...original.dimensions, diameter: 7 },
    };
    await assert.rejects(
      value('select public.fti_catalog_drawing_save($1,$2,$3) as data', [
        original.id,
        1,
        JSON.stringify(changed),
      ]),
      /changed/,
    );
    const saved = await value<DrawingDefinition>(
      'select public.fti_catalog_drawing_save($1,$2,$3) as data',
      [original.id, 2, JSON.stringify(changed)],
    );
    assert.equal(saved.revision, 3);
    assert.equal(
      (
        await value<DrawingDefinition[]>(
          'select public.fti_catalog_drawing_list() as data',
        )
      )[0].dimensions.diameter,
      original.dimensions.diameter,
    );
    await assert.rejects(
      value('select public.fti_catalog_drawing_publish($1,2,true) as data', [
        original.id,
      ]),
      /changed/,
    );
    await assert.rejects(
      value('select public.fti_catalog_drawing_save($1,3,$2) as data', [
        original.id,
        JSON.stringify({
          ...changed,
          dimensions: { diameter: -1, widths: [], lengths: [] },
        }),
      ]),
    );
    await value(
      'select public.fti_catalog_drawing_publish($1,3,true) as data',
      [original.id],
    );
    assert.equal(
      (
        await value<DrawingDefinition[]>(
          'select public.fti_catalog_drawing_list() as data',
        )
      )[0].dimensions.diameter,
      7,
    );
    await value(
      'select public.fti_catalog_drawing_publish($1,4,false) as data',
      [original.id],
    );
    assert.deepEqual(
      await value('select public.fti_catalog_drawing_list() as data'),
      [],
    );
    await db.exec('reset role');
    assert.equal(
      await value<number>(
        "select count(*)::int as data from platform.audit_logs where resource_type='drawing_definition'",
      ),
      4,
    );
    await asUser(staff);
    await assert.rejects(
      value('select public.fti_catalog_drawing_save(null,null,$1) as data', [
        JSON.stringify({ ...original, family: 'foundation' }),
      ]),
    );
    const foundation = await value<DrawingDefinition>(
      'select public.fti_catalog_drawing_save(null,null,$1) as data',
      [
        JSON.stringify({
          ...original,
          standard: 'IS 9999',
          family: 'foundation',
        }),
      ],
    );
    assert.equal(foundation.family, 'foundation');
    assert.deepEqual(
      await value('select public.fti_catalog_drawing_list() as data'),
      [],
    );
    await db.exec('reset role');
    await db.exec(
      readFileSync('deployment/fastener-dimensions/02_scan_drafts.sql', 'utf8'),
    );
    assert.equal(
      await value<number>(
        'select count(*)::int as data from catalog.drawing_definitions',
      ),
      25,
    );
    await asUser(staff);
    const jHook = await value<DrawingDefinition>(
      'select public.fti_catalog_drawing_subcategory_save(null,null,$1) as data',
      [JSON.stringify({ ...original, subcategory: 'j-hook' })],
    );
    assert.equal(jHook.subcategory, 'j-hook');
    assert.notEqual(jHook.id, original.id);
    const changedCategory = await value<DrawingDefinition>(
      'select public.fti_catalog_drawing_subcategory_save($1,1,$2) as data',
      [
        jHook.id,
        JSON.stringify({
          ...jHook,
          subcategory: 'j-hook',
          dimensions: { ...jHook.dimensions, diameter: 9 },
        }),
      ],
    );
    assert.equal(changedCategory.subcategory, 'j-hook');
    await assert.rejects(
      value(
        'select public.fti_catalog_drawing_subcategory_save($1,2,$2) as data',
        [
          jHook.id,
          JSON.stringify({ ...changedCategory, subcategory: 'square-washer' }),
        ],
      ),
    );
    await asUser(buyer);
    await assert.rejects(
      value(
        'select public.fti_catalog_drawing_subcategory_save($1,2,$2) as data',
        [jHook.id, JSON.stringify(changedCategory)],
      ),
      /Permission/,
    );
    // Photo cards publish independently of product publication or stock variants.
    await db.exec('reset role');
    await db.exec(
      "insert into catalog.categories(slug,name) values('photo-test-category','Photo test category')",
    );
    const product = await value<string>(
      "insert into catalog.products(category_id,slug,name,product_kind,status) select id,'photo-test','Photo Test','fastener','draft' from catalog.categories limit 1 returning id as data",
    );
    const categoryExists = product;
    assert.ok(categoryExists);
    const photo = await value<string>(
      "insert into platform.media_assets(entity_type,entity_id,object_key,mime_type,size_bytes,visibility,upload_status,cdn_url) values('product',$1,'photo-test.jpg','image/jpeg',100,'public','verified','https://example.com/photo-test.jpg') returning id as data",
      [product],
    );
    await db.exec('set role anon');
    assert.deepEqual(
      await value('select public.fti_catalog_fastener_photos() as data'),
      [],
    );
    await db.exec('reset role');
    const setupEntries = readFileSync(
      'deployment/fastener-dimensions/08_add_fastener_entries.sql',
      'utf8',
    );
    await db.exec(setupEntries);
    await db.exec(setupEntries);
    for (const category of [
      ...fastenerSubcategories,
      ...additionalSubcategories,
    ]) {
      const entry = await value<{ name: string; status: string }>(
        "select jsonb_build_object('name',name,'status',status) as data from catalog.products where slug=$1",
        [category.value],
      );
      assert.equal(entry.name, category.label);
      assert.equal(entry.status, 'draft');
    }
    await assert.rejects(
      value('select public.fti_catalog_fastener_photo_admin() as data'),
    );
    await asUser(buyer);
    await assert.rejects(
      value(
        "select public.fti_catalog_fastener_photo_save('u-bolt',1,$1,true) as data",
        [photo],
      ),
      /Permission/,
    );
    await asUser(staff, 'aal1');
    await assert.rejects(
      value(
        "select public.fti_catalog_fastener_photo_save('u-bolt',1,$1,true) as data",
        [photo],
      ),
      /MFA/,
    );
    await asUser(staff);
    await value(
      "select public.fti_catalog_fastener_photo_save('u-bolt',1,$1,true) as data",
      [photo],
    );
    await assert.rejects(
      value(
        "select public.fti_catalog_fastener_photo_save('u-bolt',1,$1,true) as data",
        [photo],
      ),
      /changed/,
    );
    await db.exec('reset role; set role anon');
    const visiblePhotos = await value<{ slug: string; image_url: string }[]>(
      'select public.fti_catalog_fastener_photos() as data',
    );
    assert.equal(visiblePhotos.length, 1);
    assert.equal(visiblePhotos[0].slug, 'u-bolt');
    await db.exec('reset role');
    assert.equal(
      await value<number>(
        'select count(*)::int as data from catalog.product_variants where product_id=$1',
        [product],
      ),
      0,
    );
    assert.equal(
      await value<string>(
        'select status as data from catalog.products where id=$1',
        [product],
      ),
      'draft',
    );
    await db.query(
      "update platform.media_assets set upload_status='rejected' where id=$1",
      [photo],
    );
    await db.exec('set role anon');
    assert.deepEqual(
      await value('select public.fti_catalog_fastener_photos() as data'),
      [],
    );
    await db.exec('reset role');
    const oldImports = (
      JSON.parse(
        readFileSync('deployment/website-products/products.json', 'utf8'),
      ) as { id: string; slug: string; name: string; category: string }[]
    ).filter((row) => row.category === 'fasteners');
    const fastenerCategory = await value<string>(
      "select id as data from catalog.categories where slug='fasteners'",
    );
    for (const row of oldImports)
      await db.query(
        "insert into catalog.products(id,category_id,slug,name,product_kind,status) values($1,$2,$3,$4,'fastener','draft')",
        [row.id, fastenerCategory, row.slug, row.name],
      );
    const oldCsk = oldImports.find((row) => row.slug === 'csk-screw')!;
    await db.query(
      "insert into catalog.product_variants(product_id,sku,uom) values($1,'OLD-CSK','piece')",
      [oldCsk.id],
    );
    const oldStud = oldImports.find((row) => row.slug === 'stud')!;
    const usedVariant = await value<string>(
      "insert into catalog.product_variants(product_id,sku,uom) values($1,'OLD-STUD','piece') returning id as data",
      [oldStud.id],
    );
    await db.exec(
      'create table public.cleanup_test_reference(variant_id uuid references catalog.product_variants(id))',
    );
    await db.query('insert into public.cleanup_test_reference values($1)', [
      usedVariant,
    ]);
    const oldWasher = oldImports.find((row) => row.slug === 'plain-washers')!;
    const usedPhoto = await value<string>(
      "insert into platform.media_assets(entity_type,entity_id,object_key,mime_type,size_bytes,visibility,upload_status,cdn_url) values('product',$1,'old-washer.jpg','image/jpeg',100,'public','verified','https://example.com/old-washer.jpg') returning id as data",
      [oldWasher.id],
    );
    await db.query(
      "update catalog.fastener_photo_cards set asset_id=$1 where slug='plain-washer'",
      [usedPhoto],
    );
    const deleteOld = readFileSync(
      'deployment/fastener-dimensions/09_delete_old_imports.sql',
      'utf8',
    );
    await db.exec(deleteOld);
    assert.equal(
      await value<number>(
        'select count(*)::int as data from catalog.products where id=any($1::uuid[])',
        [oldImports.map((row) => row.id)],
      ),
      2,
    );
    assert.equal(
      await value<number>(
        'select count(*)::int as data from catalog.products where id=$1',
        [oldCsk.id],
      ),
      0,
    );
    assert.equal(
      await value<number>(
        'select count(*)::int as data from catalog.product_variants where id=$1',
        [usedVariant],
      ),
      1,
    );
    for (const row of fastenerSubcategories)
      assert.equal(
        await value<number>(
          'select count(*)::int as data from catalog.products where slug=$1',
          [row.value],
        ),
        1,
      );
    await db.exec(deleteOld);
    assert.equal(
      await value<number>(
        "select count(*)::int as data from platform.audit_logs where action='catalog.old_import.delete'",
      ),
      15,
    );
    const coachImport = readFileSync(
      'deployment/fastener-dimensions/13_coach_screw_table.sql',
      'utf8',
    );
    await db.exec(coachImport);
    const importedCoach = await value<{
      head_height: number;
      head_height_min: number;
      fillet_radius_max: number;
    }>(
      "select dimensions as data from catalog.drawing_definitions where shape='coach' and size='No. 14'",
    );
    assert.equal(importedCoach.head_height, 4);
    assert.equal(importedCoach.head_height_min, 4.38);
    assert.equal(importedCoach.fillet_radius_max, 0.6);
    const coachRevision = await value<number>(
      "select revision as data from catalog.drawing_definitions where shape='coach' and size='No. 14'",
    );
    await db.exec(coachImport);
    assert.equal(
      await value<number>(
        "select revision as data from catalog.drawing_definitions where shape='coach' and size='No. 14'",
      ),
      coachRevision,
    );
    const hexImport = readFileSync(
      'deployment/fastener-dimensions/15_hex_table_drafts.sql',
      'utf8',
    );
    // Reproduce the reported failure when an older coach-only validator is installed.
    await db.exec(
      readFileSync(
        'supabase/migrations/202610260007_coach_screw_tolerances.sql',
        'utf8',
      ),
    );
    const firstHex = hexSource[0];
    await assert.rejects(
      db.query(
        "insert into catalog.drawing_definitions(subcategory,family,standard,edition,shape,size,source,notes,dimensions) values('hex-bolt','hex','IS 1363','1967','hex-bolt','M6','Test hex import','',$1)",
        [JSON.stringify(firstHex.dimensions)],
      ),
      (error: unknown) =>
        (error as { code: string; constraint: string }).code === '23514' &&
        (error as { constraint: string }).constraint ===
          'drawing_definitions_check',
    );
    await db.exec(hexImport);
    await db.exec(hexImport);
    assert.equal(
      await value<number>(
        "select count(*)::int as data from catalog.drawing_definitions where family='hex'",
      ),
      55,
    );
    assert.equal(
      await value<number>(
        "select count(*)::int as data from catalog.drawing_definitions where family='hex' and published_revision is not null",
      ),
      55,
    );
    const hexBolt = await value<DrawingDefinition>(
      "select to_jsonb(d)-'published_data' as data from catalog.drawing_definitions d where shape='hex-bolt' and size='M6'",
    );
    assert.equal(hexBolt.revision, 2);
    await asUser(buyer);
    const hexVisible = await value<DrawingDefinition[]>(
      'select public.fti_catalog_drawing_list() as data',
    );
    assert.equal(
      hexVisible.find((row) => row.id === hexBolt.id)?.dimensions.head_height,
      4.38,
    );
    await db.exec('reset role');
    await db.exec(hexImport);
    assert.equal(
      await value<number>(
        'select revision as data from catalog.drawing_definitions where id=$1',
        [hexBolt.id],
      ),
      2,
    );
    await asUser(staff);
    await value(
      'select public.fti_catalog_drawing_subcategory_save($1,2,$2) as data',
      [
        hexBolt.id,
        JSON.stringify({
          ...hexBolt,
          dimensions: { ...hexBolt.dimensions, head_height: 4.37 },
        }),
      ],
    );
    await db.exec('reset role');
    await db.exec(hexImport);
    assert.equal(
      await value<number>(
        'select revision as data from catalog.drawing_definitions where id=$1',
        [hexBolt.id],
      ),
      3,
    );
    assert.equal(
      await value<number>(
        'select published_revision as data from catalog.drawing_definitions where id=$1',
        [hexBolt.id],
      ),
      2,
    );
    const import1992 = readFileSync(
      'deployment/fastener-dimensions/16_hex_1992_table_publish.sql',
      'utf8',
    );
    await db.exec(import1992);
    await db.exec(import1992);
    assert.equal(
      await value<number>(
        "select count(*)::int as data from catalog.drawing_definitions where edition='1992' and published_revision=revision and published_data is not null",
      ),
      60,
    );
    assert.equal(
      await value<number>(
        "select count(*)::int as data from catalog.drawing_definitions where edition='1967' and family='hex'",
      ),
      55,
    );
    const import1364 = readFileSync(
      'deployment/fastener-dimensions/17_hex_1364_table_publish.sql',
      'utf8',
    );
    await db.exec(import1364);
    await db.exec(import1364);
    assert.equal(
      await value<number>(
        "select count(*)::int as data from catalog.drawing_definitions where standard='IS 1364' and published_revision=revision and published_data is not null",
      ),
      60,
    );
    assert.equal(
      await value<number>(
        "select count(*)::int as data from catalog.drawing_definitions where standard='IS 1363' and family='hex'",
      ),
      115,
    );
  } finally {
    await db.close();
  }
});
