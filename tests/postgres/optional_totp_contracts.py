"""Optional TOTP on the already verified, disposable PostgreSQL CI target only.

Managed Auth, external HTTP, real factors/secrets and provider clients are absent.
The caller owns image/isolation checks; every negative fixture is rolled back.
"""
import json


def run(pg, f):
    payment = f.create_payment(110, True)
    user, organization = payment["data"]["user_id"], payment["data"]["company_id"]
    sid, factor, backup, other = (f.op(n) for n in (110, 111, 112, 113))
    q = f.q
    pg.sql("insert into auth.sessions(id,user_id) values(" + q(sid) + "," + q(user) + ")")
    # This isolated fixture tests MFA, not billing expiry. The reused monthly
    # payment ends at the run's initial epoch, before preceding lock tests finish.
    # Give only this synthetic account a future licence and prove baseline access.
    pg.sql("update private.tc_customers set status='active',paid_until=now()+interval '1 day' where user_id=" + q(user))

    def context(actor=user, session=sid, aal=None, role="authenticated"):
        claims = {"sub": actor, "role": role, "session_id": session,
                  "user_metadata": {"aal": "aal2", "is_admin": True}, "app_metadata": {"aal": "aal2"}}
        if aal is not None:
            claims["aal"] = aal
        return ("set local role " + role + ";do $claims$ begin perform set_config('request.jwt.claim.sub',"
                + q(actor) + ",true);perform set_config('request.jwt.claims'," + q(json.dumps(claims))
                + ",true);end;$claims$;")

    def enrolled(actor=user, session=sid, fid=factor, status="verified", aal="aal2"):
        return ("insert into auth.mfa_factors(id,user_id,factor_type,status) values("
                + q(fid) + "," + q(actor) + ",'totp'," + q(status) + ");update auth.sessions set aal="
                + q(aal) + ",factor_id=" + q(fid) + " where id=" + q(session) + ";")

    def evaluate(setup, statement, *, actor=user, session=sid, aal=None, role="authenticated"):
        return pg.value("begin;" + setup + context(actor, session, aal, role) + statement + ";rollback;")

    def denied(name, setup, statement, *, actor=user, session=sid, aal="aal1", role="authenticated"):
        pg.require_error("MFA: " + name, "begin;" + setup + context(actor, session, aal, role)
                         + statement + ";rollback;", "42501")

    valid = "select jsonb_build_object('valid',public.tc_verified_session())"
    capability = "select public.tc_mfa_protection_status()"
    visible = ("select jsonb_build_object('organizations',(select count(*) from public.organizations where id="
               + q(organization) + "),'trucks',(select count(*) from public.trucks where organization_id="
               + q(organization) + "))")
    pg.check("MFA: an ordinary confirmed AAL1 user retains baseline access", evaluate("", valid) == {"valid": True})
    pg.check("MFA: unverified enrollment does not lock out the existing user",
             evaluate(enrolled(status="unverified", aal="aal1"), valid) == {"valid": True})
    for setup in ("", enrolled(aal="aal1")):
        pg.check("MFA: exact rollout capability remains readable at AAL1 without business data",
                 evaluate(setup, capability) == {"schema_version": 1, "totp_enforcement": True})
    for aal in (None, "aal1", "", "AAL2", True, {"aal": "aal2"}):
        pg.check("MFA: exact JWT claim rejects " + repr(aal) + " despite upgraded same SID and metadata",
                 evaluate(enrolled(), valid, aal=aal) == {"valid": False})
    pg.check("MFA: exact AAL2 plus live same-user verified session binding passes",
             evaluate(enrolled(), valid, aal="aal2") == {"valid": True})
    for assignment in ("aal=null", "aal='aal1'", "factor_id=null", "factor_id=" + q(other)):
        pg.check("MFA: exact AAL2 cannot override live session " + assignment,
                 evaluate(enrolled() + "update auth.sessions set " + assignment + " where id=" + q(sid) + ";",
                          valid, aal="aal2") == {"valid": False})
    foreign = (enrolled() + enrolled(f.ADMIN, f.SID, other)
               + "update auth.sessions set factor_id=" + q(other) + " where id=" + q(sid) + ";")
    pg.check("MFA: a verified factor belonging to another user never authorizes the bearer",
             evaluate(foreign, valid, aal="aal2") == {"valid": False})
    removed = (enrolled() + "insert into auth.mfa_factors(id,user_id,status) values("
               + q(backup) + "," + q(user) + ",'verified');delete from auth.mfa_factors where id=" + q(factor) + ";")
    pg.check("MFA: removing the current factor rejects its session while a verified backup survives",
             evaluate(removed, valid, aal="aal2") == {"valid": False})
    pg.check("MFA: native challenge binding to the surviving backup restores access",
             evaluate(removed + "update auth.sessions set factor_id=" + q(backup) + " where id=" + q(sid) + ";",
                      valid, aal="aal2") == {"valid": True})
    pg.check("MFA: native last-factor removal restores optional baseline access",
             evaluate(enrolled() + "delete from auth.mfa_factors where id=" + q(factor)
                      + ";update auth.sessions set aal='aal1',factor_id=null where id=" + q(sid) + ";", valid)
             == {"valid": True})
    pg.check("MFA: raw organization/truck reads are hidden at AAL1",
             evaluate(enrolled(), visible, aal="aal1") == {"organizations": 0, "trucks": 0})
    mutation = ("update public.organizations set name='MFA forbidden mutation';reset role;"
                "select jsonb_build_object('changed',exists(select 1 from public.organizations where name='MFA forbidden mutation'))")
    pg.check("MFA: unfiltered UPDATE without RETURNING cannot persist at AAL1",
             evaluate(enrolled(), mutation, aal="aal1") == {"changed": False})
    for name, statement in (
        ("company permissions RPC rejects AAL1", "select public.tc_organization_access(" + q(organization) + ")"),
        ("team RPC rejects AAL1", "select public.tc_team_control(" + q(organization) + ",'list','{}')"),
    ):
        denied(name, enrolled(), statement)
    for statement in ("select public.tc_admin_control('snapshot','{}')", "select public.tc_provider_control('status','{}')",
                      "select public.tc_admin_manual_subscription_invoices('capabilities',null,null,null,'{}',null)"):
        denied("superadmin/provider/fiscal route rejects AAL1", enrolled(f.ADMIN, f.SID), statement, actor=f.ADMIN, session=f.SID)
    pg.check("MFA: the real Root role remains authorized with complete AAL2 binding",
             evaluate(enrolled(f.ADMIN, f.SID), "select jsonb_build_object('admin',private.tc_is_admin())",
                      actor=f.ADMIN, session=f.SID, aal="aal2") == {"admin": True})
    for assignment in ("not_after=now()-interval '1 second'", "user_id=" + q(f.ADMIN)):
        denied("capability rejects expired or wrong-user SID", "update auth.sessions set " + assignment + " where id=" + q(sid) + ";", capability)
    for assignment in ("email_confirmed_at=null", "deleted_at=now()", "banned_until=now()+interval '1 day'"):
        denied("capability rejects an unavailable live Auth identity", "update auth.users set " + assignment + " where id=" + q(user) + ";", capability)
    denied("capability rejects revoked SID", "delete from auth.sessions where id=" + q(sid) + ";", capability)
    denied("capability rejects malformed SID", "", capability, session="not-a-uuid")
    denied("capability is not granted to anon", "", capability, role="anon")
    for statement in ("select private.tc_actor_identity_and_session(" + q(user) + ",false)",
                      "select private.tc_actor_verified(" + q(user) + ",false)",
                      "select private.tc_totp_required(" + q(user) + ")",
                      "select private.tc_totp_session_bound(" + q(user) + "," + q(sid) + ")",
                      "select public.tc_company_server_access(" + q(user) + "," + q(organization) + ")"):
        denied("client cannot invoke a baseline/internal service exception", "", statement)

    background = "select jsonb_build_object('active',(public.tc_company_server_access(" + q(user) + "," + q(organization) + ")->>'active')::boolean)"
    pg.check("MFA: synthetic background account has an active licence before enrollment",
             evaluate("", background, role="service_role", actor="", session="") == {"active": True})
    pg.check("MFA: explicit service background access works without a human SID",
             evaluate(enrolled() + "delete from auth.sessions where id=" + q(sid) + ";", background, role="service_role", actor="", session="") == {"active": True})
    pg.check("MFA: explicit service background access still enforces the user's ban",
             evaluate(enrolled() + "update auth.users set banned_until=now()+interval '1 day' where id=" + q(user) + ";", background,
                      role="service_role", actor="", session="") == {"active": False})
    document = "select public.tc_manual_subscription_document_server('status'," + f.js({"actor_id": f.ADMIN, "session_id": f.SID}) + ")"
    refresh = "select public.tc_subscription_snapshot_refresh('observe'," + q(user) + "," + q(sid) + "," + q(other) + ",'{}')"
    for name, setup, statement in (("fiscal", enrolled(f.ADMIN, f.SID, aal="aal1"), document),
                                   ("refresh", enrolled(aal="aal1"), refresh)):
        denied("final service-only " + name + " adapter rejects an AAL1 SID", setup, statement, role="service_role", actor="", session="")
    pg.check("MFA: final fiscal service adapter accepts a verified bound AAL2 SID",
             "document_upload_ready" in evaluate(enrolled(f.ADMIN, f.SID), document, role="service_role", actor="", session=""))
    pg.check("MFA: final canonical refresh adapter accepts a verified bound AAL2 SID",
             evaluate(enrolled(), refresh, role="service_role", actor="", session="").get("available") is True)
    readonly = pg.value("begin read only;" + context() + capability + ";rollback;")
    pg.check("MFA: capability remains STABLE and valid in a read-only transaction", readonly == {"schema_version": 1, "totp_enforcement": True})

    # The final fiscal adapter must see a downgrade/revoke that committed before
    # it acquires the session SHARE lock, using independent real connections.
    pg.sql(enrolled(f.ADMIN, f.SID))
    try:
        pg.concurrent("update auth.sessions set aal='aal1',factor_id=null where id=" + q(f.SID),
                      f.service(document), "mfa-final-session-downgrade", second_error="42501")
    finally:
        pg.sql("delete from auth.mfa_factors where id=" + q(factor) + ";update auth.sessions set aal='aal1',factor_id=null where id=" + q(f.SID))

    rollback = (pg.ROOT / "docs/verification/optional-totp-protection-rollback.sql").read_text()
    pg.require_error("MFA: rollback refuses to remove enforcement after any verified factor exists",
                     "begin;" + enrolled() + rollback, "optional_totp_rollback_refuses_verified_factors")
    pg.sql(rollback)
    pg.check("MFA: zero-factor rollback restores the exact original central predicate",
             pg.value("select jsonb_build_object('body',md5(prosrc),'capability_absent',to_regprocedure('public.tc_mfa_protection_status()') is null) from pg_proc where oid='private.tc_actor_verified(uuid,boolean)'::regprocedure")
             == {"body": "374d744e7267041f610146e220f9e49b", "capability_absent": True})
    candidate = pg.ROOT / "supabase/migrations/20261115143612_optional_totp_session_protection.sql"
    pg.sql("begin;" + candidate.read_text() + ";commit;")
    pg.check("MFA: candidate can be restored after the reviewed zero-factor rollback",
             evaluate("", capability) == {"schema_version": 1, "totp_enforcement": True})
