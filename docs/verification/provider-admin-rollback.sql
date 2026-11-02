-- TruckControl only. Synthetic users and Vault writes are rolled back together.
-- No Google/OAuth/provider requests, real sessions, or customer data are used.
begin;
do $$ begin
 if exists(select 1 from auth.users where id in ('fc100000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000002')) then
  raise exception 'Fixture collision: preserve existing work';end if;
 if exists(select 1 from private.gmail_connections) or exists(select 1 from private.gmail_oauth_states where expires_at>now())
  or exists(select 1 from private.gmail_oauth_pending where expires_at>now()) then
  raise exception 'Live Google authorization exists: skip credential test';end if;
end $$;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('fc100000-0000-4000-8000-000000000001','provider-admin@truckcontrol-test.invalid',now(),'{}'),
 ('fc100000-0000-4000-8000-000000000002','provider-customer@truckcontrol-test.invalid',now(),'{}');
insert into private.tc_admins(user_id) values('fc100000-0000-4000-8000-000000000001');
set local role anon;
do $$ declare denied boolean:=false;begin
 begin perform public.tc_provider_control('status');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous provider access accepted';end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','fc100000-0000-4000-8000-000000000002',true);
do $$ declare denied boolean:=false;begin
 begin perform public.tc_provider_control('status');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Customer provider access accepted';end if;
end $$;
select set_config('request.jwt.claim.sub','fc100000-0000-4000-8000-000000000001',true);
do $$ declare s jsonb;denied boolean:=false;begin
 s:=public.tc_provider_control('status');
 if (s->'google'->>'configured')::boolean then raise exception 'A valid configuration exists: preserve it';end if;
 if s::text like '%GOCSPX-%' then raise exception 'Unexpected credential disclosure';end if;
 begin perform public.tc_provider_control('set_google','{"client_id":"468881730124-synthetic.apps.googleusercontent.com","client_secret":"GOCSPX-******"}');
 exception when check_violation then denied:=true;end;
 if not denied then raise exception 'Masked secret accepted';end if;
 s:=public.tc_provider_control('set_google','{"client_id":"468881730124-synthetic.apps.googleusercontent.com","client_secret":"GOCSPX-synthetic-provider-test-000000"}');
 if not (s->'google'->>'configured')::boolean or s::text like '%GOCSPX-%' then raise exception 'Write-only contract failed';end if;
 denied:=false;
 begin perform public.tc_provider_control('set_google','{"client_id":"468881730124-synthetic.apps.googleusercontent.com","client_secret":"GOCSPX-synthetic-provider-test-111111"}');
 exception when check_violation then denied:=true;end;
 if not denied then raise exception 'Replacement accepted without confirmation';end if;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from private.tc_admin_audit where actor_id='fc100000-0000-4000-8000-000000000001'
  and action='provider_google_set' and details='{"credential_values_included":false,"previous_configuration_preserved":true}'::jsonb) then
  raise exception 'Metadata-only audit missing';end if;
 if exists(select 1 from private.tc_admin_audit where actor_id='fc100000-0000-4000-8000-000000000001' and details::text like '%GOCSPX-%') then
  raise exception 'Credential in audit';end if;
end $$;
update auth.users set email_confirmed_at=null where id='fc100000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ declare denied boolean:=false;begin
 begin perform public.tc_provider_control('status');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Unverified global admin accepted';end if;
end $$;
reset role;
rollback;
select 'provider_admin_passed_and_rolled_back' as verification,
 (select count(*) from auth.users where id in ('fc100000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000002')) fixture_users_remaining,
 (select count(*) from private.tc_admin_audit where actor_id='fc100000-0000-4000-8000-000000000001') fixture_audit_remaining,
 (select count(*) from vault.secrets where name like 'truckcontrol_google_client%previous_%'
  and created_at>=now()-interval '1 minute') recent_archives_remaining,
 (select registration_open and enforce_access and not payments_enabled and not sms_ready from private.tc_settings where id) launch_safeguards_preserved;
