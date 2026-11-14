"""Early fraud warning contracts for the existing isolated PostgreSQL harness.

Only synthetic rows and competing local psql sessions. No Stripe/Supabase calls.
Use run(pg, financial) before the harness dump/restore; fixture IDs 90--94.
"""
from __future__ import annotations


class RiskContracts:
    def __init__(self, pg, financial):
        self.pg, self.f = pg, financial

    def observation(self, payment, suffix="A"):
        f, data = self.f, payment["data"]
        n = str(payment["n"])
        return {
            "event_id": "evt_RiskPG" + n + suffix,
            "event_type": "radar.early_fraud_warning.created" if suffix == "A" else "radar.early_fraud_warning.updated",
            "event_created": self.pg.REPORT["epoch"] - 2, "livemode": False,
            "warning_id": "issfr_RiskPG" + n, "warning_created": self.pg.REPORT["epoch"] - 3,
            "actionable_at_event": True, "actionable_now": True,
            "fraud_type_at_event": "misc", "fraud_type_now": "misc",
            "payment_intent_id": "pi_IncidentPG" + n, "charge_id": "ch_IncidentPG" + n,
            "customer_id": data["customer_id"], "charge_amount_cents": 36300, "currency": "EUR",
            "invoice_id": data.get("invoice_id"), "subscription_id": data.get("subscription_id"),
            "invoice_payment_id": "inpay_IncidentPG" + n if payment["monthly"] else None,
            "invoice_period_start": data.get("invoice_period_start"),
            "invoice_period_end": data.get("invoice_period_end"),
        }

    def record(self, data, account=None):
        f = self.f
        return f.service(f.rpc("tc_subscription_risk_record", f.q(account or f.ACCOUNT), f.q("test"), f.js(data)))

    def admin(self, action, case_id, expected=None, operation=None, note="Synthetic isolated risk review"):
        f = self.f
        return f.admin(f.rpc("tc_admin_subscription_risk", f.q(action), f.q(case_id) + "::uuid",
            "null" if expected is None else str(expected), "null" if operation is None else f.q(operation) + "::uuid",
            f.js({"note": note} if action == "review" else {}), "null::uuid"))

    def count(self, case_id):
        return self.pg.value("select jsonb_build_object('n',count(*),'max',max(row_version)) "
            "from private.tc_subscription_risk_entries where case_id=" + self.f.q(case_id))

    def races(self):
        pg, f = self.pg, self.f
        payment = f.create_payment(90)
        before = f.original(payment)
        data = self.observation(payment)
        left, right = pg.concurrent(self.record(data), self.record(data), "risk-provider-duplicate")
        first, duplicate = f.contracts.last_json(left), f.contracts.last_json(right)
        case_id = first["case_id"]
        pg.check("EFW: duplicate real PostgreSQL deliveries append once before both ACKs",
            first["duplicate"] is False and duplicate["duplicate"] is True and duplicate["case_id"] == case_id
            and self.count(case_id) == {"n": 1, "max": 2})
        pg.concurrent(self.record(self.observation(payment, "B")), self.record(self.observation(payment, "C")),
            "risk-provider-sequence")
        pg.check("EFW: competing provider events retain unique increasing immutable versions",
            self.count(case_id) == {"n": 3, "max": 4})
        pg.concurrent(self.admin("review", case_id, 4, f.op(90)), self.admin("review", case_id, 4, f.op(91)),
            "risk-root-cas", second_error="40001")
        pg.check("EFW: two stale Root writers produce one declaration and one CAS conflict",
            self.count(case_id) == {"n": 4, "max": 5})
        review = self.admin("review", case_id, 5, f.op(92))
        left, right = pg.concurrent(review, review, "risk-root-replay")
        first, duplicate = f.contracts.last_json(left), f.contracts.last_json(right)
        pg.check("EFW: the same concurrent Root operation replays once without a second review",
            first["replayed"] is False and duplicate["replayed"] is True
            and first["operation"] == duplicate["operation"] and self.count(case_id) == {"n": 5, "max": 6})
        pg.concurrent(self.record(self.observation(payment, "D")), self.admin("review", case_id, 6, f.op(93)),
            "risk-provider-root-cas", second_error="40001")
        view = f.result(self.admin("detail", case_id))["items"][0]
        pg.check("EFW: a newly observed provider warning invalidates stale review with no economic decision",
            view["review_state"] == "pending" and view["row_version"] == 7
            and self.count(case_id) == {"n": 6, "max": 7} and f.original(payment) == before)
        # Mutable GET state is not the identity of the original immutable Event.
        replay = f.result(self.record({**data, "actionable_now": False}))
        pg.check("EFW: changed current actionable state cannot rewrite a duplicate original observation",
            replay["duplicate"] is True and self.count(case_id) == {"n": 6, "max": 7})
        return case_id

    def atomic_and_owned(self):
        pg, f = self.pg, self.f
        payment = f.create_payment(91)
        before = f.original(payment)
        data = self.observation(payment)
        pg.sql("create function private.risk_ci_fail() returns trigger language plpgsql as $fail$ begin "
            "if new.provider_event_id='evt_RiskPG91A' then raise exception 'synthetic_risk_failure';end if;return new;end;$fail$;"
            "create trigger risk_ci_fail before insert on private.tc_subscription_risk_entries "
            "for each row execute function private.risk_ci_fail();")
        try:
            pg.require_error("EFW: first-observation persistence failure aborts the complete transaction",
                "begin;" + self.record(data) + ";commit;", "synthetic_risk_failure")
        finally:
            pg.sql("drop trigger risk_ci_fail on private.tc_subscription_risk_entries;drop function private.risk_ci_fail();")
        pg.check("EFW: failed observation creates no orphan identity and changes no business data",
            pg.value("select jsonb_build_object('n',count(*)) from private.tc_subscription_risk_entries where task_id="
                + f.q(payment["task"])) == {"n": 0} and f.original(payment) == before)
        monthly, foreign = f.create_payment(92, True), f.create_payment(93, True)
        base = self.observation(monthly)
        case_id = f.result(self.record(base))["case_id"]
        for name, changes in (
            ("foreign invoice", {"invoice_id": foreign["data"]["invoice_id"]}),
            ("foreign customer", {"customer_id": foreign["data"]["customer_id"]}),
            ("client-selected company", {"company_id": foreign["data"]["company_id"]}),
            ("cross-period", {"invoice_period_start": base["invoice_period_start"] + 1}),
        ):
            pg.require_error("EFW: native binding rejects " + name,
                "begin;" + self.record({**base, "event_id": base["event_id"] + "Foreign", **changes}) + ";commit;",
                "22023" if name == "client-selected company" else "23514")
        pg.require_error("EFW: canonical warning identity cannot be rebound to a second genuine tenant payment",
            "begin;" + self.record({**self.observation(foreign), "warning_id": base["warning_id"]}) + ";commit;", "23514")
        pg.require_error("EFW: service recorder cannot infer a tenant for an unmapped payment",
            "begin;" + self.record({**base, "invoice_id": "in_UnmappedRisk"}) + ";commit;", "23514")
        # Lack of a paid receipt is retryable; observing the warning never creates it.
        pending = f.create_payment(94, commit_payment=False)
        pg.require_error("EFW: a pre-receipt warning remains unacknowledged, never invents a licence/task",
            "begin;" + self.record(self.observation(pending)) + ";commit;", "23514")
        pg.check("EFW: pending warning leaves the unpaid request and task inventory unchanged",
            pg.value("select jsonb_build_object('status',status,'n',"
                "(select count(*) from private.tc_manual_subscription_invoice_tasks where request_id="
                + f.q(pending["data"]["request_id"]) + ")) from private.tc_payment_requests where id="
                + f.q(pending["data"]["request_id"])) == {"status": "checkout", "n": 0})
        return case_id

    def acl(self, case_id):
        pg, f = self.pg, self.f
        caps = f.result(self.admin("capabilities", case_id))
        pg.check("EFW: operator capabilities cannot imply refunds, licence edits or fiscal issuance",
            caps["informational_only"] is True and all(caps[k] is False for k in
                ("refunds_available", "license_changes_available", "fiscal_emission_available")))
        for role in ("anon", "authenticated", "service_role"):
            pg.require_error("EFW: " + role + " cannot directly read the private signal ledger",
                "begin;set local role " + role + ";select * from private.tc_subscription_risk_entries;commit;", "42501")
        pg.require_error("EFW: service-role credentials cannot impersonate the human Root reviewer",
            "begin;" + f.service(f.rpc("tc_admin_subscription_risk", f.q("capabilities"))) + ";commit;", "42501")
        pg.require_error("EFW: even the table owner cannot mutate the audit log",
            "update private.tc_subscription_risk_entries set data='{}' where case_id=" + f.q(case_id),
            "manual_invoice_intake_immutable")
        # Replayed administrative declarations still need the current live SID.
        claims = {"sub": f.ADMIN, "role": "authenticated", "session_id": f.op(99)}
        denied = ("set local role authenticated;select set_config('request.jwt.claim.sub'," + f.q(f.ADMIN)
            + ",true);select set_config('request.jwt.claims'," + f.js(claims) + "::text,true);"
            + f.rpc("tc_admin_subscription_risk", f.q("detail"), f.q(case_id) + "::uuid"))
        pg.require_error("EFW: a forged/missing live SID cannot read the risk ledger", "begin;" + denied + ";commit;", "42501")


def run(pg, financial):
    pg.check("EFW candidate recorder exists only in the isolated migrated schema",
        pg.value("select jsonb_build_object('present',to_regprocedure('public.tc_subscription_risk_record(text,text,jsonb)') is not null)")["present"])
    contract = RiskContracts(pg, financial)
    case_id = contract.races()
    contract.atomic_and_owned()
    contract.acl(case_id)
