import { readFileSync, writeFileSync } from 'node:fs';

const root = 'deployment/fastener-dimensions';
const schema = readFileSync('supabase/migrations/202610260008_hex_fasteners.sql', 'utf8')
  .replace(/^begin;\s*/i, '').replace(/commit;\s*$/i, '');
const rows = JSON.parse(readFileSync(`${root}/hex-1992-source-definitions.json`, 'utf8'));
const sql = `-- DIRECT PUBLISH: includes the hex schema/validator fix before importing and publishing.
-- Existing matching entries publish immediately; manually changed dimensions are preserved.
begin;
${schema}
create temporary table fti_hex_publish_import on commit drop as
 select * from jsonb_to_recordset($hex$${JSON.stringify(rows, null, 2)}$hex$::jsonb)
 as r(subcategory text,family text,standard text,edition text,shape text,size text,source text,notes text,dimensions jsonb);

do $$ begin
 if exists(select 1 from fti_hex_publish_import where not internal.valid_drawing_dimensions(shape,dimensions)) then
  raise exception 'Hex dimension import failed validation';
 end if;
end $$;

with added as (
 insert into catalog.drawing_definitions(subcategory,family,standard,edition,shape,size,source,notes,dimensions)
 select subcategory,family,standard,edition,shape,size,source,notes,dimensions from fti_hex_publish_import
 on conflict(subcategory,family,standard,edition,shape,size) do nothing returning id,size,shape
)
insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
select auth.uid(),'catalog.hex_dimensions.import','drawing_definition',id,jsonb_build_object('size',size,'shape',shape) from added;

with approved as materialized (
 select d.* from catalog.drawing_definitions d join fti_hex_publish_import r
 on (d.subcategory,d.family,d.standard,d.edition,d.shape,d.size)=(r.subcategory,r.family,r.standard,r.edition,r.shape,r.size)
 where d.dimensions=r.dimensions and (d.published_revision is distinct from d.revision or d.published_data is null)
 for update of d
), published as (
 update catalog.drawing_definitions d
 set published_data=(to_jsonb(a)-'published_data')||jsonb_build_object('published_revision',a.revision+1,'revision',a.revision+1),
     published_revision=a.revision+1,revision=a.revision+1,updated_at=now()
 from approved a where d.id=a.id returning d.id,d.revision
)
insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
select auth.uid(),'catalog.drawing.publish','drawing_definition',id,jsonb_build_object('revision',revision) from published;
commit;

-- Results appear after commit: expected published totals are 15 for each of the four shapes.
select shape,count(*) as total,
 count(*) filter(where published_revision=revision and published_data is not null) as published,
 count(*) filter(where published_revision is distinct from revision or published_data is null) as unchanged_manual_drafts
from catalog.drawing_definitions
where family='hex' and standard='IS 1363' and edition='1992'
group by shape order by shape;
`;
writeFileSync(`${root}/16_hex_1992_table_publish.sql`, sql);
console.log('Prepared 1992 direct-publish SQL');
