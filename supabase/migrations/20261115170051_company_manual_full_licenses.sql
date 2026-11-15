-- Generated locally with official Supabase CLI 3.1.0. Candidate only.
-- Manual Full is per company, independent of Stripe/payment switches. No provider,
-- account entitlement, applied migration, enrollment setting or business row changes.
do $prior$ begin
 if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('private.tc_account_active(uuid)') and md5(prosrc)='533ab690fbd7fe74419c99696168f3d9') then raise exception 'company_full_prior_body_mismatch';end if;
 if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('private.tc_organization_access_for(uuid,uuid)') and md5(prosrc)='79f786304f81a82222f63097dfd6fb29') then raise exception 'company_full_prior_body_mismatch';end if;
 if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('private.tc_user_access(uuid)') and md5(prosrc)='88a32bd17730eedde1672b09b65401f1') then raise exception 'company_full_prior_body_mismatch';end if;
 if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('private.tc_truck_limit()') and md5(prosrc)='1406e528d82ea16f433a5098709496fc') then raise exception 'company_full_prior_body_mismatch';end if;
 if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('public.gmail_server(text,jsonb)') and md5(prosrc)='6c072ff46cd76da64b641ab0a8bcdcf7') then raise exception 'company_full_prior_body_mismatch';end if;
end;$prior$;

create table private.tc_company_full_licenses(
 organization_id uuid primary key references public.organizations(id) on delete restrict,
 enabled boolean not null,expires_at timestamptz,
 revision bigint not null check(revision between 1 and 9007199254740991),
 updated_at timestamptz not null,updated_by uuid not null references auth.users(id) on delete restrict,
 check(expires_at is null or isfinite(expires_at))
);
create table private.tc_company_full_audit(
 operation_id uuid primary key,organization_id uuid not null references public.organizations(id) on delete restrict,
 revision bigint not null,actor_id uuid not null references auth.users(id) on delete restrict,
 actor_email text not null,changed_at timestamptz not null,
 request jsonb not null,before_state jsonb not null,after_state jsonb not null,
 unique(organization_id,revision)
);
create index tc_company_full_audit_actor_idx on private.tc_company_full_audit(actor_id);
alter table private.tc_company_full_licenses enable row level security;
alter table private.tc_company_full_audit enable row level security;
revoke all on private.tc_company_full_licenses,private.tc_company_full_audit from public,anon,authenticated;
create trigger tc_company_full_audit_immutable before update or delete or truncate on private.tc_company_full_audit
 for each statement execute function private.tc_manual_subscription_intake_reject_mutation();

-- Internal metadata only. Callers must first enforce live identity and membership.
create function private.tc_company_full_state(p_org uuid) returns jsonb
language sql stable security definer set search_path='' as $state$
 select jsonb_build_object('schema_version',1,'configured',l.organization_id is not null,
  'status',case when l.organization_id is null then 'unconfigured' when not l.enabled then 'disabled'
   when l.expires_at is not null and l.expires_at<=now() then 'expired' else 'active' end,
  'enabled',l.enabled,'expires_at',l.expires_at,'revision',coalesce(l.revision,0),'updated_at',l.updated_at)
 from (select p_org id) o left join private.tc_company_full_licenses l on l.organization_id=o.id;
$state$;
revoke all on function private.tc_company_full_state(uuid) from public,anon,authenticated;
do $server_read$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant select on private.tc_company_full_licenses to service_role;
 create policy tc_company_full_server_read on private.tc_company_full_licenses for select to service_role using(true);
end if;end;$server_read$;

create or replace function private.tc_account_active(p_organization_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());enforcement boolean;manual jsonb;
begin
 if not private.tc_current_actor_verified() then return false;end if;
 if actor is null or private.tc_company_role_for(p_organization_id,actor) is null then return false;end if;
 manual:=private.tc_company_full_state(p_organization_id);
 if (manual->>'configured')::boolean then
  if manual->>'status'<>'active' then return false;end if;
  return exists(select 1 from public.organizations o
   join private.tc_customers c on c.user_id=o.owner_id
   join private.tc_customers a on a.user_id=actor
   join auth.users u on u.id=actor cross join private.tc_settings s
   where o.id=p_organization_id and c.status<>'suspended' and a.status<>'suspended'
    and private.tc_actor_verified(o.owner_id,false)
    and (not s.sms_ready or (u.phone_confirmed_at is not null
      and ('+'||regexp_replace(coalesce(u.phone,''),'[^0-9]','','g'))=a.phone)));
 end if;
 select enforce_access into enforcement from private.tc_settings where id=true;
 if not enforcement then return true;end if;
 return exists(select 1 from public.organizations o
  join private.tc_customers c on c.user_id=o.owner_id
  join private.tc_customers a on a.user_id=actor
  join auth.users u on u.id=actor cross join private.tc_settings s
  where o.id=p_organization_id and c.status<>'suspended' and a.status<>'suspended'
   and u.email_confirmed_at is not null
   and (not s.sms_ready or (u.phone_confirmed_at is not null and ('+'||regexp_replace(coalesce(u.phone,''),'[^0-9]','','g'))=a.phone))
   and ((c.status='trial' and now()<c.trial_ends_at) or (c.status='active' and now()<c.paid_until)));
end;
$$;

create or replace function private.tc_organization_access_for(p_org uuid,p_user uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare o public.organizations; c private.tc_customers; a private.tc_customers; s private.tc_settings;
 r text; plan_id text; enabled boolean; phone_needed boolean; u record; profile jsonb; manual jsonb;
begin
 -- Human requests bind their own live session. Explicit server/background users
 -- still require a valid Auth row, role and licence, without a human session.
 if not private.tc_actor_verified(p_user,p_user is not distinct from (select auth.uid())) then
  return jsonb_build_object('active',false,'features','{}'::jsonb,'profile',null);
 end if;
 r:=private.tc_company_role_for(p_org,p_user);
 if r is null then return jsonb_build_object('active',false,'features','{}'::jsonb,'profile',null);end if;
 manual:=private.tc_company_full_state(p_org);
 select * into s from private.tc_settings where id=true;
 if not s.enforce_access and not (manual->>'configured')::boolean then
  return jsonb_build_object('active',true,'is_admin',false,'features',(select jsonb_object_agg(id,true) from private.tc_modules),
   'company_role',r,'can_write',r<>'viewer','can_manage',r in ('owner','admin'),'organization_id',p_org,'profile',null,'max_trucks',50,'manual_full',manual,'observed_at',now());
 end if;
 select * into o from public.organizations where id=p_org;
 select * into c from private.tc_customers where user_id=o.owner_id;
 select * into a from private.tc_customers where user_id=p_user;
 select * into u from auth.users where id=p_user;
 phone_needed:=s.sms_ready and (u.phone_confirmed_at is null or ('+'||regexp_replace(coalesce(u.phone,''),'[^0-9]','','g'))<>a.phone);
 enabled:=c.user_id is not null and a.user_id is not null and a.status<>'suspended' and c.status<>'suspended'
  and u.email_confirmed_at is not null and not coalesce(phone_needed,true)
  and ((c.status='trial' and now()<c.trial_ends_at) or (c.status='active' and now()<c.paid_until));
 if (manual->>'configured')::boolean then
  enabled:=c.user_id is not null and a.user_id is not null and c.status<>'suspended' and a.status<>'suspended'
   and private.tc_actor_verified(o.owner_id,false) and not coalesce(phone_needed,true)
   and manual->>'status'='active';
  plan_id:='full';
 else
  plan_id:=private.tc_customer_plan(c);
 end if;
 profile:=to_jsonb(a)-'stripe_subscription_id'||jsonb_build_object('company_name',o.name,
  'status',case when a.status='suspended' then 'suspended' else c.status end,
  'trial_started_at',c.trial_started_at,'trial_ends_at',c.trial_ends_at,'paid_until',c.paid_until,'paid_plan',c.paid_plan,'trial_plan_id',c.trial_plan_id);
 return jsonb_build_object('active',coalesce(enabled,false),'is_admin',false,
  'features',private.tc_company_features(p_org,p_user,plan_id,coalesce(enabled,false)),
  'company_role',r,'can_write',coalesce(enabled,false) and r<>'viewer','can_manage',coalesce(enabled,false) and r in ('owner','admin'),
  'organization_id',p_org,'profile',profile,'plan',plan_id,
  'max_trucks',coalesce((select max_trucks from private.tc_plans where id=plan_id),50),
  'requires_phone_verification',coalesce(phone_needed,false),'sms_ready',s.sms_ready,
  'prices_are_examples',s.prices_are_examples,'payments_enabled',s.payments_enabled,
  'manual_full',manual,'observed_at',now());
end;
$$;

create or replace function private.tc_user_access(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c private.tc_customers; p private.tc_plans; s private.tc_settings; active boolean; f jsonb; is_admin boolean; requires_phone boolean; actor_verified boolean; company_available boolean;
begin
  -- Internal-only helper: all externally callable wrappers bind auth.uid().
  if p_user_id is null then return '{}'::jsonb;end if;
  actor_verified:=private.tc_actor_verified(p_user_id,p_user_id is not distinct from (select auth.uid()));
  select * into s from private.tc_settings where id=true;
  select actor_verified and exists(select 1 from private.tc_admins where user_id=p_user_id) into is_admin;
  select * into c from private.tc_customers where user_id=p_user_id;
  requires_phone := not is_admin and c.user_id is not null and s.sms_ready and not exists(
    select 1 from auth.users u where u.id=p_user_id and u.phone_confirmed_at is not null
    and ('+'||regexp_replace(coalesce(u.phone,''),'[^0-9]','','g'))=c.phone);
  active := actor_verified and (is_admin or (c.user_id is not null and c.status<>'suspended' and not coalesce(requires_phone,false) and
    ((c.status='trial' and now()<c.trial_ends_at) or (c.status='active' and now()<c.paid_until))));
  select * into p from private.tc_plans where id=private.tc_customer_plan(c);
  select jsonb_object_agg(m.id,coalesce(active,false) and m.enabled and
    (is_admin or coalesce((c.module_overrides->>m.id)::boolean,(p.modules->>m.id)::boolean,false)) and
    (m.id not in ('invoice_ai','document_ai') or (not is_admin and c.ai_allowed and c.ai_opt_in))) into f from private.tc_modules m;
  company_available:=actor_verified and not is_admin and exists(
   select 1 from private.tc_company_full_licenses l
   where l.enabled and (l.expires_at is null or l.expires_at>now())
    and private.tc_company_role_for(l.organization_id,p_user_id) is not null
    and coalesce((private.tc_organization_access_for(l.organization_id,p_user_id)->>'active')::boolean,false));
  return jsonb_build_object('is_admin',is_admin,'active',coalesce(active,false) or coalesce(company_available,false),
    'company_access_available',coalesce(company_available,false),'features',coalesce(f,'{}'),
    'profile',case when c.user_id is null or not actor_verified then null else to_jsonb(c)-'stripe_subscription_id' end,
    'plan',private.tc_customer_plan(c),
    'max_trucks',coalesce(p.max_trucks,50),'requires_phone_verification',coalesce(requires_phone,false),
    'sms_ready',s.sms_ready,'prices_are_examples',s.prices_are_examples,'payments_enabled',s.payments_enabled);
end;
$$;

create or replace function private.tc_truck_limit() returns trigger
language plpgsql security definer set search_path='' as $truck$
declare max_count integer; own uuid; access jsonb; manual jsonb;
begin
 manual:=private.tc_company_full_state(new.organization_id);
 if not (select enforce_access from private.tc_settings where id=true)
  and not (manual->>'configured')::boolean then return new;end if;
 select owner_id into own from public.organizations where id=new.organization_id for update;
 if own is null then return new;end if;
 access:=private.tc_organization_access_for(new.organization_id,own);
 max_count:=coalesce((access->>'max_trucks')::integer,50);
 if (select count(*) from public.trucks where organization_id=new.organization_id)>=max_count then
  raise exception 'Has alcanzado el límite de camiones de tu plan';end if;
 return new;
end;$truck$;

create or replace function public.gmail_server(p_action text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c private.gmail_connections; org uuid; actor uuid; access jsonb;
begin
  if p_data ? 'sync_lease_id' then return private.tc_gmail_sync_fenced(p_action,p_data);end if;
  org:=nullif(p_data->>'organization_id','')::uuid;
  if exists(select 1 from private.tc_company_full_licenses l where l.organization_id=org) then
    actor:=nullif(p_data->>'user_id','')::uuid;
    if actor is null then select owner_id into actor from public.organizations where id=org;end if;
    access:=private.tc_organization_access_for(org,actor);
    if not coalesce((access->>'active')::boolean,false)
      or not coalesce((access->'features'->>'gmail')::boolean,false)
      or (p_action in ('credentials','lock_sync','finish_sync','exists','reserve_ai','record_invoice')
        and not coalesce((access->>'can_write')::boolean,false))
      or (p_action in ('connect','disconnect') and not coalesce((access->>'can_manage')::boolean,false)) then
      if p_action='lock_sync' then return 'false'::jsonb;end if;
      if p_action='finish_sync' then return '{}'::jsonb;end if;
      raise exception 'company_full_inactive' using errcode='42501';
    end if;
    if p_action='reserve_ai' and not coalesce((access->'features'->>'invoice_ai')::boolean,false) then return 'false'::jsonb;end if;
  end if;
  if p_action in ('lock_sync','finish_sync') then
    select * into c from private.gmail_connections
      where organization_id=(p_data->>'organization_id')::uuid for update;
    if p_action='lock_sync' then
      if c.organization_id is null or c.status<>'connected'
        or (c.sync_lease_until is not null and c.sync_lease_until>=now()) then return 'false'::jsonb;end if;
      -- A legacy acquisition replaces, rather than revives, an expired UUID.
      update private.gmail_connections set sync_lease_until=now()+interval '5 minutes',
        sync_lease_id=null,sync_lease_actor=null where organization_id=c.organization_id;
      return 'true'::jsonb;
    elsif c.organization_id is null or c.sync_lease_id is not null or c.sync_lease_until is null then
      return '{}'::jsonb;
    end if;
    -- Keep the row lock until the legacy update completes: the guard and write
    -- cannot straddle a reconnect or a new fenced worker.
    return private.tc_gmail_sync(p_action,p_data);
  end if;
  if p_action in ('state_create','state_consume','pending_create','pending_consume') then return private.tc_gmail_state(p_action,p_data);end if;
  if p_action in ('connect','credentials','disconnect') then return private.tc_gmail_connection(p_action,p_data);end if;
  if p_action in ('lock_sync','finish_sync','exists') then return private.tc_gmail_sync(p_action,p_data);end if;
  if p_action in ('reserve_ai','record_invoice') then return private.tc_gmail_invoices(p_action,p_data);end if;
  raise exception 'Unsupported internal operation';
end;
$$;

create function private.tc_company_full_organization_write() returns trigger
language plpgsql security definer set search_path='' as $write$
begin
 if current_setting('role',true)='authenticated'
  and exists(select 1 from private.tc_company_full_licenses where organization_id=old.id)
  and not private.tc_account_active(old.id) then
  raise exception 'company_full_inactive' using errcode='42501';end if;
 if tg_op='DELETE' then return old;end if;return new;
end;$write$;
revoke all on function private.tc_company_full_organization_write() from public,anon,authenticated;
create trigger tc_company_full_organization_write before update or delete on public.organizations
 for each row execute function private.tc_company_full_organization_write();

create function private.tc_company_full_item(p_org uuid) returns jsonb
language sql stable security definer set search_path='' as $item$
 select jsonb_build_object('organization_id',o.id,'company_name',o.name,'owner_id',o.owner_id,
  'owner_email',u.email,'manual_full',private.tc_company_full_state(o.id),
  'effective_active',coalesce((a.access->>'active')::boolean,false),'effective_plan',a.access->>'plan')
 from public.organizations o join auth.users u on u.id=o.owner_id
 cross join lateral (select private.tc_organization_access_for(o.id,o.owner_id) access) a where o.id=p_org;
$item$;
revoke all on function private.tc_company_full_item(uuid) from public,anon,authenticated;

create function private.tc_admin_company_full(
 p_action text,p_org uuid,p_expected bigint,p_operation uuid,p_data jsonb,p_after uuid
) returns jsonb language plpgsql security definer set search_path='' as $control$
declare actor uuid;actor_email text;l private.tc_company_full_licenses;
 previous jsonb;next_state jsonb;event private.tc_company_full_audit;
 requested_expiry timestamptz;requested_enabled boolean;expected_payload jsonb;
 observed timestamptz:=now();limit_count integer:=50;cursor_revision bigint;items jsonb;next_after uuid;next_revision bigint;search text;
begin
 -- Existing helper locks and verifies the live global-role, Auth and exact SID.
 -- It does not depend on any company licence or payment/provider state.
 actor:=private.tc_manual_subscription_operator();
 if p_action is null or p_action not in ('capabilities','list','set','history')
  or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>4096 then
  raise exception 'company_full_invalid' using errcode='22023';end if;
 if p_action='capabilities' then
  if p_org is not null or p_expected is not null or p_operation is not null or p_after is not null or p_data<>'{}' then
   raise exception 'company_full_invalid' using errcode='22023';end if;
  return jsonb_build_object('schema_version',1,'manual_company_full',true,'observed_at',observed);
 end if;
 if p_action in ('list','history') then
  if p_expected is not null or p_operation is not null
   or (p_data ? 'limit' and (jsonb_typeof(p_data->'limit')<>'number' or (p_data->>'limit')!~'^[0-9]{1,3}$')) then
   raise exception 'company_full_invalid' using errcode='22023';end if;
  limit_count:=coalesce((p_data->>'limit')::integer,50);
  if limit_count not between 1 and 100 then raise exception 'company_full_invalid' using errcode='22023';end if;
 end if;
 if p_action='list' then
  if p_org is not null or p_data-array['limit','query']<>'{}'
   or (p_data ? 'query' and (jsonb_typeof(p_data->'query')<>'string' or length(p_data->>'query')>160)) then
   raise exception 'company_full_invalid' using errcode='22023';end if;
  search:=nullif(btrim(p_data->>'query'),'');
  select coalesce(jsonb_agg(x.item order by x.id),'[]') into items from (
   select o.id,private.tc_company_full_item(o.id) item from public.organizations o join auth.users u on u.id=o.owner_id
   where (p_after is null or o.id>p_after) and (search is null or strpos(lower(o.name),lower(search))>0
    or strpos(lower(coalesce(u.email,'')),lower(search))>0) order by o.id limit limit_count) x;
  if jsonb_array_length(items)=limit_count then
   next_after:=(items->(limit_count-1)->>'organization_id')::uuid;
   if not exists(select 1 from public.organizations o join auth.users u on u.id=o.owner_id where o.id>next_after
    and (search is null or strpos(lower(o.name),lower(search))>0 or strpos(lower(coalesce(u.email,'')),lower(search))>0)) then next_after:=null;end if;
  end if;
  return jsonb_build_object('schema_version',1,'observed_at',observed,'items',items,'next_after',next_after);
 end if;
 if p_org is null or p_after is not null then raise exception 'company_full_invalid' using errcode='22023';end if;
 if p_action='set' then
  if p_operation is not null then
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('truckcontrol.company_full.operation:'||p_operation::text,0));
  end if;
  perform 1 from public.organizations where id=p_org for update;
 else
  perform 1 from public.organizations where id=p_org;
 end if;
 if not found then raise exception 'company_full_not_found' using errcode='22023';end if;
 if p_action='history' then
  if p_data-array['limit','before_revision']<>'{}'
   or (p_data ? 'before_revision' and (jsonb_typeof(p_data->'before_revision')<>'number' or (p_data->>'before_revision')!~'^[0-9]{1,16}$')) then
   raise exception 'company_full_invalid' using errcode='22023';end if;
  cursor_revision:=(p_data->>'before_revision')::bigint;
  select coalesce(jsonb_agg(x.item order by x.revision desc),'[]') into items from (
   select a.revision,jsonb_build_object('operation_id',a.operation_id,'organization_id',a.organization_id,'revision',a.revision,
    'actor_id',a.actor_id,'actor_email',a.actor_email,'changed_at',a.changed_at,'before',a.before_state,'after',a.after_state) item
   from private.tc_company_full_audit a where a.organization_id=p_org and (cursor_revision is null or a.revision<cursor_revision)
   order by a.revision desc limit limit_count) x;
  if jsonb_array_length(items)=limit_count then
   next_revision:=(items->(limit_count-1)->>'revision')::bigint;
   if not exists(select 1 from private.tc_company_full_audit where organization_id=p_org and revision<next_revision) then next_revision:=null;end if;
  end if;
  return jsonb_build_object('schema_version',1,'observed_at',observed,'items',items,'next_before_revision',next_revision);
 end if;
 if p_expected is null or p_expected<0 or p_expected>9007199254740991 or p_operation is null
  or p_data-array['enabled','expires_at']<>'{}' or not(p_data ? 'enabled') or not(p_data ? 'expires_at')
  or jsonb_typeof(p_data->'enabled')<>'boolean' or jsonb_typeof(p_data->'expires_at') not in ('null','string') then
  raise exception 'company_full_invalid' using errcode='22023';end if;
 requested_enabled:=(p_data->>'enabled')::boolean;
 if jsonb_typeof(p_data->'expires_at')='string' then
  if (p_data->>'expires_at')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then
   raise exception 'company_full_invalid_expiry' using errcode='22023';end if;
  begin requested_expiry:=(p_data->>'expires_at')::timestamptz;
  exception when data_exception then raise exception 'company_full_invalid_expiry' using errcode='22023';end;
  if not isfinite(requested_expiry) then raise exception 'company_full_invalid_expiry' using errcode='22023';end if;
 end if;
 expected_payload:=jsonb_build_object('enabled',requested_enabled,'expires_at',requested_expiry,'expected_revision',p_expected);
 select * into event from private.tc_company_full_audit where operation_id=p_operation;
 if found then
  if event.actor_id<>actor or event.organization_id<>p_org or event.request<>expected_payload then
   raise exception 'company_full_operation_conflict' using errcode='22023';end if;
  return jsonb_build_object('schema_version',1,'observed_at',observed,'item',private.tc_company_full_item(p_org),
   'operation_id',p_operation,'replayed',true,'applied_revision',event.revision);
 end if;
 select * into l from private.tc_company_full_licenses where organization_id=p_org for update;
 if coalesce(l.revision,0)<>p_expected then raise exception 'company_full_stale_revision' using errcode='40001';end if;
 if p_expected=9007199254740991 then raise exception 'company_full_revision_exhausted' using errcode='22023';end if;
 previous:=private.tc_company_full_state(p_org);
 select email into actor_email from auth.users where id=actor;
 insert into private.tc_company_full_licenses(organization_id,enabled,expires_at,revision,updated_at,updated_by)
 values(p_org,requested_enabled,requested_expiry,p_expected+1,observed,actor)
 on conflict(organization_id) do update set enabled=excluded.enabled,expires_at=excluded.expires_at,
  revision=excluded.revision,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
 next_state:=private.tc_company_full_state(p_org);
 insert into private.tc_company_full_audit(operation_id,organization_id,revision,actor_id,actor_email,changed_at,request,before_state,after_state)
 values(p_operation,p_org,p_expected+1,actor,actor_email,observed,expected_payload,previous,next_state);
 return jsonb_build_object('schema_version',1,'observed_at',observed,'item',private.tc_company_full_item(p_org),
  'operation_id',p_operation,'replayed',false,'applied_revision',p_expected+1);
end;$control$;
revoke all on function private.tc_admin_company_full(text,uuid,bigint,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function private.tc_admin_company_full(text,uuid,bigint,uuid,jsonb,uuid) to authenticated;
create function public.tc_admin_company_full(p_action text,p_org uuid default null,p_expected bigint default null,
 p_operation uuid default null,p_data jsonb default '{}',p_after uuid default null) returns jsonb
language sql security invoker set search_path='' as $public$
 select private.tc_admin_company_full(p_action,p_org,p_expected,p_operation,p_data,p_after);
$public$;
revoke all on function public.tc_admin_company_full(text,uuid,bigint,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.tc_admin_company_full(text,uuid,bigint,uuid,jsonb,uuid) to authenticated;
