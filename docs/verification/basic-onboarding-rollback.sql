-- Only truckcontrol-ai. Native Auth confirmation and immutable legal-receipt fixtures.
-- No email/provider API, real session, password or customer data. Everything rolls back.
begin;
do $$ begin
 if exists(select 1 from auth.users where id in('bd100000-0000-4000-8000-000000000001','bd100000-0000-4000-8000-000000000002','bd100000-0000-4000-8000-000000000003')) then
  raise exception 'Fixture collision: preserve existing work';end if;
 if not (select registration_open and enforce_access and not payments_enabled and not sms_ready from private.tc_settings where id) then
  raise exception 'Unexpected live settings';end if;
end $$;
insert into auth.users(id,email,raw_user_meta_data) values
 ('bd100000-0000-4000-8000-000000000001','basic-a@truckcontrol-test.invalid','{"truckcontrol_registration":{"contact_name":"Persona ficticia A","company_name":"Basico ficticio A","tax_id":"DEMO-BASIC-A","address":"Direccion ficticia 1","phone":"+12025550071","requested_plan":"full","trial_plan_id":"full","trial_days":9999},"is_admin":true,"paid_plan":"full"}'),
 ('bd100000-0000-4000-8000-000000000002','basic-b@truckcontrol-test.invalid','{"truckcontrol_registration":{"contact_name":"Persona ficticia B","company_name":"Basico ficticio B","tax_id":"DEMO-BASIC-B","address":"Direccion ficticia 2","phone":"+12025550072","requested_plan":"full"}}');
set local role authenticated;
select set_config('request.jwt.claim.sub','bd100000-0000-4000-8000-000000000001',true);
do $$ declare a jsonb;begin
 a:=public.tc_finish_registration();
 if (a->>'active')::boolean then raise exception 'Unverified signup activated';end if;
end $$;
reset role;
-- Trusted server receipt fixtures, not editable metadata; no old consent is rewritten.
insert into private.tc_auth_legal_consents(user_id,legal_version,source) values
 ('bd100000-0000-4000-8000-000000000001','2026-11-02','authenticated_profile'),
 ('bd100000-0000-4000-8000-000000000002','2026-11-02','authenticated_profile');
do $$ begin
 if exists(select 1 from private.tc_customers where user_id in('bd100000-0000-4000-8000-000000000001','bd100000-0000-4000-8000-000000000002')) then
  raise exception 'Receipt bypassed native email confirmation';end if;
end $$;
update auth.users set email_confirmed_at=now() where id in('bd100000-0000-4000-8000-000000000001','bd100000-0000-4000-8000-000000000002');
update private.tc_customers set ai_allowed=true,ai_opt_in=true where user_id='bd100000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ declare a jsonb;o uuid;foreign_org uuid;denied boolean:=false;begin
 a:=public.tc_finish_registration();
 if not (a->>'active')::boolean or a->>'plan'<>'limited' or (a->>'is_admin')::boolean then raise exception 'Basic activation failed';end if;
 if a->'profile'->>'trial_plan_id'<>'limited' or (a->'profile'->>'trial_ends_at')::timestamptz-(a->'profile'->>'trial_started_at')::timestamptz<>interval '10 days' then
  raise exception 'Trial policy mismatch';end if;
 select id into o from public.organizations where owner_id='bd100000-0000-4000-8000-000000000001';
 a:=public.tc_organization_access(o);
 if a->>'plan'<>'limited' or (a->>'max_trucks')::integer<>50 or (a->'features'->>'invoice_ai')::boolean or (a->'features'->>'document_ai')::boolean then
  raise exception 'Full entitlement granted to Basic';end if;
 begin update private.tc_customers set trial_plan_id='full' where user_id='bd100000-0000-4000-8000-000000000001';
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Client modified trial plan';end if;
 perform public.tc_request_plan('full');
 if public.tc_my_access()->>'plan'<>'limited' then raise exception 'Request activated Full';end if;
 insert into public.trucks(organization_id,plate,brand,model,year,inspection_due_on)
 select o,'BASIC-'||lpad(n::text,3,'0'),'Demo','Ficticio',2026,current_date+365 from generate_series(1,50)n;
 denied:=false;
 begin insert into public.trucks(organization_id,plate,brand,model,year,inspection_due_on) values(o,'BASIC-051','Demo','Ficticio',2026,current_date+365);
 exception when others then
  if sqlerrm not like '%límite de camiones%' then raise;end if;denied:=true;end;
 if not denied then raise exception 'Basic truck quota bypass';end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','bd100000-0000-4000-8000-000000000002',true);
do $$ declare foreign_org uuid;a jsonb;begin
 if exists(select 1 from public.trucks where plate like 'BASIC-%') then raise exception 'Foreign truck data leaked';end if;
 select id into foreign_org from public.organizations where owner_id='bd100000-0000-4000-8000-000000000001';
 if foreign_org is not null then raise exception 'Foreign company leaked';end if;
 a:=public.tc_my_access();if a->>'plan'<>'limited' then raise exception 'Second tenant wrong plan';end if;
end $$;
reset role;
rollback;
select 'basic_onboarding_passed_and_rolled_back' verification,
 (select count(*) from auth.users where id in('bd100000-0000-4000-8000-000000000001','bd100000-0000-4000-8000-000000000002','bd100000-0000-4000-8000-000000000003')) fixture_users_remaining,
 (select count(*) from public.trucks where plate like 'BASIC-%' and brand='Demo' and model='Ficticio') fixture_trucks_remaining,
 (select registration_open and enforce_access and not payments_enabled and not sms_ready from private.tc_settings where id) safeguards_preserved;
