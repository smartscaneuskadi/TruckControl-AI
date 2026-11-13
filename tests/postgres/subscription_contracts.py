"""Synthetic dp_/subscription CAS contracts on the verified PostgreSQL service.

No provider client, HTTP endpoint, external database URL or real customer input.
The local opt-in requires a disposable pinned-image container with no network,
published port, bind mount or privileged host access. CI retains its existing
service-container guard and runs these contracts before its logical restore.
"""
from __future__ import annotations

import json
import os
import re

DISPUTE_MIGRATION = "20261113064846_subscription_dispute_id_prefix.sql"
ORDERING_MIGRATION = "20261113065440_subscription_snapshot_ordering.sql"
LOCAL_LABEL = "subscription-ordering-20261113"
EXTERNAL_CREDENTIALS = (
    "DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ACCESS_TOKEN",
    "STRIPE_SECRET_KEY", "STRIPE_API_KEY", "STRIPE_WEBHOOK_SECRET", "OPENAI_API_KEY",
)


def verify_local_target(pg, environment=None):
    environment = os.environ if environment is None else environment
    if (environment.get("TRUCKCONTROL_LOCAL_POSTGRES_CONTRACT") != "synthetic-only"
            or not re.fullmatch(r"[0-9a-f]{12,64}", pg.CONTAINER)):
        raise AssertionError("Explicit disposable synthetic PostgreSQL contract opt-in is required")
    if environment.get("DOCKER_HOST") != "unix:///var/run/docker.sock" or any(
            environment.get(name) for name in (
                "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH")):
        raise AssertionError("Only the explicit managed local Docker socket is accepted")
    if any(environment.get(name) for name in EXTERNAL_CREDENTIALS):
        raise AssertionError("External credentials must be absent")
    inspected = json.loads(pg.run(["docker", "inspect", pg.CONTAINER]).stdout)[0]
    image = json.loads(pg.run(["docker", "image", "inspect", pg.IMAGE]).stdout)[0]
    host = inspected["HostConfig"]
    ports = inspected.get("NetworkSettings", {}).get("Ports", {}) or {}
    expected_digest = pg.IMAGE.split("@", 1)[1]
    if (inspected.get("Config", {}).get("Image") != pg.IMAGE
            or inspected.get("Image") != image.get("Id")
            or not any(digest.endswith("@" + expected_digest) for digest in image.get("RepoDigests", []))
            or inspected.get("Config", {}).get("Labels", {}).get("truckcontrol.acceptance") != LOCAL_LABEL
            or host.get("NetworkMode") != "none" or host.get("PortBindings")
            or any(ports.values()) or host.get("Binds") or host.get("VolumesFrom")
            or host.get("Privileged") or host.get("PidMode") == "host"
            or host.get("IpcMode") == "host"
            or any(mount.get("Type") != "volume" for mount in inspected.get("Mounts", []))):
        raise AssertionError("Container must be pinned, labelled, networkless and isolated from host services/files")
    return inspected, image


def last_json(output):
    text = output.decode() if isinstance(output, bytes) else output
    return [json.loads(line) for line in text.splitlines() if line.startswith("{")][-1]


class Contracts:
    def __init__(self, pg, financial):
        self.pg, self.f = pg, financial

    def lifecycle_data(self, payment, event_id, cancel, revision=None, **overrides):
        data = payment["data"]
        result = {
            "user_id": data["user_id"], "request_id": data["request_id"],
            "subscription_id": data["subscription_id"], "customer_id": data["customer_id"],
            "event_id": event_id, "event_type": "customer.subscription.updated",
            "event_created": self.pg.REPORT["epoch"], "state": "active",
            "cancel_at_period_end": cancel, "period_end": data["subscription_current_period_end"],
            "unit_amount": 36300, "currency": "EUR", "invoice_paid": False,
        }
        if revision is not None:
            result["snapshot_revision"] = revision
        return {**result, **overrides}

    def lifecycle(self, data):
        return self.f.service(self.f.rpc("tc_recurring_billing", self.f.q("event"), self.f.js(data)))

    def observe(self, payment):
        return self.f.result(self.f.service(self.f.rpc("tc_recurring_billing", self.f.q("observe"),
            self.f.js({"subscription_id": payment["data"]["subscription_id"]}))))["snapshot_revision"]

    def snapshot(self, payment):
        q, data = self.f.q, payment["data"]
        subscription_id, user, request = q(data["subscription_id"]), q(data["user_id"]), q(data["request_id"])
        return self.pg.value("select jsonb_build_object("
            "'subscription',(select to_jsonb(b) from private.tc_billing_subscriptions b where provider_id=" + subscription_id + "),"
            "'events',(select coalesce(jsonb_agg(to_jsonb(e) order by event_id),'[]') from private.tc_subscription_events e where subscription_id=" + subscription_id + "),"
            "'invoices',(select coalesce(jsonb_agg(to_jsonb(i) order by invoice_id),'[]') from private.tc_subscription_invoices i where subscription_id=" + subscription_id + "),"
            "'customer',(select to_jsonb(c) from private.tc_customers c where user_id=" + user + "),"
            "'request',(select to_jsonb(r) from private.tc_payment_requests r where id=" + request + "),"
            "'tasks',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from private.tc_manual_subscription_invoice_tasks t where request_id=" + request + "),"
            "'receipts',(select coalesce(jsonb_agg(to_jsonb(r) order by provider_event_id),'[]') from private.tc_manual_stripe_bridge_receipts r where request_id=" + request + "),"
            "'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from private.tc_admin_audit a where target_id=" + subscription_id + "),"
            "'notices',(select coalesce(jsonb_agg(to_jsonb(n) order by n.id),'[]') from private.tc_manual_invoice_notice_outbox n "
            "join private.tc_manual_subscription_invoice_tasks t on t.id=n.task_id where t.request_id=" + request + "))")

    def dispute(self, payment, suffix="A", prefix="dp"):
        return {**self.f.observation(payment, suffix),
            "event_id": "evt_IncidentPGDispute" + str(payment["n"]) + suffix,
            "event_type": "charge.dispute.created", "object_type": "dispute",
            "object_id": prefix + "_IncidentPG" + str(payment["n"]),
            "status_at_event": "needs_response", "current_status": "needs_response",
            "event_amount_cents": 10000, "current_amount_cents": 10000,
            "charge_amount_refunded_cents": 0,
        }

    def upgrade_contracts(self):
        pg, f = self.pg, self.f
        # Install the frozen body only inside a rollback-only isolated test,
        # seed historical du_ evidence, then apply the actual additive fix.
        payment = f.create_payment(20)
        old = (f.ROOT / "supabase/migrations/20261108134217_subscription_payment_incidents.sql").read_text()
        start = old.index("create function private.tc_manual_subscription_record_incident(")
        end = old.index("end;$record$;", start) + len("end;$record$;")
        old = old[start:end].replace("create function ", "create or replace function ", 1)
        target = "'private.tc_manual_subscription_record_incident(text,text,jsonb)'::regprocedure"
        evidence = "select coalesce(jsonb_agg(to_jsonb(e) order by e.row_version),'[]') from private.tc_subscription_financial_entries e where case_id in (select id from private.tc_subscription_financial_cases where task_id=" + f.q(payment["task"]) + ")"
        identity = "select jsonb_build_object('oid',oid,'acl',proacl::text,'definer',prosecdef,'config',proconfig) from pg_proc where oid=" + target
        output = pg.sql("begin;" + old + ";" + f.record(self.dispute(payment, prefix="du")) + ";reset role;"
            "create temp table dispute_upgrade_before as select (" + identity + ") identity,(" + evidence + ") evidence;"
            + (f.ROOT / "supabase/migrations" / DISPUTE_MIGRATION).read_text() + ";"
            "select jsonb_build_object('identity',(" + identity + ")=(select identity from dispute_upgrade_before),"
            "'evidence',(" + evidence + ")=(select evidence from dispute_upgrade_before),"
            "'legacy_id',(" + evidence + ")->0->'data'->>'object_id');rollback;")
        result = last_json(output)
        pg.check("dp_ upgrade preserves real function OID/ACL and immutable historical du_ evidence",
            result == {"identity": True, "evidence": True, "legacy_id": "du_IncidentPG20"})
        pg.check("Rollback-only legacy upgrade leaves no fixture incident or obsolete function body",
            pg.value("select jsonb_build_object('cases',count(*)) from private.tc_subscription_financial_cases where task_id=" + f.q(payment["task"])) == {"cases": 0})

        payment = f.create_payment(21, True)
        before = self.snapshot(payment)
        old = (f.ROOT / "supabase/migrations/20261031181317_recurring_subscriptions.sql").read_text()
        old = old[old.index("create function public.tc_recurring_billing"):old.index("\nrevoke all on function")]
        old = old.replace("create function ", "create or replace function ", 1)
        target = "'public.tc_recurring_billing(text,jsonb)'::regprocedure"
        identity = "select jsonb_build_object('oid',oid,'acl',proacl::text,'invoker',not prosecdef,'config',proconfig) from pg_proc where oid=" + target
        historic = "select to_jsonb(b)-'snapshot_revision'-'reconciliation_required' from private.tc_billing_subscriptions b where provider_id=" + f.q(payment["data"]["subscription_id"])
        output = pg.sql("begin;alter table private.tc_billing_subscriptions drop column snapshot_revision,drop column reconciliation_required;"
            + old + ";create temp table ordering_upgrade_before as select (" + identity + ") identity,(" + historic + ") historic;"
            + (f.ROOT / "supabase/migrations" / ORDERING_MIGRATION).read_text() + ";"
            "select jsonb_build_object('identity',(" + identity + ")=(select identity from ordering_upgrade_before),"
            "'historic',(" + historic + ")=(select historic from ordering_upgrade_before),"
            "'revision',(select snapshot_revision from private.tc_billing_subscriptions where provider_id=" + f.q(payment["data"]["subscription_id"]) + "),"
            "'pending',(select reconciliation_required from private.tc_billing_subscriptions where provider_id=" + f.q(payment["data"]["subscription_id"]) + "));rollback;")
        pg.check("CAS upgrade retains populated historical values, OID/ACL and default metadata",
            last_json(output) == {"identity": True, "historic": True, "revision": 0, "pending": False})
        pg.check("Rolling back CAS upgrade preserves the complete paid subscription and audit snapshot", self.snapshot(payment) == before)

    def dispute_contracts(self):
        pg, f = self.pg, self.f
        for n, monthly in ((22, False), (23, True)):
            payment = f.create_payment(n, monthly)
            before = f.original(payment)
            data = self.dispute(payment)
            if not monthly:
                left, right = pg.concurrent(f.record(data), f.record(data), "dp-provider-duplicate")
                first, duplicate = last_json(left), last_json(right)
            else:
                first = f.result(f.record(data))
                duplicate = f.result(f.record(data))
            case_id = first["case_id"]
            pg.check("Canonical dp_ dispute persists once and replays for monthly=" + str(monthly),
                first["received"] is True and first["duplicate"] is False
                and duplicate["duplicate"] is True and duplicate["case_id"] == case_id
                and f.count(case_id) == {"n": 1, "max": 2})
            pg.check("dp_ evidence preserves the paid licence/task/receipt for monthly=" + str(monthly), f.original(payment) == before)
            pg.require_error("Canonical dispute audit remains append-only for monthly=" + str(monthly),
                "update private.tc_subscription_financial_entries set data=data where case_id=" + f.q(case_id),
                "manual_invoice_intake_immutable")
        payment = f.create_payment(24)
        before = f.original(payment)
        pg.require_error("New noncanonical du_ dispute is rejected by the migrated server function",
            "begin;" + f.record(self.dispute(payment, prefix="du")) + ";commit;", "23514")
        pg.check("Rejected du_ input creates no case/audit and leaves its original payment intact",
            pg.value("select jsonb_build_object('cases',count(*)) from private.tc_subscription_financial_cases where task_id=" + f.q(payment["task"])) == {"cases": 0}
            and f.original(payment) == before)

    def cas_contracts(self):
        pg, f = self.pg, self.f
        for n, previous in ((25, False), (26, True)):
            payment = f.create_payment(n, True)
            f.result(self.lifecycle(self.lifecycle_data(payment, "evt_OrderingInitial" + str(n), previous, self.observe(payment))))
            before = self.snapshot(payment)
            revision = self.observe(payment)
            # Intentionally reverse lexical event IDs; they are identities,
            # never a chronological tie-breaker for these equal timestamps.
            winner = self.lifecycle_data(payment, "evt_ZOrderingWinner" + str(n), not previous, revision)
            stale = self.lifecycle_data(payment, "evt_AOrderingStale" + str(n), previous, revision)
            left, right = pg.concurrent(self.lifecycle(winner), self.lifecycle(stale),
                "subscription-same-second-" + ("resume" if previous else "cancel"))
            after = self.snapshot(payment)
            pg.check("Same-second " + ("resume" if previous else "cancel") + " CAS accepts the winner and returns a fresh-read requirement to the stale connection",
                last_json(left)["received"] is True and last_json(right) == {"reconcile_required": True}
                and after["subscription"]["cancel_at_period_end"] is not previous
                and after["subscription"]["snapshot_revision"] == int(revision) + 1
                and after["subscription"]["reconciliation_required"] is False
                and len(after["events"]) == len(before["events"]) + 1
                and all(entry["event_id"] != stale["event_id"] for entry in after["events"]))
            pg.check("Nonpaid lifecycle contention changes no invoice, entitlement or financial audit for buyer " + str(n),
                all(after[key] == before[key] for key in ("invoices", "customer", "request", "tasks", "receipts", "audit", "notices")))
            fresh = {**stale, "snapshot_revision": self.observe(payment), "cancel_at_period_end": not previous}
            pg.check("A new canonical read accepts the previously stale same-second event without lexical ordering for buyer " + str(n),
                f.result(self.lifecycle(fresh))["received"] is True)
            confirmed = self.snapshot(payment)
            pg.check("Confirmed same-second lifecycle snapshot retains the event timestamp watermark for buyer " + str(n),
                confirmed["subscription"]["cancel_at_period_end"] is not previous
                and confirmed["subscription"]["event_created"] == pg.REPORT["epoch"])
            pg.check("Duplicate lifecycle receipt cannot regress the canonical state for buyer " + str(n),
                f.result(self.lifecycle(stale)) == {"duplicate": True} and self.snapshot(payment) == confirmed)

    def paid_bridge_contracts(self):
        pg, f = self.pg, self.f
        payment = f.create_payment(27, True)
        data, epoch = payment["data"], pg.REPORT["epoch"]
        cancellation = self.lifecycle_data(payment, "evt_OrderingPaidCancel", True, self.observe(payment))
        invoice_id = "in_OrderingPaidRenewal"
        renewal = {**data, "provider_event_id": "evt_OrderingPaidRenewal", "provider_event_created": epoch,
            "provider_payment_id": invoice_id, "invoice_id": invoice_id, "billing_reason": "subscription_cycle",
            "invoice_period_start": epoch, "invoice_period_end": epoch + 30 * 86400,
            "subscription_current_period_end": epoch + 30 * 86400, "cancel_at_period_end": False}
        apply_renewal = f.service(f.rpc("tc_manual_subscription_apply_payment", f.q("subscription_invoice"), f.q(f.ACCOUNT), f.js(renewal)))
        left, right = pg.concurrent(self.lifecycle(cancellation), apply_renewal, "subscription-canonical-versus-paid-bridge")
        after = self.snapshot(payment)
        pg.check("Concurrent paid bridge commits its valid invoice without regressing the same-second cancellation snapshot",
            last_json(left)["received"] is True and last_json(right)["received"] is True
            and after["subscription"]["cancel_at_period_end"] is True
            and after["subscription"]["reconciliation_required"] is True
            and len(after["invoices"]) == len(after["tasks"]) == len(after["receipts"]) == 2
            and len(after["audit"]) == 2
            and pg.value("select jsonb_build_object('ending',extract(epoch from paid_until)::bigint) from private.tc_customers where user_id=" + f.q(data["user_id"])) == {"ending": epoch + 30 * 86400})
        pg.check("Paid bridge replay cannot duplicate invoice, entitlement or audit after ambiguity",
            f.result(apply_renewal)["duplicate"] is True and self.snapshot(payment) == after)
        fresh = self.lifecycle_data(payment, "evt_OrderingPaidCanonical", True, self.observe(payment),
            event_created=epoch - 1, period_end=epoch + 30 * 86400)
        f.result(self.lifecycle(fresh))
        resolved = self.snapshot(payment)
        pg.check("Fresh canonical CAS clears ambiguity even when triggered by an older event",
            resolved["subscription"]["reconciliation_required"] is False
            and resolved["subscription"]["cancel_at_period_end"] is True
            and resolved["subscription"]["event_created"] == epoch
            and all(resolved[key] == after[key] for key in ("customer", "invoices", "tasks", "receipts", "audit", "notices")))

        # Fail after snapshot mutation, while inserting the receipt. Real
        # PostgreSQL must roll back the revision and every other changed row.
        pg.sql("create function private.subscription_ci_fail_receipt() returns trigger language plpgsql as $fail$ begin "
            "if new.event_id='evt_OrderingReceiptFailure' then raise exception 'synthetic_subscription_receipt_failure';end if;return new;end;$fail$;"
            "create trigger subscription_ci_fail_receipt before insert on private.tc_subscription_events for each row execute function private.subscription_ci_fail_receipt();")
        try:
            pg.require_error("Lifecycle receipt failure rolls back the preceding CAS state mutation",
                "begin;" + self.lifecycle(self.lifecycle_data(payment, "evt_OrderingReceiptFailure", False, self.observe(payment))) + ";commit;",
                "synthetic_subscription_receipt_failure")
        finally:
            pg.sql("drop trigger subscription_ci_fail_receipt on private.tc_subscription_events;drop function private.subscription_ci_fail_receipt();")
        pg.check("Failed lifecycle receipt leaves revision, paid access, invoices and audit byte-equivalent", self.snapshot(payment) == resolved)

        pg.sql("create function private.subscription_ci_fail_audit() returns trigger language plpgsql as $fail$ begin "
            "if new.details->>'invoice_id'='in_OrderingAuditFailure' then raise exception 'synthetic_subscription_audit_failure';end if;return new;end;$fail$;"
            "create trigger subscription_ci_fail_audit before insert on private.tc_admin_audit for each row execute function private.subscription_ci_fail_audit();")
        failed_renewal = {**renewal, "provider_event_id": "evt_OrderingAuditFailure", "provider_event_created": epoch + 1,
            "provider_payment_id": "in_OrderingAuditFailure", "invoice_id": "in_OrderingAuditFailure",
            "invoice_period_start": epoch + 30 * 86400, "invoice_period_end": epoch + 60 * 86400,
            "subscription_current_period_end": epoch + 60 * 86400}
        try:
            pg.require_error("Paid invoice audit failure rolls back bridge, lifecycle receipt and entitlement atomically",
                "begin;" + f.service(f.rpc("tc_manual_subscription_apply_payment", f.q("subscription_invoice"), f.q(f.ACCOUNT), f.js(failed_renewal))) + ";commit;",
                "synthetic_subscription_audit_failure")
        finally:
            pg.sql("drop trigger subscription_ci_fail_audit on private.tc_admin_audit;drop function private.subscription_ci_fail_audit();")
        pg.check("Failed paid invoice audit leaves the entire canonical/fiscal snapshot byte-equivalent", self.snapshot(payment) == resolved)

    def run(self):
        self.upgrade_contracts()
        self.dispute_contracts()
        self.cas_contracts()
        self.paid_bridge_contracts()


def run(pg, financial):
    Contracts(pg, financial).run()
    pg.check("dp_/CAS contracts leave real payment, notice and live-channel switches OFF",
        pg.value("select jsonb_build_object('payments',(select payments_enabled from private.tc_settings where id),"
            "'notices',(select enabled from private.tc_manual_invoice_notice_settings where id),"
            "'live_channels',(select count(*) from private.tc_manual_stripe_channels where mode='live' and enabled))")
        == {"payments": False, "notices": False, "live_channels": 0})


def run_local(pg, financial):
    inspected, image = verify_local_target(pg)
    pg.REPORT.update({"contract": "truckcontrol-dp-cas-postgres-v1", "local_disposable": True,
        "logical_restore_executed": False, "container_image_id": inspected["Image"],
        "resolved_repository_digests": image["RepoDigests"], "network": "none",
        "source_commit": pg.run(["git", "rev-parse", "HEAD"]).stdout.decode().strip(),
        "server_version": pg.sql("select current_setting('server_version')")})
    pg.check("Local contract uses PostgreSQL17, pinned image and no network/host service access", pg.REPORT["server_version"].startswith("17."))
    pg.check("Local contract starts with an empty disposable database",
        pg.value("select jsonb_build_object('tables',count(*)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('auth','public','private','storage') and c.relkind='r'") == {"tables": 0})
    pg.sql((financial.ROOT / "tests/postgres/prelude.sql").read_text())
    paths = sorted((financial.ROOT / "supabase/migrations").glob("*.sql"))
    for path in paths:
        if path.name in (DISPUTE_MIGRATION, ORDERING_MIGRATION):
            before = pg.catalog_fingerprint(pg.SOURCE)
            pg.sql("begin;" + path.read_text() + ";rollback;")
            pg.check(path.name + ": additive DDL rolls back to the exact existing catalog", pg.catalog_fingerprint(pg.SOURCE) == before)
        pg.sql("begin;" + path.read_text() + ";commit;")
    pg.check("Local isolated database contains no network or Vault extension",
        pg.value("select jsonb_build_object('network',exists(select 1 from pg_extension where extname in ('http','pg_net','pg_cron')),'vault',to_regclass('vault.secrets') is not null)") == {"network": False, "vault": False})
    financial.seed_context()
    run(pg, financial)
    pg.REPORT["passed"] = True
