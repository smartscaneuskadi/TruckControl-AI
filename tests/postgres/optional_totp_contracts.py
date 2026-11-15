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
    truck = f.op(118)
    pg.sql("insert into public.trucks(id,organization_id,plate,brand,model,year,odometer_km,inspection_due_on) values("
           + q(truck) + "," + q(organization) + ",'MFA-FULL-PG','MAN','Synthetic',2026,1234,'2027-01-01')")

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

    def full(action, company=None, expected=None, operation=None, data=None):
        return f.rpc("tc_admin_company_full", q(action),
                     q(company) + "::uuid" if company else "null::uuid",
                     str(expected) if expected is not None else "null::bigint",
                     q(operation) + "::uuid" if operation else "null::uuid",
                     f.js(data or {}), "null::uuid")

    def configured_full(enabled=True, expiry=None):
        # Both the real Root role and its native factor-bound SID are required.
        # Every use of this setup is inside evaluate()/denied()'s rolled-back
        # transaction; no synthetic licence decision survives the assertion.
        return (enrolled(f.ADMIN, f.SID, other)
                + context(f.ADMIN, f.SID, "aal2")
                + full("set", organization, 0, f.op(114),
                       {"enabled": enabled, "expires_at": expiry})
                + ";reset role;")

    def protection_fingerprint():
        signatures = (
            "private.tc_actor_verified(uuid,boolean)",
            "private.tc_actor_identity_and_session(uuid,boolean)",
            "private.tc_totp_required(uuid)",
            "private.tc_totp_session_bound(uuid,uuid)",
            "private.tc_manual_fiscal_document_actor(uuid,uuid)",
            "private.tc_subscription_snapshot_refresh(text,uuid,uuid,uuid,jsonb)",
            "private.tc_mfa_protection_status()", "public.tc_mfa_protection_status()",
            "private.tc_admin_company_full(text,uuid,bigint,uuid,jsonb,uuid)",
            "public.tc_admin_company_full(text,uuid,bigint,uuid,jsonb,uuid)",
        )
        return pg.value("select jsonb_object_agg(p.oid::regprocedure::text,"
                        "jsonb_build_object('oid',p.oid::text,'body',md5(p.prosrc),"
                        "'owner',p.proowner::regrole::text,'acl',to_jsonb(p.proacl),"
                        "'security_definer',p.prosecdef,'volatility',p.provolatile,"
                        "'config',to_jsonb(p.proconfig))) from pg_catalog.pg_proc p where p.oid in ("
                        + ",".join(q(signature) + "::regprocedure" for signature in signatures) + ")")

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

    # The newly published Full controller must inherit the same live MFA gate.
    # In particular, a stale AAL1 JWT is denied after its SID is upgraded, and a
    # tenant's otherwise valid AAL2 must never become a global administration role.
    root_factor = enrolled(f.ADMIN, f.SID, other)
    full_set = full("set", organization, 0, f.op(114), {"enabled": True, "expires_at": None})
    for action, statement in (("capabilities", full("capabilities")),
                              ("list", full("list")),
                              ("set", full_set),
                              ("history", full("history", organization))):
        denied("manual Full Root " + action + " rejects stale AAL1 despite upgraded same SID",
               root_factor, statement, actor=f.ADMIN, session=f.SID)
    root_capability = evaluate(root_factor, full("capabilities"), actor=f.ADMIN, session=f.SID, aal="aal2")
    pg.check("MFA: manual Full capability requires and accepts the live Root AAL2 binding",
             root_capability.get("schema_version") == 1 and root_capability.get("manual_company_full") is True)
    replay = evaluate(configured_full(), full_set, actor=f.ADMIN, session=f.SID, aal="aal2")
    pg.check("MFA: bound Root Full activation retains UUID replay and a single applied revision",
             replay["replayed"] is True and replay["applied_revision"] == 1
             and replay["operation_id"] == f.op(114)
             and replay["item"]["manual_full"]["status"] == "active"
             and replay["item"]["manual_full"]["revision"] == 1)
    history = evaluate(configured_full(), full("history", organization), actor=f.ADMIN, session=f.SID, aal="aal2")
    pg.check("MFA: Full audit retains exactly one actual Root operator and operation",
             len(history["items"]) == 1 and history["items"][0]["actor_id"] == f.ADMIN
             and history["items"][0]["operation_id"] == f.op(114)
             and history["items"][0]["revision"] == 1)
    denied("tenant AAL2 cannot self-activate manual Full", enrolled(), full_set, aal="aal2")
    company_admin = (root_factor + "delete from private.tc_admins where user_id=" + q(f.ADMIN) + ";"
                     "insert into private.tc_memberships(organization_id,user_id,role,status,invited_by) values("
                     + q(organization) + "," + q(f.ADMIN) + ",'admin','active'," + q(user) + ");")
    denied("company administrator AAL2 cannot self-activate manual Full", company_admin, full_set,
           actor=f.ADMIN, session=f.SID, aal="aal2")
    denied("manual Full ON never replaces the tenant's required MFA challenge",
           configured_full() + enrolled(), "select public.tc_organization_access(" + q(organization) + ")")
    active_full = evaluate(configured_full() + enrolled(),
                           "select public.tc_organization_access(" + q(organization) + ")", aal="aal2")
    pg.check("MFA: Full ON and complete AAL2 together preserve the company's commercial access",
             active_full["active"] and active_full["plan"] == "full"
             and active_full["can_write"] and active_full["manual_full"]["status"] == "active")
    pg.check("MFA: bound AAL2 sees the retained company fleet when Full is ON",
             evaluate(configured_full() + enrolled(), visible, aal="aal2") == {"organizations": 1, "trucks": 1})
    for label, enabled, expiry in (("disabled", False, None), ("expired", True, "2000-01-01T00:00:00Z")):
        blocked_setup = configured_full(enabled, expiry) + enrolled()
        blocked = evaluate(blocked_setup, "select public.tc_organization_access(" + q(organization) + ")", aal="aal2")
        pg.check("MFA: valid AAL2 cannot bypass an explicitly " + label + " Full licence",
                 not blocked["active"] and not blocked["can_write"]
                 and blocked["manual_full"]["status"] == label and not any(blocked["features"].values()))
        pg.check("MFA: a " + label + " Full company hides its fleet even from valid AAL2",
                 evaluate(blocked_setup, visible, aal="aal2") == {"organizations": 1, "trucks": 0})
        mutation = ("update public.trucks set odometer_km=9876 where id=" + q(truck)
                    + ";reset role;select jsonb_build_object('retained',"
                    "(select odometer_km=1234 from public.trucks where id=" + q(truck) + "))")
        pg.check("MFA: a " + label + " Full company cannot mutate retained data with AAL2",
                 evaluate(blocked_setup, mutation, aal="aal2") == {"retained": True})
        no_factor_setup = (blocked_setup + "delete from auth.mfa_factors where id=" + q(factor)
                           + ";update auth.sessions set aal='aal1',factor_id=null where id=" + q(sid) + ";")
        no_factor = evaluate(no_factor_setup, "select public.tc_organization_access(" + q(organization) + ")", aal="aal1")
        pg.check("MFA: last-factor removal cannot reactivate an explicitly " + label + " Full licence",
                 not no_factor["active"] and no_factor["manual_full"]["status"] == label)
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

    # Removing enforcement based on a momentarily empty factor list is unsafe:
    # an Auth verification may finish later. Operational rollback therefore
    # keeps these routines in place and requires a new, reviewed forward change.
    rollback = (pg.ROOT / "docs/verification/optional-totp-protection-rollback.sql").read_text()
    forward_only = "optional_totp_enforcement_retirement_requires_forward_migration"
    before = protection_fingerprint()
    pg.check("MFA: forward-only retirement test starts without verified factors",
             pg.value("select jsonb_build_object('count',count(*)) from auth.mfa_factors where status='verified'")
             == {"count": 0})
    pg.require_error("MFA: zero-factor retirement still refuses to remove enforcement", rollback, forward_only)
    pg.check("MFA: rejected zero-factor retirement preserves MFA and Full OIDs, bodies, owners, ACL and configuration",
             protection_fingerprint() == before)
    pg.check("MFA: rejected zero-factor retirement preserves exact rollout capability",
             evaluate("", capability) == {"schema_version": 1, "totp_enforcement": True})
    pg.sql(enrolled())
    try:
        pg.require_error("MFA: verified-factor retirement requires a reviewed forward migration", rollback, forward_only)
        pg.check("MFA: rejected verified-factor retirement preserves MFA and Full authorization routines",
                 protection_fingerprint() == before)
        pg.check("MFA: rejected retirement keeps AAL1 denied and complete AAL2 accepted",
                 evaluate("", valid, aal="aal1") == {"valid": False}
                 and evaluate("", valid, aal="aal2") == {"valid": True})
        pg.check("MFA: rollout capability is retained after rejected retirement with a verified factor",
                 evaluate("", capability) == {"schema_version": 1, "totp_enforcement": True})
    finally:
        pg.sql("delete from auth.mfa_factors where id=" + q(factor)
               + ";update auth.sessions set aal='aal1',factor_id=null where id=" + q(sid))
    pg.sql(enrolled(status="unverified", aal="aal1"))
    try:
        pg.require_error("MFA: pending-factor retirement cannot remove protection before a later verification",
                         rollback, forward_only)
        # This is a deterministic late-completion contract, not a concurrent
        # managed Auth acceptance. The native harness separately exercises Auth.
        pg.sql("update auth.mfa_factors set status='verified' where id=" + q(factor)
               + ";update auth.sessions set aal='aal2',factor_id=" + q(factor) + " where id=" + q(sid))
        pg.check("MFA: later verification still requires exact AAL2 after retirement is refused",
                 evaluate("", valid, aal="aal1") == {"valid": False}
                 and evaluate("", valid, aal="aal2") == {"valid": True})
        pg.check("MFA: later verification retains the original MFA and manual Full catalog fingerprint",
                 protection_fingerprint() == before)
    finally:
        pg.sql("delete from auth.mfa_factors where id=" + q(factor)
               + ";update auth.sessions set aal='aal1',factor_id=null where id=" + q(sid))
