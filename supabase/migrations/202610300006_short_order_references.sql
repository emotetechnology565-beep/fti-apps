begin;

-- A shared, non-cycling sequence avoids collisions across concurrent orders.
-- Pad short numbers without truncating once the sequence exceeds six digits.
create sequence internal.order_reference_sequence as bigint no cycle;
revoke all on sequence internal.order_reference_sequence from public,anon,authenticated;

create function internal.next_order_reference(p_prefix text) returns text
language plpgsql set search_path='' as $$
declare serial text;
begin
 if p_prefix is null or p_prefix not in ('RM','FN','O') then
  raise exception 'Invalid order reference prefix' using errcode='22023';
 end if;
 serial:=nextval('internal.order_reference_sequence'::regclass)::text;
 return p_prefix||'-'||lpad(serial,greatest(6,length(serial)),'0');
end $$;
revoke all on function internal.next_order_reference(text) from public,anon,authenticated;

-- Replace only reference generation in the current submit functions. This keeps
-- their latest validation, replay handling, permissions and message payloads.
-- Existing references and UUIDs are retained for history and external messages.
do $$
declare signature text; function_id regprocedure; definition text; revised text;
begin
 foreach signature in array array[
  'public.fti_catalog_raw_order_submit(uuid,uuid,integer,text,jsonb)',
  'public.fti_catalog_selection_request_submit(uuid,uuid,text,jsonb)',
  'public.fti_catalog_manual_request_submit(uuid,jsonb,text,jsonb)',
  'public.fti_catalog_fastener_order_submit(uuid,uuid,integer,jsonb,text,integer,boolean,jsonb)',
  'public.fti_catalog_fastener_requirement_submit(uuid,jsonb,integer,jsonb)',
  'public.fti_commerce_cart_order(uuid,uuid,jsonb)',
  'public.fti_commerce_quote_order(uuid,uuid,uuid)'
 ] loop
  function_id:=to_regprocedure(signature);
  if function_id is null then raise exception 'Missing order function: %',signature; end if;
  definition:=pg_get_functiondef(function_id);
  revised:=replace(definition,'''FTI-RM-''||upper(replace(p_id::text,''-'',''''))','internal.next_order_reference(''RM'')');
  revised:=replace(revised,'''FTI-FN-''||upper(replace(p_id::text,''-'',''''))','internal.next_order_reference(''FN'')');
  revised:=replace(revised,'''FTI-O-''||upper(substr(replace(result::text,''-'',''''),1,12))','internal.next_order_reference(''O'')');
  revised:=replace(revised,'''FTI-O-''||upper(substr(replace(order_id::text,''-'',''''),1,12))','internal.next_order_reference(''O'')');
  if revised=definition then raise exception 'Order reference generator did not match: %',signature; end if;
  execute revised;
 end loop;
end $$;

notify pgrst,'reload schema';
commit;
