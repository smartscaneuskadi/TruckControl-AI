alter table private.tc_modules drop constraint tc_modules_id_check;
alter table private.tc_modules add constraint tc_modules_id_check check(id in
 ('dashboard','trucks','drivers','income','expenses','profitability','documents','gmail','assistant','invoice_ai',
  'trailers','customers','trips','maintenance','fuel','deadlines','alerts','team'));
insert into private.tc_modules(id,label) values('trailers','Remolques'),('customers','Clientes'),('trips','Viajes'),
 ('maintenance','Mantenimiento'),('fuel','Combustible'),('deadlines','Vencimientos'),('alerts','Alertas'),('team','Usuarios de empresa');
update private.tc_plans set modules=modules||'{"trailers":true,"customers":true,"trips":true,"maintenance":true,"fuel":true,"deadlines":true,"alerts":true,"team":true}'::jsonb;

create table private.fleet_records (
 id uuid primary key,
 organization_id uuid not null references public.organizations(id) on delete restrict,
 kind text not null check(kind in ('trailers','customers','trips','maintenance','fuel','deadlines','alerts')),
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=16384),
 truck_id uuid,driver_id uuid,trailer_id uuid,customer_id uuid,finance_entry_id uuid,
 row_version bigint not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,truck_id) references public.trucks(organization_id,id) on delete restrict,
 foreign key(organization_id,driver_id) references public.drivers(organization_id,id) on delete restrict,
 foreign key(organization_id,trailer_id) references private.fleet_records(organization_id,id) on delete restrict,
 foreign key(organization_id,customer_id) references private.fleet_records(organization_id,id) on delete restrict,
 foreign key(organization_id,finance_entry_id) references public.finance_entries(organization_id,id) on delete restrict
);
create index fleet_records_org_kind_idx on private.fleet_records(organization_id,kind,updated_at desc);
create index fleet_records_truck_idx on private.fleet_records(organization_id,truck_id);
create index fleet_records_driver_idx on private.fleet_records(organization_id,driver_id);
create index fleet_records_trailer_idx on private.fleet_records(organization_id,trailer_id);
create index fleet_records_customer_idx on private.fleet_records(organization_id,customer_id);
create index fleet_records_finance_idx on private.fleet_records(organization_id,finance_entry_id);
create unique index fleet_trailer_plate_unique on private.fleet_records(organization_id,upper(regexp_replace(payload->>'plate','[ -]','','g'))) where kind='trailers';
create unique index fleet_trip_truck_running on private.fleet_records(organization_id,truck_id) where kind='trips' and payload->>'status'='in_transit';
create unique index fleet_trip_driver_running on private.fleet_records(organization_id,driver_id) where kind='trips' and payload->>'status'='in_transit' and driver_id is not null;
create unique index fleet_trip_trailer_running on private.fleet_records(organization_id,trailer_id) where kind='trips' and payload->>'status'='in_transit' and trailer_id is not null;
create unique index fleet_alert_source_unique on private.fleet_records(organization_id,(payload->>'sourceKey')) where kind='alerts' and coalesce(payload->>'sourceKey','')<>'';
alter table public.finance_entries add column source_record_id uuid;
alter table public.finance_entries add constraint finance_source_record_fk foreign key(organization_id,source_record_id) references private.fleet_records(organization_id,id) on delete restrict;
create unique index finance_source_record_once on public.finance_entries(organization_id,source_record_id) where source_record_id is not null;

create function private.tc_json_integer(p jsonb,k text,lo numeric,hi numeric) returns boolean
language sql immutable security invoker set search_path='' as $$
 select case when jsonb_typeof(p->k)='number' then (p->>k)::numeric between lo and hi and trunc((p->>k)::numeric)=(p->>k)::numeric else false end;
$$;
create function private.tc_json_date(p jsonb,k text,required boolean) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare d date;
begin
 if coalesce(p->>k,'')='' then return not required;end if;
 if jsonb_typeof(p->k)<>'string' or (p->>k)!~'^\d{4}-\d{2}-\d{2}$' then return false;end if;
 d:=(p->>k)::date;return to_char(d,'YYYY-MM-DD')=p->>k;
exception when invalid_datetime_format or datetime_field_overflow then return false;
end;
$$;
revoke all on function private.tc_json_integer(jsonb,text,numeric,numeric),private.tc_json_date(jsonb,text,boolean) from public,anon,authenticated;
grant execute on function private.tc_json_integer(jsonb,text,numeric,numeric),private.tc_json_date(jsonb,text,boolean) to authenticated;

create function private.tc_record_valid(k text,p jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
begin
 if jsonb_typeof(p)<>'object' or char_length(coalesce(p->>'notes',''))>500 then return false;end if;
 case k
 when 'trailers' then return coalesce((p->>'plate')~'^[A-Za-z0-9 -]{3,16}$' and
  p->>'type' in ('tautliner','refrigerated','container','tipper','other') and p->>'status' in ('available','in_use','maintenance') and
  private.tc_json_integer(p,'capacityKg',0,100000) and private.tc_json_date(p,'inspectionDueOn',true) and private.tc_json_date(p,'insuranceDueOn',true),false);
 when 'customers' then return coalesce(char_length(btrim(p->>'name')) between 1 and 100 and char_length(btrim(p->>'taxId')) between 1 and 30
  and char_length(coalesce(p->>'email',''))<=254 and char_length(coalesce(p->>'phone',''))<=30 and char_length(coalesce(p->>'address',''))<=240,false);
 when 'trips' then return coalesce(char_length(btrim(p->>'reference')) between 1 and 60 and char_length(btrim(p->>'origin')) between 1 and 120
  and char_length(btrim(p->>'destination')) between 1 and 120 and p->>'status' in ('planned','in_transit','completed','cancelled')
  and private.tc_json_integer(p,'distanceKm',0,1000000) and private.tc_json_integer(p,'amountCents',0,10000000000)
  and private.tc_json_date(p,'startOn',true) and private.tc_json_date(p,'endOn',false)
  and (coalesce(p->>'endOn','')='' or p->>'endOn'>=p->>'startOn'),false);
 when 'maintenance' then return coalesce(p->>'type' in ('preventive','corrective') and char_length(btrim(p->>'description')) between 1 and 240
  and p->>'status' in ('planned','in_progress','completed') and private.tc_json_integer(p,'odometerKm',0,10000000)
  and private.tc_json_integer(p,'amountCents',0,10000000000) and private.tc_json_date(p,'scheduledOn',true)
  and private.tc_json_date(p,'completedOn',p->>'status'='completed') and private.tc_json_date(p,'nextDueOn',false)
  and (p->>'nextDueKm' is null or private.tc_json_integer(p,'nextDueKm',0,10000000)),false);
 when 'fuel' then return coalesce(private.tc_json_date(p,'date',true) and private.tc_json_integer(p,'odometerKm',0,10000000)
  and private.tc_json_integer(p,'millilitres',1,5000000) and private.tc_json_integer(p,'amountCents',1,10000000000)
  and char_length(btrim(p->>'station')) between 1 and 120 and jsonb_typeof(p->'fullTank')='boolean',false);
 when 'deadlines' then return coalesce(char_length(btrim(p->>'title')) between 1 and 160 and p->>'category' in ('insurance','inspection','permit','tachograph','medical','other')
  and p->>'status' in ('active','resolved') and private.tc_json_date(p,'dueOn',true) and private.tc_json_integer(p,'remindDays',0,365),false);
 when 'alerts' then return coalesce(char_length(btrim(p->>'title')) between 1 and 160 and private.tc_json_date(p,'dueOn',true)
  and p->>'status' in ('open','acknowledged') and p->>'priority' in ('normal','urgent') and char_length(coalesce(p->>'sourceKey',''))<=180,false);
 else return false;end case;
end;
$$;
revoke all on function private.tc_record_valid(text,jsonb) from public,anon,authenticated;
grant execute on function private.tc_record_valid(text,jsonb) to authenticated;

create function private.tc_validate_record_trigger() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if not private.tc_record_valid(new.kind,new.payload) then raise exception 'Revisa los datos de la operación' using errcode='23514';end if;
 if tg_op='UPDATE' then
  if new.organization_id<>old.organization_id or new.kind<>old.kind then raise exception 'No se puede trasladar el registro';end if;
  if old.finance_entry_id is not null and new.payload is distinct from old.payload then raise exception 'Conserva el registro contabilizado';end if;
  new.row_version:=old.row_version+1;new.created_at:=old.created_at;
 else new.row_version:=1;new.created_at:=now();end if;
 new.updated_at:=now();
 new.truck_id:=nullif(new.payload->>'truckId','')::uuid;new.driver_id:=nullif(new.payload->>'driverId','')::uuid;
 new.trailer_id:=nullif(new.payload->>'trailerId','')::uuid;new.customer_id:=nullif(new.payload->>'customerId','')::uuid;
 if new.kind in ('trips','maintenance','fuel') and new.truck_id is null then raise exception 'Selecciona un camión';end if;
 if new.trailer_id is not null and not exists(select 1 from private.fleet_records where organization_id=new.organization_id and id=new.trailer_id and kind='trailers') then raise exception 'Remolque no disponible';end if;
 if new.customer_id is not null and not exists(select 1 from private.fleet_records where organization_id=new.organization_id and id=new.customer_id and kind='customers') then raise exception 'Cliente no disponible';end if;
 if new.kind='fuel' then
  perform id from public.trucks where organization_id=new.organization_id and id=new.truck_id for update;
  if exists(select 1 from private.fleet_records r where r.organization_id=new.organization_id and r.truck_id=new.truck_id and r.kind='fuel' and r.id<>new.id
   and ((r.payload->>'date'<new.payload->>'date' and (r.payload->>'odometerKm')::bigint>(new.payload->>'odometerKm')::bigint)
   or (r.payload->>'date'>new.payload->>'date' and (r.payload->>'odometerKm')::bigint<(new.payload->>'odometerKm')::bigint))) then raise exception 'El kilometraje no sigue el historial del camión';end if;
 end if;
 return new;
end;
$$;
revoke all on function private.tc_validate_record_trigger() from public,anon,authenticated;
create trigger tc_record_validation before insert or update on private.fleet_records for each row execute function private.tc_validate_record_trigger();
alter table private.fleet_records enable row level security;
create policy fleet_records_read on private.fleet_records for select to authenticated using(private.tc_account_active(organization_id));
create policy fleet_records_insert on private.fleet_records for insert to authenticated with check(private.tc_can_write_company(organization_id) and private.tc_feature(organization_id,kind));
create policy fleet_records_update on private.fleet_records for update to authenticated using(private.tc_can_write_company(organization_id) and private.tc_feature(organization_id,kind)) with check(private.tc_can_write_company(organization_id) and private.tc_feature(organization_id,kind));
create policy fleet_records_delete on private.fleet_records for delete to authenticated using(private.tc_can_write_company(organization_id) and private.tc_feature(organization_id,kind) and finance_entry_id is null);
revoke all on private.fleet_records from public,anon,authenticated;
grant select,delete on private.fleet_records to authenticated;
grant insert(id,organization_id,kind,payload) on private.fleet_records to authenticated;
grant update(payload) on private.fleet_records to authenticated;

-- The operational ledger stays in the unexposed schema. These RPCs are bound to
-- auth.uid(), pass through RLS, and use versions to prevent silent overwrites.
create function private.tc_record_json(r private.fleet_records) returns jsonb
language sql immutable security invoker set search_path='' as $$
 select jsonb_build_object('id',r.id,'kind',r.kind,'data',r.payload,'version',r.row_version,'financeEntryId',r.finance_entry_id);
$$;
revoke all on function private.tc_record_json(private.fleet_records) from public,anon,authenticated;
grant execute on function private.tc_record_json(private.fleet_records) to authenticated;

create function private.tc_list_records(p_org uuid,p_after uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
 if (select auth.uid()) is null or not private.tc_account_active(p_org) then raise exception 'Empresa no disponible' using errcode='42501';end if;
 return coalesce((select jsonb_agg(private.tc_record_json(r) order by r.id) from
  (select * from private.fleet_records where organization_id=p_org and (p_after is null or id>p_after) order by id limit 500) r),'[]'::jsonb);
end;
$$;
revoke all on function private.tc_list_records(uuid,uuid) from public,anon,authenticated;
grant execute on function private.tc_list_records(uuid,uuid) to authenticated;
create function public.tc_list_records(p_org uuid,p_after uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$select private.tc_list_records(p_org,p_after);$$;
revoke all on function public.tc_list_records(uuid,uuid) from public,anon,authenticated;
grant execute on function public.tc_list_records(uuid,uuid) to authenticated;

create function private.tc_save_record(p_org uuid,p_id uuid,p_kind text,p_payload jsonb,p_expected bigint) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r private.fleet_records;
begin
 if (select auth.uid()) is null or not private.tc_can_write_company(p_org) or not private.tc_feature(p_org,p_kind) then
  raise exception 'Sin permiso para este módulo' using errcode='42501';end if;
 select * into r from private.fleet_records where organization_id=p_org and id=p_id for update;
 if found then
  if r.kind<>p_kind then raise exception 'Tipo de registro incorrecto' using errcode='23514';end if;
  if (p_expected is null and r.row_version=1 or r.row_version=p_expected+1) and r.payload=p_payload then return private.tc_record_json(r);end if;
  if p_expected is null or r.row_version<>p_expected then raise exception 'Otro dispositivo ha cambiado este registro' using errcode='40001';end if;
  update private.fleet_records set payload=p_payload where organization_id=p_org and id=p_id returning * into r;
 else
  if p_expected is not null then raise exception 'El registro ya no existe' using errcode='40001';end if;
  insert into private.fleet_records(id,organization_id,kind,payload) values(p_id,p_org,p_kind,p_payload) returning * into r;
 end if;
 return private.tc_record_json(r);
end;
$$;
revoke all on function private.tc_save_record(uuid,uuid,text,jsonb,bigint) from public,anon,authenticated;
grant execute on function private.tc_save_record(uuid,uuid,text,jsonb,bigint) to authenticated;
create function public.tc_save_record(p_org uuid,p_id uuid,p_kind text,p_payload jsonb,p_expected bigint default null) returns jsonb
language sql security invoker set search_path='' as $$select private.tc_save_record(p_org,p_id,p_kind,p_payload,p_expected);$$;
revoke all on function public.tc_save_record(uuid,uuid,text,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.tc_save_record(uuid,uuid,text,jsonb,bigint) to authenticated;

create function private.tc_delete_record(p_org uuid,p_id uuid,p_expected bigint) returns void
language plpgsql security invoker set search_path='' as $$
declare r private.fleet_records;
begin
 if (select auth.uid()) is null or not private.tc_can_write_company(p_org) then raise exception 'Sin permiso de escritura' using errcode='42501';end if;
 select * into r from private.fleet_records where organization_id=p_org and id=p_id for update;
 if not found then return;end if;
 if not private.tc_feature(p_org,r.kind) then raise exception 'Módulo desactivado' using errcode='42501';end if;
 if r.row_version<>p_expected then raise exception 'Otro dispositivo ha cambiado este registro' using errcode='40001';end if;
 if r.finance_entry_id is not null then raise exception 'Conserva el registro contabilizado' using errcode='23514';end if;
 delete from private.fleet_records where organization_id=p_org and id=p_id;
end;
$$;
revoke all on function private.tc_delete_record(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function private.tc_delete_record(uuid,uuid,bigint) to authenticated;
create function public.tc_delete_record(p_org uuid,p_id uuid,p_expected bigint) returns void
language sql security invoker set search_path='' as $$select private.tc_delete_record(p_org,p_id,p_expected);$$;
revoke all on function public.tc_delete_record(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.tc_delete_record(uuid,uuid,bigint) to authenticated;

create function private.tc_book_record(p_org uuid,p_record uuid,p_expected bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.fleet_records; entry uuid; entry_kind text; category text; concept text; day date; km bigint:=0;
begin
 if (select auth.uid()) is null or not private.tc_can_write_company(p_org) then raise exception 'Sin permiso de escritura' using errcode='42501';end if;
 select * into r from private.fleet_records where organization_id=p_org and id=p_record for update;
 if not found or r.kind not in ('trips','maintenance','fuel') or not private.tc_feature(p_org,r.kind) then raise exception 'Registro no disponible' using errcode='42501';end if;
 entry_kind:=case when r.kind='trips' then 'income' else 'expense' end;
 if not private.tc_feature(p_org,case when entry_kind='income' then 'income' else 'expenses' end) then raise exception 'Módulo económico desactivado' using errcode='42501';end if;
 if r.finance_entry_id is not null then return jsonb_build_object('entry_id',r.finance_entry_id,'already_booked',true);end if;
 if r.row_version<>p_expected then raise exception 'Otro dispositivo ha cambiado este registro' using errcode='40001';end if;
 if (r.payload->>'amountCents')::bigint<=0 or (r.kind in ('trips','maintenance') and r.payload->>'status'<>'completed') then raise exception 'Finaliza el trabajo y revisa su importe';end if;
 if r.kind='trips' then category:='transport';concept:='Viaje '||(r.payload->>'reference');day:=coalesce(nullif(r.payload->>'endOn',''),r.payload->>'startOn')::date;km:=(r.payload->>'distanceKm')::bigint;
 elsif r.kind='maintenance' then category:='maintenance';concept:=left('Mantenimiento: '||(r.payload->>'description'),160);day:=(r.payload->>'completedOn')::date;
 else category:='fuel';concept:=left('Repostaje: '||(r.payload->>'station'),160);day:=(r.payload->>'date')::date;end if;
 entry:=gen_random_uuid();
 insert into public.finance_entries(id,organization_id,truck_id,kind,concept,date,amount_cents,category,payment_status,distance_km,source_record_id)
  values(entry,p_org,r.truck_id,entry_kind,concept,day,(r.payload->>'amountCents')::bigint,category,'pending',km,r.id);
 update private.fleet_records set finance_entry_id=entry where organization_id=p_org and id=p_record;
 return jsonb_build_object('entry_id',entry,'already_booked',false);
end;
$$;
revoke all on function private.tc_book_record(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function private.tc_book_record(uuid,uuid,bigint) to authenticated;
create function public.tc_book_record(p_org uuid,p_record uuid,p_expected bigint) returns jsonb
language sql security invoker set search_path='' as $$select private.tc_book_record(p_org,p_record,p_expected);$$;
revoke all on function public.tc_book_record(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.tc_book_record(uuid,uuid,bigint) to authenticated;
do $$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  grant select,insert,update,delete on private.fleet_records to service_role;
  grant execute on function private.tc_json_integer(jsonb,text,numeric,numeric),private.tc_json_date(jsonb,text,boolean),private.tc_record_valid(text,jsonb) to service_role;
 end if;
end $$;
