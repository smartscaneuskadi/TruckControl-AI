-- Additive migration 63: verified sessions, atomic subscription intake,
-- private manual fiscal PDFs and idempotent administrator notice outbox.
-- Filename created by official Supabase CLI 3.0.0 in Actions 42469793645.
-- Does not modify migration 62, enable payments, send email, or enable workers.
-- All service flags remain OFF pending independent native/provider acceptance.

-- Verified administrator and user sessions
create function private.tc_actor_verified(p_user uuid,p_require_session boolean)
returns boolean language plpgsql stable security definer set search_path='' as $actor_verified$
declare sid uuid;
begin
  if p_user is null or p_require_session is null then return false; end if;
  if not exists(select 1 from auth.users u where u.id=p_user
    and u.email_confirmed_at is not null and u.deleted_at is null
    and coalesce(u.banned_until,'-infinity'::timestamptz)<=now()) then
    return false;
  end if;
  if p_require_session then
    if p_user is distinct from (select auth.uid()) then return false; end if;
    begin
      sid:=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id')::uuid;
    exception when invalid_text_representation then return false;
    end;
    if sid is null or to_regclass('auth.sessions') is null then return false; end if;
    -- UUID equality uses the managed sessions primary key. not_after is an
    -- optional managed Auth field; absent/NULL means no time-boxed expiry.
    if not exists(select 1 from auth.sessions s where s.id=sid and s.user_id=p_user
      and (nullif(to_jsonb(s)->>'not_after','') is null
        or (to_jsonb(s)->>'not_after')::timestamptz>now())) then
      return false;
    end if;
  end if;
  return true;
end;$actor_verified$;
revoke all on function private.tc_actor_verified(uuid,boolean) from public,anon,authenticated;
-- Intentionally NO client grant. Existing definer wrappers call this predicate.
-- p_require_session=false is reserved for an explicitly bound internal user;
-- it still denies unconfirmed, banned and deleted users.

-- Parameterless identity checker for user-triggered Edge requests. It does
-- not require a company/profile/license, so verified onboarding remains valid.
create function private.tc_verified_session()
returns boolean language sql stable security definer set search_path='' as $verified_session$
  select private.tc_actor_verified((select auth.uid()),true);
$verified_session$;
revoke all on function private.tc_verified_session() from public,anon,authenticated;
grant execute on function private.tc_verified_session() to authenticated;
create function public.tc_verified_session()
returns boolean language sql stable security invoker set search_path='' as $verified_session_public$
  select private.tc_verified_session();
$verified_session_public$;
revoke all on function public.tc_verified_session() from public,anon,authenticated;
grant execute on function public.tc_verified_session() to authenticated;

create or replace function private.tc_is_admin()
returns boolean language plpgsql stable security definer set search_path='' as $admin_identity$
declare actor uuid:=(select auth.uid());
begin
  return actor is not null
    and exists(select 1 from private.tc_admins a where a.user_id=actor)
    and private.tc_actor_verified(actor,true);
end;$admin_identity$;

-- Preserve every original economic operation. Helper62 holds live user/admin/
-- session rows through writes; the shared predicate also rejects a missing SID.
create or replace function private.tc_admin_control(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $admin_control$
declare actor uuid := (select auth.uid()); target uuid; result jsonb; old_record jsonb; updated_record jsonb;
  plan private.tc_plans; request private.tc_payment_requests; receipt text; until_date timestamptz;
begin
 if not private.tc_actor_verified(actor,true) then
  raise exception 'Solo la cuenta administradora verificada puede realizar esta operación' using errcode='42501';end if;
 if actor is null or not exists(select 1 from private.tc_admins where user_id=actor) then
  raise exception 'Solo la cuenta administradora puede realizar esta operación' using errcode='42501';end if;
 perform private.tc_manual_subscription_operator();
 -- Revalidate after acquiring live Auth/admin/session SHARE locks.
 if not private.tc_actor_verified(actor,true) then
  raise exception 'Solo la cuenta administradora verificada puede realizar esta operación' using errcode='42501';end if;
 if p_action='snapshot' then return private.tc_admin_snapshot(p_data);end if;
 if p_action='module' then return private.tc_admin_module(p_data);end if;
 if p_action='customer' then return private.tc_admin_customer(p_data);end if;
 if p_action='plan' then return private.tc_admin_plan(p_data);end if;
 if p_action='settings' then return private.tc_admin_settings(p_data);end if;
 if p_action='manual_payment' then return private.tc_admin_manual_payment(p_data);end if;
 raise exception 'Operación no disponible';
end;
$admin_control$;

-- Preserve schema62's OID, VOLATILE semantics, definer ownership and ACL.
-- All fiscal operator entry points call this helper, including reads/replays.
-- A human session is mandatory; JWT claims never replace the live rows.
create or replace function private.tc_manual_subscription_operator()
returns uuid language plpgsql volatile security definer set search_path='' as $operator_session$
declare actor uuid:=(select auth.uid()); sid uuid;
begin
  if actor is null then
    raise exception 'manual_invoice_operator_forbidden' using errcode='42501';
  end if;
  perform 1 from auth.users u where u.id=actor and u.email_confirmed_at is not null
    and u.deleted_at is null and coalesce(u.banned_until,'-infinity'::timestamptz)<=now()
    for share;
  if not found then raise exception 'manual_invoice_operator_forbidden' using errcode='42501'; end if;
  perform 1 from private.tc_admins a where a.user_id=actor for share;
  if not found then raise exception 'manual_invoice_operator_forbidden' using errcode='42501'; end if;
  begin
    sid:=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id')::uuid;
  exception when invalid_text_representation then
    raise exception 'manual_invoice_session_revoked' using errcode='42501';
  end;
  if sid is null or to_regclass('auth.sessions') is null then
    raise exception 'manual_invoice_session_revoked' using errcode='42501';
  end if;
  perform 1 from auth.sessions s where s.id=sid and s.user_id=actor
    and (nullif(to_jsonb(s)->>'not_after','') is null
      or (to_jsonb(s)->>'not_after')::timestamptz>now()) for share;
  if not found then raise exception 'manual_invoice_session_revoked' using errcode='42501'; end if;
  -- Recheck after every authorization row is locked. This also centralizes
  -- identity/session constraints added to the shared predicate in the future.
  if not private.tc_actor_verified(actor,true) then
    raise exception 'manual_invoice_operator_forbidden' using errcode='42501';
  end if;
  return actor;
end;$operator_session$;


-- Company RLS and business entry points
create function private.tc_current_actor_verified() returns boolean
language sql stable security definer set search_path='' as $current_actor$
 select private.tc_actor_verified((select auth.uid()),true);
$current_actor$;
revoke all on function private.tc_current_actor_verified() from public,anon,authenticated;
grant execute on function private.tc_current_actor_verified() to authenticated;


-- Preserve private.tc_company_role_for and its existing API/grants.
create or replace function private.tc_company_role_for(p_org uuid,p_user uuid) returns text
language sql stable security definer set search_path='' as $$
 select case when o.owner_id=p_user then 'owner' else
  (select m.role from private.tc_memberships m where m.organization_id=o.id and m.user_id=p_user and m.status='active') end
 from public.organizations o where o.id=p_org and p_user is not null and private.tc_actor_verified(p_user,false);
$$;

-- Preserve private.tc_company_role and its existing API/grants.
create or replace function private.tc_company_role(p_org uuid) returns text
language sql stable security definer set search_path='' as $$
 select case when private.tc_current_actor_verified()
  then private.tc_company_role_for(p_org,(select auth.uid())) else null end;
$$;

-- Preserve private.tc_account_active and its existing API/grants.
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

-- Preserve private.tc_client_active and its existing API/grants.
create or replace function private.tc_client_active() returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.tc_current_actor_verified() then return false;end if;
 if (select auth.uid()) is null then return false;end if;
 if not (select enforce_access from private.tc_settings where id=true) then return true;end if;
 return coalesce((private.tc_user_access((select auth.uid()))->>'active')::boolean,false);
end;
$$;

-- Preserve private.tc_organization_access_for and its existing API/grants.
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

-- Preserve private.tc_user_access and its existing API/grants.
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

-- Preserve private.tc_my_access and its existing API/grants.
create or replace function private.tc_my_access() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.tc_current_actor_verified() then
  raise exception 'Sesion no disponible' using errcode='42501';
 end if;
 if (select auth.uid()) is null then raise exception 'Inicia sesión' using errcode='42501';end if;
 return private.tc_user_access((select auth.uid()));
end;
$$;

-- Preserve private.tc_current_organization_access and its existing API/grants.
create or replace function private.tc_current_organization_access(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.tc_current_actor_verified() then
  raise exception 'Sesion no disponible' using errcode='42501';
 end if;
 if (select auth.uid()) is null then raise exception 'Inicia sesión' using errcode='42501';end if;
 return private.tc_organization_access_for(p_org,(select auth.uid()));
end;
$$;

-- Preserve private.tc_team_control and its existing API/grants.
create or replace function private.tc_team_control(p_org uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); target uuid; member_role text; overrides jsonb;
begin
 if not private.tc_current_actor_verified() then
  raise exception 'Sesion no disponible' using errcode='42501';
 end if;
 if actor is null then raise exception 'Inicia sesión' using errcode='42501';end if;
 if p_action='invitations' then
  return coalesce((select jsonb_agg(jsonb_build_object('organization_id',m.organization_id,'name',o.name,'role',m.role))
   from private.tc_memberships m join public.organizations o on o.id=m.organization_id
   where m.user_id=actor and m.status='invited'),'[]');
 end if;
 if p_action in ('accept','reject') then
  if not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'Confirma tu correo';end if;
  update private.tc_memberships set status=case when p_action='accept' then 'active' else 'revoked' end,updated_at=now()
   where organization_id=p_org and user_id=actor and status='invited';
  if not found then raise exception 'Invitación no disponible';end if;return '{}';
 end if;
 if private.tc_company_role(p_org) not in ('owner','admin') or not private.tc_account_active(p_org) or not private.tc_feature(p_org,'team') then
  raise exception 'Solo el administrador de esta empresa' using errcode='42501';end if;
 if p_action='list' then
  return coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'email',u.email,'role',m.role,'status',m.status,'module_overrides',m.module_overrides))
   from private.tc_memberships m join auth.users u on u.id=m.user_id where m.organization_id=p_org and m.status<>'revoked'),'[]');
 end if;
 if p_action='invite' then
  select u.id into target from auth.users u join private.tc_customers c on c.user_id=u.id
   where lower(u.email)=lower(btrim(p_data->>'email')) and u.email_confirmed_at is not null;
 else target:=(p_data->>'user_id')::uuid;end if;
 if target is null or exists(select 1 from public.organizations where id=p_org and owner_id=target) then raise exception 'Usuario no disponible';end if;
 if p_action='remove' then
  update private.tc_memberships set status='revoked',updated_at=now() where organization_id=p_org and user_id=target;return '{}';
 end if;
 member_role:=p_data->>'role';overrides:=coalesce(p_data->'module_overrides','{}');
 if member_role not in ('admin','operator','viewer') or not private.tc_validate_module_map(overrides) then raise exception 'Permisos no válidos';end if;
 if p_action='invite' then
  insert into private.tc_memberships(organization_id,user_id,role,module_overrides,invited_by)
   values(p_org,target,member_role,overrides,actor)
   on conflict(organization_id,user_id) do update set role=excluded.role,module_overrides=excluded.module_overrides,
    status=case when tc_memberships.status='active' then 'active' else 'invited' end,updated_at=now();
 elsif p_action='update' then
  update private.tc_memberships set role=member_role,module_overrides=overrides,updated_at=now() where organization_id=p_org and user_id=target and status='active';
 else raise exception 'Operación no válida';end if;return '{}';
end;
$$;

-- Preserve private.tc_finish_registration and its existing API/grants.
create or replace function private.tc_finish_registration() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.tc_current_actor_verified() then
  raise exception 'Sesion no disponible' using errcode='42501';
 end if;
 if (select auth.uid()) is null then raise exception 'Inicia sesión' using errcode='42501';end if;
 perform private.tc_provision((select auth.uid()));return private.tc_user_access((select auth.uid()));
end;
$$;

-- Preserve private.tc_set_ai_opt_in and its existing API/grants.
create or replace function private.tc_set_ai_opt_in(p_enabled boolean) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.tc_current_actor_verified() then
  raise exception 'Sesion no disponible' using errcode='42501';
 end if;
 if (select auth.uid()) is null then raise exception 'Inicia sesión' using errcode='42501';end if;
 update private.tc_customers set ai_opt_in=p_enabled,updated_at=now() where user_id=(select auth.uid());
 return private.tc_user_access((select auth.uid()));
end;
$$;

-- Preserve private.tc_request_plan and its existing API/grants.
create or replace function private.tc_request_plan(p_plan_id text) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid := (select auth.uid()); p private.tc_plans; request_id uuid;
begin
 if not private.tc_current_actor_verified() then
  raise exception 'Sesion no disponible' using errcode='42501';
 end if;
 if actor is null or not exists(select 1 from private.tc_customers where user_id=actor) then
  raise exception 'Completa la verificación de tu cuenta' using errcode='42501';end if;
 perform 1 from private.tc_customers where user_id=actor for update;
 update private.tc_payment_requests set status='cancelled' where user_id=actor and status in ('requested','checkout') and created_at<now()-interval '1 day';
 select * into p from private.tc_plans where id=p_plan_id and published;
 if not found then raise exception 'Plan no disponible';end if;
 select id into request_id from private.tc_payment_requests where user_id=actor and plan_id=p_plan_id
   and plan_revision=p.revision and status in ('requested','checkout') order by created_at desc limit 1;
 if request_id is null then
  insert into private.tc_payment_requests(user_id,plan_id,quoted_cents,plan_revision,net_cents,vat_rate_bps,vat_cents) values(actor,p.id,p.monthly_cents+private.tc_quote_vat(p.monthly_cents),p.revision,p.monthly_cents,2100,private.tc_quote_vat(p.monthly_cents)) returning id into request_id;
 end if;
 update private.tc_customers set requested_plan=p_plan_id,updated_at=now() where user_id=actor;
 return request_id;
end;
$$;

-- SELECT visibility alone is insufficient for UPDATE without RETURNING.
-- This fresh-actor policy protects all organization operations, including
-- inserts before the new row exists, while existing tenant/owner policies and
-- renewal visibility for expired licences remain unchanged.
create policy tc_organizations_current_session on public.organizations
 as restrictive for all to authenticated
 using((select private.tc_current_actor_verified()))
 with check((select private.tc_current_actor_verified()));


-- Atomic verified Stripe payment intake
create table private.tc_manual_stripe_channels (
  provider_account_id text not null check(provider_account_id ~ '^acct_[A-Za-z0-9]{1,100}$'),
  mode text not null check(mode in ('test','live')),
  enabled boolean not null default false,
  isolated_test_instance boolean not null default false,
  commercial_approved_at timestamptz,
  approval_reference text check(char_length(approval_reference) between 3 and 240),
  primary key(provider_account_id,mode),
  constraint tc_manual_stripe_channel_acceptance check (
    not enabled or
    (mode='test' and isolated_test_instance) or
    (mode='live' and commercial_approved_at is not null
      and isfinite(commercial_approved_at) and approval_reference is not null)
  )
);
create table private.tc_manual_stripe_bridge_receipts (
  provider_event_id text primary key check(provider_event_id ~ '^evt_[A-Za-z0-9]{1,200}$'),
  provider_account_id text not null,
  mode text not null check(mode in ('test','live')),
  payment_kind text not null check(payment_kind in ('initial_payment','subscription_invoice')),
  provider_payment_id text not null,
  request_id uuid not null references private.tc_payment_requests(id) on delete restrict,
  task_id uuid not null,
  proof_sha256 text not null check(proof_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  foreign key(provider_account_id,mode) references private.tc_manual_stripe_channels(provider_account_id,mode),
  foreign key(task_id,provider_account_id)
    references private.tc_manual_subscription_invoice_tasks(id,provider_account_id) on delete restrict
);
alter table private.tc_manual_stripe_channels enable row level security;
alter table private.tc_manual_stripe_bridge_receipts enable row level security;
create policy tc_manual_stripe_channels_no_client on private.tc_manual_stripe_channels
 as restrictive for all to public using(false) with check(false);
create policy tc_manual_stripe_receipts_no_client on private.tc_manual_stripe_bridge_receipts
 as restrictive for all to public using(false) with check(false);
revoke all on private.tc_manual_stripe_channels,private.tc_manual_stripe_bridge_receipts
 from public,anon,authenticated;
create trigger tc_manual_stripe_receipts_immutable
 before update or delete or truncate on private.tc_manual_stripe_bridge_receipts
 for each statement execute function private.tc_manual_subscription_intake_reject_mutation();

-- SECURITY INVOKER, service_role only. The trusted Edge adapter verifies raw
-- webhook HMAC and re-fetches Stripe objects before this call. This SQL function
-- does not authenticate Stripe and must never be granted to a browser role.
-- One RPC transaction covers billing, fiscal intake and append-only receipt.
create function public.tc_manual_subscription_apply_payment(
 p_kind text,p_account text,p_data jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $bridge$
#variable_conflict use_variable
declare
  r private.tc_payment_requests;
  c private.tc_customers;
  b private.tc_billing_subscriptions;
  i private.tc_subscription_invoices;
  t private.tc_manual_subscription_invoice_tasks;
  receipt private.tc_manual_stripe_bridge_receipts;
  channel private.tc_manual_stripe_channels;
  user_id uuid; request_id uuid; company_id uuid; org_count integer;
  amount integer; event_id text; payment_id text; checkout_id text;
  invoice_id text; subscription_id text; customer_id text; event_type text;
  mode text; paid_at timestamptz; start_at timestamptz; end_at timestamptz;
  current_end timestamptz; stamp bigint; task_id uuid; proof_hash text;
  prior_task boolean; prior_invoice boolean; current_event boolean;
begin
  if current_user<>'service_role' then
    raise exception 'manual_stripe_server_only' using errcode='42501'; end if;
  if p_kind is null or p_kind not in ('initial_payment','subscription_invoice')
    or p_account is null or p_account !~ '^acct_[A-Za-z0-9]{1,100}$'
    or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>12000
    or p_data->>'currency' is distinct from 'EUR'
    or jsonb_typeof(p_data->'livemode') is distinct from 'boolean'
  then raise exception 'manual_stripe_invalid' using errcode='22023'; end if;
  mode:=case when (p_data->>'livemode')::boolean then 'live' else 'test' end;
  select * into channel from private.tc_manual_stripe_channels x
    where x.provider_account_id=p_account and x.mode=mode;
  if not found or not channel.enabled
    or (mode='test' and not channel.isolated_test_instance)
    or (mode='live' and (channel.commercial_approved_at is null or channel.commercial_approved_at>now()))
  then raise exception 'manual_stripe_channel_disabled' using errcode='42501'; end if;
  begin
    user_id:=(p_data->>'user_id')::uuid;
    request_id:=(p_data->>'request_id')::uuid;
    amount:=(p_data->>'amount_cents')::integer;
    stamp:=(p_data->>'provider_event_created')::bigint;
    paid_at:=(p_data->>'paid_at')::timestamptz;
  exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
    raise exception 'manual_stripe_invalid' using errcode='22023';
  end;
  event_id:=p_data->>'provider_event_id'; event_type:=p_data->>'provider_event_type';
  payment_id:=p_data->>'provider_payment_id';
  if user_id is null or request_id is null or amount is null or amount not between 100 and 100000000
    or stamp is null or stamp<1 or stamp>extract(epoch from now())+300
    or paid_at is null or not isfinite(paid_at) or paid_at>now()+interval '5 minutes'
    or event_type is null
    or event_id is null or event_id !~ '^evt_[A-Za-z0-9]{1,200}$'
    or payment_id is null or payment_id !~ '^(pi|in)_[A-Za-z0-9]{1,200}$'
  then raise exception 'manual_stripe_invalid' using errcode='22023'; end if;

  -- Match legacy recurring lock order (customer, then request) to avoid a
  -- request/customer deadlock between old and new provider deliveries.
  select * into c from private.tc_customers x where x.user_id=user_id for update;
  if not found then raise exception 'manual_stripe_order_unavailable' using errcode='23514'; end if;
  select * into r from private.tc_payment_requests x where x.id=request_id for update;
  if not found or r.user_id<>user_id or r.currency<>'EUR' or r.quoted_cents<>amount
    or r.status not in ('requested','checkout','paid')
    or r.net_cents is null or r.vat_rate_bps is null or r.vat_cents is null
  then raise exception 'manual_stripe_order_mismatch' using errcode='23514'; end if;
  select count(*),min(o.id::text)::uuid into org_count,company_id
    from public.organizations o where o.owner_id=user_id;
  if org_count<>1 or company_id is null
    or (p_data->>'company_id' is not null and (p_data->>'company_id')::uuid<>company_id)
  then raise exception 'manual_stripe_company_ambiguous' using errcode='23514'; end if;

  if p_kind='initial_payment' then
    checkout_id:=p_data->>'checkout_id';
    if payment_id !~ '^pi_[A-Za-z0-9]{1,200}$'
      or event_type not in ('checkout.session.completed','checkout.session.async_payment_succeeded')
      or checkout_id is null or checkout_id !~ '^cs_[A-Za-z0-9_]{1,200}$'
      or r.checkout_id is distinct from checkout_id
      or exists(select 1 from private.tc_billing_subscriptions x where x.request_id=r.id)
      or exists(select 1 from private.tc_subscription_orders x where x.request_id=r.id)
    then raise exception 'manual_stripe_checkout_mismatch' using errcode='23514'; end if;
  else
    invoice_id:=p_data->>'invoice_id'; subscription_id:=p_data->>'subscription_id';
    customer_id:=p_data->>'customer_id';
    begin
      start_at:=to_timestamp((p_data->>'invoice_period_start')::bigint);
      end_at:=to_timestamp((p_data->>'invoice_period_end')::bigint);
      current_end:=to_timestamp((p_data->>'subscription_current_period_end')::bigint);
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'manual_stripe_invalid_period' using errcode='22023';
    end;
    if invoice_id is null or invoice_id !~ '^in_[A-Za-z0-9]{1,200}$' or payment_id<>invoice_id
      or subscription_id is null or subscription_id !~ '^sub_[A-Za-z0-9]{1,200}$'
      or customer_id is null or customer_id !~ '^cus_[A-Za-z0-9]{1,200}$'
      or event_type is distinct from 'invoice.paid'
      or p_data->>'billing_reason' is null or p_data->>'billing_reason' not in ('subscription_create','subscription_cycle')
      or jsonb_typeof(p_data->'cancel_at_period_end') is distinct from 'boolean'
      or p_data->>'subscription_state' is null
      or p_data->>'subscription_state' not in ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')
      or start_at is null or end_at is null or not isfinite(start_at) or not isfinite(end_at)
      or end_at<start_at+interval '27 days' or end_at>start_at+interval '32 days'
      or end_at>now()+interval '62 days' or current_end is null or not isfinite(current_end)
      or current_end>now()+interval '62 days' or current_end<now()-interval '2 years'
      or (p_data->>'unit_amount')::integer is distinct from amount
    then raise exception 'manual_stripe_invalid_period' using errcode='23514'; end if;
    select * into b from private.tc_billing_subscriptions x where x.provider_id=subscription_id;
    if found then
      if b.user_id<>user_id or b.request_id<>r.id or b.customer_id<>customer_id
        or b.plan_id<>r.plan_id or b.monthly_cents<>amount or b.currency<>'EUR'
      then raise exception 'manual_stripe_subscription_mismatch' using errcode='23514'; end if;
    elsif not exists(select 1 from private.tc_subscription_orders x
      where x.user_id=user_id and x.request_id=r.id and x.checkout_id=r.checkout_id and x.checkout_id is not null) then
      raise exception 'manual_stripe_reservation_missing' using errcode='23514';
    end if;
    select * into i from private.tc_subscription_invoices x where x.invoice_id=invoice_id for update;
    prior_invoice:=found;
    if prior_invoice and (i.subscription_id<>subscription_id or i.user_id<>user_id or i.amount_cents<>amount
      or i.currency<>'EUR' or i.period_start<>start_at or i.period_end<>end_at)
    then raise exception 'manual_stripe_invoice_mismatch' using errcode='23514'; end if;
    if exists(select 1 from private.tc_subscription_events x where x.event_id=event_id
      and (x.subscription_id<>subscription_id or not prior_invoice)) then
      raise exception 'manual_stripe_event_conflict' using errcode='23514'; end if;
  end if;

  proof_hash:=encode(sha256(convert_to(jsonb_build_object(
    'kind',p_kind,'account',p_account,'mode',mode,'event',event_id,'type',event_type,'event_created',stamp,
    'payment',payment_id,'request',r.id,'user',r.user_id,'company',company_id,
    'amount',amount,'currency','EUR','paid_at',extract(epoch from paid_at),'checkout',checkout_id,
    'invoice',invoice_id,'subscription',subscription_id,'start',extract(epoch from start_at),'end',extract(epoch from end_at)
  )::text,'UTF8')),'hex');
  select * into receipt from private.tc_manual_stripe_bridge_receipts x where x.provider_event_id=event_id;
  if found then
    if receipt.proof_sha256<>proof_hash or receipt.provider_account_id<>p_account or receipt.mode<>mode then
      raise exception 'manual_stripe_event_conflict' using errcode='23514'; end if;
    perform private.tc_manual_invoice_notice_enqueue(receipt.task_id);
    return jsonb_build_object('contract','manual-stripe-payment-bridge-v1','received',true,'duplicate',true,'task_id',receipt.task_id);
  end if;

  select * into t from private.tc_manual_subscription_invoice_tasks x
    where x.provider_payment_id=payment_id;
  prior_task:=found;
  if prior_task and (t.provider_account_id<>p_account or t.request_id<>r.id
    or t.buyer_user_id<>r.user_id or t.buyer_company_id<>company_id or t.amount_cents<>amount)
  then raise exception 'manual_stripe_payment_conflict' using errcode='23514'; end if;

  if p_kind='initial_payment' then
    current_event:=exists(select 1 from private.tc_payment_events x where x.event_id=event_id);
    -- Legacy paid rows/events have no durable PI binding. Never extend a
    -- previously-paid request on the basis of a new, unattributed event.
    if not prior_task and (r.status='paid' or current_event) then
      raise exception 'manual_stripe_legacy_payment_review' using errcode='23514'; end if;
    if not prior_task then
      perform public.tc_platform_server('payment_event',jsonb_build_object(
        'event_id',event_id,'event_type',event_type,'user_id',r.user_id,'request_id',r.id,
        'amount_cents',amount,'currency','EUR'
      ));
    elsif current_event and not exists(select 1 from private.tc_manual_subscription_invoice_events x
      where x.provider_event_id=event_id and x.task_id=t.id and x.provider_account_id=p_account) then
      raise exception 'manual_stripe_event_conflict' using errcode='23514';
    else
      -- Register the new delivery also in the legacy dedup table, without
      -- re-running the licence extension for the same captured PI.
      insert into private.tc_payment_events(event_id,event_type) values(event_id,event_type) on conflict do nothing;
    end if;
    task_id:=private.tc_manual_subscription_invoice_intake(
      p_account,event_id,payment_id,r.id,company_id,amount,paid_at);
  else
    perform public.tc_recurring_billing('event',jsonb_build_object(
      'user_id',r.user_id,'request_id',r.id,'subscription_id',subscription_id,
      'customer_id',customer_id,'event_id',event_id,'event_type','invoice.paid','event_created',stamp,
      'state',p_data->>'subscription_state','cancel_at_period_end',(p_data->>'cancel_at_period_end')::boolean,
      'period_end',(p_data->>'subscription_current_period_end')::bigint,
      'unit_amount',amount,'currency','EUR','invoice_paid',true,
      'invoice_id',invoice_id,'invoice_amount',amount,
      'invoice_period_start',(p_data->>'invoice_period_start')::bigint,
      'invoice_period_end',(p_data->>'invoice_period_end')::bigint
    ));
    -- Compare against the actual persisted invoice, including duplicate paths.
    select * into i from private.tc_subscription_invoices x where x.invoice_id=invoice_id;
    if not found or i.subscription_id<>subscription_id or i.user_id<>r.user_id or i.amount_cents<>amount
      or i.currency<>'EUR' or i.period_start<>start_at or i.period_end<>end_at then
      raise exception 'manual_stripe_invoice_mismatch' using errcode='23514'; end if;
    task_id:=private.tc_manual_subscription_invoice_renewal_intake(
      p_account,event_id,invoice_id,subscription_id,company_id,amount,paid_at);
  end if;
  insert into private.tc_manual_stripe_bridge_receipts(
    provider_event_id,provider_account_id,mode,payment_kind,provider_payment_id,request_id,task_id,proof_sha256
  ) values(event_id,p_account,mode,p_kind,payment_id,r.id,task_id,proof_hash);
  perform private.tc_manual_invoice_notice_enqueue(task_id);
  return jsonb_build_object('contract','manual-stripe-payment-bridge-v1','received',true,'duplicate',prior_task,'task_id',task_id);
end;$bridge$;
revoke all on function public.tc_manual_subscription_apply_payment(text,text,jsonb) from public,anon,authenticated;
do $grants$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  grant select on private.tc_manual_stripe_channels to service_role;
  grant select,insert on private.tc_manual_stripe_bridge_receipts to service_role;
  -- FOR UPDATE in the existing private intake requires UPDATE privilege;
  -- its immutable trigger still rejects every actual UPDATE/DELETE/TRUNCATE.
  grant select,insert,update on private.tc_manual_subscription_invoice_tasks to service_role;
  grant select,insert on private.tc_manual_subscription_invoice_events to service_role;
  grant execute on function private.tc_manual_subscription_invoice_intake(text,text,text,uuid,uuid,integer,timestamptz),
    private.tc_manual_subscription_invoice_renewal_intake(text,text,text,text,uuid,integer,timestamptz),
    public.tc_manual_subscription_apply_payment(text,text,jsonb) to service_role;
 end if;
end;$grants$;


-- Private fiscal document reservations and access
do $storage$
begin
 if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
    values('tc-subscription-fiscal','tc-subscription-fiscal',false,10485760,array['application/pdf'])
    on conflict(id) do nothing;
  if not exists(select 1 from storage.buckets where id='tc-subscription-fiscal'
    and public=false and file_size_limit between 8 and 10485760
    and allowed_mime_types=array['application/pdf']) then
    raise exception 'manual_document_private_bucket_required';
  end if;
  if not exists(select 1 from pg_class where oid='storage.objects'::regclass and relrowsecurity) then
    raise exception 'manual_document_storage_rls_required';
  end if;
  -- Restrictive guard denies this bucket even if an older fleet policy is broad.
  -- Other buckets and their existing permissions are unaffected.
  create policy tc_subscription_fiscal_backend_only on storage.objects as restrictive
    for all to anon,authenticated
    using(bucket_id<>'tc-subscription-fiscal')
    with check(bucket_id<>'tc-subscription-fiscal');
 end if;
end;$storage$;
do $service_privileges$
begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  revoke all on private.tc_manual_subscription_invoice_documents from service_role;
 end if;
end;$service_privileges$;
create table private.tc_manual_subscription_document_runtime(
  id boolean primary key default true check(id),
  uploads_enabled boolean not null default false,
  downloads_enabled boolean not null default false
);
insert into private.tc_manual_subscription_document_runtime(id,uploads_enabled) values(true,false);
create table private.tc_manual_subscription_document_reservations(
  operation_id uuid primary key,
  document_id uuid not null unique default gen_random_uuid(),
  task_id uuid not null references private.tc_manual_subscription_invoice_tasks(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  -- No FK to auth.sessions: logout/revocation must remain possible.
  session_id uuid not null,
  expected_version bigint not null check(expected_version between 1 and 9007199254740990),
  object_key text not null unique check(char_length(object_key)<=250),
  nonce uuid not null default gen_random_uuid(),
  sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes integer not null check(size_bytes between 8 and 10485760),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '30 minutes'
);
create index tc_manual_document_reservation_actor_idx
  on private.tc_manual_subscription_document_reservations(actor_id,created_at);
create table private.tc_manual_subscription_document_access(
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null,
  document_id uuid not null references private.tc_manual_subscription_invoice_documents(id) on delete restrict,
  task_id uuid not null references private.tc_manual_subscription_invoice_tasks(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  session_id uuid not null,
  created_at timestamptz not null default now()
);
create index tc_manual_document_access_actor_idx
  on private.tc_manual_subscription_document_access(actor_id,created_at);
alter table private.tc_manual_subscription_document_runtime enable row level security;
alter table private.tc_manual_subscription_document_reservations enable row level security;
alter table private.tc_manual_subscription_document_access enable row level security;
revoke all on private.tc_manual_subscription_document_runtime,
  private.tc_manual_subscription_document_reservations,
  private.tc_manual_subscription_document_access from public,anon,authenticated;
do $service_private$
begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  revoke all on private.tc_manual_subscription_document_runtime,
    private.tc_manual_subscription_document_reservations,
    private.tc_manual_subscription_document_access from service_role;
 end if;
end;$service_private$;
create policy tc_manual_document_runtime_denied on private.tc_manual_subscription_document_runtime
  as restrictive for all to public using(false) with check(false);
create policy tc_manual_document_reservations_denied on private.tc_manual_subscription_document_reservations
  as restrictive for all to public using(false) with check(false);
create policy tc_manual_document_access_denied on private.tc_manual_subscription_document_access
  as restrictive for all to public using(false) with check(false);
create trigger tc_manual_document_reservations_immutable
 before update or delete or truncate on private.tc_manual_subscription_document_reservations
 for each statement execute function private.tc_manual_subscription_intake_reject_mutation();
create trigger tc_manual_document_access_immutable
 before update or delete or truncate on private.tc_manual_subscription_document_access
 for each statement execute function private.tc_manual_subscription_intake_reject_mutation();

-- Lock the authorization rows in the same order as the operator RPC. A revoke
-- that started first must finish before this lock can be granted; a later revoke
-- waits until this short database transaction has completed.
create function private.tc_manual_fiscal_document_actor(p_actor uuid,p_session uuid)
returns void language plpgsql security invoker set search_path='' as $actor$
begin
  if p_actor is null or p_session is null then
    raise exception 'manual_document_operator_required' using errcode='42501';
  end if;
  perform 1 from auth.users u where u.id=p_actor and u.email_confirmed_at is not null
    and u.deleted_at is null and coalesce(u.banned_until,'-infinity'::timestamptz)<=now() for share;
  if not found then raise exception 'manual_document_operator_required' using errcode='42501'; end if;
  perform 1 from private.tc_admins a where a.user_id=p_actor for share;
  if not found then raise exception 'manual_document_operator_required' using errcode='42501'; end if;
  perform 1 from auth.sessions s where s.id=p_session and s.user_id=p_actor
    and (nullif(to_jsonb(s)->>'not_after','') is null
      or (to_jsonb(s)->>'not_after')::timestamptz>now()) for share;
  if not found then raise exception 'manual_document_operator_required' using errcode='42501'; end if;
end;$actor$;
revoke all on function private.tc_manual_fiscal_document_actor(uuid,uuid)
  from public,anon,authenticated;

-- Privileged backend adapter only. Each request ALSO verifies the caller JWT
-- via Auth getUser and the existing admin RPC before entering this function.
-- Recheck live membership/user/session here, not caller-supplied role metadata.
create function private.tc_manual_subscription_document_server(p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $document$
declare
 actor uuid; sid uuid; task_id uuid; operation uuid; expected bigint;
 task private.tc_manual_subscription_invoice_tasks; snapshot jsonb;
 reservation private.tc_manual_subscription_document_reservations;
 document private.tc_manual_subscription_invoice_documents;
 ready boolean:=false; bucket_ready boolean:=false;
 object_id uuid; object_key text; wanted_hash text; wanted_size integer;
begin
 if p_action is null or p_action not in('status','reserve','complete','download')
   or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>8192 then
   raise exception 'manual_document_invalid' using errcode='22023';
 end if;
 actor:=(p_data->>'actor_id')::uuid; sid:=(p_data->>'session_id')::uuid;
 if p_action='status' then
   if p_data-array['actor_id','session_id']<>'{}' then
     raise exception 'manual_document_invalid' using errcode='22023';
   end if;
   perform private.tc_manual_fiscal_document_actor(actor,sid);
   if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
     select exists(select 1 from storage.buckets b where b.id='tc-subscription-fiscal'
       and b.public=false and b.file_size_limit between 8 and 10485760 and b.allowed_mime_types=array['application/pdf'])
       and exists(select 1 from pg_class c where c.oid='storage.objects'::regclass and c.relrowsecurity)
       and exists(select 1 from pg_policy p where p.polrelid='storage.objects'::regclass
         and p.polname='tc_subscription_fiscal_backend_only' and p.polpermissive=false)
       into bucket_ready;
   end if;
   select uploads_enabled and downloads_enabled into ready
     from private.tc_manual_subscription_document_runtime where id for share;
   ready:=coalesce(ready,false) and coalesce(bucket_ready,false);
   return jsonb_build_object('available',true,'document_upload_ready',ready,'downloads_ready',ready);
 end if;
 task_id:=(p_data->>'task_id')::uuid; operation:=(p_data->>'operation_id')::uuid;
 expected:=(p_data->>'expected_version')::bigint;
 if operation is null or task_id is null or expected is null or expected not between 1 and 9007199254740990 then
   raise exception 'manual_document_invalid' using errcode='22023';
 end if;
 perform private.tc_manual_fiscal_document_actor(actor,sid);
 select * into task from private.tc_manual_subscription_invoice_tasks where id=task_id for update;
 if not found then raise exception 'manual_document_task_denied' using errcode='42501'; end if;
 -- Re-evaluate after any task-lock wait without changing JWT/session claims.
 perform private.tc_manual_fiscal_document_actor(actor,sid);
 snapshot:=private.tc_manual_subscription_invoice_dto(task_id);
 if (snapshot->>'row_version')::bigint<>expected then
   raise exception 'manual_document_version_conflict' using errcode='40001';
 end if;
 if p_action='download' then
   if not coalesce((select uploads_enabled and downloads_enabled from private.tc_manual_subscription_document_runtime where id),false) then
     raise exception 'manual_document_download_unavailable' using errcode='42501';
   end if;
   if p_data-array['actor_id','session_id','task_id','operation_id','expected_version','document_id']<>'{}' then
     raise exception 'manual_document_invalid' using errcode='22023';
   end if;
   select * into document from private.tc_manual_subscription_invoice_documents
     where id=(p_data->>'document_id')::uuid and tc_manual_subscription_invoice_documents.task_id=task.id;
   if not found then raise exception 'manual_document_denied' using errcode='42501'; end if;
   perform pg_advisory_xact_lock(hashtextextended(actor::text,61009));
   if (select count(*) from private.tc_manual_subscription_document_access a
       where a.actor_id=actor and a.created_at>now()-interval '1 hour')>=100 then
     raise exception 'manual_document_rate_limit' using errcode='54000';
   end if;
   -- Log every authorized attempt, including repeated operation IDs. Reusing an
   -- operation must not bypass the read limiter or claim mail delivery.
   insert into private.tc_manual_subscription_document_access(operation_id,document_id,task_id,actor_id,session_id)
     values(operation,document.id,task.id,actor,sid);
 else
   if not coalesce((select uploads_enabled and downloads_enabled from private.tc_manual_subscription_document_runtime where id),false)
     or snapshot->>'status'<>'awaiting_issue' or (snapshot->>'buyer_validated')::boolean is distinct from true then
     raise exception 'manual_document_upload_unavailable' using errcode='42501';
   end if;
   wanted_hash:=p_data->>'sha256'; wanted_size:=(p_data->>'size_bytes')::integer;
   if wanted_hash is null or wanted_hash !~ '^[0-9a-f]{64}$'
     or wanted_size is null or wanted_size not between 8 and 10485760 then
     raise exception 'manual_document_invalid' using errcode='22023';
   end if;
   if p_action='reserve' then
     if p_data-array['actor_id','session_id','task_id','operation_id','expected_version','sha256','size_bytes']<>'{}' then
       raise exception 'manual_document_invalid' using errcode='22023';
     end if;
     -- Serialize reservation quota for a single actor across different tasks.
     perform pg_advisory_xact_lock(hashtextextended(actor::text,61008));
     select * into reservation from private.tc_manual_subscription_document_reservations where operation_id=operation;
     if found then
       if reservation.actor_id<>actor or reservation.session_id<>sid or reservation.task_id<>task.id
         or reservation.expected_version<>expected or reservation.sha256<>wanted_hash
         or reservation.size_bytes<>wanted_size or reservation.expires_at<now() then
         raise exception 'manual_document_conflicting_replay' using errcode='23514';
       end if;
     else
       if (select count(*) from private.tc_manual_subscription_document_reservations r
         where r.actor_id=actor and r.created_at>now()-interval '1 hour')>=20 then
         raise exception 'manual_document_rate_limit' using errcode='54000';
       end if;
       object_id:=gen_random_uuid();
       object_key:='subscription-invoices/'||task.buyer_company_id||'/'||task.id||'/'||object_id||'.pdf';
       insert into private.tc_manual_subscription_document_reservations(
         operation_id,document_id,task_id,actor_id,session_id,expected_version,object_key,sha256,size_bytes
       ) values(operation,object_id,task.id,actor,sid,expected,object_key,wanted_hash,wanted_size)
       returning * into reservation;
     end if;
     return jsonb_build_object('operation_id',reservation.operation_id,'nonce',reservation.nonce,
       'document_id',reservation.document_id,'task_id',reservation.task_id,'object_key',reservation.object_key,
       'sha256',reservation.sha256,'size_bytes',reservation.size_bytes);
   end if;
   if p_data-array['actor_id','session_id','task_id','operation_id','expected_version','sha256','size_bytes','nonce','document_id']<>'{}' then
     raise exception 'manual_document_invalid' using errcode='22023';
   end if;
   select * into reservation from private.tc_manual_subscription_document_reservations where operation_id=operation;
   if not found or reservation.actor_id<>actor or reservation.session_id<>sid or reservation.task_id<>task.id
     or reservation.expected_version<>expected or reservation.sha256<>wanted_hash or reservation.size_bytes<>wanted_size
     or reservation.document_id is distinct from (p_data->>'document_id')::uuid
     or reservation.nonce is distinct from (p_data->>'nonce')::uuid or reservation.expires_at<now() then
     raise exception 'manual_document_reservation_required' using errcode='23514';
   end if;
   -- This metadata check supplements (does not replace) readback+SHA256 in Edge.
   -- Only the service-role backend can complete; browsers never submit proof.
   if not exists(select 1 from storage.objects o join storage.buckets b on b.id=o.bucket_id
     where b.id='tc-subscription-fiscal' and b.public=false
       and o.name=reservation.object_key and o.metadata->>'mimetype'='application/pdf'
       and (o.metadata->>'size')::bigint=reservation.size_bytes) then
     raise exception 'manual_document_private_object_missing' using errcode='23514';
   end if;
   insert into private.tc_manual_subscription_invoice_documents(id,task_id,object_key,sha256,size_bytes)
     values(reservation.document_id,task.id,reservation.object_key,wanted_hash,wanted_size)
     on conflict(id) do nothing;
   select * into document from private.tc_manual_subscription_invoice_documents where id=reservation.document_id;
   if not found or document.task_id<>task.id or document.object_key<>reservation.object_key
     or document.sha256<>wanted_hash or document.size_bytes<>wanted_size then
     raise exception 'manual_document_conflicting_evidence' using errcode='23514';
   end if;
 end if;
 return jsonb_build_object('document_id',document.id,'task_id',document.task_id,
   'object_key',document.object_key,'sha256',document.sha256,'size_bytes',document.size_bytes);
end;$document$;
revoke all on function private.tc_manual_subscription_document_server(text,jsonb) from public,anon,authenticated;

create function public.tc_manual_subscription_document_server(p_action text,p_data jsonb)
returns jsonb language sql security invoker set search_path='' as $wrapper$
 select private.tc_manual_subscription_document_server(p_action,p_data);
$wrapper$;
revoke all on function public.tc_manual_subscription_document_server(text,jsonb) from public,anon,authenticated;
do $service_functions$
begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  revoke all on function private.tc_manual_fiscal_document_actor(uuid,uuid) from service_role;
  grant usage on schema private to service_role;
  grant execute on function private.tc_manual_subscription_document_server(text,jsonb) to service_role;
  grant execute on function public.tc_manual_subscription_document_server(text,jsonb) to service_role;
 end if;
end;$service_functions$;

-- Acceptance BEFORE activation:
-- * isolated PGlite/Postgres schema, role/tenant/revoked-session/CAS/replay tests;
-- * private storage upload/readback on synthetic PDF, no overwrite, unknown-write
--   recovery with same reservation, zero PII cache and authorized proxy download;
-- * deploy reviewed Edge source and verify its exact dependencies;
-- * only after recorded native acceptance: consciously change the existing admin
--   capability projection and this private flag. They remain false in this file.
-- * human validates genuine GDTaller/TicketBAI content separately; a PDF header
--   and hash prove transport/integrity only, never issuance or fiscal validity.
-- No deletion compensation: uncertain objects stay private pending investigation.


-- Administrator invoice request notices
create function private.tc_manual_invoice_notice_clock() returns timestamptz
language sql volatile security invoker set search_path='' as $$select clock_timestamp()$$;
revoke all on function private.tc_manual_invoice_notice_clock() from public,anon,authenticated;

create table private.tc_manual_invoice_notice_settings(
 id boolean primary key default true check(id),
 enabled boolean not null default false,
 daily_limit integer not null default 20 check(daily_limit between 1 and 20),
 monthly_limit integer not null default 500 check(monthly_limit between 1 and 500)
);
insert into private.tc_manual_invoice_notice_settings(id) values(true);
create table private.tc_manual_invoice_notice_outbox(
 id uuid primary key default gen_random_uuid(),
 task_id uuid not null unique references private.tc_manual_subscription_invoice_tasks(id) on delete restrict,
 mode text not null check(mode in('test','live')),
 recipient text not null default 'pedidos@smartscaneuskadi.com' check(recipient='pedidos@smartscaneuskadi.com'),
 template_version integer not null default 1 check(template_version=1),
 created_at timestamptz not null default private.tc_manual_invoice_notice_clock(),
 status text not null default 'pending' check(status in('pending','leased','retry_wait','accepted','uncertain','failed')),
 attempts integer not null default 0 check(attempts between 0 and 3),
 row_version bigint not null default 1 check(row_version between 1 and 9007199254740991),
 next_attempt_at timestamptz not null default private.tc_manual_invoice_notice_clock(),
 first_attempt_at timestamptz,
 lease_token uuid,
 lease_until timestamptz,
 provider_email_id uuid,
 error_code text check(error_code in('rate_limited','idempotency_busy','provider_rejected','provider_uncertain','lease_expired','idempotency_window_expired','attempts_exhausted')),
 settled_lease_token uuid,
 settled_expected_version bigint,
 settled_outcome text,
 constraint tc_manual_notice_lease_shape check(
  (status='leased' and lease_token is not null and lease_until is not null) or
  (status<>'leased' and lease_token is null and lease_until is null)),
 constraint tc_manual_notice_acceptance_shape check((status='accepted')=(provider_email_id is not null)),
 constraint tc_manual_notice_attempt_shape check((status='pending' and attempts=0 and first_attempt_at is null)
   or (status<>'pending' and attempts between 1 and 3 and first_attempt_at is not null))
);
create index tc_manual_notice_due_idx on private.tc_manual_invoice_notice_outbox(next_attempt_at,id)
 where status in('pending','retry_wait');
create table private.tc_manual_invoice_notice_audit(
 notice_id uuid not null references private.tc_manual_invoice_notice_outbox(id) on delete restrict,
 row_version bigint not null,
 from_status text,
 to_status text not null,
 attempts integer not null,
 error_code text,
 provider_email_id uuid,
 actor_role text not null check(actor_role='service_role'),
 created_at timestamptz not null default private.tc_manual_invoice_notice_clock(),
 primary key(notice_id,row_version)
);
alter table private.tc_manual_invoice_notice_settings enable row level security;
alter table private.tc_manual_invoice_notice_outbox enable row level security;
alter table private.tc_manual_invoice_notice_audit enable row level security;
create policy tc_manual_notice_settings_no_client on private.tc_manual_invoice_notice_settings
 as restrictive for all to public using(false) with check(false);
create policy tc_manual_notice_outbox_no_client on private.tc_manual_invoice_notice_outbox
 as restrictive for all to public using(false) with check(false);
create policy tc_manual_notice_audit_no_client on private.tc_manual_invoice_notice_audit
 as restrictive for all to public using(false) with check(false);
revoke all on private.tc_manual_invoice_notice_settings,private.tc_manual_invoice_notice_outbox,
 private.tc_manual_invoice_notice_audit from public,anon,authenticated;

create function private.tc_manual_invoice_notice_guard() returns trigger
language plpgsql security invoker set search_path='' as $guard$
begin
 if current_setting('role',true) is distinct from 'service_role' then
  raise exception 'manual_notice_server_only' using errcode='42501'; end if;
 if tg_op='INSERT' then
  if new.status<>'pending' or new.attempts<>0 or new.row_version<>1
   or new.first_attempt_at is not null or new.lease_token is not null
   or not exists(select 1 from private.tc_manual_stripe_bridge_receipts b
      where b.task_id=new.task_id and b.mode=new.mode)
  then raise exception 'manual_notice_unreconciled_task' using errcode='23514'; end if;
 else
  if (new.id,new.task_id,new.mode,new.recipient,new.template_version,new.created_at)
    is distinct from (old.id,old.task_id,old.mode,old.recipient,old.template_version,old.created_at)
    or new.row_version<>old.row_version+1
  then raise exception 'manual_notice_metadata_immutable' using errcode='23514'; end if;
  if old.status in('accepted','uncertain','failed')
   or not((old.status in('pending','retry_wait') and new.status='leased' and new.attempts=old.attempts+1)
    or (old.status='leased' and new.status in('retry_wait','accepted','uncertain','failed') and new.attempts=old.attempts)
    or (old.status='retry_wait' and new.status='failed' and new.attempts=old.attempts))
   or (old.first_attempt_at is not null and new.first_attempt_at is distinct from old.first_attempt_at)
  then raise exception 'manual_notice_transition_forbidden' using errcode='23514'; end if;
 end if;
 return new;
end;$guard$;
revoke all on function private.tc_manual_invoice_notice_guard() from public,anon,authenticated;
create trigger tc_manual_notice_guard before insert or update on private.tc_manual_invoice_notice_outbox
 for each row execute function private.tc_manual_invoice_notice_guard();
create trigger tc_manual_notice_no_remove before delete or truncate on private.tc_manual_invoice_notice_outbox
 for each statement execute function private.tc_manual_subscription_intake_reject_mutation();
create trigger tc_manual_notice_audit_immutable before update or delete or truncate on private.tc_manual_invoice_notice_audit
 for each statement execute function private.tc_manual_subscription_intake_reject_mutation();
create function private.tc_manual_invoice_notice_log() returns trigger
language plpgsql security invoker set search_path='' as $audit$
begin
 insert into private.tc_manual_invoice_notice_audit(
  notice_id,row_version,from_status,to_status,attempts,error_code,provider_email_id,actor_role
 ) values(new.id,new.row_version,case when tg_op='INSERT' then null else old.status end,
  new.status,new.attempts,new.error_code,new.provider_email_id,'service_role');
 return new;
end;$audit$;
revoke all on function private.tc_manual_invoice_notice_log() from public,anon,authenticated;
create trigger tc_manual_notice_log after insert or update on private.tc_manual_invoice_notice_outbox
 for each row execute function private.tc_manual_invoice_notice_log();

-- Call AFTER the bridge receipt INSERT, and before its return, in the SAME RPC.
-- Also call on a verified replay to idempotently return an existing notice.
create function private.tc_manual_invoice_notice_enqueue(p_task_id uuid) returns uuid
language plpgsql security definer set search_path='' as $enqueue$
declare result uuid; paid_mode text; modes integer;
begin
 if current_setting('role',true) is distinct from 'service_role' then
  raise exception 'manual_notice_server_only' using errcode='42501'; end if;
 select min(b.mode),count(distinct b.mode) into paid_mode,modes
  from private.tc_manual_stripe_bridge_receipts b
  join private.tc_manual_subscription_invoice_tasks t on t.id=b.task_id
  where b.task_id=p_task_id;
 if p_task_id is null or modes<>1 then
  raise exception 'manual_notice_unreconciled_task' using errcode='23514'; end if;
 insert into private.tc_manual_invoice_notice_outbox(task_id,mode)
  values(p_task_id,paid_mode) on conflict(task_id) do nothing;
 select id into strict result from private.tc_manual_invoice_notice_outbox where task_id=p_task_id;
 return result;
end;$enqueue$;
revoke all on function private.tc_manual_invoice_notice_enqueue(uuid) from public,anon,authenticated;


create function private.tc_manual_invoice_notice_runtime() returns jsonb
language plpgsql stable security definer set search_path='' as $runtime$
begin
 if current_setting('role',true) is distinct from 'service_role' then
  raise exception 'manual_notice_server_only' using errcode='42501'; end if;
 return (select jsonb_build_object('contract','manual-invoice-notice-runtime-v1',
  'enabled',s.enabled,'daily_limit',s.daily_limit,'monthly_limit',s.monthly_limit)
  from private.tc_manual_invoice_notice_settings s where id);
end;$runtime$;
revoke all on function private.tc_manual_invoice_notice_runtime() from public,anon,authenticated;

create function public.tc_manual_invoice_notice_runtime() returns jsonb
language sql stable security invoker set search_path='' as $$select private.tc_manual_invoice_notice_runtime()$$;
revoke all on function public.tc_manual_invoice_notice_runtime() from public,anon,authenticated;


create function private.tc_manual_invoice_notice_claim() returns jsonb
language plpgsql security definer set search_path='' as $claim$
declare s private.tc_manual_invoice_notice_settings; n private.tc_manual_invoice_notice_outbox;
 stamp timestamptz:=private.tc_manual_invoice_notice_clock();
begin
 if current_setting('role',true) is distinct from 'service_role' then
  raise exception 'manual_notice_server_only' using errcode='42501'; end if;
 select * into strict s from private.tc_manual_invoice_notice_settings where id for update;
 if not s.enabled then return null; end if;
 -- A crashed worker may already have sent: expire to terminal uncertainty,
 -- NEVER back to pending/retry. Accepted is not a delivery confirmation.
 update private.tc_manual_invoice_notice_outbox set status='uncertain',error_code='lease_expired',
  lease_token=null,lease_until=null,row_version=row_version+1
  where status='leased' and lease_until<=stamp;
 update private.tc_manual_invoice_notice_outbox set status='failed',error_code='idempotency_window_expired',
  row_version=row_version+1
  where status='retry_wait' and first_attempt_at+interval '23 hours'<=stamp;
 if (select count(*) from private.tc_manual_invoice_notice_audit
   where to_status='leased' and created_at>=date_trunc('day',stamp at time zone 'UTC') at time zone 'UTC')>=s.daily_limit
  or (select count(*) from private.tc_manual_invoice_notice_audit
   where to_status='leased' and created_at>=date_trunc('month',stamp at time zone 'UTC') at time zone 'UTC')>=s.monthly_limit
 then return null; end if;
 select * into n from private.tc_manual_invoice_notice_outbox
  where mode='live' and status in('pending','retry_wait') and attempts<3 and next_attempt_at<=stamp
   and (first_attempt_at is null or first_attempt_at+interval '23 hours'>stamp)
  order by next_attempt_at,id limit 1 for update skip locked;
 if not found then return null; end if;
 update private.tc_manual_invoice_notice_outbox set status='leased',attempts=attempts+1,
  first_attempt_at=coalesce(first_attempt_at,stamp),lease_token=gen_random_uuid(),
  lease_until=stamp+interval '60 seconds',row_version=row_version+1,error_code=null
  where id=n.id returning * into n;
 return jsonb_build_object('contract','manual-invoice-notice-claim-v1','notice',jsonb_build_object(
  'id',n.id,'task_id',n.task_id,'lease_token',n.lease_token,'row_version',n.row_version,
  'attempt',n.attempts,'first_attempt_at',n.first_attempt_at,'lease_until',n.lease_until,
  'mode',n.mode,'template_version',n.template_version));
end;$claim$;
revoke all on function private.tc_manual_invoice_notice_claim() from public,anon,authenticated;

create function public.tc_manual_invoice_notice_claim() returns jsonb
language sql security invoker set search_path='' as $$select private.tc_manual_invoice_notice_claim()$$;
revoke all on function public.tc_manual_invoice_notice_claim() from public,anon,authenticated;


create function private.tc_manual_invoice_notice_finish(
 p_notice uuid,p_lease uuid,p_expected bigint,p_outcome text,p_provider_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $finish$
declare n private.tc_manual_invoice_notice_outbox; wanted text; code text;
 stamp timestamptz:=private.tc_manual_invoice_notice_clock(); wait_seconds integer;
begin
 if current_setting('role',true) is distinct from 'service_role' then
  raise exception 'manual_notice_server_only' using errcode='42501'; end if;
 if p_notice is null or p_lease is null or p_expected is null or p_expected<2
  or p_outcome is null or p_outcome not in('accepted','retry_rate','retry_busy','failed','uncertain')
  or (p_outcome='accepted') is distinct from (p_provider_id is not null) then
  raise exception 'manual_notice_result_invalid' using errcode='22023'; end if;
 select * into n from private.tc_manual_invoice_notice_outbox where id=p_notice for update;
 if not found then raise exception 'manual_notice_not_found' using errcode='42501'; end if;
 if n.settled_lease_token=p_lease and n.settled_expected_version=p_expected
  and n.settled_outcome=p_outcome and n.provider_email_id is not distinct from p_provider_id then
  return jsonb_build_object('contract','manual-invoice-notice-finish-v1','id',n.id,'status',n.status,'replayed',true);
 end if;
 if n.status<>'leased' or n.lease_token<>p_lease or n.row_version<>p_expected or n.lease_until<=stamp then
  raise exception 'manual_notice_lease_conflict' using errcode='40001'; end if;
 if p_outcome='accepted' then wanted:='accepted';code:=null;
 elsif p_outcome='uncertain' then wanted:='uncertain';code:='provider_uncertain';
 elsif p_outcome='failed' then wanted:='failed';code:='provider_rejected';
 else
  wanted:=case when n.attempts>=3 then 'failed'
    when n.first_attempt_at+interval '23 hours'<=stamp then 'failed' else 'retry_wait' end;
  code:=case when n.attempts>=3 then 'attempts_exhausted'
    when n.first_attempt_at+interval '23 hours'<=stamp then 'idempotency_window_expired'
    when p_outcome='retry_rate' then 'rate_limited' else 'idempotency_busy' end;
 end if;
 wait_seconds:=30*(2^(n.attempts-1))::integer+
  ((hashtextextended(n.id::text||n.attempts::text,0)&2147483647)%30)::integer;
 update private.tc_manual_invoice_notice_outbox set status=wanted,error_code=code,
  provider_email_id=p_provider_id,lease_token=null,lease_until=null,row_version=row_version+1,
  next_attempt_at=case when wanted='retry_wait' then stamp+make_interval(secs=>wait_seconds) else next_attempt_at end,
  settled_lease_token=p_lease,settled_expected_version=p_expected,settled_outcome=p_outcome
  where id=n.id returning * into n;
 return jsonb_build_object('contract','manual-invoice-notice-finish-v1','id',n.id,'status',n.status,'replayed',false);
end;$finish$;
revoke all on function private.tc_manual_invoice_notice_finish(uuid,uuid,bigint,text,uuid)
 from public,anon,authenticated;

create function public.tc_manual_invoice_notice_finish(
 p_notice uuid,p_lease uuid,p_expected bigint,p_outcome text,p_provider_id uuid default null
) returns jsonb language sql security invoker set search_path='' as $$
 select private.tc_manual_invoice_notice_finish(p_notice,p_lease,p_expected,p_outcome,p_provider_id)
$$;
revoke all on function public.tc_manual_invoice_notice_finish(uuid,uuid,bigint,text,uuid) from public,anon,authenticated;


-- Historical isolated fixtures may not define service_role. PUBLIC/client
-- revocations above are unconditional; only the optional server role is gated.
do $notice_service_grants$
begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  revoke all on function private.tc_manual_invoice_notice_clock() from service_role;
  revoke all on private.tc_manual_invoice_notice_settings,private.tc_manual_invoice_notice_outbox,
 private.tc_manual_invoice_notice_audit from service_role;
  revoke all on function private.tc_manual_invoice_notice_guard() from service_role;
  revoke all on function private.tc_manual_invoice_notice_log() from service_role;
  revoke all on function private.tc_manual_invoice_notice_enqueue(uuid) from service_role;
  revoke all on function private.tc_manual_invoice_notice_runtime() from service_role;
  revoke all on function private.tc_manual_invoice_notice_claim() from service_role;
  revoke all on function private.tc_manual_invoice_notice_finish(uuid,uuid,bigint,text,uuid)
 from service_role;
  grant execute on function private.tc_manual_invoice_notice_enqueue(uuid) to service_role;
  grant execute on function private.tc_manual_invoice_notice_runtime() to service_role;
  grant execute on function public.tc_manual_invoice_notice_runtime() to service_role;
  grant execute on function private.tc_manual_invoice_notice_claim() to service_role;
  grant execute on function public.tc_manual_invoice_notice_claim() to service_role;
  grant execute on function private.tc_manual_invoice_notice_finish(uuid,uuid,bigint,text,uuid) to service_role;
  grant execute on function public.tc_manual_invoice_notice_finish(uuid,uuid,bigint,text,uuid) to service_role;
 end if;
end;$notice_service_grants$;
