-- Immutable legal receipts. Does not change prices, trial length or existing access.
create table private.tc_auth_legal_consents(
 user_id uuid not null references auth.users(id) on delete restrict,
 legal_version text not null,
 accepted_at timestamptz not null default now(),
 mail_attempt uuid references private.tc_auth_mail_attempts(id) on delete restrict,
 source text not null check(source in ('invitation','authenticated_profile')),
 primary key(user_id,legal_version)
);
alter table private.tc_auth_legal_consents enable row level security;
revoke all on private.tc_auth_legal_consents from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 execute 'create policy tc_auth_legal_server on private.tc_auth_legal_consents for select to service_role using(true)';
 grant select on private.tc_auth_legal_consents to service_role;
end if;end $$;
create function private.tc_auth_mail_consent(p_user_id uuid,p_request_id uuid,p_version text,p_authenticated boolean default false)
returns boolean language plpgsql security definer set search_path='' as $$
declare s private.tc_auth_mail_settings;u record;expected_hash text;begin
 select * into s from private.tc_auth_mail_settings where id;
 if not s.enabled or not s.legal_ready or s.legal_version is distinct from p_version
  or not (select registration_open from private.tc_settings where id) then return false;end if;
 select id,email,email_confirmed_at into u from auth.users where id=p_user_id;
 if not found then return false;end if;
 if p_authenticated then
  if u.email_confirmed_at is null or p_request_id is not null then return false;end if;
 else
  if u.email_confirmed_at is not null or p_request_id is null then return false;end if;
  expected_hash:=encode(extensions.hmac('auth-email-v1:'||lower(u.email),
   (select decrypted_secret from vault.decrypted_secrets where name='truckcontrol_auth_mail_signing_key'),'sha256'),'hex');
  if not exists(select 1 from private.tc_auth_mail_attempts a where a.id=p_request_id
   and a.action='signup' and a.email_hash=expected_hash and a.legal_version=p_version
   and a.created_at>now()-interval '15 minutes') then return false;end if;
 end if;
 insert into private.tc_auth_legal_consents(user_id,legal_version,mail_attempt,source)
 values(p_user_id,p_version,p_request_id,case when p_authenticated then 'authenticated_profile' else 'invitation' end)
 on conflict(user_id,legal_version) do nothing;
 return true;
end $$;
revoke all on function private.tc_auth_mail_consent(uuid,uuid,text,boolean) from public,anon,authenticated;
create function public.company_auth_mail_consent(p_user_id uuid,p_request_id uuid,p_version text,p_authenticated boolean default false)
returns boolean language sql security invoker set search_path='' as $$select private.tc_auth_mail_consent(p_user_id,p_request_id,p_version,p_authenticated);$$;
revoke all on function public.company_auth_mail_consent(uuid,uuid,text,boolean) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function private.tc_auth_mail_consent(uuid,uuid,text,boolean),public.company_auth_mail_consent(uuid,uuid,text,boolean) to service_role;
end if;end $$;

create or replace function private.tc_provision(p_user_id uuid) returns void
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
  if not s.registration_open or u.email_confirmed_at is null then return; end if;
  -- Auth metadata is user-editable. New customers need an immutable server receipt.
  if (select enabled from private.tc_auth_mail_settings where id) and not exists(
    select 1 from private.tc_customers where user_id=p_user_id) and (
      not (select legal_ready from private.tc_auth_mail_settings where id) or not exists(
        select 1 from private.tc_auth_legal_consents c join private.tc_auth_mail_settings m on m.id
        where c.user_id=p_user_id and c.legal_version=m.legal_version)) then return;end if;

  if s.sms_ready and u.phone_confirmed_at is null then return; end if;
  r := u.raw_user_meta_data->'truckcontrol_registration';
  if r is null or jsonb_typeof(r)<>'object' then return; end if;
  v_phone := coalesce(r->>'phone','');
  if v_phone !~ '^\+[1-9][0-9]{7,14}$' then return; end if;
  if s.sms_ready and ('+'||regexp_replace(coalesce(u.phone,''),'[^0-9]','','g'))<>v_phone then return; end if;
  if char_length(btrim(coalesce(r->>'contact_name',''))) not between 2 and 100
    or char_length(btrim(coalesce(r->>'company_name',''))) not between 2 and 100
    or char_length(btrim(coalesce(r->>'tax_id',''))) not between 3 and 30
    or char_length(btrim(coalesce(r->>'address',''))) not between 5 and 240 then return; end if;
  insert into private.tc_customers(user_id,contact_name,company_name,tax_id,address,email,phone,requested_plan,trial_started_at,trial_ends_at)
    values(p_user_id,btrim(r->>'contact_name'),btrim(r->>'company_name'),btrim(r->>'tax_id'),btrim(r->>'address'),u.email,v_phone,
      case when r->>'requested_plan'='full' then 'full' else 'limited' end,now(),now()+interval '10 days')
    on conflict(user_id) do nothing;
  if not exists(select 1 from public.organizations where owner_id=p_user_id) then
    insert into public.organizations(owner_id,name) values(p_user_id,btrim(r->>'company_name'));
  end if;
end;
$$;
revoke all on function private.tc_provision(uuid) from public,anon,authenticated;

