-- OPTIONAL TOTP: ENFORCEMENT RETIREMENT IS FORWARD-ONLY.
-- Never run automatically or use this file to remove an account factor.
-- A point-in-time empty auth.mfa_factors check is not sufficient: native Auth
-- verification already in flight can complete after such a transaction commits.
-- Do not add custom triggers/locks to managed Auth to emulate a global drain.
--
-- Operational recovery: publish a previously verified MFA-capable build with
-- VITE_MFA_ENROLLMENT_ENABLED=false. Keep challenge, factor management, SQL
-- enforcement, Full permissions and audit. A pre-MFA build such as Sites46
-- does not provide a challenge for enrolled users and is not that recovery build.
-- Retiring server enforcement requires a new reviewed forward migration plus
-- an explicit provider/drain recovery plan, never replaying an old migration.
-- This guard performs no DDL/DML and refuses both empty and enrolled states.
do $retain_totp_enforcement$
begin
 raise exception 'optional_totp_enforcement_retirement_requires_forward_migration'
  using errcode='42501';
end;$retain_totp_enforcement$;
