-- Dedicated TruckControl project only. Synthetic data is rolled back.
-- No DDL, secret generation, Auth API, provider request, email or charge.
-- Access enforcement, RLS, registration, billing and modules stay unchanged.
begin;
do $$ begin
  if not (select enforce_access from private.tc_settings where id=true)
    or (select registration_open or payments_enabled from private.tc_settings where id=true)
    then raise exception 'Unexpected access or commercial settings';end if;
  if exists(select 1 from auth.users where id in (
    'f1000000-0000-4000-8000-000000000201','f1000000-0000-4000-8000-000000000202'))
    then raise exception 'Synthetic IDs already exist; do not overwrite';end if;
end $$;

insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at,raw_user_meta_data) values
 ('f1000000-0000-4000-8000-000000000201','owner-a@truckcontrol-test.invalid',now(),'12025550121',now(),'{}'),
 ('f1000000-0000-4000-8000-000000000202','owner-b@truckcontrol-test.invalid',now(),'12025550122',now(),'{}');
insert into private.tc_customers(user_id,contact_name,company_name,tax_id,address,email,phone) values
 ('f1000000-0000-4000-8000-000000000201','Persona ficticia A','Empresa ficticia A','TEST-A','Dirección ficticia A','owner-a@truckcontrol-test.invalid','+12025550121'),
 ('f1000000-0000-4000-8000-000000000202','Persona ficticia B','Empresa ficticia B','TEST-B','Dirección ficticia B','owner-b@truckcontrol-test.invalid','+12025550122');
insert into public.organizations(id,owner_id,name) values
 ('f2000000-0000-4000-8000-000000000201','f1000000-0000-4000-8000-000000000201','Empresa ficticia A'),
 ('f2000000-0000-4000-8000-000000000202','f1000000-0000-4000-8000-000000000202','Empresa ficticia B');

set local role anon;
do $$ declare denied boolean:=false;begin
  begin perform public.gmail_runtime_config();
  exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'Anonymous caller reached provider configuration';end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000201',true);
do $$ declare denied boolean:=false;begin
  begin perform public.gmail_runtime_config();
  exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'App user reached provider configuration';end if;
  denied:=false;
  begin perform public.gmail_server('state_create',jsonb_build_object(
    'organization_id','f2000000-0000-4000-8000-000000000201',
    'user_id','f1000000-0000-4000-8000-000000000201','state_hash',repeat('a',64)));
  exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'App user reached server-only state operation';end if;
end $$;
reset role;

set local role service_role;
do $$
declare owner_a uuid:='f1000000-0000-4000-8000-000000000201';
 owner_b uuid:='f1000000-0000-4000-8000-000000000202';
 org_a uuid:='f2000000-0000-4000-8000-000000000201';
 result jsonb;denied boolean:=false;
begin
  perform public.gmail_server('state_create',jsonb_build_object(
    'organization_id',org_a,'user_id',owner_a,'state_hash',repeat('a',64),
    'return_origin','https://www.truckcontrolai.com'));
  result:=public.gmail_server('state_consume',jsonb_build_object('state_hash',repeat('a',64)));
  if result->>'return_origin'<>'https://www.truckcontrolai.com'
    or result->>'organization_id'<>org_a::text or result->>'user_id'<>owner_a::text
    then raise exception 'State lost its trusted origin or tenant/user binding';end if;
  if public.gmail_server('state_consume',jsonb_build_object('state_hash',repeat('a',64))) is not null
    then raise exception 'State replay accepted';end if;
  begin
    perform public.gmail_server('state_create',jsonb_build_object(
      'organization_id',org_a,'user_id',owner_b,'state_hash',repeat('b',64)));
  exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'Foreign-company owner created state';end if;
  denied:=false;
  begin
    perform public.gmail_server('state_create',jsonb_build_object(
      'organization_id',org_a,'user_id',owner_a,'state_hash',repeat('c',64),
      'return_origin','https://evil.example'));
  exception when check_violation then denied:=true;end;
  if not denied then raise exception 'Foreign return origin accepted';end if;
end $$;
reset role;

insert into private.tc_memberships(organization_id,user_id,role,status,invited_by) values
 ('f2000000-0000-4000-8000-000000000201','f1000000-0000-4000-8000-000000000202','viewer','active','f1000000-0000-4000-8000-000000000201');
set local role service_role;
do $$ declare denied boolean:=false;begin
  begin
    perform public.gmail_server('state_create',jsonb_build_object(
      'organization_id','f2000000-0000-4000-8000-000000000201',
      'user_id','f1000000-0000-4000-8000-000000000202','state_hash',repeat('d',64)));
  exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'Viewer created administrator state';end if;
  perform public.gmail_server('state_create',jsonb_build_object(
    'organization_id','f2000000-0000-4000-8000-000000000201',
    'user_id','f1000000-0000-4000-8000-000000000201','state_hash',repeat('e',64)));
end $$;
reset role;
update private.tc_customers set status='suspended'
 where user_id='f1000000-0000-4000-8000-000000000201';
set local role service_role;
do $$ begin
  if public.gmail_server('state_consume',jsonb_build_object('state_hash',repeat('e',64))) is not null
    then raise exception 'Administrative suspension did not invalidate state';end if;
end $$;
reset role;
rollback;

select 'gmail_onboarding_passed_and_rolled_back' as verification,
 (select count(*) from auth.users where id in ('f1000000-0000-4000-8000-000000000201','f1000000-0000-4000-8000-000000000202')) as synthetic_users_remaining,
 (select count(*) from public.organizations where id in ('f2000000-0000-4000-8000-000000000201','f2000000-0000-4000-8000-000000000202')) as synthetic_companies_remaining,
 (select enforce_access from private.tc_settings where id=true) as enforce_access,
 (select registration_open from private.tc_settings where id=true) as registration_open,
 (select payments_enabled from private.tc_settings where id=true) as payments_enabled;
