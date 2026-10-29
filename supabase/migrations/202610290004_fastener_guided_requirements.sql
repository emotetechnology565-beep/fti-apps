-- Database-owned catalogue copy and quote-only guided fastener requirements.
-- Advertised capabilities are not assertions of stock, standards or grade equivalence.
begin;

create table if not exists catalog.fastener_details (
 subcategory text primary key references catalog.fastener_photo_cards(slug),
 description text not null check(length(description) between 1 and 6000),
 specifications jsonb not null default '[]' check(jsonb_typeof(specifications)='array'),
 materials text[] not null default '{}', grades text[] not null default '{}',
 threads text[] not null default '{}', finishes text[] not null default '{}',
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default now()
);
alter table catalog.fastener_details enable row level security;
revoke all on catalog.fastener_details from public,anon,authenticated;

insert into catalog.fastener_details(subcategory,description)
 select slug,label||' requirements can be configured against published standards and drawings. Confirm material, grade, thread, finish, dimensions and availability with FTI when requesting a quotation.'
 from catalog.fastener_photo_cards on conflict(subcategory) do nothing;

-- Transcribed from assets/fastener-uploads/WhatsApp Unknown 2026-10-28 at 8.28.19 AM/extracted-details.md.
update catalog.fastener_details set
 description='Hex bolts with advertised cold and hot forging capabilities for industrial and OEM supply. Cold forged sizes cover diameters of 5–24 mm and lengths of 10–200 mm; hot forged sizes cover diameters of 24–56 mm and lengths of 50–450 mm. Confirm property class, product standard, thread pitch and coating specification when requesting a quotation.',
 specifications='[
  {"label":"Material used","value":"Wire and round bars"},
  {"label":"Material grades","value":"LC / MS / CHQ · EN-8D · Boron · SAE-4140 · EN-19"},
  {"label":"Cold forging","value":"Diameter 5–24 mm · Length 10–200 mm"},
  {"label":"Hot forging","value":"Diameter 24–56 mm · Length 50–450 mm"},
  {"label":"Threading capacity","value":"5–56 mm"},
  {"label":"Threads available","value":"BSW · UNC · UNF · Coarse metric and inch; confirm designation and pitch"},
  {"label":"Manufacturing process","value":"Raw material → Cutting to length → Cold or hot forging → Threading → Inspection. The forging route depends on the required size."},
  {"label":"Inspection","value":"Dimensional check and quality inspection"},
  {"label":"Facilities available","value":"Cold forging headers · Screw forgings (multiple stages) · Nut forging M24–M42 using a friction press"},
  {"label":"Finishing facilities","value":"Auto black · Zinc plating · Hot dip galvanizing · Zinc flake"},
  {"label":"Specification confirmation","value":"Advertised capabilities only. Confirm grade, thread pitch, finish and availability with your quote. Nut forging is a facility capability."}
 ]'::jsonb,
 materials=array['LC','MS','CHQ'],
 grades=array['LC','MS','CHQ','EN-8D','Boron','SAE-4140','EN-19'],
 threads=array['BSW','UNC','UNF','Coarse metric','Coarse inch'],
 finishes=array['Auto black','Zinc plating','Hot dip galvanizing','Zinc flake']
 where subcategory='hex-bolt' and revision=1;

create or replace function public.fti_catalog_fastener_detail(p_subcategory text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('subcategory',d.subcategory,'title',c.label,'description',d.description,
  'specifications',d.specifications,'materials',to_jsonb(d.materials),'grades',to_jsonb(d.grades),
  'threads',to_jsonb(d.threads),'finishes',to_jsonb(d.finishes),'revision',d.revision)
 from catalog.fastener_details d join catalog.fastener_photo_cards c on c.slug=d.subcategory
 where d.subcategory=p_subcategory and (c.published or exists(
  select 1 from catalog.drawing_definitions dr where dr.subcategory=d.subcategory
   and dr.published_revision is not null and dr.published_data is not null));
$$;

create or replace function public.fti_catalog_fastener_requirement_submit(
 p_id uuid,p_requirement jsonb,p_quantity integer,p_buyer jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_actor(); old sales.raw_material_requests; def jsonb; dr catalog.drawing_definitions;
 profile catalog.fastener_details; label text; phone text; ref text; details jsonb; recipient record;
 nm text:=trim(coalesce(p_buyer->>'name','')); company text:=trim(coalesce(p_buyer->>'business',''));
 location text:=trim(coalesce(p_buyer->>'location','')); req_slug text:=p_requirement->>'subcategory';
 dims jsonb:=p_requirement->'dimensions'; k text; v jsonb; custom boolean; def_id uuid; def_rev integer; size_text text;
begin
 if p_id is null then raise exception 'Request ID required' using errcode='22023'; end if;
 if jsonb_typeof(p_requirement) is distinct from 'object' or octet_length(p_requirement::text)>16384 then
  raise exception 'Invalid fastener requirement' using errcode='22023'; end if;
 if p_quantity is null or p_quantity not between 1 and 1000000 then
  raise exception 'Enter a whole quantity from 1 to 1,000,000 pieces' using errcode='22023'; end if;
 if length(nm) not between 2 and 80 or length(company) not between 1 and 80 or length(location) not between 5 and 100
  or nm ~ '[[:cntrl:]]' or company ~ '[[:cntrl:]]' or location ~ '[[:cntrl:]]'
  or coalesce(p_buyer->>'whatsapp_consent','false')<>'true' then
  raise exception 'Enter buyer name, business and delivery location, and agree to WhatsApp updates' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into old from sales.raw_material_requests where id=p_id;
 if found then
  if old.buyer_id<>actor then raise exception 'Request unavailable' using errcode='42501'; end if;
  if old.details->'fastener_requirement' is distinct from p_requirement or old.quantity<>p_quantity
   or old.details->>'name' is distinct from nm or old.details->>'business' is distinct from company
   or old.details->>'location' is distinct from location then
   raise exception 'This request ID was already used for different details' using errcode='22023'; end if;
  return jsonb_build_object('id',old.id,'reference',old.details->>'reference','replayed',true);
 end if;
 select '+'||regexp_replace(u.phone,'^\+','') into phone from auth.users u
  where u.id=actor and u.phone_confirmed_at is not null;
 if phone is null or phone !~ '^\+[1-9][0-9]{7,14}$' then
  raise exception 'Verify your WhatsApp phone before requesting a quotation' using errcode='22023'; end if;
 select d.* into profile from catalog.fastener_details d join catalog.fastener_photo_cards c on c.slug=d.subcategory
  where d.subcategory=req_slug and (c.published or exists(
   select 1 from catalog.drawing_definitions published where published.subcategory=d.subcategory
    and published.published_revision is not null and published.published_data is not null)) for share of d,c;
 if not found then raise exception 'Choose a fastener from the catalogue' using errcode='22023'; end if;
 select c.label into label from catalog.fastener_photo_cards c where c.slug=req_slug;
 for k,v in select * from jsonb_each(p_requirement) loop
  if k not in ('subcategory','definition_id','revision','standard','shape','dimensions','material','grade','thread','pitch','finish','with_nut','notes','custom') then
   raise exception 'Unknown requirement field: %',k using errcode='22023'; end if;
 end loop;
 foreach k in array array['standard','shape','material','grade','thread','pitch','finish','notes'] loop
  if p_requirement ? k and jsonb_typeof(p_requirement->k) is distinct from 'string' then
   raise exception 'Requirement % must be text',k using errcode='22023'; end if;
  if length(coalesce(p_requirement->>k,''))>(case when k='notes' then 2000 else 160 end)
   or coalesce(p_requirement->>k,'') ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' then
   raise exception 'Requirement % is too long or contains invalid characters',k using errcode='22023'; end if;
 end loop;
 foreach k in array array['standard','material','grade','thread','finish'] loop
  if length(trim(coalesce(p_requirement->>k,''))) not between 1 and 160 then
   raise exception 'Choose %, or indicate that FTI should confirm it',replace(k,'_',' ') using errcode='22023'; end if;
 end loop;
 if jsonb_typeof(p_requirement->'custom') is distinct from 'boolean'
  or jsonb_typeof(p_requirement->'with_nut') is distinct from 'boolean' then
  raise exception 'Choose a requirement route and supply option' using errcode='22023'; end if;
 custom:=(p_requirement->>'custom')::boolean;
 if (p_requirement->>'with_nut')::boolean and req_slug not in ('hex-bolt','heavy-hex-bolt') then
  raise exception 'Combined nut supply is unavailable for this fastener' using errcode='22023'; end if;
 if jsonb_typeof(dims) is distinct from 'object' then raise exception 'Enter requirement dimensions' using errcode='22023'; end if;
 for k,v in select * from jsonb_each(dims) loop
  if k not in ('diameter_mm','length_mm','width_mm','radius_mm','return_height_mm','angle_deg','thickness_mm')
   or jsonb_typeof(v) is distinct from 'number' then
   raise exception 'Invalid dimension: %',k using errcode='22023'; end if;
  if (v#>>'{}')::numeric<=0 or (v#>>'{}')::numeric>(case when k='angle_deg' then 360 else 10000 end) then
   raise exception 'Dimension % must be positive and within the supported range',k using errcode='22023'; end if;
 end loop;
 if dims='{}'::jsonb and (not custom or length(trim(coalesce(p_requirement->>'notes','')))<5) then
  raise exception 'Enter dimensions or describe your custom requirement' using errcode='22023'; end if;
 if p_requirement->>'definition_id' is not null then
  if p_requirement->>'definition_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or coalesce(p_requirement->>'revision','') !~ '^[1-9][0-9]{0,8}$' then
   raise exception 'Choose a valid published drawing' using errcode='22023'; end if;
  def_id:=(p_requirement->>'definition_id')::uuid; def_rev:=(p_requirement->>'revision')::integer;
  select * into dr from catalog.drawing_definitions where id=def_id and published_revision=def_rev for share;
  def:=dr.published_data;
  if def is null or dr.subcategory<>req_slug then
   raise exception 'Dimensions changed or were withdrawn. Reload before requesting a quote' using errcode='22023'; end if;
  if coalesce(p_requirement->>'shape','')<>def->>'shape' then
   raise exception 'Drawing shape does not match the requirement' using errcode='22023'; end if;
  if not custom and trim(p_requirement->>'standard') is distinct from (def->>'standard')||':'||(def->>'edition') then
   raise exception 'Standard does not match the selected drawing; choose a custom requirement' using errcode='22023'; end if;
  if dims ? 'diameter_mm' and (dims->>'diameter_mm')::numeric is distinct from (def->'dimensions'->>'diameter')::numeric then
   raise exception 'Diameter does not match the selected drawing; choose a custom requirement' using errcode='22023'; end if;
 elsif not custom then
  raise exception 'Choose a published drawing or a custom requirement' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,1));
 if (select count(*) from sales.raw_material_requests where buyer_id=actor and created_at>now()-interval '1 hour')>=20 then
  raise exception 'Too many requests. Please try again later' using errcode='22023'; end if;
 ref:='FTI-FN-'||upper(replace(p_id::text,'-',''));
 select coalesce(string_agg(replace(e.key,'_',' ')||': '||e.value,', ' order by e.key),'Custom dimensions; see notes')
  into size_text from jsonb_each_text(dims) e;
 details:=jsonb_build_object('reference',ref,'material',label,'grade',p_requirement->>'grade',
  'size',size_text,'standard',p_requirement->>'standard','quantity',p_quantity||' pieces','uom','piece',
  'name',nm,'business',company,'location',location,'phone',phone,'whatsapp_consent',true,
  'fastener_requirement',p_requirement,'drawing_snapshot',def,
  'match_status',case when custom then 'custom_requirement' else 'drawing_requirement' end,
  'price_state','request_quote','thread',p_requirement->>'thread','pitch',p_requirement->>'pitch',
  'finish',p_requirement->>'finish','notes',p_requirement->>'notes','supply',case when (p_requirement->>'with_nut')::boolean then 'With nut' else 'Single fastener' end);
 insert into sales.raw_material_requests(id,buyer_id,quantity,details,manual_entry)
  values(p_id,actor,p_quantity,details,true);
 insert into sales.raw_material_jobs(request_id,phone,template,parameters) values(p_id,phone,'fti_raw_material_received_v1',
  jsonb_build_array(nm,ref,label,size_text,p_requirement->>'grade',p_quantity||' pieces'));
 for recipient in select r.phone from sales.raw_material_recipients r where r.enabled loop
  insert into sales.raw_material_jobs(request_id,phone,template,parameters) values(p_id,recipient.phone,'fti_raw_material_admin_v1',
   jsonb_build_array(ref,label,size_text,p_requirement->>'grade',p_quantity||' pieces',nm,company,phone,location));
 end loop;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id)
  values(actor,'fastener.requirement.submitted','raw_material_request',p_id);
 return jsonb_build_object('id',p_id,'reference',ref,'replayed',false);
end $$;

revoke all on function public.fti_catalog_fastener_detail(text),public.fti_catalog_fastener_requirement_submit(uuid,jsonb,integer,jsonb) from public,anon,authenticated;
grant execute on function public.fti_catalog_fastener_detail(text) to anon,authenticated;
grant execute on function public.fti_catalog_fastener_requirement_submit(uuid,jsonb,integer,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
