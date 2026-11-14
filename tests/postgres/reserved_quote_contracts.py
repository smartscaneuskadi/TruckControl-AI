"""Saved quote recovery in the existing pinned disposable PostgreSQL service.

The shared SQL is also executed by PGlite. Real connections below prove that
the existing customer/request/reservation locks serialize recovery and provider
expiry. No HTTP, Stripe SDK, credentials, paid event or fiscal issuance occurs.
"""
from __future__ import annotations

import json


def last_json(output):
    return [json.loads(line) for line in output.decode().splitlines() if line.startswith("{")][-1]


def run(pg, f):
    baseline = pg.database_fingerprint(pg.SOURCE)
    contract = pg.value("begin;" + (f.ROOT / "tests/postgres/reserved_quote_contract.sql").read_text() + ";rollback;")
    pg.check("Reserved quote shared contract has no provider or paid mutation",
        contract["contract"] == "reserved-recurring-quote-age-v1"
        and contract["provider_calls"] == contract["paid_mutations"] == 0
        and contract["rollback_required"] is True and len(contract["checks"]) == 27)
    for name in contract["checks"]:
        pg.check("Reserved quote: " + name, True)
    pg.check("Shared saved quote SQL rolls back every row, function, flag and permission",
        pg.database_fingerprint(pg.SOURCE) == baseline)

    def call(p, action):
        d = p["data"]
        data = {"user_id": d["user_id"], "request_id": d["request_id"],
            "terms_accepted": True, "terms_version": "synthetic-reserved-quote-v1"}
        if action != "prepare":
            data["checkout_id"] = d["checkout_id"]
        return f.service(f.rpc("tc_recurring_billing", f.q(action), f.js(data)))

    def setup(n):
        p = f.create_payment(n, commit_payment=False)
        pg.sql("update private.tc_settings set payments_enabled=true,prices_are_examples=false where id;"
            "update private.tc_payment_requests set status='requested',checkout_id=null,created_at=now()-interval '23 hours' where id=" + f.q(p["data"]["request_id"]))
        f.result(call(p, "prepare"))
        f.result(call(p, "saved"))
        pg.sql("update private.tc_payment_requests set created_at=created_at-interval '2 hours' where id=" + f.q(p["data"]["request_id"]) + ";"
            "update private.tc_subscription_orders set created_at=created_at-interval '2 hours',terms_accepted_at=terms_accepted_at-interval '2 hours',expires_at=expires_at-interval '2 hours' where user_id=" + f.q(p["data"]["user_id"]))
        return p

    def state(p):
        user, request = f.q(p["data"]["user_id"]), f.q(p["data"]["request_id"])
        return pg.value("select jsonb_build_object("
            "'customer',(select to_jsonb(c) from private.tc_customers c where user_id=" + user + "),"
            "'request',(select to_jsonb(r) from private.tc_payment_requests r where id=" + request + "),"
            "'reservation',(select to_jsonb(o) from private.tc_subscription_orders o where user_id=" + user + "),"
            "'subscriptions',(select count(*) from private.tc_billing_subscriptions where user_id=" + user + "),"
            "'invoices',(select count(*) from private.tc_subscription_invoices where user_id=" + user + "),"
            "'tasks',(select count(*) from private.tc_manual_subscription_invoice_tasks where buyer_user_id=" + user + "))")

    initial_flags = pg.value("select to_jsonb(s) from private.tc_settings s where id")
    try:
        p = setup(170)
        before = state(p)
        left, right = pg.concurrent(call(p, "prepare"), call(p, "prepare"), "reserved-quote-duplicate-prepare")
        pg.check("Concurrent saved quote recovery returns the same Checkout with unchanged lease and access",
            last_json(left)["checkout_id"] == last_json(right)["checkout_id"] == p["data"]["checkout_id"]
            and last_json(left)["available"] is last_json(right)["available"] is True
            and state(p) == before)

        p = setup(171)
        pg.concurrent(call(p, "checkout_expired"), call(p, "prepare"), "reserved-quote-expiry-wins",
            second_error="Vuelve a solicitar el plan")
        after = state(p)
        pg.check("Provider expiry committed first prevents stale recovery or a replacement reservation",
            after["reservation"] is None and after["request"]["status"] == "cancelled"
            and after["subscriptions"] == after["invoices"] == after["tasks"] == 0)

        p = setup(172)
        pg.concurrent(call(p, "prepare"), call(p, "checkout_expired"), "reserved-quote-prepare-before-expiry")
        after = state(p)
        pg.check("Provider expiry serialized after recovery releases its reservation without resurrection",
            after["reservation"] is None and after["request"]["status"] == "cancelled"
            and after["subscriptions"] == after["invoices"] == after["tasks"] == 0)
        pg.require_error("Expired saved quote cannot be prepared again after both transactions complete",
            "begin;" + call(p, "prepare") + ";commit;", "Vuelve a solicitar el plan")
        pg.check("Denied post-expiry retry leaves the complete buyer state unchanged", state(p) == after)
    finally:
        pg.sql("update private.tc_settings set payments_enabled=" + ("true" if initial_flags["payments_enabled"] else "false")
            + ",prices_are_examples=" + ("true" if initial_flags["prices_are_examples"] else "false") + " where id;")
    pg.check("Saved quote concurrency restores the original commercial switches",
        pg.value("select to_jsonb(s) from private.tc_settings s where id") == initial_flags)
    pg.REPORT["reserved_quote_recovery"] = {"provider_calls": 0, "paid_mutations": 0,
        "shared_sql_checks": 27, "real_lock_races": 3, "managed_supabase_acceptance": False}
