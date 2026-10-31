-- Additive SaaS layer. Never alters the legacy workshop tables or FIXPilot.
-- Local/demo enforcement stays off; the selected TruckControl project enables it
-- explicitly after migrations and security checks.
create table private.tc_settings (
  id boolean primary key default true check(id),
  app_name text not null default 'TruckControl AI',
  owner_email text not null default 'pedidos@smartscaneuskadi.com',
  enforce_access boolean not null default false,
  prices_are_examples boolean not null default true,
  sms_ready boolean not null default false,
  payments_enabled boolean not null default false,
  registration_open boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into private.tc_settings(id) values(true);
create table private.tc_modules (
  id text primary key check(id in ('dashboard','trucks','drivers','income','expenses','profitability','documents','gmail','assistant','invoice_ai')),
  label text not null,
  enabled boolean not null default true
);
insert into private.tc_modules(id,label,enabled) values
  ('dashboard','Panel principal',true),('trucks','Gestión de camiones',true),
  ('drivers','Gestión de conductores',true),('income','Ingresos',true),('expenses','Gastos',true),
  ('profitability','Rentabilidad',true),('documents','Documentos',true),('gmail','Facturas Gmail',true),
  ('assistant','Copiloto de flota',true),('invoice_ai','Lectura IA de facturas',false);
create table private.tc_plans (
  id text primary key check(id in ('limited','full')),
  name text not null check(char_length(name) between 1 and 50),
  monthly_cents integer not null check(monthly_cents between 100 and 100000000),
  currency text not null default 'EUR' check(currency='EUR'),
  max_trucks integer check(max_trucks between 1 and 10000),
  modules jsonb not null check(jsonb_typeof(modules)='object'),
  published boolean not null default true,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);
insert into private.tc_plans(id,name,monthly_cents,max_trucks,modules) values
  ('limited','Limitado',30000,50,'{"dashboard":true,"trucks":true,"drivers":true,"income":true,"expenses":true,"profitability":true,"documents":false,"gmail":false,"assistant":false,"invoice_ai":false}'),
  ('full','Full',90000,null,'{"dashboard":true,"trucks":true,"drivers":true,"income":true,"expenses":true,"profitability":true,"documents":true,"gmail":true,"assistant":true,"invoice_ai":true}');
create table private.tc_admins (
  user_id uuid primary key references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create table private.tc_customers (
  user_id uuid primary key references auth.users(id) on delete restrict,
  contact_name text not null check(char_length(btrim(contact_name)) between 2 and 100),
  company_name text not null check(char_length(btrim(company_name)) between 2 and 100),
  tax_id text not null check(char_length(btrim(tax_id)) between 3 and 30),
  address text not null check(char_length(btrim(address)) between 5 and 240),
  email text not null,
  phone text not null unique check(phone ~ '^\+[1-9][0-9]{7,14}$'),
  requested_plan text not null default 'full' references private.tc_plans(id),
  paid_plan text references private.tc_plans(id),
  status text not null default 'trial' check(status in ('trial','active','suspended')),
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null default now()+interval '10 days',
  paid_until timestamptz,
  ai_allowed boolean not null default false,
  ai_opt_in boolean not null default false,
  module_overrides jsonb not null default '{}'::jsonb check(jsonb_typeof(module_overrides)='object'),
  stripe_subscription_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(trial_ends_at=trial_started_at+interval '10 days')
);
create table private.tc_admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id),
  action text not null,
  target_id text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index tc_audit_created_idx on private.tc_admin_audit(created_at desc);
create table private.tc_payment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  plan_id text not null references private.tc_plans(id),
  quoted_cents integer not null check(quoted_cents>0),
  plan_revision bigint not null,
  currency text not null default 'EUR' check(currency='EUR'),
  status text not null default 'requested' check(status in ('requested','checkout','paid','cancelled')),
  checkout_id text unique,
  created_at timestamptz not null default now()
);
create index tc_payment_user_created_idx on private.tc_payment_requests(user_id,created_at desc);
create unique index tc_payment_pending_unique on private.tc_payment_requests(user_id,plan_id,plan_revision) where status in ('requested','checkout');
create table private.tc_payment_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);
alter table private.tc_settings enable row level security;
alter table private.tc_modules enable row level security;
alter table private.tc_plans enable row level security;
alter table private.tc_admins enable row level security;
alter table private.tc_customers enable row level security;
alter table private.tc_admin_audit enable row level security;
alter table private.tc_payment_requests enable row level security;
alter table private.tc_payment_events enable row level security;
revoke all on private.tc_settings,private.tc_modules,private.tc_plans,private.tc_admins,private.tc_customers,
  private.tc_admin_audit,private.tc_payment_requests,private.tc_payment_events from public,anon,authenticated;

-- Definer helpers are necessary to read private subscription/admin records from
-- RLS without granting clients mutation access. Every entry checks auth.uid(),
-- uses a fixed search_path and lives outside the exposed API schema.
create function private.tc_is_admin() returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists(select 1 from private.tc_admins where user_id=(select auth.uid()));
$$;
create function private.tc_user_access(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c private.tc_customers; p private.tc_plans; s private.tc_settings; active boolean; f jsonb; is_admin boolean;
begin
  -- Internal-only helper: all externally callable wrappers bind auth.uid().
  if p_user_id is null then return '{}'::jsonb;end if;
  select * into s from private.tc_settings where id=true;
  select exists(select 1 from private.tc_admins where user_id=p_user_id) into is_admin;
  select * into c from private.tc_customers where user_id=p_user_id;
  active := is_admin or (c.user_id is not null and c.status<>'suspended' and
    ((c.status='trial' and now()<c.trial_ends_at) or (c.status='active' and now()<c.paid_until)));
  select * into p from private.tc_plans where id=case when now()<c.trial_ends_at then 'full' when c.status='active' then c.paid_plan else 'full' end;
  select jsonb_object_agg(m.id,coalesce(active,false) and m.enabled and
    (is_admin or coalesce((c.module_overrides->>m.id)::boolean,(p.modules->>m.id)::boolean,false)) and
    (m.id<>'invoice_ai' or (not is_admin and c.ai_allowed and c.ai_opt_in))) into f from private.tc_modules m;
  return jsonb_build_object('is_admin',is_admin,'active',coalesce(active,false),'features',coalesce(f,'{}'),
    'profile',case when c.user_id is null then null else to_jsonb(c)-'stripe_subscription_id' end,
    'plan',case when now()<c.trial_ends_at then 'full' when c.status='active' then c.paid_plan else 'full' end,
    'max_trucks',case when c.status='active' and now()>=c.trial_ends_at then p.max_trucks else null end,
    'sms_ready',s.sms_ready,'prices_are_examples',s.prices_are_examples,'payments_enabled',s.payments_enabled);
end;
$$;
-- This helper is intentionally NOT granted to authenticated users: a caller may
-- not request another user's subscription. Public wrappers bind auth.uid().
revoke all on function private.tc_user_access(uuid) from public,anon,authenticated;

create function private.tc_account_active(p_organization_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare owner uuid; enforcement boolean;
begin
  if (select auth.uid()) is null then return false; end if;
  select owner_id into owner from public.organizations where id=p_organization_id and owner_id=(select auth.uid());
  if owner is null then return false; end if;
  select enforce_access into enforcement from private.tc_settings where id=true;
  if not enforcement then return true; end if;
  return coalesce((private.tc_user_access(owner)->>'active')::boolean,false);
end;
$$;
create function private.tc_feature(p_organization_id uuid,p_module text) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.tc_account_active(p_organization_id) then return false; end if;
  if not (select enforce_access from private.tc_settings where id=true) then return true; end if;
  return coalesce((private.tc_user_access((select auth.uid()))->'features'->>p_module)::boolean,false);
end;
$$;
revoke all on function private.tc_is_admin(),private.tc_account_active(uuid),private.tc_feature(uuid,text) from public,anon,authenticated;
grant execute on function private.tc_is_admin(),private.tc_account_active(uuid),private.tc_feature(uuid,text) to authenticated;

create function private.tc_client_active() returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
 if (select auth.uid()) is null then return false;end if;
 if not (select enforce_access from private.tc_settings where id=true) then return true;end if;
 return coalesce((private.tc_user_access((select auth.uid()))->>'active')::boolean,false);
end;
$$;
revoke all on function private.tc_client_active() from public,anon,authenticated;
grant execute on function private.tc_client_active() to authenticated;

-- Account expiry and suspension are checked by the database, not the device clock.
create policy tc_drivers_active on public.drivers as restrictive for all to authenticated
 using((select private.tc_client_active())) with check((select private.tc_client_active()));
create policy tc_trucks_active on public.trucks as restrictive for all to authenticated
 using((select private.tc_client_active())) with check((select private.tc_client_active()));
create policy tc_entries_active on public.finance_entries as restrictive for all to authenticated
 using((select private.tc_client_active())) with check((select private.tc_client_active()));
create policy tc_documents_active on private.company_documents as restrictive for all to authenticated
 using(private.tc_feature(organization_id,'documents') or private.tc_feature(organization_id,'gmail'))
 with check(private.tc_feature(organization_id,'documents'));
create policy tc_invoices_active on private.invoice_documents as restrictive for all to authenticated
 using(private.tc_feature(organization_id,'gmail')) with check(private.tc_feature(organization_id,'gmail'));

create function private.tc_write_gate() returns trigger language plpgsql security invoker set search_path='' as $$
declare org uuid; module text;
begin
  org := case when tg_op='DELETE' then old.organization_id else new.organization_id end;
  if tg_table_name='trucks' then module := 'trucks';
  elsif tg_table_name='drivers' then module := 'drivers';
  elsif tg_op='DELETE' then module := case when old.kind='income' then 'income' else 'expenses' end;
  else module := case when new.kind='income' then 'income' else 'expenses' end;
  end if;
  -- Service operations are authorized by server endpoints before writing.
  if current_user='authenticated' and exists(select 1 from public.organizations where id=org and owner_id=(select auth.uid()))
    and not private.tc_feature(org,module) then
    raise exception 'El módulo no está disponible para esta cuenta' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if; return new;
end;
$$;
revoke all on function private.tc_write_gate() from public,anon,authenticated;
create trigger tc_driver_write before insert or update or delete on public.drivers for each row execute function private.tc_write_gate();
create trigger tc_truck_write before insert or update or delete on public.trucks for each row execute function private.tc_write_gate();
create trigger tc_entry_write before insert or update or delete on public.finance_entries for each row execute function private.tc_write_gate();

create function private.tc_truck_limit() returns trigger language plpgsql security definer set search_path='' as $$
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
revoke all on function private.tc_truck_limit() from public,anon,authenticated;
create trigger tc_truck_quota before insert on public.trucks for each row execute function private.tc_truck_limit();

-- Data from user_metadata supplies contact fields only; it never supplies role,
-- plan entitlement, verification state, trial dates or subscription state.
create function private.tc_provision(p_user_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare u record; r jsonb; s private.tc_settings; v_phone text;
begin
  select * into s from private.tc_settings where id=true;
  select * into u from auth.users where id=p_user_id for update;
  if not found then return; end if;
  if u.email_confirmed_at is not null and lower(u.email)=lower(s.owner_email) then
    insert into private.tc_admins(user_id) values(p_user_id) on conflict do nothing;
    return;
  end if;
  if not s.registration_open or u.email_confirmed_at is null or u.phone_confirmed_at is null then return; end if;
  r := u.raw_user_meta_data->'truckcontrol_registration';
  if r is null or jsonb_typeof(r)<>'object' then return; end if;
  v_phone := '+'||regexp_replace(coalesce(u.phone,''),'[^0-9]','','g');
  if v_phone<>coalesce(r->>'phone','') or v_phone !~ '^\+[1-9][0-9]{7,14}$' then return; end if;
  if char_length(btrim(coalesce(r->>'contact_name',''))) not between 2 and 100
    or char_length(btrim(coalesce(r->>'company_name',''))) not between 2 and 100
    or char_length(btrim(coalesce(r->>'tax_id',''))) not between 3 and 30
    or char_length(btrim(coalesce(r->>'address',''))) not between 5 and 240 then return; end if;
  insert into private.tc_customers(user_id,contact_name,company_name,tax_id,address,email,phone,requested_plan,trial_started_at,trial_ends_at)
    values(p_user_id,btrim(r->>'contact_name'),btrim(r->>'company_name'),btrim(r->>'tax_id'),btrim(r->>'address'),u.email,v_phone,
      case when r->>'requested_plan'='limited' then 'limited' else 'full' end,now(),now()+interval '10 days')
    on conflict(user_id) do nothing;
  if not exists(select 1 from public.organizations where owner_id=p_user_id) then
    insert into public.organizations(owner_id,name) values(p_user_id,btrim(r->>'company_name'));
  end if;
end;
$$;
revoke all on function private.tc_provision(uuid) from public,anon,authenticated;
create function private.tc_verified_user_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform private.tc_provision(new.id);return new;end;
$$;
revoke all on function private.tc_verified_user_trigger() from public,anon,authenticated;
-- Minimal PostgreSQL test fixtures omit Auth columns; production has all of them.
do $$ begin
 if exists(select 1 from information_schema.columns where table_schema='auth' and table_name='users' and column_name='email_confirmed_at') then
  create trigger tc_verified_customer after insert or update of email_confirmed_at,phone_confirmed_at,raw_user_meta_data
    on auth.users for each row execute function private.tc_verified_user_trigger();
 end if;
end $$;

-- The retained project's automatic RLS event trigger is not a client API.
do $$ begin
 if to_regprocedure('public.rls_auto_enable()') is not null then
  revoke all on function public.rls_auto_enable() from public,anon,authenticated;
 end if;
end $$;

create function private.tc_catalog() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('app_name',s.app_name,'trial_days',10,'prices_are_examples',s.prices_are_examples,
  'payments_enabled',s.payments_enabled,'sms_ready',s.sms_ready,'registration_open',s.registration_open,'plans',
  (select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'monthly_cents',p.monthly_cents,'currency',p.currency,
     'max_trucks',p.max_trucks,'modules',p.modules,'revision',p.revision) order by p.monthly_cents)
     from private.tc_plans p where published)) from private.tc_settings s where id=true;
$$;
revoke all on function private.tc_catalog() from public,anon,authenticated;
create function public.tc_public_catalog() returns jsonb language sql stable security invoker set search_path='' as $$ select private.tc_catalog(); $$;
grant execute on function private.tc_catalog() to anon,authenticated;
grant usage on schema private to anon;
revoke all on function public.tc_public_catalog() from public;
grant execute on function public.tc_public_catalog() to anon,authenticated;

create function private.tc_my_access() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if (select auth.uid()) is null then raise exception 'Inicia sesión' using errcode='42501';end if;
 return private.tc_user_access((select auth.uid()));
end;
$$;
create function public.tc_my_access() returns jsonb language sql stable security invoker set search_path='' as $$select private.tc_my_access();$$;
create function private.tc_finish_registration() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if (select auth.uid()) is null then raise exception 'Inicia sesión' using errcode='42501';end if;
 perform private.tc_provision((select auth.uid()));return private.tc_user_access((select auth.uid()));
end;
$$;
create function public.tc_finish_registration() returns jsonb language sql security invoker set search_path='' as $$select private.tc_finish_registration();$$;
create function private.tc_set_ai_opt_in(p_enabled boolean) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if (select auth.uid()) is null then raise exception 'Inicia sesión' using errcode='42501';end if;
 update private.tc_customers set ai_opt_in=p_enabled,updated_at=now() where user_id=(select auth.uid());
 return private.tc_user_access((select auth.uid()));
end;
$$;
create function public.tc_set_ai_opt_in(p_enabled boolean) returns jsonb language sql security invoker set search_path='' as $$select private.tc_set_ai_opt_in(p_enabled);$$;
revoke all on function private.tc_my_access(),private.tc_finish_registration(),private.tc_set_ai_opt_in(boolean),
 public.tc_my_access(),public.tc_finish_registration(),public.tc_set_ai_opt_in(boolean) from public,anon,authenticated;
grant execute on function private.tc_my_access(),private.tc_finish_registration(),private.tc_set_ai_opt_in(boolean),
 public.tc_my_access(),public.tc_finish_registration(),public.tc_set_ai_opt_in(boolean) to authenticated;

create function private.tc_validate_module_map(p_map jsonb) returns boolean
language sql stable security invoker set search_path='' as $$
 select jsonb_typeof(p_map)='object' and not exists(select 1 from jsonb_each(p_map) e
   where not exists(select 1 from private.tc_modules m where m.id=e.key) or jsonb_typeof(e.value)<>'boolean');
$$;
revoke all on function private.tc_validate_module_map(jsonb) from public,anon,authenticated;

create function private.tc_admin_control(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := (select auth.uid()); target uuid; result jsonb; old_record jsonb; updated_record jsonb;
  plan private.tc_plans; request private.tc_payment_requests; receipt text; until_date timestamptz;
begin
 if actor is null or not exists(select 1 from private.tc_admins where user_id=actor) then
  raise exception 'Solo la cuenta administradora puede realizar esta operación' using errcode='42501';end if;
 if p_action='snapshot' then
  return jsonb_build_object('settings',(select to_jsonb(s)-'owner_email' from private.tc_settings s where id=true),
   'plans',(select coalesce(jsonb_agg(to_jsonb(p) order by monthly_cents),'[]') from private.tc_plans p),
   'modules',(select coalesce(jsonb_agg(to_jsonb(m) order by id),'[]') from private.tc_modules m),
   'customers',(select coalesce(jsonb_agg(to_jsonb(c)-'stripe_subscription_id' order by created_at desc),'[]') from private.tc_customers c),
   'pending_registrations',(select coalesce(jsonb_agg(p),'[]') from (select u.id,u.email,
      u.email_confirmed_at is not null as email_confirmed,u.phone_confirmed_at is not null as phone_confirmed,
      u.raw_user_meta_data->'truckcontrol_registration'->>'company_name' as company_name
      from auth.users u where not exists(select 1 from private.tc_customers c where c.user_id=u.id)
      and not exists(select 1 from private.tc_admins a where a.user_id=u.id)
      and u.raw_user_meta_data ? 'truckcontrol_registration' limit 500)p),
   'payment_requests',(select coalesce(jsonb_agg(to_jsonb(r) order by created_at desc),'[]') from private.tc_payment_requests r),
   'audit',(select coalesce(jsonb_agg(a),'[]') from (select * from private.tc_admin_audit order by created_at desc limit 100)a));
 elsif p_action='module' then
  update private.tc_modules set enabled=(p_data->>'enabled')::boolean where id=p_data->>'id' returning to_jsonb(private.tc_modules.*) into updated_record;
  if not found then raise exception 'Módulo no válido';end if;
 elsif p_action='customer' then
  target := (p_data->>'user_id')::uuid;
  select to_jsonb(c) into old_record from private.tc_customers c where user_id=target for update;
  if not found then raise exception 'Cliente no disponible';end if;
  if p_data ? 'module_overrides' and not private.tc_validate_module_map(p_data->'module_overrides') then raise exception 'Módulos no válidos';end if;
  update private.tc_customers set ai_allowed=case when p_data ? 'ai_allowed' then (p_data->>'ai_allowed')::boolean else ai_allowed end,
   status=case when p_data->>'suspended'='true' then 'suspended' when p_data->>'suspended'='false'
     then case when paid_until>now() then 'active' else 'trial' end else status end,
   module_overrides=case when p_data ? 'module_overrides' then p_data->'module_overrides' else module_overrides end,updated_at=now()
   where user_id=target returning to_jsonb(private.tc_customers.*)-'stripe_subscription_id' into updated_record;
 elsif p_action='plan' then
  if not private.tc_validate_module_map(p_data->'modules') then raise exception 'Módulos no válidos';end if;
  update private.tc_plans set name=p_data->>'name',monthly_cents=(p_data->>'monthly_cents')::integer,
   max_trucks=(p_data->>'max_trucks')::integer,modules=p_data->'modules',published=(p_data->>'published')::boolean,
   revision=revision+1,updated_at=now() where id=p_data->>'id' returning to_jsonb(private.tc_plans.*) into updated_record;
  if not found then raise exception 'Plan no válido';end if;
 elsif p_action='settings' then
  if p_data->>'payments_enabled'='true' and coalesce((p_data->>'prices_are_examples')::boolean,
    (select prices_are_examples from private.tc_settings where id=true)) then raise exception 'Confirma los precios antes de habilitar cobros';end if;
  update private.tc_settings set
   prices_are_examples=coalesce((p_data->>'prices_are_examples')::boolean,prices_are_examples),
   payments_enabled=coalesce((p_data->>'payments_enabled')::boolean,payments_enabled),
   registration_open=coalesce((p_data->>'registration_open')::boolean,registration_open),updated_at=now()
   where id=true returning to_jsonb(private.tc_settings.*)-'owner_email' into updated_record;
  if (updated_record->>'prices_are_examples')::boolean and (updated_record->>'payments_enabled')::boolean then
   raise exception 'Los precios de ejemplo no pueden generar cobros';end if;
 elsif p_action='manual_payment' then
  if (select prices_are_examples from private.tc_settings where id=true) then raise exception 'Los precios son de ejemplo; no se puede registrar un cobro real';end if;
  select * into request from private.tc_payment_requests where id=(p_data->>'request_id')::uuid for update;
  if not found then raise exception 'Solicitud no disponible';end if;
  if request.status='paid' then return jsonb_build_object('id',request.id,'already_paid',true);end if;
  receipt := btrim(coalesce(p_data->>'receipt',''));
  if char_length(receipt) not between 3 and 160 then raise exception 'Añade la referencia del pago confirmado';end if;
  select * into plan from private.tc_plans where id=request.plan_id;
  select greatest(coalesce(paid_until,now()),now(),trial_ends_at)+interval '1 month' into until_date from private.tc_customers where user_id=request.user_id for update;
  update private.tc_customers set paid_plan=request.plan_id,paid_until=until_date,
   status=case when status='suspended' then 'suspended' else 'active' end,updated_at=now() where user_id=request.user_id;
  update private.tc_payment_requests set status='paid' where id=request.id returning to_jsonb(private.tc_payment_requests.*) into updated_record;
  updated_record := updated_record||jsonb_build_object('receipt',receipt,'access_until',until_date);
 else raise exception 'Operación no disponible';end if;
 insert into private.tc_admin_audit(actor_id,action,target_id,details) values(actor,p_action,coalesce(target::text,p_data->>'id',p_data->>'request_id'),
  jsonb_build_object('before',old_record-'stripe_subscription_id','after',updated_record));
 return coalesce(updated_record,'{}');
end;
$$;
create function public.tc_admin_control(p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select private.tc_admin_control(p_action,p_data);$$;
revoke all on function private.tc_admin_control(text,jsonb),public.tc_admin_control(text,jsonb) from public,anon,authenticated;
grant execute on function private.tc_admin_control(text,jsonb),public.tc_admin_control(text,jsonb) to authenticated;

create function private.tc_request_plan(p_plan_id text) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid := (select auth.uid()); p private.tc_plans; request_id uuid;
begin
 if actor is null or not exists(select 1 from private.tc_customers where user_id=actor) then
  raise exception 'Completa la verificación de tu cuenta' using errcode='42501';end if;
 perform 1 from private.tc_customers where user_id=actor for update;
 update private.tc_payment_requests set status='cancelled' where user_id=actor and status in ('requested','checkout') and created_at<now()-interval '1 day';
 select * into p from private.tc_plans where id=p_plan_id and published;
 if not found then raise exception 'Plan no disponible';end if;
 select id into request_id from private.tc_payment_requests where user_id=actor and plan_id=p_plan_id
   and plan_revision=p.revision and status in ('requested','checkout') order by created_at desc limit 1;
 if request_id is null then
  insert into private.tc_payment_requests(user_id,plan_id,quoted_cents,plan_revision) values(actor,p.id,p.monthly_cents,p.revision) returning id into request_id;
 end if;
 update private.tc_customers set requested_plan=p_plan_id,updated_at=now() where user_id=actor;
 return request_id;
end;
$$;
create function public.tc_request_plan(p_plan_id text) returns uuid language sql security invoker set search_path='' as $$select private.tc_request_plan(p_plan_id);$$;
revoke all on function private.tc_request_plan(text),public.tc_request_plan(text) from public,anon,authenticated;
grant execute on function private.tc_request_plan(text),public.tc_request_plan(text) to authenticated;

-- Server-only entrypoint for Gmail and optional payment provider; never exposed
-- to an anonymous/authenticated caller. It does not create a paid subscription
-- from a client redirect or from user-editable metadata.
create function public.tc_platform_server(p_action text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c private.tc_customers; r private.tc_payment_requests; settings private.tc_settings; account uuid; ending timestamptz;
begin
 account := nullif(p_data->>'user_id','')::uuid;
 if p_action='user_access' then
  if not exists(select 1 from public.organizations where id=(p_data->>'organization_id')::uuid and owner_id=account) then return null;end if;
  return private.tc_user_access(account);
 elsif p_action='checkout_order' then
  select * into settings from private.tc_settings where id=true;
  if not settings.payments_enabled or settings.prices_are_examples then raise exception 'Cobros desactivados';end if;
  select * into r from private.tc_payment_requests where id=(p_data->>'request_id')::uuid and user_id=account;
  if not found or r.status not in ('requested','checkout') or r.created_at<now()-interval '1 day'
    or not exists(select 1 from private.tc_plans where id=r.plan_id and revision=r.plan_revision and published) then raise exception 'Solicitud no disponible; vuelve a elegir el plan';end if;
  if exists(select 1 from private.tc_customers where user_id=account and paid_until>now()+interval '20 days') then raise exception 'Tu periodo de acceso ya está pagado';end if;
  return to_jsonb(r);
 elsif p_action='checkout_saved' then
  update private.tc_payment_requests set status='checkout',checkout_id=p_data->>'checkout_id'
   where id=(p_data->>'request_id')::uuid and user_id=account and status='requested';return '{}'::jsonb;
 elsif p_action='payment_event' then
  if exists(select 1 from private.tc_payment_events where event_id=p_data->>'event_id') then return jsonb_build_object('duplicate',true);end if;
  insert into private.tc_payment_events(event_id,event_type) values(p_data->>'event_id',p_data->>'event_type') on conflict do nothing;
  if not found then return jsonb_build_object('duplicate',true);end if;
  select * into r from private.tc_payment_requests where id=(p_data->>'request_id')::uuid for update;
  if not found or r.user_id<>account or r.quoted_cents<>(p_data->>'amount_cents')::integer or lower(r.currency)<>lower(p_data->>'currency') then
   raise exception 'El pago no corresponde al pedido';end if;
  select * into c from private.tc_customers where user_id=account for update;
  ending := coalesce((p_data->>'period_end')::timestamptz,greatest(coalesce(c.paid_until,now()),now(),c.trial_ends_at)+interval '1 month');
  if ending<=now() or ending>now()+interval '2 months' then raise exception 'Periodo de pago no válido';end if;
  update private.tc_payment_requests set status='paid' where id=r.id;
  update private.tc_customers set paid_plan=r.plan_id,paid_until=greatest(coalesce(paid_until,ending),ending),
   stripe_subscription_id=p_data->>'subscription_id',status=case when status='suspended' then 'suspended' else 'active' end,
   updated_at=now() where user_id=account;
  return jsonb_build_object('applied',true);
 else raise exception 'Operación no válida';end if;
end;
$$;
revoke all on function public.tc_platform_server(text,jsonb) from public,anon,authenticated;
do $$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  grant usage on schema private to service_role;
  grant select,insert,update,delete on private.tc_settings,private.tc_modules,private.tc_plans,private.tc_admins,private.tc_customers,
   private.tc_admin_audit,private.tc_payment_requests,private.tc_payment_events to service_role;
  grant execute on function private.tc_user_access(uuid),public.tc_platform_server(text,jsonb) to service_role;
 end if;
 if to_regclass('storage.objects') is not null then
  execute $policy$create policy tc_documents_subscription_read on storage.objects as restrictive for select to authenticated
   using(bucket_id<>'truckcontrol-documents' or case when split_part(name,'/',1) ~ '^[0-9a-f-]{36}$'
    then private.tc_feature(split_part(name,'/',1)::uuid,'documents') or private.tc_feature(split_part(name,'/',1)::uuid,'gmail') else false end)$policy$;
  execute $policy$create policy tc_documents_subscription_upload on storage.objects as restrictive for insert to authenticated
   with check(bucket_id<>'truckcontrol-documents' or case when split_part(name,'/',1) ~ '^[0-9a-f-]{36}$'
    then private.tc_feature(split_part(name,'/',1)::uuid,'documents') else false end)$policy$;
 end if;
end $$;
