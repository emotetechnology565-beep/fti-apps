-- Compatibility fix for already deployed order forms. No rows are deleted.
begin;
create or replace function public.fti_catalog_fastener_order_submit(
 p_id uuid,p_definition uuid,p_revision integer,p_input jsonb,p_grade text,p_quantity integer,p_with_nut boolean,p_buyer jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_actor(); old sales.fastener_requests; def jsonb; sel jsonb; rates public.fastener_grade_rates;
 phone text; nm text; company text; location text; ref text; details jsonb; recipient record; k text; v jsonb; len numeric;
begin
 if p_id is null then raise exception 'Request ID required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 nm:=trim(coalesce(p_buyer->>'name','')); company:=trim(coalesce(p_buyer->>'business','')); location:=trim(coalesce(p_buyer->>'location',''));
 if length(nm) not between 2 and 80 or length(company) not between 1 and 80 or length(location) not between 5 and 100
 or coalesce(p_buyer->>'whatsapp_consent','false')<>'true' then raise exception 'Enter buyer details and agree to WhatsApp updates'; end if;
 sel:=jsonb_build_object('definition_id',p_definition,'revision',p_revision,'input',p_input,'grade',p_grade,'quantity',p_quantity,'with_nut',p_with_nut);
 select * into old from sales.fastener_requests where id=p_id;
 if found then
  if old.buyer_id<>actor then raise exception 'Request unavailable' using errcode='42501'; end if;
  if old.selection is distinct from sel or old.details->>'name' is distinct from nm or old.details->>'business' is distinct from company or old.details->>'location' is distinct from location then raise exception 'Request ID already used for different details'; end if;
  return jsonb_build_object('reference',old.details->>'reference','replayed',true);
 end if;
 select '+'||regexp_replace(u.phone,'^\+','') into phone from auth.users u where u.id=actor and u.phone_confirmed_at is not null;
 if phone is null or phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Verify your WhatsApp phone before ordering'; end if;
 select published_data into def from catalog.drawing_definitions where id=p_definition and published_revision=p_revision for share;
 if def is null then raise exception 'Dimensions changed or were withdrawn. Reload before ordering.'; end if;
 if p_quantity is null or p_quantity not between 1 and 1000000 or p_with_nut is null then raise exception 'Enter a valid quantity'; end if;
 if p_with_nut and def->>'shape' not in ('hex-bolt','hex-screw') then raise exception 'Combined supply is unavailable for this selection'; end if;
 if jsonb_typeof(p_input) is distinct from 'object' or not p_input ? 'length' then raise exception 'Drawing dimensions required'; end if;
 for k,v in select * from jsonb_each(p_input) loop
  if k not in ('length','width','pitch','radius','returnHeight','angle') or jsonb_typeof(v)<>'number' then raise exception 'Invalid drawing dimension'; end if;
  -- Older app builds send width=0 when there is no width selector.
  -- Accept only this unused field; required widths and all other dimensions stay positive.
  if k='width' and (v#>>'{}')::numeric=0
   and jsonb_array_length(def->'dimensions'->'widths')=0 then continue; end if;
  if (v#>>'{}')::numeric<=0 or (v#>>'{}')::numeric>10000 then
   raise exception 'Drawing dimension % must be greater than 0 and at most 10000 mm',k; end if;
 end loop;
 len:=(p_input->>'length')::numeric;
 if jsonb_array_length(def->'dimensions'->'lengths')>0 and not (def->'dimensions'->'lengths') @> jsonb_build_array(len) then raise exception 'Choose a published length'; end if;
 if jsonb_array_length(def->'dimensions'->'widths')>0 and not (def->'dimensions'->'widths') @> jsonb_build_array((p_input->>'width')::numeric) then raise exception 'Choose a published width'; end if;
 if p_input ? 'pitch' and (p_input->>'pitch')::numeric>100 then raise exception 'Pitch must not exceed 100 mm'; end if;
 if def->'dimensions' ? 'pitch' and p_input ? 'pitch' and (p_input->>'pitch')::numeric is distinct from (def->'dimensions'->>'pitch')::numeric then raise exception 'Pitch must match the published definition'; end if;
 if def->>'shape'='j-i' and coalesce((p_input->>'angle')::numeric,25) not between 1 and 75 then raise exception 'Return angle must be between 1 and 75 degrees'; end if;
 if def->>'shape' in ('j-ii','u-round') and (not p_input ? 'radius' or len<=(p_input->>'radius')::numeric+(def->'dimensions'->>'diameter')::numeric) then raise exception 'Radius must leave a straight leg'; end if;
 if def->>'shape'='j-ii' and (not p_input ? 'returnHeight' or (p_input->>'returnHeight')::numeric<(p_input->>'radius')::numeric+(def->'dimensions'->>'diameter')::numeric or (p_input->>'returnHeight')::numeric>=len) then raise exception 'Invalid return height'; end if;
 if def->>'shape' in ('hex-nut','lock-nut') and len is distinct from (def->'dimensions'->>'head_height')::numeric then raise exception 'Nut thickness must match the selected definition'; end if;
 select * into rates from public.fastener_grade_rates where grade=p_grade for share;
 if not found then raise exception 'Choose an available grade'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,1));
 if (select count(*) from sales.fastener_requests where buyer_id=actor and created_at>now()-interval '1 hour')>=20 then raise exception 'Too many requests. Try again later'; end if;
 ref:='FTI-FN-'||upper(replace(p_id::text,'-',''));
 details:=jsonb_build_object('reference',ref,'material',def->>'shape','standard',(def->>'standard')||':'||(def->>'edition'),
  'size',def->>'size','length_mm',len,'grade',p_grade,'quantity',p_quantity||' pieces','supply',case when p_with_nut then 'With nut' else 'Single fastener' end,
  'name',nm,'business',company,'phone',phone,'location',location,'bolt_rate',rates.bolt_rate,'nut_rate',rates.nut_rate,'rate_revision',rates.revision,'whatsapp_consent',true);
 insert into sales.fastener_requests(id,buyer_id,definition_id,selection,definition,details) values(p_id,actor,p_definition,sel,def-'source'-'notes',details);
 insert into sales.fastener_jobs(request_id,phone,template,parameters) values(p_id,phone,'fti_fastener_received_v1',
  jsonb_build_array(ref,def->>'shape',details->>'standard',(def->>'size')||' / L '||len||' mm',p_grade,p_quantity||' pieces',details->>'supply',nm,company,phone,location));
 for recipient in select r.phone from sales.raw_material_recipients r where r.enabled loop
  insert into sales.fastener_jobs(request_id,phone,template,parameters) values(p_id,recipient.phone,'fti_fastener_admin_v1',
   jsonb_build_array(ref,def->>'shape',details->>'standard',(def->>'size')||' / L '||len||' mm',p_grade,p_quantity||' pieces',details->>'supply',nm,company,phone,location));
 end loop;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id) values(actor,'fastener.submitted','fastener_request',p_id);
 return jsonb_build_object('reference',ref,'replayed',false);
end $$;
notify pgrst,'reload schema';
commit;
