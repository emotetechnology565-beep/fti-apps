begin;

-- Supabase Auth stores international phone numbers without the leading +.
-- Keep profile numbers canonical for consent checks and the WhatsApp sender.
create or replace function internal.identity_profile_phone_format() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.phone ~ '^\+?[1-9][0-9]{7,14}$' then
  new.phone := '+' || ltrim(new.phone,'+');
 end if;
 return new;
end $$;
revoke all on function internal.identity_profile_phone_format() from public,anon,authenticated;
drop trigger if exists identity_profile_phone_format on identity.profiles;
create trigger identity_profile_phone_format before insert or update of phone on identity.profiles
 for each row execute function internal.identity_profile_phone_format();

-- Repair from the verified Auth record, never from user-editable metadata.
-- Preserve consent timestamps and queued notifications.
update identity.profiles p set phone='+' || ltrim(u.phone,'+'),updated_at=now()
from auth.users u where u.id=p.id and u.phone_confirmed_at is not null
 and u.phone ~ '^\+?[1-9][0-9]{7,14}$'
 and p.phone is distinct from '+' || ltrim(u.phone,'+');

create or replace function public.fti_operations_whatsapp_opt_in(p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_actor(); phone_number text;
begin
 if p_enabled is null then raise exception 'Choose enabled or disabled' using errcode='22023'; end if;
 perform 1 from identity.profiles where id=actor for update;
 if not found then raise exception 'Save your personal profile first' using errcode='22023'; end if;
 if p_enabled then
  select '+' || ltrim(phone,'+') into phone_number from auth.users
   where id=actor and phone_confirmed_at is not null and phone ~ '^\+?[1-9][0-9]{7,14}$';
  if phone_number is null then
   raise exception 'A verified WhatsApp phone number is required' using errcode='22023';
  end if;
 end if;
 update identity.profiles set
  phone=case when p_enabled then phone_number else phone end,
  whatsapp_updates_opt_in_at=case when p_enabled then coalesce(whatsapp_updates_opt_in_at,now()) else null end,
  updated_at=now()
 where id=actor;
 if not p_enabled then update platform.whatsapp_jobs set status='failed',last_error='User withdrew WhatsApp consent'
  where user_id=actor and status in ('pending','claimed'); end if;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id)
 values(actor,case when p_enabled then 'whatsapp.opt_in' else 'whatsapp.opt_out' end,'profile',actor);
end $$;
revoke all on function public.fti_operations_whatsapp_opt_in(boolean) from public,anon,authenticated;
grant execute on function public.fti_operations_whatsapp_opt_in(boolean) to authenticated;
notify pgrst,'reload schema';
commit;
