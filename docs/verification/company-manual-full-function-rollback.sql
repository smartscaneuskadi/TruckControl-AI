-- Function-only rollback candidate. Official reviewed path only; never automatic.
-- Retains licence/audit tables and triggers. Explicit OFF must never reopen legacy access.
begin;
lock table private.tc_company_full_licenses in share row exclusive mode;
do $refuse$ begin
 if exists(select 1 from private.tc_company_full_licenses) then
  raise exception 'company_full_rollback_refuses_configured_companies';end if;
end;$refuse$;
do $expected$ begin if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('private.tc_account_active(uuid)') and md5(prosrc)='cb8465c6eef91273d2ec22ebc4c2d9cb') then raise exception 'company_full_rollback_body_mismatch';end if;end;$expected$;
do $expected$ begin if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('private.tc_organization_access_for(uuid,uuid)') and md5(prosrc)='1ab3f4ecf190fe49ac7a53c3758a699b') then raise exception 'company_full_rollback_body_mismatch';end if;end;$expected$;
do $expected$ begin if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('private.tc_user_access(uuid)') and md5(prosrc)='047eb67dcdcd066dd755e451fbae9389') then raise exception 'company_full_rollback_body_mismatch';end if;end;$expected$;
do $expected$ begin if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('private.tc_truck_limit()') and md5(prosrc)='1e03a13fcd5ae5292c66f80732686809') then raise exception 'company_full_rollback_body_mismatch';end if;end;$expected$;
do $expected$ begin if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('public.gmail_server(text,jsonb)') and md5(prosrc)='00fa475e88c717cffecdedec592dd3b4') then raise exception 'company_full_rollback_body_mismatch';end if;end;$expected$;
do $expected$ begin if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('private.tc_admin_company_full(text,uuid,bigint,uuid,jsonb,uuid)') and md5(prosrc)='574867d77a2c10e3d37c9cf4c5d91b1c') then raise exception 'company_full_rollback_body_mismatch';end if;end;$expected$;
create or replace function private.tc_account_active(p_organization_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());enforcement boolean;
begin
 if not private.tc_current_actor_verified() then return false;end if;
 if actor is null or private.tc_company_role_for(p_organization_id,actor) is null then return false;end if;
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
 r text; plan_id text; enabled boolean; phone_needed boolean; u record; profile jsonb;
begin
 -- Human requests bind their own live session. Explicit server/background users
 -- still require a valid Auth row, role and licence, without a human session.
 if not private.tc_actor_verified(p_user,p_user is not distinct from (select auth.uid())) then
  return jsonb_build_object('active',false,'features','{}'::jsonb,'profile',null);
 end if;
 r:=private.tc_company_role_for(p_org,p_user);
 if r is null then return jsonb_build_object('active',false,'features','{}'::jsonb,'profile',null);end if;
 select * into s from private.tc_settings where id=true;
 if not s.enforce_access then
  return jsonb_build_object('active',true,'is_admin',false,'features',(select jsonb_object_agg(id,true) from private.tc_modules),
   'company_role',r,'can_write',r<>'viewer','can_manage',r in ('owner','admin'),'organization_id',p_org,'profile',null,'max_trucks',50);
 end if;
 select * into o from public.organizations where id=p_org;
 select * into c from private.tc_customers where user_id=o.owner_id;
 select * into a from private.tc_customers where user_id=p_user;
 select * into u from auth.users where id=p_user;
 phone_needed:=s.sms_ready and (u.phone_confirmed_at is null or ('+'||regexp_replace(coalesce(u.phone,''),'[^0-9]','','g'))<>a.phone);
 enabled:=c.user_id is not null and a.user_id is not null and a.status<>'suspended' and c.status<>'suspended'
  and u.email_confirmed_at is not null and not coalesce(phone_needed,true)
  and ((c.status='trial' and now()<c.trial_ends_at) or (c.status='active' and now()<c.paid_until));
 plan_id:=private.tc_customer_plan(c);
 profile:=to_jsonb(a)-'stripe_subscription_id'||jsonb_build_object('company_name',o.name,
  'status',case when a.status='suspended' then 'suspended' else c.status end,
  'trial_started_at',c.trial_started_at,'trial_ends_at',c.trial_ends_at,'paid_until',c.paid_until,'paid_plan',c.paid_plan,'trial_plan_id',c.trial_plan_id);
 return jsonb_build_object('active',coalesce(enabled,false),'is_admin',false,
  'features',private.tc_company_features(p_org,p_user,plan_id,coalesce(enabled,false)),
  'company_role',r,'can_write',coalesce(enabled,false) and r<>'viewer','can_manage',coalesce(enabled,false) and r in ('owner','admin'),
  'organization_id',p_org,'profile',profile,'plan',plan_id,
  'max_trucks',coalesce((select max_trucks from private.tc_plans where id=plan_id),50),
  'requires_phone_verification',coalesce(phone_needed,false),'sms_ready',s.sms_ready,
  'prices_are_examples',s.prices_are_examples,'payments_enabled',s.payments_enabled);
end;
$$;

create or replace function private.tc_user_access(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c private.tc_customers; p private.tc_plans; s private.tc_settings; active boolean; f jsonb; is_admin boolean; requires_phone boolean; actor_verified boolean;
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
  return jsonb_build_object('is_admin',is_admin,'active',coalesce(active,false),'features',coalesce(f,'{}'),
    'profile',case when c.user_id is null or not actor_verified then null else to_jsonb(c)-'stripe_subscription_id' end,
    'plan',private.tc_customer_plan(c),
    'max_trucks',coalesce(p.max_trucks,50),'requires_phone_verification',coalesce(requires_phone,false),
    'sms_ready',s.sms_ready,'prices_are_examples',s.prices_are_examples,'payments_enabled',s.payments_enabled);
end;
$$;

create or replace function private.tc_truck_limit() returns trigger language plpgsql security definer set search_path='' as $$
declare max_count integer; own uuid;
begin
  if not (select enforce_access from private.tc_settings where id=true) then return new; end if;
  select owner_id into own from public.organizations where id=new.organization_id for update;
  if own is null then return new; end if;
  max_count := (private.tc_user_access(own)->>'max_trucks')::integer;
  if max_count is not null and (select count(*) from public.trucks where organization_id=new.organization_id)>=max_count then
    raise exception 'Has alcanzado el límite de camiones de tu plan';
  end if;
  return new;
end;
$$;

create or replace function public.gmail_server(p_action text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c private.gmail_connections;
begin
  if p_data ? 'sync_lease_id' then return private.tc_gmail_sync_fenced(p_action,p_data);end if;
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

drop function public.tc_admin_company_full(text,uuid,bigint,uuid,jsonb,uuid);
drop function private.tc_admin_company_full(text,uuid,bigint,uuid,jsonb,uuid);
drop function private.tc_company_full_item(uuid);
-- Existing new trigger remains harmless with the required empty licence table.
commit;
