-- REVIEW PROPOSAL ONLY: integrate into a NEW CLI-named migration, never edit 62.
-- Read-only native inspection 08/11/2026 found both existing bodies identical
-- to their latest repository definitions. No credentials or Vault were read.
-- CREATE OR REPLACE retains routine OIDs, owners, signatures and existing ACLs.

-- Shared identity predicate for RLS and trusted background tasks. No locks or
-- writes: safe within STABLE functions and read-only Data API transactions.
-- This is verification, never authority from mutable JWT/user metadata.
create function private.tc_actor_verified(p_user uuid,p_require_session boolean)
returns boolean language plpgsql stable security definer set search_path='' as $actor_verified$
declare sid text;
begin
  if p_user is null or p_require_session is null then return false; end if;
  if not exists(select 1 from auth.users u where u.id=p_user
    and u.email_confirmed_at is not null and u.deleted_at is null
    and coalesce(u.banned_until,'-infinity'::timestamptz)<=now()) then
    return false;
  end if;
  if p_require_session then
    if p_user is distinct from (select auth.uid()) then return false; end if;
    sid:=nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id';
    if sid is null or to_regclass('auth.sessions') is null then return false; end if;
    if not exists(select 1 from auth.sessions s where s.id::text=sid and s.user_id=p_user) then
      return false;
    end if;
  end if;
  return true;
end;$actor_verified$;
revoke all on function private.tc_actor_verified(uuid,boolean) from public,anon,authenticated;
-- Intentionally NO client grant. Existing definer wrappers call this predicate.
-- p_require_session=false is reserved for an explicitly bound internal user;
-- it still denies unconfirmed, banned and deleted users.

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
 perform private.tc_manual_subscription_operator();
 if not private.tc_actor_verified(actor,true) then
  raise exception 'Solo la cuenta administradora verificada puede realizar esta operación' using errcode='42501';end if;
 if actor is null or not exists(select 1 from private.tc_admins where user_id=actor) then
  raise exception 'Solo la cuenta administradora puede realizar esta operación' using errcode='42501';end if;
 if p_action='snapshot' then return private.tc_admin_snapshot(p_data);end if;
 if p_action='module' then return private.tc_admin_module(p_data);end if;
 if p_action='customer' then return private.tc_admin_customer(p_data);end if;
 if p_action='plan' then return private.tc_admin_plan(p_data);end if;
 if p_action='settings' then return private.tc_admin_settings(p_data);end if;
 if p_action='manual_payment' then return private.tc_admin_manual_payment(p_data);end if;
 raise exception 'Operación no disponible';
end;
$admin_control$;
