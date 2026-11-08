-- REVIEW PROPOSAL ONLY: integrate into a NEW CLI-named migration, never edit 62.
-- Read-only native inspection 08/11/2026 found both existing bodies identical
-- to their latest repository definitions. No credentials or Vault were read.
-- CREATE OR REPLACE retains routine OIDs, owners, signatures and existing ACLs.

-- Shared identity predicate for RLS and trusted background tasks. No locks or
-- writes: safe within STABLE functions and read-only Data API transactions.
-- This is verification, never authority from mutable JWT/user metadata.
create function private.tc_actor_verified(p_user uuid,p_require_session boolean)
returns boolean language plpgsql stable security definer set search_path='' as $actor_verified$
declare sid uuid;
begin
  if p_user is null or p_require_session is null then return false; end if;
  if not exists(select 1 from auth.users u where u.id=p_user
    and u.email_confirmed_at is not null and u.deleted_at is null
    and coalesce(u.banned_until,'-infinity'::timestamptz)<=now()) then
    return false;
  end if;
  if p_require_session then
    if p_user is distinct from (select auth.uid()) then return false; end if;
    begin
      sid:=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id')::uuid;
    exception when invalid_text_representation then return false;
    end;
    if sid is null or to_regclass('auth.sessions') is null then return false; end if;
    -- UUID equality uses the managed sessions primary key. not_after is an
    -- optional managed Auth field; absent/NULL means no time-boxed expiry.
    if not exists(select 1 from auth.sessions s where s.id=sid and s.user_id=p_user
      and (nullif(to_jsonb(s)->>'not_after','') is null
        or (to_jsonb(s)->>'not_after')::timestamptz>now())) then
      return false;
    end if;
  end if;
  return true;
end;$actor_verified$;
revoke all on function private.tc_actor_verified(uuid,boolean) from public,anon,authenticated;
-- Intentionally NO client grant. Existing definer wrappers call this predicate.
-- p_require_session=false is reserved for an explicitly bound internal user;
-- it still denies unconfirmed, banned and deleted users.

-- Parameterless identity checker for user-triggered Edge requests. It does
-- not require a company/profile/license, so verified onboarding remains valid.
create function private.tc_verified_session()
returns boolean language sql stable security definer set search_path='' as $verified_session$
  select private.tc_actor_verified((select auth.uid()),true);
$verified_session$;
revoke all on function private.tc_verified_session() from public,anon,authenticated;
grant execute on function private.tc_verified_session() to authenticated;
create function public.tc_verified_session()
returns boolean language sql stable security invoker set search_path='' as $verified_session_public$
  select private.tc_verified_session();
$verified_session_public$;
revoke all on function public.tc_verified_session() from public,anon,authenticated;
grant execute on function public.tc_verified_session() to authenticated;

create or replace function private.tc_is_admin()
returns boolean language plpgsql stable security definer set search_path='' as $admin_identity$
declare actor uuid:=(select auth.uid());
begin
  return actor is not null
    and exists(select 1 from private.tc_admins a where a.user_id=actor)
    and private.tc_actor_verified(actor,true);
end;$admin_identity$;

-- Preserve every original economic operation. Helper62 holds live user/admin/
-- session rows through writes; the shared predicate also rejects a missing SID.
create or replace function private.tc_admin_control(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $admin_control$
declare actor uuid := (select auth.uid()); target uuid; result jsonb; old_record jsonb; updated_record jsonb;
  plan private.tc_plans; request private.tc_payment_requests; receipt text; until_date timestamptz;
begin
 if not private.tc_actor_verified(actor,true) then
  raise exception 'Solo la cuenta administradora verificada puede realizar esta operación' using errcode='42501';end if;
 if actor is null or not exists(select 1 from private.tc_admins where user_id=actor) then
  raise exception 'Solo la cuenta administradora puede realizar esta operación' using errcode='42501';end if;
 perform private.tc_manual_subscription_operator();
 -- Revalidate after acquiring live Auth/admin/session SHARE locks.
 if not private.tc_actor_verified(actor,true) then
  raise exception 'Solo la cuenta administradora verificada puede realizar esta operación' using errcode='42501';end if;
 if p_action='snapshot' then return private.tc_admin_snapshot(p_data);end if;
 if p_action='module' then return private.tc_admin_module(p_data);end if;
 if p_action='customer' then return private.tc_admin_customer(p_data);end if;
 if p_action='plan' then return private.tc_admin_plan(p_data);end if;
 if p_action='settings' then return private.tc_admin_settings(p_data);end if;
 if p_action='manual_payment' then return private.tc_admin_manual_payment(p_data);end if;
 raise exception 'Operación no disponible';
end;
$admin_control$;

-- Preserve schema62's OID, VOLATILE semantics, definer ownership and ACL.
-- All fiscal operator entry points call this helper, including reads/replays.
-- A human session is mandatory; JWT claims never replace the live rows.
create or replace function private.tc_manual_subscription_operator()
returns uuid language plpgsql volatile security definer set search_path='' as $operator_session$
declare actor uuid:=(select auth.uid()); sid uuid;
begin
  if actor is null then
    raise exception 'manual_invoice_operator_forbidden' using errcode='42501';
  end if;
  perform 1 from auth.users u where u.id=actor and u.email_confirmed_at is not null
    and u.deleted_at is null and coalesce(u.banned_until,'-infinity'::timestamptz)<=now()
    for share;
  if not found then raise exception 'manual_invoice_operator_forbidden' using errcode='42501'; end if;
  perform 1 from private.tc_admins a where a.user_id=actor for share;
  if not found then raise exception 'manual_invoice_operator_forbidden' using errcode='42501'; end if;
  begin
    sid:=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id')::uuid;
  exception when invalid_text_representation then
    raise exception 'manual_invoice_session_revoked' using errcode='42501';
  end;
  if sid is null or to_regclass('auth.sessions') is null then
    raise exception 'manual_invoice_session_revoked' using errcode='42501';
  end if;
  perform 1 from auth.sessions s where s.id=sid and s.user_id=actor
    and (nullif(to_jsonb(s)->>'not_after','') is null
      or (to_jsonb(s)->>'not_after')::timestamptz>now()) for share;
  if not found then raise exception 'manual_invoice_session_revoked' using errcode='42501'; end if;
  -- Recheck after every authorization row is locked. This also centralizes
  -- identity/session constraints added to the shared predicate in the future.
  if not private.tc_actor_verified(actor,true) then
    raise exception 'manual_invoice_operator_forbidden' using errcode='42501';
  end if;
  return actor;
end;$operator_session$;
