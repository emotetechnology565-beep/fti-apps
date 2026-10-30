-- Run AFTER 202610300010_market_rates_admin.sql in Supabase SQL Editor.
-- Imports market.txt as dated historical quotes, not today's prices.
-- Source market labels are retained in the district field. They are not all
-- administrative district names. Ludhiana grades remain separate labels.
-- Quoted price = base = sale; source market movement is NOT an added charge.
-- Safe to rerun: no existing prices or notes are overwritten.
begin;

create temporary table market_txt_import (
 category text, state text, district text, quoted_price numeric(14,2),
 market_movement numeric(14,2), grade text,
 primary key(category,state,district)
) on commit drop;

insert into market_txt_import values
 ('Ingot','Punjab','Mandi Gobindgarh',46300,-200,null),
 ('Ingot','Punjab','Ludhiana (EN8D)',46900,-100,'EN8D'),
 ('Ingot','Punjab','Ludhiana (MS)',46500,-100,'MS'),
 ('Ingot','Uttar Pradesh','Muzaffarnagar',44800,300,null),
 ('Ingot','Himachal Pradesh','Himachal',45300,-200,null),
 ('Ingot','Jammu and Kashmir','Jammu',45800,-200,null),
 ('Ingot','Chhattisgarh','Raigarh',42300,-600,null),
 ('Ingot','Chhattisgarh','Raipur',42600,-200,null),
 ('Ingot','Uttar Pradesh','Ghaziabad',44900,100,null),
 ('Ingot','Telangana','Hyderabad',45100,0,null),
 ('Ingot','Rajasthan','Jaipur',45000,0,null),
 ('Ingot','Rajasthan','Bhiwadi',45400,0,null),
 ('Ingot','West Bengal','Durgapur',43000,-400,null),
 ('Ingot','West Bengal','Kolkatta',43200,-400,null),
 ('Ingot','Odisha','Rourkela',41800,0,null),
 ('Ingot','Gujarat','Bhavnagar',45500,-300,null),
 ('Scrap','Punjab','Mandi Gobindgarh',37100,-300,null), -- Mandi Melting
 ('Scrap','Punjab','Ludhiana',38900,-100,null),
 ('Scrap','Uttar Pradesh','Muzaffarnagar',38200,-200,null),
 ('Scrap','Chhattisgarh','Raipur',37400,-400,null),
 ('Scrap','West Bengal','Durgapur',35800,-1000,null),
 ('Scrap','West Bengal','Kolkatta',36300,-1000,null),
 ('Scrap','Uttar Pradesh','Ghaziabad',36700,0,null),
 ('Scrap','Gujarat','Bhavnagar',37500,0,null),
 ('Scrap','Rajasthan','Jaipur',33500,0,null),
 ('Billet','Punjab','Mandi Gobindgarh',46300,-200,null),
 ('Billet','Uttar Pradesh','Muzaffarnagar',45000,-400,null),
 ('Billet','Uttar Pradesh','Ghaziabad',45300,100,null),
 ('Billet','Tamil Nadu','Chennai',47000,0,null),
 ('Billet','Chhattisgarh','Raipur',43000,-200,null),
 ('Billet','Rajasthan','Jaipur',45400,0,null),
 ('Billet','Telangana','Hyderabad',45000,-500,null),
 ('Billet','West Bengal','Durgapur',43600,-200,null),
 ('Billet','West Bengal','Kolkatta',43800,-200,null),
 ('Billet','Gujarat','Bhavnagar',45900,-200,null),
 ('Old Scrap','Punjab','Mandi Gobindgarh',33600,-300,null);

do $import$
declare
 -- If multiple publishing admins exist, replace null with the importing
 -- admin's actual identity.profiles.id, e.g. 'your-admin-uuid'::uuid.
 v_admin uuid := null;
 v_candidates uuid[];
 v_stamp timestamptz := '2026-10-28 12:00:00+05:30';
 v_location uuid;
 v_entry uuid;
 v_existing pricing.market_rate_entries;
 item record;
 v_inserted integer := 0;
begin
 -- Serialize reruns of this same source report.
 perform pg_advisory_xact_lock(hashtextextended('market.txt:2026-10-28T12:00:00+05:30',0));
 if v_admin is null then
   select array_agg(p.id order by p.id) into v_candidates
   from identity.profiles p where p.account_status='active'
   and exists(select 1 from identity.user_roles ur join identity.role_permissions rp on rp.role_code=ur.role_code where ur.user_id=p.id and rp.permission='price.manage')
   and exists(select 1 from identity.user_roles ur join identity.role_permissions rp on rp.role_code=ur.role_code where ur.user_id=p.id and rp.permission='price.publish');
   if coalesce(array_length(v_candidates,1),0)<>1 then
     raise exception 'Expected one active publishing admin, found %. Set v_admin to your publishing admin profile UUID in this script.',coalesce(array_length(v_candidates,1),0);
   end if;
   v_admin := v_candidates[1];
 end if;
 if not exists(select 1 from identity.profiles p where p.id=v_admin and p.account_status='active'
   and exists(select 1 from identity.user_roles ur join identity.role_permissions rp on rp.role_code=ur.role_code where ur.user_id=p.id and rp.permission='price.manage')
   and exists(select 1 from identity.user_roles ur join identity.role_permissions rp on rp.role_code=ur.role_code where ur.user_id=p.id and rp.permission='price.publish')) then
   raise exception 'v_admin must be an active profile with price.manage and price.publish permissions.';
 end if;

 for item in select * from market_txt_import order by category,state,district loop
   insert into pricing.market_rate_locations(category,state,district)
   values(item.category,item.state,item.district) on conflict do nothing;
   select id into strict v_location from pricing.market_rate_locations
   where category=item.category and lower(btrim(state))=lower(item.state) and lower(btrim(district))=lower(item.district)
   for update;
   select * into v_existing from pricing.market_rate_entries where location_id=v_location and published_at=v_stamp;
   if found then
     if v_existing.base_price<>item.quoted_price or v_existing.increase_amount<>0 then
       raise exception 'A different quote already exists for % / % / % at the report time. No import changes were committed.',item.category,item.state,item.district;
     end if;
     continue;
   end if;
   insert into pricing.market_rate_entries(location_id,base_price,increase_amount,published_at,published_by)
   values(v_location,item.quoted_price,0,v_stamp,v_admin) returning id into v_entry;
   insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
   values(v_admin,'market_rates.import','market_rate_entry',v_entry,
     jsonb_build_object('source','market.txt','source_report_at',v_stamp,'imported_at',clock_timestamp(),
       'category',item.category,'state',item.state,'source_market_label',item.district,'grade',item.grade,
       'quoted_price',item.quoted_price,'reported_market_movement',item.market_movement,
       'usd_inr',95.04,'unit','INR/MT','added_increase',0,
       'mapping_note',case when item.district='Himachal' then 'Source specifies only the state; district is unspecified.'
         when item.district='Mandi Gobindgarh' and item.category='Scrap' then 'Melting Scrap / Mandi Melting; repeated source entries combined.'
         else 'Original market label retained in district field.' end));
   v_inserted := v_inserted+1;
 end loop;
 raise notice 'Imported % new prices. Existing matching historical entries were preserved.',v_inserted;
end $import$;

-- Preview the imported report. Does not replace any newer published entries.
select l.category,l.state,l.district,e.base_price,e.increase_amount,e.sale_price,
 e.published_at at time zone 'Asia/Kolkata' as report_time_ist
from pricing.market_rate_entries e join pricing.market_rate_locations l on l.id=e.location_id
join market_txt_import s on s.category=l.category and lower(s.state)=lower(btrim(l.state)) and lower(s.district)=lower(btrim(l.district))
where e.published_at='2026-10-28 12:00:00+05:30'::timestamptz
order by l.category,l.state,l.district;
commit;
