-- REVIEW PROPOSAL ONLY; not a migration and never applied from this file.
-- Requires private.tc_actor_verified(uuid,boolean) from the separately reviewed
-- admin-session-freshness proposal. This file does not redefine that helper.
-- Existing function OIDs/grants remain intact through CREATE OR REPLACE.
-- No row locks, writes, network access or user_metadata authorization in RLS.
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
