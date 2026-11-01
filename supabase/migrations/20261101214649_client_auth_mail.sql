-- Custom delivery of native Auth links. Does not open signup, payments or confirm users.
create table private.tc_auth_mail_settings(
 id boolean primary key default true check(id),
 enabled boolean not null default false,
 legal_ready boolean not null default false,
 legal_version text not null default '2026-11-01',
 acceptance_enabled boolean not null default false,
 daily_limit integer not null default 40 check(daily_limit between 1 and 80),
 monthly_limit integer not null default 1000 check(monthly_limit between 1 and 2000)
);
insert into private.tc_auth_mail_settings(id) values(true);
create table private.tc_auth_mail_attempts(
 id uuid primary key,
 email_hash text not null check(email_hash ~ '^[0-9a-f]{64}$'),
 ip_hash text not null check(ip_hash ~ '^[0-9a-f]{64}$'),
 action text not null check(action in ('signup','recovery','owner_invite','acceptance')),
 legal_version text,
 created_at timestamptz not null default now()
);
create index tc_auth_mail_time_idx on private.tc_auth_mail_attempts(created_at);
create index tc_auth_mail_email_time_idx on private.tc_auth_mail_attempts(email_hash,created_at);
create index tc_auth_mail_ip_time_idx on private.tc_auth_mail_attempts(ip_hash,created_at);
alter table private.tc_auth_mail_settings enable row level security;
alter table private.tc_auth_mail_attempts enable row level security;
revoke all on private.tc_auth_mail_settings,private.tc_auth_mail_attempts from public,anon,authenticated;
do $$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  execute 'create policy tc_auth_mail_settings_server on private.tc_auth_mail_settings for all to service_role using(true) with check(true)';
  execute 'create policy tc_auth_mail_attempts_server on private.tc_auth_mail_attempts for all to service_role using(true) with check(true)';
  grant select on private.tc_auth_mail_settings to service_role;
  grant select,insert on private.tc_auth_mail_attempts to service_role;
 end if;
end $$;

do $$ begin
 if to_regclass('vault.secrets') is not null then
 if not exists(select 1 from vault.secrets where name='truckcontrol_auth_mail_signing_key') and exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='extensions' and p.proname='gen_random_bytes') then
  perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'truckcontrol_auth_mail_signing_key','TruckControl Auth mail only. Independent of Gmail AES, receiving and model keys.');
 end if;
 end if;
end $$;

create function private.tc_auth_mail_config() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 select jsonb_build_object('enabled',m.enabled,'registration_open',s.registration_open and m.legal_ready,
  'legal_version',m.legal_version,'acceptance_enabled',m.acceptance_enabled,'owner_email',s.owner_email)
 into result from private.tc_auth_mail_settings m cross join private.tc_settings s where m.id and s.id;
 if to_regclass('vault.decrypted_secrets') is not null then
  select result||jsonb_build_object('api_key',max(decrypted_secret) filter(where name='truckcontrol_resend_api_key'),
   'signing_key',max(decrypted_secret) filter(where name='truckcontrol_auth_mail_signing_key')) into result
  from vault.decrypted_secrets where name in ('truckcontrol_resend_api_key','truckcontrol_auth_mail_signing_key');
 end if;
 return result;
end $$;
revoke all on function private.tc_auth_mail_config() from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function private.tc_auth_mail_config() to service_role;end if;end $$;
create function public.company_auth_mail_config() returns jsonb language sql stable security invoker set search_path='' as $$select private.tc_auth_mail_config();$$;
revoke all on function public.company_auth_mail_config() from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function public.company_auth_mail_config() to service_role;end if;end $$;

create function private.tc_auth_mail_reserve(p_data jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare s private.tc_auth_mail_settings; request_id uuid; inserted_id uuid;begin
 if p_data->>'email_hash' !~ '^[0-9a-f]{64}$' or p_data->>'ip_hash' !~ '^[0-9a-f]{64}$'
  or p_data->>'action' not in ('signup','recovery','owner_invite','acceptance') then raise exception 'Invalid mail reservation';end if;
 request_id:=(p_data->>'request_id')::uuid;
 if request_id is null then raise exception 'Missing request identity';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('truckcontrol-auth-mail-quota',0));
 select * into s from private.tc_auth_mail_settings where id;
 if not s.enabled then return null;end if;
 if (select count(*) from private.tc_auth_mail_attempts where created_at>=date_trunc('day',now()))>=s.daily_limit
  or (select count(*) from private.tc_auth_mail_attempts where created_at>=date_trunc('month',now()))>=s.monthly_limit
  or (select count(*) from private.tc_auth_mail_attempts where email_hash=p_data->>'email_hash' and created_at>now()-interval '15 minutes')>=2
  or (select count(*) from private.tc_auth_mail_attempts where email_hash=p_data->>'email_hash' and created_at>=date_trunc('day',now()))>=5
  or (select count(*) from private.tc_auth_mail_attempts where ip_hash=p_data->>'ip_hash' and created_at>now()-interval '1 hour')>=8 then return null;end if;
 if p_data->>'action'='signup' and (not s.legal_ready or not (select registration_open from private.tc_settings where id)
   or p_data->>'legal_version' is distinct from s.legal_version) then return null;end if;
 if p_data->>'action'='acceptance' and not s.acceptance_enabled then return null;end if;
 insert into private.tc_auth_mail_attempts(id,email_hash,ip_hash,action,legal_version)
 values(request_id,p_data->>'email_hash',p_data->>'ip_hash',p_data->>'action',case when p_data->>'action'='signup' then s.legal_version else null end)
 on conflict(id) do nothing returning id into inserted_id;
 return inserted_id;
end $$;
revoke all on function private.tc_auth_mail_reserve(jsonb) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function private.tc_auth_mail_reserve(jsonb) to service_role;end if;end $$;
create function public.company_auth_mail_reserve(p_data jsonb) returns uuid language sql security invoker set search_path='' as $$select private.tc_auth_mail_reserve(p_data);$$;
revoke all on function public.company_auth_mail_reserve(jsonb) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function public.company_auth_mail_reserve(jsonb) to service_role;end if;end $$;
