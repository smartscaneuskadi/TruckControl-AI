-- Only truckcontrol-ai. Native Auth confirmation and immutable legal-receipt fixtures.
-- No email/provider API, real session, password or customer data. Everything rolls back.
begin;
do $$ begin
 if exists(select 1 from auth.users where id in('d4100000-0000-4000-8000-000000000001','d4100000-0000-4000-8000-000000000002','d4100000-0000-4000-8000-000000000003')) then
  raise exception 'Fixture collision: preserve existing work';end if;
 if not (select registration_open and enforce_access and not payments_enabled and not sms_ready from private.tc_settings where id) then
  raise exception 'Unexpected live settings';end if;
end $$;
insert into auth.users(id,email,raw_user_meta_data) values
 ('d4100000-0000-4000-8000-000000000001','gmail-origin-a@truckcontrol-test.invalid','{"truckcontrol_registration":{"contact_name":"Persona ficticia A","company_name":"Basico ficticio A","tax_id":"DEMO-BASIC-A","address":"Direccion ficticia 1","phone":"+12025550071","requested_plan":"full","trial_plan_id":"full","trial_days":9999},"is_admin":true,"paid_plan":"full"}'),
 ('d4100000-0000-4000-8000-000000000002','gmail-origin-b@truckcontrol-test.invalid','{"truckcontrol_registration":{"contact_name":"Persona ficticia B","company_name":"Basico ficticio B","tax_id":"DEMO-BASIC-B","address":"Direccion ficticia 2","phone":"+12025550072","requested_plan":"full"}}');
set local role authenticated;
select set_config('request.jwt.claim.sub','d4100000-0000-4000-8000-000000000001',true);
do $$ declare a jsonb;begin
 a:=public.tc_finish_registration();
 if (a->>'active')::boolean then raise exception 'Unverified signup activated';end if;
end $$;
reset role;
-- Trusted server receipt fixtures, not editable metadata; no old consent is rewritten.
insert into private.tc_auth_legal_consents(user_id,legal_version,source) values
 ('d4100000-0000-4000-8000-000000000001','2026-11-02','authenticated_profile'),
 ('d4100000-0000-4000-8000-000000000002','2026-11-02','authenticated_profile');
do $$ begin
 if exists(select 1 from private.tc_customers where user_id in('d4100000-0000-4000-8000-000000000001','d4100000-0000-4000-8000-000000000002')) then
  raise exception 'Receipt bypassed native email confirmation';end if;
end $$;
update auth.users set email_confirmed_at=now() where id in('d4100000-0000-4000-8000-000000000001','d4100000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub','d4100000-0000-4000-8000-000000000001',true);
select (public.tc_finish_registration()->>'active')::boolean as fixture_a_activated;
select set_config('request.jwt.claim.sub','d4100000-0000-4000-8000-000000000002',true);
select (public.tc_finish_registration()->>'active')::boolean as fixture_b_activated;
reset role;
-- Documentary fixtures only; no production customer or module is changed.
update private.tc_customers set module_overrides='{"gmail":true}' where user_id in ('d4100000-0000-4000-8000-000000000001','d4100000-0000-4000-8000-000000000002');
select set_config('truckcontrol_test.org_a',(select id::text from public.organizations where owner_id='d4100000-0000-4000-8000-000000000001'),true);
select set_config('request.jwt.claim.sub','d4100000-0000-4000-8000-000000000001',true);
set local role service_role;
do $$ declare o uuid:=current_setting('truckcontrol_test.org_a')::uuid;u uuid:='d4100000-0000-4000-8000-000000000001';origin text;v jsonb;i integer:=0;h text;denied boolean:=false;begin
 foreach origin in array array['https://truckcontrolai.com','https://www.truckcontrolai.com','https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site','https://truckcontrol-ai-candidata.earlymug513.chatgpt.site'] loop
  i:=i+1;h:=lpad(to_hex(i),64,'0');
  perform public.gmail_server('state_create',jsonb_build_object('organization_id',o,'user_id',u,'state_hash',h,'return_origin',origin));
  v:=public.gmail_server('state_consume',jsonb_build_object('state_hash',h));
  if v->>'return_origin' is distinct from origin or v->>'organization_id' is distinct from o::text or v->>'user_id' is distinct from u::text then raise exception 'Native OAuth origin/binding failed';end if;
  if public.gmail_server('state_consume',jsonb_build_object('state_hash',h)) is not null then raise exception 'State replay accepted';end if;
 end loop;
 begin perform public.gmail_server('state_create',jsonb_build_object('organization_id',o,'user_id',u,'state_hash',repeat('f',64),'return_origin','https://evil.invalid'));exception when check_violation then denied:=true;end;
 if not denied then raise exception 'Foreign callback origin accepted';end if;
 denied:=false;
 begin perform public.gmail_server('state_create',jsonb_build_object('organization_id',o,'user_id','d4100000-0000-4000-8000-000000000002','state_hash',repeat('e',64),'return_origin','https://truckcontrolai.com'));exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Foreign company manager accepted';end if;
end $$;
reset role;
set local role authenticated;
do $$ declare denied boolean:=false;begin
 begin perform public.gmail_server('state_create','{}');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Client accessed server OAuth state';end if;
end $$;
reset role;
rollback;
select 'gmail_origin_rollback' as test,
 not exists(select 1 from auth.users where id in('d4100000-0000-4000-8000-000000000001','d4100000-0000-4000-8000-000000000002')) as fixture_users_absent,
 not exists(select 1 from private.gmail_oauth_states where user_id in('d4100000-0000-4000-8000-000000000001','d4100000-0000-4000-8000-000000000002')) as fixture_states_absent;
