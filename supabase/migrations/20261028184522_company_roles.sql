-- Company membership never comes from user_metadata. Owners retain their account.
create table private.tc_memberships (
 organization_id uuid not null references public.organizations(id) on delete restrict,
 user_id uuid not null references auth.users(id) on delete restrict,
 role text not null check(role in ('admin','operator','viewer')),
 status text not null default 'invited' check(status in ('invited','active','revoked')),
 module_overrides jsonb not null default '{}' check(jsonb_typeof(module_overrides)='object'),
 invited_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key(organization_id,user_id)
);
create index tc_memberships_user_idx on private.tc_memberships(user_id,status);
create index tc_memberships_inviter_idx on private.tc_memberships(invited_by);
alter table private.tc_memberships enable row level security;
revoke all on private.tc_memberships from public,anon,authenticated;

create function private.tc_company_role_for(p_org uuid,p_user uuid) returns text
language sql stable security definer set search_path='' as $$
 select case when o.owner_id=p_user then 'owner' else
  (select m.role from private.tc_memberships m where m.organization_id=o.id and m.user_id=p_user and m.status='active') end
 from public.organizations o where o.id=p_org and p_user is not null;
$$;
revoke all on function private.tc_company_role_for(uuid,uuid) from public,anon,authenticated;
create function private.tc_company_role(p_org uuid) returns text
language sql stable security definer set search_path='' as $$
 select private.tc_company_role_for(p_org,(select auth.uid()));
$$;
revoke all on function private.tc_company_role(uuid) from public,anon,authenticated;
grant execute on function private.tc_company_role(uuid) to authenticated;

create function private.tc_company_features(p_org uuid,p_user uuid,p_plan text,p_active boolean) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(m.id,p_active and m.enabled and
  coalesce((u.module_overrides->>m.id)::boolean,(p.modules->>m.id)::boolean,false) and
  coalesce((r.module_overrides->>m.id)::boolean,true) and
  (m.id<>'invoice_ai' or (u.ai_allowed and u.ai_opt_in))),'{}'::jsonb)
 from private.tc_modules m cross join private.tc_plans p
 left join private.tc_customers u on u.user_id=p_user
 left join private.tc_memberships r on r.organization_id=p_org and r.user_id=p_user and r.status='active'
 where p.id=p_plan;
$$;
revoke all on function private.tc_company_features(uuid,uuid,text,boolean) from public,anon,authenticated;

create function private.tc_organization_access_for(p_org uuid,p_user uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare o public.organizations; c private.tc_customers; a private.tc_customers; s private.tc_settings;
 r text; plan_id text; enabled boolean; phone_needed boolean; u record; profile jsonb;
begin
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
 plan_id:=case when now()<c.trial_ends_at then 'full' when c.status='active' then c.paid_plan else 'full' end;
 profile:=to_jsonb(a)-'stripe_subscription_id'||jsonb_build_object('company_name',o.name,
  'status',case when a.status='suspended' then 'suspended' else c.status end,
  'trial_started_at',c.trial_started_at,'trial_ends_at',c.trial_ends_at,'paid_until',c.paid_until,'paid_plan',c.paid_plan);
 return jsonb_build_object('active',coalesce(enabled,false),'is_admin',false,
  'features',private.tc_company_features(p_org,p_user,plan_id,coalesce(enabled,false)),
  'company_role',r,'can_write',coalesce(enabled,false) and r<>'viewer','can_manage',coalesce(enabled,false) and r in ('owner','admin'),
  'organization_id',p_org,'profile',profile,'plan',plan_id,
  'max_trucks',coalesce((select max_trucks from private.tc_plans where id=plan_id),50),
  'requires_phone_verification',coalesce(phone_needed,false),'sms_ready',s.sms_ready,
  'prices_are_examples',s.prices_are_examples,'payments_enabled',s.payments_enabled);
end;
$$;
revoke all on function private.tc_organization_access_for(uuid,uuid) from public,anon,authenticated;

create function private.tc_current_organization_access(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if (select auth.uid()) is null then raise exception 'Inicia sesión' using errcode='42501';end if;
 return private.tc_organization_access_for(p_org,(select auth.uid()));
end;
$$;
revoke all on function private.tc_current_organization_access(uuid) from public,anon,authenticated;
grant execute on function private.tc_current_organization_access(uuid) to authenticated;
create function public.tc_organization_access(p_org uuid) returns jsonb
language sql stable security invoker set search_path='' as $$select private.tc_current_organization_access(p_org);$$;
revoke all on function public.tc_organization_access(uuid) from public,anon,authenticated;
grant execute on function public.tc_organization_access(uuid) to authenticated;

create or replace function private.tc_account_active(p_organization_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());enforcement boolean;
begin
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
create function private.tc_can_write_company(p_org uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.tc_account_active(p_org) and private.tc_company_role(p_org) in ('owner','admin','operator');
$$;
revoke all on function private.tc_can_write_company(uuid) from public,anon,authenticated;
grant execute on function private.tc_can_write_company(uuid) to authenticated;
create or replace function private.tc_feature(p_organization_id uuid,p_module text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((private.tc_organization_access_for(p_organization_id,(select auth.uid()))->'features'->>p_module)::boolean,false);
$$;

alter policy organizations_select on public.organizations using(private.tc_company_role(id) is not null);
alter policy organizations_insert on public.organizations with check(owner_id=(select auth.uid()) and private.tc_client_active());
alter policy drivers_owner on public.drivers using(private.tc_company_role(organization_id) is not null) with check(private.tc_can_write_company(organization_id));
alter policy trucks_owner on public.trucks using(private.tc_company_role(organization_id) is not null) with check(private.tc_can_write_company(organization_id));
alter policy entries_owner on public.finance_entries using(private.tc_company_role(organization_id) is not null) with check(private.tc_can_write_company(organization_id));
alter policy tc_drivers_active on public.drivers using(private.tc_account_active(organization_id)) with check(private.tc_account_active(organization_id));
alter policy tc_trucks_active on public.trucks using(private.tc_account_active(organization_id)) with check(private.tc_account_active(organization_id));
alter policy tc_entries_active on public.finance_entries using(private.tc_account_active(organization_id)) with check(private.tc_account_active(organization_id));
create policy tc_driver_delete_role on public.drivers as restrictive for delete to authenticated using(private.tc_can_write_company(organization_id));
create policy tc_truck_delete_role on public.trucks as restrictive for delete to authenticated using(private.tc_can_write_company(organization_id));
create policy tc_entry_delete_role on public.finance_entries as restrictive for delete to authenticated using(private.tc_can_write_company(organization_id));
alter policy documents_owner on private.company_documents using(private.tc_account_active(organization_id)) with check(private.tc_can_write_company(organization_id));
alter policy gmail_owner_read on private.gmail_connections using(private.tc_account_active(organization_id));
alter policy invoices_owner on private.invoice_documents using(private.tc_account_active(organization_id)) with check(private.tc_can_write_company(organization_id));

create function private.tc_team_control(p_org uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); target uuid; member_role text; overrides jsonb;
begin
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
revoke all on function private.tc_team_control(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.tc_team_control(uuid,text,jsonb) to authenticated;
create function public.tc_team_control(p_org uuid,p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select private.tc_team_control(p_org,p_action,p_data);$$;
revoke all on function public.tc_team_control(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.tc_team_control(uuid,text,jsonb) to authenticated;

create function public.tc_company_server_access(p_user uuid,p_org uuid) returns jsonb
language sql stable security invoker set search_path='' as $$select private.tc_organization_access_for(p_org,p_user);$$;
revoke all on function public.tc_company_server_access(uuid,uuid) from public,anon,authenticated;
do $$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  create policy tc_memberships_server on private.tc_memberships for all to service_role using(true) with check(true);
  grant select,insert,update on private.tc_memberships to service_role;
  grant execute on function private.tc_organization_access_for(uuid,uuid),public.tc_company_server_access(uuid,uuid) to service_role;
 end if;
 if to_regclass('storage.objects') is not null then
  execute $p$alter policy truckcontrol_documents_select on storage.objects using(bucket_id='truckcontrol-documents' and
   case when split_part(name,'/',1) ~ '^[0-9a-f-]{36}$' then private.tc_account_active(split_part(name,'/',1)::uuid) else false end)$p$;
  execute $p$alter policy truckcontrol_documents_insert on storage.objects with check(bucket_id='truckcontrol-documents' and
   case when split_part(name,'/',1) ~ '^[0-9a-f-]{36}$' then private.tc_can_write_company(split_part(name,'/',1)::uuid) else false end)$p$;
 end if;
end $$;
