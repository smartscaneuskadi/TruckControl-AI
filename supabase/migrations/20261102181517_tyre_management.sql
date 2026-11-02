-- Additive tyre register, maintenance entitlement, no financial/provider changes.
create function private.tc_tyre_valid(p jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare k text;
begin
 if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>8192 or not (p ?& array[
  'code','truckId','position','status','brand','model','size','installedOn','installedKm','measuredOn',
  'treadTenthsMm','pressureKpa','minTreadTenthsMm','minPressureKpa','maxPressureKpa','nextCheckOn','notes']) then return false;end if;
 if exists(select 1 from jsonb_object_keys(p) fields(name) where fields.name<>all(array[
  'code','truckId','position','status','brand','model','size','installedOn','installedKm','measuredOn',
  'treadTenthsMm','pressureKpa','minTreadTenthsMm','minPressureKpa','maxPressureKpa','nextCheckOn','notes'])) then return false;end if;
 foreach k in array array['code','position','status','brand','model','size','notes'] loop
  if jsonb_typeof(p->k)<>'string' then return false;end if;
 end loop;
 if char_length(btrim(p->>'code')) not between 1 and 60 or char_length(btrim(p->>'position'))>40
  or char_length(p->>'brand')>80 or char_length(p->>'model')>80 or char_length(p->>'size')>40 or char_length(p->>'notes')>500
  or p->>'status' not in ('mounted','stock','retired') then return false;end if;
 if p->'truckId'<>'null'::jsonb then
  if jsonb_typeof(p->'truckId')<>'string' then return false;end if;
  perform (p->>'truckId')::uuid;
 end if;
 if p->>'status'='mounted' then
  if p->>'truckId' is null or char_length(btrim(p->>'position'))=0 then return false;end if;
 elsif p->>'truckId' is not null or char_length(btrim(p->>'position'))<>0 then return false;end if;
 foreach k in array array['installedOn','measuredOn','nextCheckOn'] loop
  if p->k<>'null'::jsonb and (jsonb_typeof(p->k)<>'string' or p->>k='' or not private.tc_json_date(p,k,true)) then return false;end if;
 end loop;
 if p->'installedKm'<>'null'::jsonb and not private.tc_json_integer(p,'installedKm',0,10000000) then return false;end if;
 foreach k in array array['treadTenthsMm','minTreadTenthsMm'] loop
  if p->k<>'null'::jsonb and not private.tc_json_integer(p,k,0,400) then return false;end if;
 end loop;
 foreach k in array array['pressureKpa','minPressureKpa','maxPressureKpa'] loop
  if p->k<>'null'::jsonb and not private.tc_json_integer(p,k,0,2000) then return false;end if;
 end loop;
 if (p->>'treadTenthsMm' is not null or p->>'pressureKpa' is not null) and p->>'measuredOn' is null then return false;end if;
 if p->>'installedOn' is not null and p->>'measuredOn' is not null and p->>'measuredOn'<p->>'installedOn' then return false;end if;
 if p->>'minPressureKpa' is not null and p->>'maxPressureKpa' is not null and (p->>'minPressureKpa')::integer>(p->>'maxPressureKpa')::integer then return false;end if;
 return true;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end;$$;
revoke all on function private.tc_tyre_valid(jsonb) from public,anon,authenticated;
grant execute on function private.tc_tyre_valid(jsonb) to authenticated;

create table private.company_tyres(
 id uuid primary key,
 organization_id uuid not null references public.organizations(id) on delete restrict,
 payload jsonb not null check(private.tc_tyre_valid(payload)),
 truck_id uuid generated always as ((payload->>'truckId')::uuid) stored,
 row_version bigint not null default 1 check(row_version>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,truck_id) references public.trucks(organization_id,id) on delete restrict
);
create index company_tyres_org_page on private.company_tyres(organization_id,id);
create index company_tyres_truck on private.company_tyres(organization_id,truck_id);
create unique index company_tyres_code on private.company_tyres(organization_id,upper(btrim(payload->>'code')));
create unique index company_tyres_position on private.company_tyres(organization_id,truck_id,upper(regexp_replace(btrim(payload->>'position'),'\s+',' ','g'))) where payload->>'status'='mounted';
create table private.company_tyre_history(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,
 tyre_id uuid not null,row_version bigint not null,payload jsonb not null,
 actor_id uuid not null,changed_at timestamptz not null default now(),
 foreign key(organization_id,tyre_id) references private.company_tyres(organization_id,id) on delete restrict,
 unique(organization_id,tyre_id,row_version)
);
create index company_tyre_history_page on private.company_tyre_history(organization_id,id);
create index company_tyre_history_tyre_page on private.company_tyre_history(organization_id,tyre_id,id);
alter table private.company_tyres enable row level security;
alter table private.company_tyre_history enable row level security;
create policy tyres_read on private.company_tyres for select to authenticated using(
 (select auth.uid()) is not null and private.tc_account_active(organization_id) and private.tc_feature(organization_id,'maintenance'));
create policy tyres_insert on private.company_tyres for insert to authenticated with check(
 (select auth.uid()) is not null and private.tc_can_write_company(organization_id) and private.tc_feature(organization_id,'maintenance'));
create policy tyres_update on private.company_tyres for update to authenticated using(
 (select auth.uid()) is not null and private.tc_can_write_company(organization_id) and private.tc_feature(organization_id,'maintenance')) with check(
 (select auth.uid()) is not null and private.tc_can_write_company(organization_id) and private.tc_feature(organization_id,'maintenance'));
create policy tyre_history_read on private.company_tyre_history for select to authenticated using(
 (select auth.uid()) is not null and private.tc_account_active(organization_id) and private.tc_feature(organization_id,'maintenance'));
revoke all on private.company_tyres,private.company_tyre_history from public,anon,authenticated;
grant select on private.company_tyres,private.company_tyre_history to authenticated;
grant insert(id,organization_id,payload) on private.company_tyres to authenticated;
grant update(payload) on private.company_tyres to authenticated;

create function private.tc_tyre_before_write() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if (select auth.uid()) is null or not private.tc_can_write_company(new.organization_id) or not private.tc_feature(new.organization_id,'maintenance') then
  raise exception 'Neumaticos no autorizados' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('truckcontrol.tyres:'||new.organization_id::text,0));
 if not private.tc_tyre_valid(new.payload) then raise exception 'Revisa los datos del neumatico' using errcode='23514';end if;
 if (new.payload->>'measuredOn')::date>timezone('UTC',now())::date or (new.payload->>'installedOn')::date>timezone('UTC',now())::date then
  raise exception 'No registres mediciones o montajes futuros' using errcode='23514';end if;
 if tg_op='UPDATE' then
  if new.id<>old.id or new.organization_id<>old.organization_id then raise exception 'No se puede trasladar el neumatico' using errcode='23514';end if;
  new.row_version:=old.row_version+1;new.created_at:=old.created_at;
 else
  new.row_version:=1;new.created_at:=now();
 end if;
 new.updated_at:=now();return new;
end;$$;
revoke all on function private.tc_tyre_before_write() from public,anon,authenticated;
create trigger tc_tyre_before_write before insert or update on private.company_tyres for each row execute function private.tc_tyre_before_write();
-- Intentional private-only definer: append an unforgeable revision; clients cannot mutate history.
create function private.tc_tyre_audit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if (select auth.uid()) is null or not private.tc_can_write_company(new.organization_id) or not private.tc_feature(new.organization_id,'maintenance') then
  raise exception 'Auditoria no autorizada' using errcode='42501';end if;
 -- The caller holds the tenant advisory lock. Count without per-row RLS lookups.
 if tg_op='INSERT' and (select count(*) from private.company_tyres where organization_id=new.organization_id)>5000 then
  raise exception 'Limite de 5000 neumaticos' using errcode='23514';end if;
 insert into private.company_tyre_history(organization_id,tyre_id,row_version,payload,actor_id)
  values(new.organization_id,new.id,new.row_version,new.payload,(select auth.uid()));
 return new;
end;$$;
revoke all on function private.tc_tyre_audit() from public,anon,authenticated;
create trigger tc_tyre_audit after insert or update on private.company_tyres for each row execute function private.tc_tyre_audit();

create function private.tc_tyre_json(r private.company_tyres) returns jsonb
language sql immutable security invoker set search_path='' as $$
 select jsonb_build_object('id',r.id,'organizationId',r.organization_id,'data',r.payload,'version',r.row_version,'updatedAt',r.updated_at);
$$;
revoke all on function private.tc_tyre_json(private.company_tyres) from public,anon,authenticated;
grant execute on function private.tc_tyre_json(private.company_tyres) to authenticated;
create function private.tc_tyre_page(p_org uuid,p_kind text,p_after uuid,p_tyre uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
 if (select auth.uid()) is null or not private.tc_account_active(p_org) or not private.tc_feature(p_org,'maintenance') then
  raise exception 'Neumaticos no autorizados' using errcode='42501';end if;
 if p_kind='tyres' and p_tyre is null then
  return coalesce((select jsonb_agg(private.tc_tyre_json(r) order by r.id) from
   (select * from private.company_tyres where organization_id=p_org and (p_after is null or id>p_after) order by id limit 200) r),'[]'::jsonb);
 elsif p_kind='history' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'organizationId',r.organization_id,'tyreId',r.tyre_id,'data',r.payload,'version',r.row_version,'changedAt',r.changed_at) order by r.id) from
   (select * from private.company_tyre_history where organization_id=p_org and (p_after is null or id>p_after) and (p_tyre is null or tyre_id=p_tyre) order by id limit 200) r),'[]'::jsonb);
 end if;
 raise exception 'Consulta no disponible' using errcode='22023';
end;$$;
revoke all on function private.tc_tyre_page(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function private.tc_tyre_page(uuid,text,uuid,uuid) to authenticated;
create function public.tc_tyre_page(p_org uuid,p_kind text default 'tyres',p_after uuid default null,p_tyre uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$select private.tc_tyre_page(p_org,p_kind,p_after,p_tyre);$$;
revoke all on function public.tc_tyre_page(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.tc_tyre_page(uuid,text,uuid,uuid) to authenticated;

create function private.tc_save_tyre(p_org uuid,p_id uuid,p_data jsonb,p_expected bigint) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r private.company_tyres;
begin
 if (select auth.uid()) is null or not private.tc_can_write_company(p_org) or not private.tc_feature(p_org,'maintenance') then
  raise exception 'Sin permiso para neumaticos' using errcode='42501';end if;
 if not private.tc_tyre_valid(p_data) then raise exception 'Revisa los datos del neumatico' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('truckcontrol.tyres:'||p_org::text,0));
 select * into r from private.company_tyres where organization_id=p_org and id=p_id for update;
 if found then
  if ((p_expected is null and r.row_version=1) or r.row_version=p_expected or r.row_version=p_expected+1) and r.payload=p_data then return private.tc_tyre_json(r);end if;
  if p_expected is null or r.row_version<>p_expected then raise exception 'Otro dispositivo ha cambiado el neumatico' using errcode='40001';end if;
  update private.company_tyres set payload=p_data where organization_id=p_org and id=p_id returning * into r;
 else
  if p_expected is not null then raise exception 'El neumatico ya no esta disponible' using errcode='40001';end if;
  insert into private.company_tyres(id,organization_id,payload) values(p_id,p_org,p_data) returning * into r;
 end if;
 return private.tc_tyre_json(r);
end;$$;
revoke all on function private.tc_save_tyre(uuid,uuid,jsonb,bigint) from public,anon,authenticated;
grant execute on function private.tc_save_tyre(uuid,uuid,jsonb,bigint) to authenticated;
create function public.tc_save_tyre(p_org uuid,p_id uuid,p_data jsonb,p_expected bigint default null) returns jsonb
language sql security invoker set search_path='' as $$select private.tc_save_tyre(p_org,p_id,p_data,p_expected);$$;
revoke all on function public.tc_save_tyre(uuid,uuid,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.tc_save_tyre(uuid,uuid,jsonb,bigint) to authenticated;
