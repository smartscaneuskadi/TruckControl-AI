-- Per-company preparation only. No invoice number, signature, credential or tax submission.
create function private.tc_fiscal_payload_valid(p jsonb, p_kind text) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare o jsonb;
begin
 if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>1024 then return false;end if;
 if p_kind='policy' then
  o:=p->'options';
  if p-array['enabled','options']<>'{}'::jsonb or jsonb_typeof(p->'enabled') is distinct from 'boolean'
    or jsonb_typeof(o) is distinct from 'object' or o-array['ticketbai','verifactu','no_verifactu','external','facturae']<>'{}'::jsonb
    or jsonb_typeof(o->'ticketbai') is distinct from 'boolean' or jsonb_typeof(o->'verifactu') is distinct from 'boolean'
    or jsonb_typeof(o->'no_verifactu') is distinct from 'boolean' or jsonb_typeof(o->'external') is distinct from 'boolean' or jsonb_typeof(o->'facturae') is distinct from 'boolean' then return false;end if;
  return not (p->>'enabled')::boolean or (o->>'ticketbai')::boolean or (o->>'verifactu')::boolean or (o->>'no_verifactu')::boolean or (o->>'external')::boolean;
 elsif p_kind='profile' then
  if p-array['regime','territory','document_format']<>'{}'::jsonb
    or jsonb_typeof(p->'regime') is distinct from 'string' or p->>'regime' not in ('ticketbai','verifactu','no_verifactu','external')
    or jsonb_typeof(p->'document_format') is distinct from 'string' or p->>'document_format' not in ('pdf','facturae') then return false;end if;
  if p->>'regime'='ticketbai' then
   return coalesce(jsonb_typeof(p->'territory')='string' and p->>'territory' in ('araba','bizkaia','gipuzkoa'),false);
  end if;
  return p->'territory' is not distinct from 'null'::jsonb;
 end if;
 return false;
end;$$;
revoke all on function private.tc_fiscal_payload_valid(jsonb,text) from public,anon,authenticated;

create function private.tc_fiscal_actor_verified() returns boolean
language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and exists(select 1 from auth.users u where u.id=(select auth.uid())
  and nullif(to_jsonb(u)->>'email_confirmed_at','') is not null and to_jsonb(u)->>'deleted_at' is null
  and coalesce(nullif(to_jsonb(u)->>'banned_until','')::timestamptz,'-infinity'::timestamptz)<=now());
$$;
create function private.tc_fiscal_global_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select private.tc_fiscal_actor_verified() and private.tc_is_admin();
$$;
create function private.tc_fiscal_company_manager(p_org uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.tc_fiscal_actor_verified() and private.tc_account_active(p_org)
  and coalesce(private.tc_company_role(p_org) in ('owner','admin'),false) and private.tc_feature(p_org,'income');
$$;
revoke all on function private.tc_fiscal_actor_verified(),private.tc_fiscal_global_admin(),private.tc_fiscal_company_manager(uuid) from public,anon,authenticated;
grant execute on function private.tc_fiscal_global_admin(),private.tc_fiscal_company_manager(uuid) to authenticated;

create table private.tc_fiscal_policies (
 organization_id uuid primary key references public.organizations(id) on delete restrict,
 payload jsonb not null check(private.tc_fiscal_payload_valid(payload,'policy')),
 row_version bigint not null default 1 check(row_version>0),
 updated_at timestamptz not null default now(),updated_by uuid not null
);
create table private.tc_fiscal_profiles (
 organization_id uuid primary key references public.organizations(id) on delete restrict,
 payload jsonb not null check(private.tc_fiscal_payload_valid(payload,'profile')),
 row_version bigint not null default 1 check(row_version>0),
 updated_at timestamptz not null default now(),updated_by uuid not null
);
alter table private.tc_fiscal_policies enable row level security;
alter table private.tc_fiscal_profiles enable row level security;
revoke all on private.tc_fiscal_policies,private.tc_fiscal_profiles from public,anon,authenticated;
grant select on private.tc_fiscal_policies,private.tc_fiscal_profiles to authenticated;
create policy fiscal_policy_read on private.tc_fiscal_policies for select to authenticated
 using ((select private.tc_fiscal_global_admin()) or private.tc_fiscal_company_manager(organization_id));
create policy fiscal_profile_read on private.tc_fiscal_profiles for select to authenticated
 using ((select private.tc_fiscal_global_admin()) or private.tc_fiscal_company_manager(organization_id));

create function private.tc_fiscal_state(p_org uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('schema_version',1,'phase','preparation','emission_available',false,
  'organization_id',o.id,'organization_name',o.name,
  'policy',coalesce(p.payload,'{"enabled":false,"options":{"ticketbai":false,"verifactu":false,"no_verifactu":false,"external":false,"facturae":false}}'::jsonb)
    ||jsonb_build_object('version',p.row_version,'updated_at',p.updated_at),
  'profile',case when f.organization_id is null then null else f.payload||jsonb_build_object('version',f.row_version,'updated_at',f.updated_at) end,
  'configured_option_allowed',coalesce((p.payload->>'enabled')::boolean
    and (p.payload->'options'->>(f.payload->>'regime'))::boolean
    and (f.payload->>'document_format'='pdf' or (p.payload->'options'->>'facturae')::boolean),false))
 from public.organizations o left join private.tc_fiscal_policies p on p.organization_id=o.id
 left join private.tc_fiscal_profiles f on f.organization_id=o.id where o.id=p_org;
$$;
revoke all on function private.tc_fiscal_state(uuid) from public,anon,authenticated;

-- Definer is required for global enumeration and writes without granting table DML.
-- Global branches require a verified platform administrator; company branches require
-- a verified active owner/admin with the income module. User metadata is never authority.
create function private.tc_company_fiscal_control(p_org uuid,p_action text,p_data jsonb,p_expected bigint,p_after uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());pol private.tc_fiscal_policies;prof private.tc_fiscal_profiles;
 result jsonb;next_version bigint;
begin
 if not private.tc_fiscal_actor_verified() then raise exception 'Inicia sesión con una cuenta verificada' using errcode='42501';end if;
 if p_action is null or p_action not in ('status','save','admin_list','admin_set') then raise exception 'Acción fiscal no válida' using errcode='22023';end if;
 if p_action in ('admin_list','admin_set') then
  if not private.tc_fiscal_global_admin() then raise exception 'Solo la administración global puede gestionar opciones fiscales' using errcode='42501';end if;
 else
  if p_org is null or not private.tc_fiscal_company_manager(p_org) then raise exception 'Sin permiso para configurar la facturación de esta empresa' using errcode='42501';end if;
 end if;
 if p_action in ('status','admin_list') then
  if p_data is distinct from '{}'::jsonb or p_expected is not null or (p_action='status' and p_after is not null)
    or (p_action='admin_list' and p_org is not null) then raise exception 'Consulta fiscal no válida' using errcode='23514';end if;
  if p_action='status' then return private.tc_fiscal_state(p_org);end if;
  with picked as (select o.id from public.organizations o where p_after is null or o.id>p_after order by o.id limit 51),
   first_page as (select id from picked order by id limit 50)
  select jsonb_build_object('items',coalesce(jsonb_agg(private.tc_fiscal_state(id) order by id),'[]'::jsonb),
    'next_cursor',case when (select count(*) from picked)>50 then (select id from first_page order by id desc limit 1) else null end)
   into result from first_page;
  return result;
 end if;
 if p_org is null or p_after is not null or (p_expected is not null and p_expected<1)
   or not exists(select 1 from public.organizations where id=p_org) then raise exception 'Datos fiscales no válidos' using errcode='23514';end if;
 if not private.tc_fiscal_payload_valid(p_data,case when p_action='admin_set' then 'policy' else 'profile' end) then
  raise exception 'Revisa las opciones, territorio y formato de facturación' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('truckcontrol.fiscal:'||p_org::text,0));
 if p_action='admin_set' then
  if not private.tc_fiscal_global_admin() then raise exception 'Administración fiscal no autorizada' using errcode='42501';end if;
  select * into pol from private.tc_fiscal_policies where organization_id=p_org for update;
  if found then
   if pol.payload=p_data and ((p_expected is null and pol.row_version=1) or p_expected=pol.row_version or p_expected=pol.row_version-1) then return private.tc_fiscal_state(p_org);end if;
   if p_expected is null or p_expected<>pol.row_version then raise exception 'La política ha cambiado en otro dispositivo' using errcode='40001';end if;
   update private.tc_fiscal_policies set payload=p_data,row_version=row_version+1,updated_at=now(),updated_by=actor where organization_id=p_org returning row_version into next_version;
  else
   if p_expected is not null then raise exception 'La política fiscal ya no está disponible' using errcode='40001';end if;
   insert into private.tc_fiscal_policies(organization_id,payload,updated_by) values(p_org,p_data,actor) returning row_version into next_version;
  end if;
 else
  if not private.tc_fiscal_company_manager(p_org) then raise exception 'Configuración fiscal no autorizada' using errcode='42501';end if;
  select * into pol from private.tc_fiscal_policies where organization_id=p_org for update;
  if not found or not (pol.payload->>'enabled')::boolean
    or not (pol.payload->'options'->>(p_data->>'regime'))::boolean
    or (p_data->>'document_format'='facturae' and not (pol.payload->'options'->>'facturae')::boolean) then
   raise exception 'La administración no ha permitido esta opción' using errcode='42501';end if;
  select * into prof from private.tc_fiscal_profiles where organization_id=p_org for update;
  if found then
   if prof.payload=p_data and ((p_expected is null and prof.row_version=1) or p_expected=prof.row_version or p_expected=prof.row_version-1) then return private.tc_fiscal_state(p_org);end if;
   if p_expected is null or p_expected<>prof.row_version then raise exception 'El perfil fiscal ha cambiado en otro dispositivo' using errcode='40001';end if;
   update private.tc_fiscal_profiles set payload=p_data,row_version=row_version+1,updated_at=now(),updated_by=actor where organization_id=p_org returning row_version into next_version;
  else
   if p_expected is not null then raise exception 'El perfil fiscal ya no está disponible' using errcode='40001';end if;
   insert into private.tc_fiscal_profiles(organization_id,payload,updated_by) values(p_org,p_data,actor) returning row_version into next_version;
  end if;
 end if;
 insert into private.tc_admin_audit(actor_id,action,target_id,details) values(actor,
  case when p_action='admin_set' then 'fiscal_policy_update' else 'fiscal_profile_update' end,p_org::text,
  jsonb_build_object('organization_id',p_org,'version',next_version,'configuration',p_data,'tax_submission',false,'emission_available',false));
 return private.tc_fiscal_state(p_org);
end;$$;
revoke all on function private.tc_company_fiscal_control(uuid,text,jsonb,bigint,uuid) from public,anon,authenticated;
grant execute on function private.tc_company_fiscal_control(uuid,text,jsonb,bigint,uuid) to authenticated;
create function public.tc_company_fiscal_control(p_org uuid,p_action text,p_data jsonb default '{}',p_expected bigint default null,p_after uuid default null) returns jsonb
language sql security invoker set search_path='' as $$select private.tc_company_fiscal_control(p_org,p_action,p_data,p_expected,p_after);$$;
revoke all on function public.tc_company_fiscal_control(uuid,text,jsonb,bigint,uuid) from public,anon,authenticated;
grant execute on function public.tc_company_fiscal_control(uuid,text,jsonb,bigint,uuid) to authenticated;
