-- TruckControl only. Exercise deployed RPC permissions with all existing
-- controls intact. No provider request, credential output or account creation.
-- Historical pre-approval check. AI now has an approved 10 USD/month budget;
-- do not disable an authorized service merely to replay this closed-state test.
begin;
do $$ begin
 if not (select enforce_access from private.tc_settings where id=true)
  or (select registration_open or payments_enabled from private.tc_settings where id=true)
  or (select ai_enabled or ai_monthly_budget_cents<>0 or receiving_enabled from private.tc_provider_settings where id=true) then
  raise exception 'Expected protected, closed acceptance configuration';end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='private' and c.relname in ('tc_provider_settings','tc_ai_monthly_budget','tc_ai_calls') and not c.relrowsecurity) then
  raise exception 'Missing provider RLS';end if;
 if has_table_privilege('service_role','private.tc_provider_settings','UPDATE') then
  raise exception 'Runtime may change provider policy';end if;
end $$;
set local role anon;
do $$ declare statement text;denied boolean;begin
 foreach statement in array array[
  'select public.company_provider_runtime_config(''ai'')',
  'select public.company_ai_budget_server(''reserve'',''{}''::jsonb)',
  'select public.company_invoice_ai_apply(''{}''::jsonb)',
  'select * from private.tc_provider_settings',
  'select * from private.tc_ai_monthly_budget',
  'select * from private.tc_ai_calls'] loop
  denied:=false;
  begin execute statement;exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'Anonymous provider access was allowed';end if;
 end loop;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000401',true);
do $$ declare statement text;denied boolean;begin
 foreach statement in array array[
  'select public.company_provider_runtime_config(''ai'')',
  'select public.company_ai_budget_server(''reserve'',''{}''::jsonb)',
  'select public.company_invoice_ai_apply(''{}''::jsonb)',
  'select * from private.tc_provider_settings',
  'select * from private.tc_ai_monthly_budget',
  'select * from private.tc_ai_calls'] loop
  denied:=false;
  begin execute statement;exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'Authenticated provider access was allowed';end if;
 end loop;
end $$;
reset role;
set local role service_role;
do $$ declare denied boolean:=false;begin
 if public.company_ai_budget_server('reserve',jsonb_build_object(
  'organization_id','f2000000-0000-4000-8000-000000000401',
  'user_id','f1000000-0000-4000-8000-000000000401',
  'kind','document','model','gpt-6-luna')) is not null then
  raise exception 'Disabled AI accepted a reservation';end if;
 begin perform public.company_mail_server('delivery_check',jsonb_build_object(
  'recipient',repeat('a',43)||'@unissued.invalid'));
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Unissued receiver address accepted';end if;
end $$;
reset role;
rollback;
select 'ai_provider_disabled_permissions_passed_and_rolled_back' as verification,
 (select count(*) from auth.users) as auth_users,
 (select count(*) from public.organizations) as organizations,
 (select count(*) from private.tc_ai_calls) as ai_calls,
 (select coalesce(sum(reserved_micro_usd),0) from private.tc_ai_monthly_budget) as reserved_micro_usd,
 (select enforce_access from private.tc_settings where id=true) as enforce_access,
 (select registration_open from private.tc_settings where id=true) as registration_open,
 (select payments_enabled from private.tc_settings where id=true) as payments_enabled,
 (select ai_enabled from private.tc_provider_settings where id=true) as ai_enabled,
 (select ai_monthly_budget_cents from private.tc_provider_settings where id=true) as ai_monthly_budget_cents,
 (select receiving_enabled from private.tc_provider_settings where id=true) as receiving_enabled,
 (select updated_at from vault.secrets where name='truckcontrol_gmail_token_encryption_key') as gmail_aes_updated_at;
