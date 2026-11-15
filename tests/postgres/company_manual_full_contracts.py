"""Manual per-company Full contracts in the existing disposable PostgreSQL.

Auth/Storage catalogs here are synthetic; actual Auth/REST/Storage acceptance is
separate. No provider client, external URL, payment or model call is used.
"""
from __future__ import annotations

import json


def run(pg, f):
    q, js = f.q, f.js
    owner, other, member = (f.uid(n) for n in (210, 211, 212))
    owner_sid, other_sid, member_sid = (f.op(n) for n in (210, 211, 212))
    sibling, root_org, truck, document, storage = (f.op(n) for n in range(213, 218))

    def context(user=owner, sid=owner_sid, role="authenticated"):
        claims = {"sub": user, "role": role,
            "user_metadata": {"is_admin": True, "paid_plan": "full"}}
        if sid is not None:
            claims["session_id"] = sid
        return ("reset role;set local role " + role + ";do $claims$ begin perform set_config('request.jwt.claim.sub',"
            + q(user) + ",true);perform set_config('request.jwt.claims'," + q(json.dumps(claims))
            + ",true);end $claims$;")

    def root(statement):
        return context(f.ADMIN, f.SID) + statement + ";"

    def service(statement):
        return context("", None, "service_role") + statement + ";"

    def rpc(action, company=None, expected=None, operation=None, data=None, after=None):
        return f.rpc("tc_admin_company_full", q(action), q(company) + "::uuid" if company else "null::uuid",
            str(expected) if expected is not None else "null::bigint",
            q(operation) + "::uuid" if operation else "null::uuid", js(data or {}),
            q(after) + "::uuid" if after else "null::uuid")

    def set_full(company, enabled=True, expiry=None, expected=0, operation=None):
        return root(rpc("set", company, expected, operation or f.op(250),
            {"enabled": enabled, "expires_at": expiry}))

    flags = "reset role;update private.tc_settings set enforce_access=true,sms_ready=false,payments_enabled=false,prices_are_examples=true where id;"

    def trial(statement):
        return pg.value("begin;" + flags + statement + ";rollback;")

    def deny(name, statement, error="42501"):
        pg.require_error("Manual Full: " + name, "begin;" + flags + statement + ";rollback;", error)

    def access(company, user=owner, sid=owner_sid):
        return context(user, sid) + f.rpc("tc_organization_access", q(company) + "::uuid") + ";"

    # Test the shipped rollback body before any committed configured decision.
    rollback = (f.ROOT / "docs/verification/company-manual-full-function-rollback.sql").read_text()
    assert rollback.rstrip().endswith("commit;")
    before_rollback = pg.catalog_fingerprint(pg.SOURCE)
    restored = pg.value(rollback.rstrip()[:-len("commit;")]
        + "select jsonb_build_object('rpc_absent',to_regprocedure('public.tc_admin_company_full(text,uuid,bigint,uuid,jsonb,uuid)') is null,"
        + "'audit_kept',to_regclass('private.tc_company_full_audit') is not null,"
        + "'old_guard',md5((select prosrc from pg_proc where oid='private.tc_account_active(uuid)'::regprocedure))='533ab690fbd7fe74419c99696168f3d9');rollback;")
    pg.check("Manual Full: zero-record function rollback executes with old guard and immutable tables retained",
        restored == {"rpc_absent": True, "audit_kept": True, "old_guard": True}
        and pg.catalog_fingerprint(pg.SOURCE) == before_rollback)

    # Native service keys are not modeled here. These users/claims exist only
    # inside the pinned local catalog and cannot authenticate to a real service.
    for n, user, sid in ((210, owner, owner_sid), (211, other, other_sid), (212, member, member_sid)):
        profile = {"truckcontrol_registration": {"contact_name": "Synthetic manual operator",
            "company_name": "Synthetic manual company " + str(n), "tax_id": "SYNTH-MANUAL-" + str(n),
            "address": "Synthetic isolated street 123", "phone": "+12025558" + str(n), "requested_plan": "limited"}}
        pg.sql("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(" + q(user) + ","
            + q("manual-pg-" + str(n) + "@example.invalid") + ",now()," + js(profile) + ");"
            + "insert into auth.sessions(id,user_id) values(" + q(sid) + "," + q(user) + ");")
    org = pg.value("select jsonb_build_object('id',id) from public.organizations where owner_id=" + q(owner))["id"]
    other_org = pg.value("select jsonb_build_object('id',id) from public.organizations where owner_id=" + q(other))["id"]
    path = org + "/" + document + "/synthetic-manual-proof.pdf"
    pg.sql("insert into public.organizations(id,owner_id,name) values(" + q(sibling) + "," + q(owner)
        + ",'Synthetic same-owner second company'),(" + q(root_org) + "," + q(f.ADMIN) + ",'Synthetic Root company');"
        + "insert into public.trucks(id,organization_id,plate,brand,model,year,inspection_due_on) values(" + q(truck) + ","
        + q(org) + ",'MANUAL-PG-BASE','MAN','Synthetic',2026,'2027-01-01');"
        + "insert into private.company_documents(id,organization_id,name,object_path,content_type,size_bytes) values("
        + q(document) + "," + q(org) + ",'Synthetic proof.pdf'," + q(path) + ",'application/pdf',8);"
        + "insert into storage.objects(id,bucket_id,name,owner) values(" + q(storage) + ",'truckcontrol-documents',"
        + q(path) + "," + q(owner) + ");"
        + "insert into private.gmail_connections(organization_id,connected_by,google_subject,email,last_sync_at,sync_page_token) values("
        + q(org) + "," + q(owner) + ",'synthetic-manual-google-subject','manual-mail@example.invalid','2026-01-01T00:00:00Z','synthetic-existing-cursor');")

    baseline = pg.database_fingerprint(pg.SOURCE)
    legacy = trial(access(org))
    pg.check("Manual Full: unconfigured company retains its legacy trial and metadata",
        legacy["active"] and legacy["plan"] == "limited"
        and legacy["manual_full"]["status"] == "unconfigured" and legacy["manual_full"]["revision"] == 0)
    expire = "reset role;update private.tc_customers set status='trial',paid_plan=null,paid_until=null,trial_started_at=now()-interval '20 days',trial_ends_at=now()-interval '10 days' where user_id=" + q(owner) + ";"
    scoped = trial(expire + "create temp table original_manual_customer as select to_jsonb(c) value from private.tc_customers c where user_id=" + q(owner) + ";"
        + set_full(org) + access(org) + "reset role;select jsonb_build_object('enabled',private.tc_organization_access_for(" + q(org) + "," + q(owner) + "),"
        + "'sibling',private.tc_organization_access_for(" + q(sibling) + "," + q(owner) + "),"
        + "'other',private.tc_organization_access_for(" + q(other_org) + "," + q(other) + "),"
        + "'customer_unchanged',(select value from original_manual_customer)=(select to_jsonb(c) from private.tc_customers c where user_id=" + q(owner) + "))")
    pg.check("Manual Full: expired same-owner sibling and other owner are isolated without global user entitlement",
        scoped["enabled"]["active"] and scoped["enabled"]["plan"] == "full"
        and not scoped["sibling"]["active"] and not scoped["sibling"]["manual_full"]["configured"]
        and scoped["other"]["active"] and scoped["other"]["plan"] == "limited" and scoped["customer_unchanged"])
    bootstrap = trial(expire + set_full(org) + context() + f.rpc("tc_finish_registration"))
    pg.check("Manual Full: bootstrap admits a scoped Full company but keeps legacy per-user plan/features",
        bootstrap["active"] and bootstrap["company_access_available"] and bootstrap["plan"] == "limited"
        and not bootstrap["features"]["documents"] and not bootstrap["features"]["gmail"])
    disabled = trial(set_full(org, False) + "reset role;update private.tc_settings set enforce_access=false;"
        + context() + "update public.trucks set odometer_km=999 where id=" + q(truck) + ";"
        + "reset role;select jsonb_build_object('access',private.tc_organization_access_for(" + q(org) + "," + q(owner)
        + "),'truck_unchanged',(select odometer_km=0 from public.trucks where id=" + q(truck) + "))")
    # Separate role-visible assertions avoid inspecting the hidden business row
    # as the authenticated caller. The owner-only read above verifies retention.
    visible = trial(set_full(org, False) + "reset role;update private.tc_settings set enforce_access=false;" + context()
        + "select jsonb_build_object('trucks',(select count(*) from public.trucks where id=" + q(truck) + "),"
        + "'organizations',(select count(*) from public.organizations where id=" + q(org) + "),"
        + "'objects',(select count(*) from storage.objects where id=" + q(storage) + "),'access',public.tc_organization_access(" + q(org) + "))")
    pg.check("Manual Full: OFF wins even with legacy enforce_access=false; raw UPDATE without RETURNING cannot write",
        not disabled["access"]["active"] and disabled["truck_unchanged"]
        and visible["trucks"] == visible["objects"] == 0 and visible["organizations"] == 1
        and not visible["access"]["can_write"] and not any(visible["access"]["features"].values()))
    deny("OFF company rename is blocked without RETURNING", set_full(org, False) + context()
        + "update public.organizations set name='must never persist' where id=" + q(org), "company_full_inactive")
    deny("OFF document RPC denies original access", set_full(org, False) + context() + f.rpc("tc_document_page", q(org), "null::uuid"))
    deny("OFF operational RPC is denied", set_full(org, False) + context() + f.rpc("tc_list_records", q(org), "null::uuid"))
    deny("OFF storage insert cannot create a fresh original", set_full(org, False) + context()
        + "insert into storage.objects(bucket_id,name,owner) values('truckcontrol-documents'," + q(org + "/" + f.op(218) + "/blocked.pdf") + "," + q(owner) + ")")
    # PostgreSQL transaction time makes equality deterministic, unlike HTTP.
    boundary_rpc = f.rpc("tc_admin_company_full", "'set'", q(org), "0", q(f.op(251)),
        "jsonb_build_object('enabled',true,'expires_at',now())", "null::uuid")
    boundary = trial(root(boundary_rpc) + access(org))
    pg.check("Manual Full: exact server expiry boundary is expired and denies operations",
        not boundary["active"] and boundary["manual_full"]["status"] == "expired")
    transitions = trial(set_full(org, True, "2000-01-01T00:00:00Z")
        + set_full(org, True, None, 1, f.op(252)) + access(org))
    pg.check("Manual Full: reactivation from past expiry is immediate and NULL expiry is unlimited",
        transitions["active"] and transitions["manual_full"]["status"] == "active"
        and transitions["manual_full"]["expires_at"] is None and transitions["manual_full"]["revision"] == 2)

    for role in ("admin", "operator", "viewer"):
        membership = "reset role;insert into private.tc_memberships(organization_id,user_id,role,status,invited_by) values("
        membership += q(org) + "," + q(member) + "," + q(role) + ",'active'," + q(owner) + ");"
        deny("company " + role + " cannot self-grant with forged user metadata",
            membership + context(member, member_sid) + rpc("set", org, 0, f.op(253), {"enabled": True, "expires_at": None}))
        member_access = trial(set_full(org) + membership + access(org, member, member_sid))
        pg.check("Manual Full: existing " + role + " permissions survive Full",
            member_access["active"] and member_access["company_role"] == role
            and member_access["can_write"] == (role != "viewer")
            and member_access["can_manage"] == (role == "admin"))
    for label, sid in (("missing", None), ("other user's", owner_sid), ("malformed", "malformed")):
        deny("Root metadata read rejects " + label + " native SID",
            context(f.ADMIN, sid) + rpc("capabilities"))
    for field in ("banned_until=now()+interval '1 day'", "deleted_at=now()", "email_confirmed_at=null"):
        deny("unavailable Auth Root cannot read or mutate " + field,
            "reset role;update auth.users set " + field + " where id=" + q(f.ADMIN) + ";" + root(rpc("capabilities")))
    deny("revoked global Root cannot mutate even with old Auth metadata",
        "reset role;delete from private.tc_admins where user_id=" + q(f.ADMIN) + ";" + root(rpc("set", org, 0, f.op(253), {"enabled": True, "expires_at": None})))
    management = trial(set_full(root_org, False) + root(rpc("capabilities")))
    pg.check("Manual Full: global management remains available while Root company is OFF",
        management["schema_version"] == 1 and management["manual_company_full"] is True)
    for target in (owner, member):
        membership = ("reset role;insert into private.tc_memberships(organization_id,user_id,role,status,invited_by) values("
            + q(org) + "," + q(member) + ",'viewer','active'," + q(owner) + ");") if target == member else ""
        result = trial(set_full(org) + membership + "reset role;update private.tc_customers set status='suspended' where user_id="
            + q(target) + ";" + access(org, target, member_sid if target == member else owner_sid))
        pg.check("Manual Full: explicit security suspension remains authoritative for " + ("member" if target == member else "owner"), not result["active"])
    owner_ban = (set_full(org) + "reset role;update auth.users set banned_until=now()+interval '1 day' where id=" + q(owner) + ";")
    deny("banned native actor cannot use company status RPC", owner_ban + access(org))
    banned = trial(owner_ban + "reset role;insert into private.tc_memberships(organization_id,user_id,role,status,invited_by) values("
        + q(org) + "," + q(member) + ",'viewer','active'," + q(owner) + ");" + access(org, member, member_sid))
    pg.check("Manual Full: owner's live Auth ban also blocks an otherwise valid member", not banned["active"])
    features = trial(set_full(org) + "reset role;update private.tc_modules set enabled=false where id='documents';"
        + "update private.tc_customers set module_overrides='{\"gmail\":false}' where user_id=" + q(owner) + ";" + access(org))
    pg.check("Manual Full: global module and company-owner restrictions remain authoritative",
        not features["features"]["documents"] and not features["features"]["gmail"])

    worker = trial(set_full(org, False) + service("select jsonb_build_object('access',public.tc_company_server_access(" + q(owner) + "," + q(org)
        + "),'document_ai',public.tc_consume_document_ai(" + q(org) + "," + q(owner) + "),'legacy_lock',public.gmail_server('lock_sync',"
        + js({"organization_id": org}) + "),'fenced_lock',public.gmail_server('lock_sync',"
        + js({"organization_id": org, "user_id": owner, "sync_lease_id": f.op(254)}) + "))"))
    pg.check("Manual Full: service background guard, AI reservation and both Gmail acquisition paths deny OFF",
        not worker["access"]["active"] and worker["document_ai"] is False
        and worker["legacy_lock"] is False and worker["fenced_lock"] is False)
    lease = {"organization_id": org, "user_id": owner, "sync_lease_id": f.op(254)}
    active_lease = set_full(org) + service(f.rpc("gmail_server", "'lock_sync'", js(lease)))
    lease_on = trial(active_lease + service("select jsonb_build_object('allowed',public.gmail_server('assert_sync'," + js(lease) + "))"))
    pg.check("Manual Full: a permitted fenced worker can acquire the existing synthetic connection", lease_on == {"allowed": True})
    revoked_lease = active_lease + set_full(org, False, None, 1, f.op(255))
    pg.check("Manual Full: disable revokes an already acquired worker capability",
        trial(revoked_lease + service("select jsonb_build_object('allowed',public.gmail_server('assert_sync'," + js(lease) + "))")) == {"allowed": False})
    deny("disable prevents an acquired fenced worker from committing an invoice",
        revoked_lease + service(f.rpc("gmail_server", "'record_invoice'", js(lease))))
    finish = trial(revoked_lease + service(f.rpc("gmail_server", "'finish_sync'",
        js({**lease, "succeeded": True, "reauthorize": True, "page_token": "must-not-persist"})))
        + "reset role;select jsonb_build_object('lease_released',sync_lease_id is null and sync_lease_until is null,"
        + "'cursor_preserved',sync_page_token='synthetic-existing-cursor','status_preserved',status='connected',"
        + "'sync_preserved',last_sync_at='2026-01-01T00:00:00Z'::timestamptz) from private.gmail_connections where organization_id=" + q(org))
    pg.check("Manual Full: denied worker may release only its lease, without cursor/status/sync mutations",
        finish == {"lease_released": True, "cursor_preserved": True, "status_preserved": True, "sync_preserved": True})
    for name, statement in (
        ("legacy Gmail credentials", f.rpc("gmail_server", "'credentials'", js({"organization_id": org}))),
        ("fenced Gmail original import", f.rpc("gmail_server", "'record_invoice'", js({"organization_id": org, "user_id": owner, "sync_lease_id": f.op(254)}))),
        ("inbound company mail", f.rpc("company_mail_server", "'get_inbox'", js({"organization_id": org, "user_id": owner}))),
        ("company copilot", f.rpc("company_copilot_server", q(org), q(owner), "'context'", "'{}'::jsonb")),
    ):
        deny("OFF blocks " + name, set_full(org, False) + service(statement))
    ai = trial(set_full(org) + "reset role;update private.tc_modules set enabled=true where id='document_ai';" + access(org))
    pg.check("Manual Full: plan alone never opts in to AI or enables provider consent", not ai["features"]["document_ai"])
    quota = trial(set_full(org) + "reset role;update private.tc_modules set enabled=true where id='document_ai';"
        + "update private.tc_customers set ai_allowed=true,ai_opt_in=true where user_id=" + q(owner) + ";"
        + "insert into private.tc_document_ai_usage(organization_id,month,calls) values(" + q(org) + ",date_trunc('month',now())::date,99);"
        + service("select jsonb_build_object('one',public.tc_consume_document_ai(" + q(org) + "," + q(owner)
            + "),'two',public.tc_consume_document_ai(" + q(org) + "," + q(owner) + "))"))
    pg.check("Manual Full: preexisting AI consent still obeys the 100-call company cap", quota == {"one": True, "two": False})
    cap = (set_full(org) + "reset role;update private.tc_plans set max_trucks=null where id='full';" + context()
        + "insert into public.trucks(organization_id,plate,brand,model,year,inspection_due_on) select " + q(org)
        + ",'MANUAL-PG-CAP-'||n,'MAN','Synthetic',2026,'2027-01-01' from generate_series(1,49) n;")
    count = trial(cap + "select jsonb_build_object('trucks',count(*)) from public.trucks where organization_id=" + q(org))
    pg.check("Manual Full: 50-truck limit accepts its upper boundary even when plan max is NULL", count == {"trucks": 50})
    deny("51st truck is denied with Full plan max NULL", cap
        + "insert into public.trucks(organization_id,plate,brand,model,year,inspection_due_on) values(" + q(org)
        + ",'MANUAL-PG-OVER','MAN','Synthetic',2026,'2027-01-01')", "Has alcanzado")
    for statement in ("select * from private.tc_company_full_licenses", "select * from private.tc_company_full_audit",
            "select private.tc_company_full_state(" + q(org) + ")", "select private.tc_company_full_item(" + q(org) + ")"):
        deny("ordinary client cannot use raw licence/audit/internal helpers", context() + statement)
    deny("service worker cannot self-grant through the Root RPC", service(rpc("set", org, 0, f.op(253), {"enabled": True, "expires_at": None})))
    deny("service worker cannot write the private licence table", set_full(org) + service(
        "update private.tc_company_full_licenses set enabled=false where organization_id=" + q(org)))
    pg.check("Manual Full: rollback-only permission, business and quota cases leave no persisted drift",
        pg.database_fingerprint(pg.SOURCE) == baseline)

    # Durable concurrency covers first-insert CAS, lost ACK replay and a single
    # operation UUID reused across companies, using genuinely different psql PIDs.
    # Never UPDATE a shared settings row in the competing transactions: the
    # observed blocking must come from the controller's own serialization.
    original_flags = pg.value("select to_jsonb(s) from private.tc_settings s where id")
    pg.sql(flags)
    first = set_full(org, True, None, 0, f.op(260))
    contender = set_full(org, False, None, 0, f.op(261))
    pg.concurrent(first, contender, "company-full-first-cas", second_error="40001")
    count_audit = lambda company: pg.value("select jsonb_build_object('n',count(*),'revision',max(revision)) from private.tc_company_full_audit where organization_id=" + q(company))
    pg.check("Manual Full: concurrent first CAS commits one immutable revision", count_audit(org) == {"n": 1, "revision": 1})
    duplicate = set_full(sibling, True, None, 0, f.op(262))
    left, right = pg.concurrent(duplicate, duplicate, "company-full-operation-replay")
    decode = f.contracts.last_json
    pg.check("Manual Full: identical concurrent operation UUID replays exactly once",
        decode(left)["replayed"] is False and decode(right)["replayed"] is True
        and count_audit(sibling) == {"n": 1, "revision": 1})
    pg.concurrent(set_full(org, False, None, 1, f.op(263)),
        set_full(sibling, False, None, 1, f.op(263)), "company-full-operation-cross-company", second_error="22023")
    pg.check("Manual Full: cross-company operation conflict changes only the winning company",
        count_audit(org) == {"n": 2, "revision": 2} and count_audit(sibling) == {"n": 1, "revision": 1})
    replay = pg.value("begin;" + flags + set_full(org, True, None, 0, f.op(260)) + ";commit;")
    pg.check("Manual Full: lost-ACK retry after a newer OFF decision returns current state without resurrection",
        replay["replayed"] and replay["applied_revision"] == 1
        and replay["item"]["manual_full"]["revision"] == 2 and replay["item"]["manual_full"]["status"] == "disabled"
        and count_audit(org) == {"n": 2, "revision": 2})
    audit = pg.value("begin;" + flags + "update auth.users set email='fresh-manual-root@example.invalid' where id=" + q(f.ADMIN) + ";"
        + set_full(org, True, None, 2, f.op(264)) + root(rpc("history", org, data={"limit": 1})) + ";rollback;")
    last = audit["items"][0]
    pg.check("Manual Full: history captures fresh Auth actor email/time and ordered immutable before/after",
        last["actor_id"] == f.ADMIN and last["actor_email"] == "fresh-manual-root@example.invalid"
        and last["changed_at"] == audit["observed_at"] and last["revision"] == 3
        and last["before"]["enabled"] is False and last["after"]["enabled"] is True
        and audit["next_before_revision"] == 3)
    for statement in ("update private.tc_company_full_audit set actor_email='rewrite'",
            "delete from private.tc_company_full_audit", "truncate private.tc_company_full_audit"):
        pg.require_error("Manual Full: audit rejects owner mutation " + statement.split()[0], statement, "manual_invoice_intake_immutable")
    pg.require_error("Manual Full: function-only rollback refuses configured records including explicit OFF", rollback,
        "company_full_rollback_refuses_configured_companies")
    pg.sql("update private.tc_settings set enforce_access=" + ("true" if original_flags["enforce_access"] else "false")
        + ",sms_ready=" + ("true" if original_flags["sms_ready"] else "false")
        + ",payments_enabled=" + ("true" if original_flags["payments_enabled"] else "false")
        + ",prices_are_examples=" + ("true" if original_flags["prices_are_examples"] else "false") + " where id")
    pg.check("Manual Full: all commercial/payment/security switches retain their original values",
        pg.value("select to_jsonb(s) from private.tc_settings s where id") == original_flags)
    pg.REPORT["manual_company_full"] = {"provider_calls": 0, "payment_mutations": 0,
        "synthetic_licence_decisions": True, "real_lock_races": 3,
        "managed_supabase_acceptance": False, "native_auth_storage_acceptance": "separate harness"}
