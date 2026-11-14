"""Canonical refresh on synthetic buyers; real PostgreSQL sessions/row locks.

No HTTP, external database, provider key or paid event is generated here.
The caller's existing pinned disposable-service guard remains mandatory.
"""
from __future__ import annotations
import json


def run(pg, f):
    def sid(n):
        return "fd660000-0000-4000-8000-" + str(n).zfill(12)

    def setup(n):
        p = f.create_payment(n, True)
        pg.sql("insert into auth.sessions(id,user_id) values(" + f.q(sid(n)) + "," + f.q(p["data"]["user_id"]) + ");")
        return p

    def call(p, action, operation, data=None):
        return f.service(f.rpc("tc_subscription_snapshot_refresh", f.q(action),
            f.q(p["data"]["user_id"]) + "::uuid", f.q(sid(p["n"])) + "::uuid",
            f.q(f.op(operation)) + "::uuid", f.js(data or {})))

    def observe(p, operation):
        return f.result(call(p, "observe", operation))

    def payload(p, operation):
        d = p["data"]
        return {"request_id": d["request_id"], "subscription_id": d["subscription_id"],
            "customer_id": d["customer_id"], "snapshot_revision": observe(p, operation)["snapshot_revision"],
            "state": "active", "cancel_at_period_end": True,
            "period_end": d["subscription_current_period_end"], "unit_amount": 36300, "currency": "EUR"}

    def state(p):
        return pg.value("select jsonb_build_object('subscription',to_jsonb(s),'refreshes',"
            "(select coalesce(jsonb_agg(to_jsonb(a) order by operation_id),'[]') from private.tc_subscription_snapshot_refreshes a where a.subscription_id=s.provider_id))"
            " from private.tc_billing_subscriptions s where provider_id=" + f.q(p["data"]["subscription_id"]))

    p = setup(80)
    pg.sql("update private.tc_billing_subscriptions set state='canceled',reconciliation_required=true where provider_id=" + f.q(p["data"]["subscription_id"]))
    original, before = f.original(p), state(p)
    data = payload(p, 80)
    accepted = f.result(call(p, "commit", 80, data))
    after = state(p)
    pg.check("Explicit canonical refresh resolves a terminal pending snapshot without a fabricated event",
        accepted == {"refreshed": True, "duplicate": False}
        and after["subscription"]["state"] == "active"
        and after["subscription"]["reconciliation_required"] is False
        and after["subscription"]["event_created"] == before["subscription"]["event_created"]
        and len(after["refreshes"]) == 1 and f.original(p) == original)
    pg.check("Refresh UUID replay is idempotent and does not create a paid receipt or invoice",
        f.result(call(p, "commit", 80, data)) == {"refreshed": True, "duplicate": True}
        and state(p) == after and f.original(p) == original)
    for role in ("anon", "authenticated"):
        pg.require_error("Refresh provider mutation rejects browser role " + role,
            "begin;set local role " + role + ";" + f.rpc("tc_subscription_snapshot_refresh", "'observe'", "null::uuid", "null::uuid", "null::uuid", "'{}'::jsonb") + ";rollback;", "42501")
        pg.require_error("Refresh ledger rejects browser reads " + role,
            "begin;set local role " + role + ";select * from private.tc_subscription_snapshot_refreshes;rollback;", "42501")
    pg.require_error("Refresh audit is immutable even to its owner",
        "begin;update private.tc_subscription_snapshot_refreshes set canonical='{}' where operation_id=" + f.q(f.op(80)) + ";rollback;", "manual_invoice_intake_immutable")
    pg.check("Denied mutation leaves the complete canonical receipt unchanged", state(p) == after)

    # Two independent connections race with the SAME observed revision.
    p = setup(81)
    data = payload(p, 81)
    original = f.original(p)
    outputs = pg.concurrent(call(p, "commit", 81, data), call(p, "commit", 181, {**data, "cancel_at_period_end": False}), "subscription-explicit-refresh-cas")
    responses = [next(json.loads(line) for line in out.decode().splitlines() if line.startswith("{")) for out in outputs]
    pg.check("Only one competing canonical refresh commits, loser must observe/GET again",
        responses == [{"refreshed": True, "duplicate": False}, {"reconcile_required": True}]
        and len(state(p)["refreshes"]) == 1 and f.original(p) == original)
    pg.check("A fresh revision resolves the loser without changing its paid access",
        f.result(call(p, "commit", 181, {**payload(p, 181), "cancel_at_period_end": False})) == {"refreshed": True, "duplicate": False}
        and state(p)["subscription"]["cancel_at_period_end"] is False and f.original(p) == original)

    p = setup(82)
    data = payload(p, 82)
    pg.concurrent(call(p, "commit", 82, data), call(p, "commit", 82, data), "subscription-explicit-refresh-operation-replay")
    pg.check("Concurrent identical refresh UUID has one durable audited snapshot", len(state(p)["refreshes"]) == 1)

    p = setup(83)
    data = payload(p, 83)
    before, original = state(p), f.original(p)
    pg.concurrent("delete from auth.sessions where id=" + f.q(sid(83)), call(p, "commit", 83, data),
        "subscription-explicit-refresh-logout", second_error="42501")
    pg.check("Logout that commits first prevents the in-flight provider response being persisted",
        state(p) == before and f.original(p) == original)

    # Trigger a failure only after the state UPDATE to prove atomic rollback.
    p = setup(84)
    data = payload(p, 84)
    before = state(p)
    pg.sql("create function private.snapshot_refresh_ci_fail() returns trigger language plpgsql as $$begin raise exception 'synthetic_snapshot_refresh_audit_failure';end$$;"
        "create trigger snapshot_refresh_ci_fail before insert on private.tc_subscription_snapshot_refreshes for each row execute function private.snapshot_refresh_ci_fail();")
    try:
        pg.require_error("Failed refresh audit rolls back the whole canonical commit",
            "begin;" + call(p, "commit", 84, data) + ";commit;", "synthetic_snapshot_refresh_audit_failure")
    finally:
        pg.sql("drop trigger snapshot_refresh_ci_fail on private.tc_subscription_snapshot_refreshes;drop function private.snapshot_refresh_ci_fail();")
    pg.check("Failed canonical refresh leaves no partial state or audit", state(p) == before)

    p = setup(85)
    # Distinct UUIDs share the same SQL cadence, independent of browser state.
    for operation in (85, 185, 285):
        pg.check("Canonical observation consumes a durable owner permit " + str(operation),
            observe(p, operation).get("available") is True)
    pg.check("Fourth distinct UUID is throttled before any provider GET",
        observe(p, 385) == {"throttled": True, "retry_after_seconds": 60})
    pg.require_error("Canonical observation permits are immutable",
        "begin;delete from private.tc_subscription_snapshot_refresh_attempts where actor_id=" + f.q(p["data"]["user_id"]) + ";rollback;", "manual_invoice_intake_immutable")
    pg.REPORT["canonical_refresh"] = {"provider_calls": 0, "paid_mutations": 0, "real_lock_races": 3,
        "managed_supabase_acceptance": False}
