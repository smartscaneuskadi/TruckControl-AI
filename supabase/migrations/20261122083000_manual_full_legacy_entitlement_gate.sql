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
  return jsonb_build_object('active',true,'is_admin',false,'features',private.tc_company_features(p_org,p_user,'limited',true),
   'company_role',r,'can_write',r<>'viewer','can_manage',r in ('owner','admin'),'organization_id',p_org,'profile',null,'plan','limited','max_trucks',50,'manual_full',manual,'observed_at',now());
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
   where l.enabled and (l.expires_at is null or l.expires_at>now())
    and private.tc_company_role_for(l.organization_id,p_user_id) is not null
    and coalesce((private.tc_organization_access_for(l.organization_id,p_user_id)->>'active')::boolean,false));
  return jsonb_build_object('is_admin',is_admin,'active',coalesce(active,false) or coalesce(company_available,false),
    'company_access_available',coalesce(company_available,false),'features',coalesce(f,'{}'),
    'profile',case when c.user_id is null or not actor_verified then null else to_jsonb(c)-'stripe_subscription_id' end,
    'plan',case when is_admin then 'full' else 'limited' end,
    'max_trucks',coalesce(p.max_trucks,50),'requires_phone_verification',coalesce(requires_phone,false),
    'sms_ready',s.sms_ready,'prices_are_examples',s.prices_are_examples,'payments_enabled',s.payments_enabled);
end;
$function$;
