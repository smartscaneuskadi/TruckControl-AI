-- P0: FULL is never inferred from historical trial, paid plan, module override,
-- or disabled enforcement. Only the separately audited Root licence grants FULL.
-- Candidate only: do NOT run against production until isolated tests and review.
-- No data, licences, subscriptions, Stripe settings or other state is mutated.
-- CREATE OR REPLACE keeps existing grants and row policies.
do $legacy_full_guard$
begin
 if not exists (select 1 from pg_catalog.pg_proc where oid=to_regprocedure('private.tc_company_features(uuid,uuid,text,boolean)') and md5(prosrc)='7daae036fe6ac8b3ec8c2884c1615042') then
  raise exception 'manual_full_legacy_gate_prior_body_mismatch_tc_company_features';
 end if;
 if not exists (select 1 from pg_catalog.pg_proc where oid=to_regprocedure('private.tc_organization_access_for(uuid,uuid)') and md5(prosrc)='1ab3f4ecf190fe49ac7a53c3758a699b') then
  raise exception 'manual_full_legacy_gate_prior_body_mismatch_tc_organization_access_for';
 end if;
 if not exists (select 1 from pg_catalog.pg_proc where oid=to_regprocedure('private.tc_user_access(uuid)') and md5(prosrc)='047eb67dcdcd066dd755e451fbae9389') then
  raise exception 'manual_full_legacy_gate_prior_body_mismatch_tc_user_access';
 end if;
end;
$legacy_full_guard$;

-- A module override can narrow the effective plan, never upgrade Limited to FULL.
CREATE OR REPLACE FUNCTION private.tc_company_features(p_org uuid, p_user uuid, p_plan text, p_active boolean)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_object_agg(m.id,p_active and m.enabled and
  coalesce((p.modules->>m.id)::boolean,false) and
  coalesce((u.module_overrides->>m.id)::boolean,true) and
  coalesce((r.module_overrides->>m.id)::boolean,true) and
  -- Backend invariant independent of potentially drifted plan JSON/overrides.
  (m.id not in ('invoice_ai','document_ai') or
   (p_plan='full' and (private.tc_company_full_state(p_org)->>'status')='active'
    and u.ai_allowed and u.ai_opt_in))),'{}'::jsonb)
 from private.tc_modules m cross join private.tc_plans p
 left join private.tc_customers u on u.user_id=p_user
 left join private.tc_memberships r on r.organization_id=p_org and r.user_id=p_user and r.status='active'
 where p.id=p_plan;
$function$;

-- Company-scoped FULL needs a manual active licence regardless of legacy flags.
CREATE OR REPLACE FUNCTION private.tc_organization_access_for(p_org uuid, p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- Legacy enforcement bypass never disables identity, owner-ban, customer
  -- suspension or phone checks. It only skips the Basic billing clock.
  enabled:=exists(select 1 from public.organizations o
   join private.tc_customers owner_customer on owner_customer.user_id=o.owner_id
   join private.tc_customers actor_customer on actor_customer.user_id=p_user
   join auth.users actor_user on actor_user.id=p_user
   where o.id=p_org and owner_customer.status<>'suspended'
    and actor_customer.status<>'suspended'
    and private.tc_actor_verified(o.owner_id,false)
    and actor_user.email_confirmed_at is not null
    and (not s.sms_ready or (actor_user.phone_confirmed_at is not null
     and ('+'||regexp_replace(coalesce(actor_user.phone,''),'[^0-9]','','g'))=actor_customer.phone)));
  return jsonb_build_object('active',enabled,'is_admin',false,'features',private.tc_company_features(p_org,p_user,'limited',enabled),
   'company_role',r,'can_write',enabled and r<>'viewer','can_manage',enabled and r in ('owner','admin'),'organization_id',p_org,'profile',null,'plan','limited','max_trucks',50,'manual_full',manual,'observed_at',now());
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
  -- OFF/expired revokes only FULL capabilities, not a verified member's Basic
  -- access to existing fleet data. Suspensions/identity checks remain mandatory.
  enabled:=c.user_id is not null and a.user_id is not null and c.status<>'suspended' and a.status<>'suspended'
   and private.tc_actor_verified(o.owner_id,false) and not coalesce(phone_needed,true);
  plan_id:=case when manual->>'status'='active' then 'full' else 'limited' end;
 else
  -- Historical Full trial/paid flags do not imply a manual company licence.
  plan_id:='limited';
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
$function$;

-- RLS and Storage use this identity/Basic gate. They must NOT depend on
-- FULL licence status: OFF/expiry is a feature-tier change, not a data deletion
-- or company suspension. FULL-only operations additionally require tc_feature.
-- Guard ensures the current production definition, not an unexpected drift.
do $basic_gate_guard$ begin
 if not exists (select 1 from pg_catalog.pg_proc
  where oid=to_regprocedure('private.tc_account_active(uuid)')
   and md5(prosrc)='cb8465c6eef91273d2ec22ebc4c2d9cb') then
  raise exception 'manual_full_basic_gate_prior_body_mismatch_tc_account_active';
 end if;
end;$basic_gate_guard$;
CREATE OR REPLACE FUNCTION private.tc_account_active(p_organization_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=(select auth.uid());enforcement boolean;manual jsonb;
begin
 if not private.tc_current_actor_verified() then return false;end if;
 if actor is null or private.tc_company_role_for(p_organization_id,actor) is null then return false;end if;
 manual:=private.tc_company_full_state(p_organization_id);
 if (manual->>'configured')::boolean then
  -- Keep the existing verified/suspension checks for any configured licence;
  -- the licence's active/disabled/expired status only changes the feature tier.
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
 -- Unconfigured organizations keep the Limited billing clock when enabled.
 -- Enforcement OFF must never bypass account suspension or verified identity.
 return exists(select 1 from public.organizations o
  join private.tc_customers c on c.user_id=o.owner_id
  join private.tc_customers a on a.user_id=actor
  join auth.users u on u.id=actor cross join private.tc_settings s
  where o.id=p_organization_id and c.status<>'suspended' and a.status<>'suspended'
   and u.email_confirmed_at is not null
   and (not s.sms_ready or (u.phone_confirmed_at is not null and ('+'||regexp_replace(coalesce(u.phone,''),'[^0-9]','','g'))=a.phone))
   and (not enforcement or ((c.status='trial' and now()<c.trial_ends_at) or (c.status='active' and now()<c.paid_until))));
end;
$function$;

-- Global account bootstrap is Basic-scoped; company-scoped FULL stays separate.
CREATE OR REPLACE FUNCTION private.tc_user_access(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  select * into p from private.tc_plans where id='limited';
  select jsonb_object_agg(m.id,coalesce(active,false) and m.enabled and
    (is_admin or coalesce((p.modules->>m.id)::boolean,false)) and
     (is_admin or coalesce((c.module_overrides->>m.id)::boolean,true)) and
    -- The global bootstrap cannot grant company-only FULL AI entitlements.
    (m.id not in ('invoice_ai','document_ai'))) into f from private.tc_modules m;
  company_available:=actor_verified and not is_admin and exists(
   select 1 from private.tc_company_full_licenses l
   -- A configured OFF/expired licence still provides a Basic company
   -- entrypoint; the company access RPC enforces the effective tier.
   where private.tc_company_role_for(l.organization_id,p_user_id) is not null
    and coalesce((private.tc_organization_access_for(l.organization_id,p_user_id)->>'active')::boolean,false));
  return jsonb_build_object('is_admin',is_admin,'active',coalesce(active,false) or coalesce(company_available,false),
    'company_access_available',coalesce(company_available,false),'features',coalesce(f,'{}'),
    'profile',case when c.user_id is null or not actor_verified then null else to_jsonb(c)-'stripe_subscription_id' end,
    'plan',case when is_admin then 'full' else 'limited' end,
    'max_trucks',coalesce(p.max_trucks,50),'requires_phone_verification',coalesce(requires_phone,false),
    'sms_ready',s.sms_ready,'prices_are_examples',s.prices_are_examples,'payments_enabled',s.payments_enabled);
end;
$function$;
