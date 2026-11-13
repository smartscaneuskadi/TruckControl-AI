"""Owned unlinked-inbox races; only the isolated financial PostgreSQL harness.

Pending native orders are synthetic. Only the existing paid bridge may change
their entitlement; incident ingestion and Root declarations must not do so.
"""
from __future__ import annotations


class UnlinkedContracts:
    def __init__(self, pg, financial):
        self.pg, self.f = pg, financial

    def binding(self, payment):
        data = payment["data"]
        return {"request_id": data["request_id"], "user_id": data["user_id"],
            "checkout_id": data["checkout_id"], "mode": "subscription" if payment["monthly"] else "payment"}

    def ingest(self, payment, observation=None):
        f = self.f
        return f.service(f.rpc("tc_subscription_incident_ingest", f.q(f.ACCOUNT), f.q("test"),
            f.js(f.observation(payment) if observation is None else observation), f.js(self.binding(payment))))

    def paid(self, payment):
        f = self.f
        return f.service(f.rpc("tc_manual_subscription_apply_payment",
            f.q("subscription_invoice" if payment["monthly"] else "initial_payment"), f.q(f.ACCOUNT), f.js(payment["data"])))

    def business(self, payment):
        q, data = self.f.q, payment["data"]
        user, request = q(data["user_id"]), q(data["request_id"])
        return self.pg.value("select jsonb_build_object("
            "'customer',(select to_jsonb(c) from private.tc_customers c where user_id=" + user + "),"
            "'request',(select to_jsonb(r) from private.tc_payment_requests r where id=" + request + "),"
            "'tasks',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from private.tc_manual_subscription_invoice_tasks t where request_id=" + request + "),"
            "'receipts',(select coalesce(jsonb_agg(to_jsonb(r) order by provider_event_id),'[]') from private.tc_manual_stripe_bridge_receipts r where request_id=" + request + "),"
            "'invoices',(select coalesce(jsonb_agg(to_jsonb(i) order by invoice_id),'[]') from private.tc_subscription_invoices i where user_id=" + user + "),"
            "'subscriptions',(select coalesce(jsonb_agg(to_jsonb(b) order by provider_id),'[]') from private.tc_billing_subscriptions b where request_id=" + request + "),"
            "'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from private.tc_admin_audit a where actor_id=" + user + "),"
            "'notices',(select coalesce(jsonb_agg(to_jsonb(n) order by n.id),'[]') from private.tc_manual_invoice_notice_outbox n "
            "join private.tc_manual_subscription_invoice_tasks t on t.id=n.task_id where t.request_id=" + request + "))")

    def inbox(self, payment):
        request = self.f.q(payment["data"]["request_id"])
        return self.pg.value("select jsonb_build_object("
            "'cases',(select coalesce(jsonb_agg(to_jsonb(c) order by id),'[]') from private.tc_subscription_unlinked_cases c where request_id=" + request + "),"
            "'entries',(select coalesce(jsonb_agg(to_jsonb(e) order by e.row_version),'[]') from private.tc_subscription_unlinked_entries e "
            "join private.tc_subscription_unlinked_cases c on c.id=e.case_id where c.request_id=" + request + "))")

    def financial(self, payment):
        request = self.f.q(payment["data"]["request_id"])
        return self.pg.value("select jsonb_build_object("
            "'cases',(select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]') from private.tc_subscription_financial_cases c "
            "join private.tc_manual_subscription_invoice_tasks t on t.id=c.task_id where t.request_id=" + request + "),"
            "'entries',(select coalesce(jsonb_agg(to_jsonb(e) order by e.row_version),'[]') from private.tc_subscription_financial_entries e "
            "join private.tc_subscription_financial_cases c on c.id=e.case_id join private.tc_manual_subscription_invoice_tasks t on t.id=c.task_id where t.request_id=" + request + "))")

    def admin(self, action, case_id, expected=None, operation=None):
        f = self.f
        return f.admin(f.rpc("tc_admin_subscription_unlinked", f.q(action), f.q(case_id) + "::uuid",
            "null" if expected is None else str(expected), "null" if operation is None else f.q(operation) + "::uuid",
            f.js({} if action == "detail" else {"reason": "Synthetic isolated financial review", "evidence_reference": "Synthetic private reference"}),
            "null::uuid"))

    def check_paid_once(self, payment):
        saved = self.business(payment)
        self.pg.check("Only one real synthetic paid proof grants an entitlement for inbox buyer " + str(payment["n"]),
            saved["request"]["status"] == "paid" and saved["customer"]["paid_plan"] == "limited"
            and len(saved["tasks"]) == len(saved["receipts"]) == 1
            and len(saved["invoices"]) == len(saved["subscriptions"]) == int(payment["monthly"]))
        if payment["monthly"]:
            self.pg.check("Inbox race cannot extend monthly access beyond the actual invoice period for buyer " + str(payment["n"]),
                self.pg.value("select jsonb_build_object('ending',extract(epoch from paid_until)::bigint) from private.tc_customers where user_id="
                    + self.f.q(payment["data"]["user_id"])) == {"ending": payment["data"]["invoice_period_end"]})

    def duplicate_quarantine(self):
        pg, f = self.pg, self.f
        payment = f.create_payment(60, commit_payment=False)
        before = self.business(payment)
        left, right = pg.concurrent(self.ingest(payment), self.ingest(payment), "inbox-duplicate-ingest")
        first, duplicate = f.contracts.last_json(left), f.contracts.last_json(right)
        inbox = self.inbox(payment)
        pg.check("Two competing ingests create exactly one quarantine identity and immutable provider entry",
            first["recorded"] is True and first["target"] == "quarantined" and first["duplicate"] is False
            and duplicate["duplicate"] is True and duplicate["case_id"] == first["case_id"]
            and len(inbox["cases"]) == len(inbox["entries"]) == 1
            and inbox["entries"][0]["kind"] == "provider" and inbox["entries"][0]["row_version"] == 2)
        pg.check("Concurrent quarantine ingestion creates no paid task, licence, fiscal record or financial case",
            self.business(payment) == before and self.financial(payment) == {"cases": [], "entries": []})

        # The same Root operation may wait for the case lock and replay once;
        # it must remain actor-bound and cannot create a second declaration.
        review = self.admin("review", first["case_id"], 2, f.op(60))
        left, right = pg.concurrent(review, review, "inbox-root-operation-replay")
        pg.check("Root operation replay after a real inbox row-lock wait records one declaration",
            f.contracts.last_json(left) == f.contracts.last_json(right)
            and [entry["kind"] for entry in self.inbox(payment)["entries"]] == ["provider", "review"])
        pg.require_error("A distinct stale Root operation cannot append a second inbox declaration",
            "begin;" + self.admin("dismiss", first["case_id"], 2, f.op(61)) + ";commit;", "40001")
        pg.check("Root inbox declarations cannot invent paid access or fiscal work", self.business(payment) == before)

        updated = {**f.observation(payment), "event_id": f.observation(payment)["event_id"] + "Updated", "event_type": "refund.updated"}
        pg.concurrent(self.ingest(payment, updated), self.admin("review", first["case_id"], 3, f.op(62)),
            "inbox-provider-versus-root-cas", second_error="40001")
        pg.check("A concurrent provider observation invalidates stale Root CAS and reopens review without granting access",
            [entry["kind"] for entry in self.inbox(payment)["entries"]] == ["provider", "review", "provider"]
            and f.result(self.admin("detail", first["case_id"]))["items"][0]["review_state"] == "pending"
            and self.business(payment) == before)

        paid = f.result(self.paid(payment))
        linked = self.inbox(payment)
        links = [entry for entry in linked["entries"] if entry["kind"] == "linked"]
        detail = f.result(self.admin("detail", first["case_id"]))["items"][0]
        pg.check("A delayed genuine one-off receipt links the reviewed quarantine once without another incident retry",
            paid["received"] is True and len(links) == 1
            and links[0]["data"] == {"task_id": paid["task_id"], "receipt_event_id": payment["data"]["provider_event_id"],
                "queued_event_id": updated["event_id"]}
            and detail["review_state"] == "pending" and detail["link_state"] == "linked_to_existing_payment"
            and [entry["row_version"] for entry in linked["entries"]] == [2, 3, 4, 5]
            and self.financial(payment) == {"cases": [], "entries": []})
        self.check_paid_once(payment)
        pg.require_error("Linked inbox evidence remains append-only after payment",
            "delete from private.tc_subscription_unlinked_entries where case_id=" + f.q(first["case_id"]),
            "manual_invoice_intake_immutable")

    def paid_ingest_orders(self):
        pg, f = self.pg, self.f
        for n, quarantine_first in ((61, True), (62, False)):
            payment = f.create_payment(n, True, commit_payment=False)
            before = self.business(payment)
            first, second = (self.ingest(payment), self.paid(payment)) if quarantine_first else (self.paid(payment), self.ingest(payment))
            left, right = pg.concurrent(first, second,
                "inbox-quarantine-first" if quarantine_first else "inbox-payment-first")
            results = [f.contracts.last_json(left), f.contracts.last_json(right)]
            paid, incident = (results[1], results[0]) if quarantine_first else (results[0], results[1])
            inbox, native = self.inbox(payment), self.financial(payment)
            pg.check("Customer/request locking accepts both the genuine payment and owned incident with quarantine_first=" + str(quarantine_first),
                paid["received"] is True and incident["recorded"] is True
                and before["tasks"] == before["receipts"] == [] and before["customer"]["paid_until"] is None)
            if quarantine_first:
                links = [entry for entry in inbox["entries"] if entry["kind"] == "linked"]
                pg.check("Quarantine-first commit auto-links exactly one existing receipt/task without waiting for an incident retry",
                    incident["target"] == "quarantined" and len(inbox["cases"]) == 1 and len(inbox["entries"]) == 2
                    and len(links) == 1 and links[0]["row_version"] == 3
                    and links[0]["data"] == {"task_id": paid["task_id"], "receipt_event_id": payment["data"]["provider_event_id"],
                        "queued_event_id": f.observation(payment)["event_id"]}
                    and native == {"cases": [], "entries": []})
            else:
                pg.check("Payment-first commit uses one normal financial entry and creates no artificial quarantine row",
                    incident["target"] == "linked" and inbox == {"cases": [], "entries": []}
                    and len(native["cases"]) == len(native["entries"]) == 1
                    and native["cases"][0]["task_id"] == paid["task_id"]
                    and native["entries"][0]["provider_event_id"] == f.observation(payment)["event_id"])
            self.check_paid_once(payment)
            saved = self.business(payment)
            f.result(self.ingest(payment))
            duplicate = f.result(self.ingest(payment))
            final_native = self.financial(payment)
            pg.check("Incident retries preserve paid entitlement and one canonical provider entry with quarantine_first=" + str(quarantine_first),
                duplicate["recorded"] is True and duplicate["target"] == "linked" and duplicate["duplicate"] is True
                and self.business(payment) == saved and self.inbox(payment) == inbox
                and len(final_native["cases"]) == len(final_native["entries"]) == 1)


def run(pg, financial):
    pg.check("The integrated owned-inbox migration and paid-receipt trigger are installed",
        pg.value("select jsonb_build_object('ingest',to_regprocedure('public.tc_subscription_incident_ingest(text,text,jsonb,jsonb)') is not null,"
            "'trigger',exists(select 1 from pg_trigger where tgname='tc_subscription_unlinked_receipt_inserted' and not tgisinternal))")
        == {"ingest": True, "trigger": True})
    contracts = UnlinkedContracts(pg, financial)
    contracts.duplicate_quarantine()
    contracts.paid_ingest_orders()
