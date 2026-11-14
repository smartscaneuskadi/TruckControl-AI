#!/usr/bin/env python3
"""Synthetic Gmail lease races in the already verified PostgreSQL CI service.

No Gmail/Google/Storage API, provider credential, real mailbox or managed
restore is involved. The preceding two steps own schema setup and logical
restore evidence; this step adds competing psql transactions on that service.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("gmail_isolated_postgres", ROOT / "scripts/verify-isolated-postgres.py")
assert spec and spec.loader
pg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pg)
q, sql, value, check = pg.quote, pg.sql, pg.value, pg.check
MIGRATION = "20261114170031_gmail_sync_lease_fencing.sql"
EXTERNAL_CREDENTIALS = (
    "DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ACCESS_TOKEN",
    "STRIPE_SECRET_KEY", "STRIPE_API_KEY", "STRIPE_WEBHOOK_SECRET", "OPENAI_API_KEY",
    "GOOGLE_CLIENT_SECRET", "GMAIL_ENCRYPTION_KEY",
)
pg.REPORT.update({
    "contract": "truckcontrol-gmail-sync-postgres-v1",
    "scope": "synthetic Gmail connection rows, real PostgreSQL row locks and independent psql backends",
    "checks": [], "provider_calls": 0, "real_mailbox_access": False,
    "managed_service_restore": False, "logical_restore_performed": False,
})


def validate_environment(environment=None) -> str:
    environment = os.environ if environment is None else environment
    container = environment.get("TRUCKCONTROL_POSTGRES_CONTAINER", "")
    if environment.get("GITHUB_ACTIONS") != "true" or not re.fullmatch(r"[0-9a-f]{12,64}", container):
        raise AssertionError("Only the explicit isolated GitHub Actions service container is accepted")
    if pg.SOURCE != "tc_acceptance":
        raise AssertionError("Only the fixed disposable CI database is accepted")
    if environment.get("DOCKER_HOST", "") not in ("", "unix:///var/run/docker.sock") or any(
            environment.get(name) for name in ("DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH")):
        raise AssertionError("Remote Docker contexts and TLS selectors are forbidden")
    if any(environment.get(name) for name in EXTERNAL_CREDENTIALS):
        raise AssertionError("External credentials must be absent")
    return container


def validate_receipts(initial: dict, financial: dict, source: str) -> None:
    for receipt, contract in (
        (initial, "truckcontrol-isolated-postgres-v1"),
        (financial, "truckcontrol-financial-incidents-postgres-v1"),
    ):
        if (receipt.get("contract") != contract or receipt.get("passed") is not True
                or receipt.get("source_commit") != source or receipt.get("provider_calls") != 0
                or receipt.get("managed_service_restore") is not False):
            raise AssertionError("Both preceding isolated acceptance receipts must match this exact source")
    if initial.get("image") != pg.IMAGE or not initial.get("container_image_id"):
        raise AssertionError("The preceding acceptance must identify the fixed immutable PostgreSQL image")


def verify_ci_target() -> None:
    if validate_environment() != pg.CONTAINER:
        raise AssertionError("The inherited service container selector must remain unchanged")
    source = pg.run(["git", "rev-parse", "HEAD"]).stdout.decode().strip()
    initial = json.loads((pg.RESULTS / "report.json").read_text())
    financial = json.loads((pg.RESULTS / "financial-incidents-report.json").read_text())
    validate_receipts(initial, financial, source)
    # Reuse the exact immutable image and local socket, never pull or launch an
    # alternate container. All SQL below goes through pg.pg_command's fixed DB.
    running = pg.run(["docker", "inspect", "--format", "{{.Image}}", pg.CONTAINER]).stdout.decode().strip()
    image = json.loads(pg.run(["docker", "image", "inspect", pg.IMAGE]).stdout)[0]
    check("Gmail races reuse the preceding verified immutable PostgreSQL service",
          running == image["Id"] == initial["container_image_id"]
          and any(digest.endswith("@" + pg.IMAGE.split("@", 1)[1]) for digest in image.get("RepoDigests", [])))
    migration_sha = hashlib.sha256((ROOT / "supabase/migrations" / MIGRATION).read_bytes()).hexdigest()
    check("The preceding schema acceptance applied this exact Gmail fencing migration",
          {"name": MIGRATION, "sha256": migration_sha} in initial.get("local_migrations", []))
    pg.REPORT.update({"source_commit": source, "image": pg.IMAGE, "container_image_id": running,
                      "migration_sha256": migration_sha,
                      "preceding_reports": ["report.json", "financial-incidents-report.json"]})
    check("The fixed local PostgreSQL database has the Gmail fence and no network extensions",
          value("select jsonb_build_object('database',current_database(),'version',current_setting('server_version_num')::int/10000,"
                "'fence',to_regprocedure('private.tc_gmail_sync_fenced(text,jsonb)') is not null,"
                "'network',exists(select 1 from pg_extension where extname in ('http','pg_net','pg_cron')))")
          == {"database": "tc_acceptance", "version": 17, "fence": True, "network": False})


def uid(n: int) -> str:
    return "a8100000-0000-4000-8000-" + str(n).zfill(12)


def lease(n: int, worker: int) -> str:
    return "a8300000-0000-4000-8000-" + str(n * 10 + worker).zfill(12)


def context(fixture: dict, worker: int = 1) -> dict:
    return {"organization_id": fixture["org"], "user_id": fixture["user"],
            "sync_lease_id": lease(fixture["n"], worker)}


def rpc(action: str, data: dict) -> str:
    return ("select jsonb_build_object('result',public.gmail_server(" + q(action)
            + "," + q(json.dumps(data)) + "::jsonb))")


def service(statement: str) -> str:
    return "set local role service_role;" + statement


def apply(action: str, data: dict):
    return value("begin;" + service(rpc(action, data)) + ";commit;")["result"]


def connection_data(fixture: dict, mailbox: str) -> dict:
    subject = "synthetic-gmail-pg-" + str(fixture["n"]) + "-" + mailbox
    return {"organization_id": fixture["org"], "user_id": fixture["user"],
            "google_subject": subject, "email": subject + "@example.invalid",
            # Opaque synthetic metadata; never decrypt, authenticate or send it.
            "refresh_token_cipher": "synthetic-not-a-credential-" + subject + "-placeholder"}


def state_statement(fixture: dict) -> str:
    return ("select jsonb_build_object('connection',(select to_jsonb(c) from private.gmail_connections c "
            "where organization_id=" + q(fixture["org"]) + "))")


def state(fixture: dict) -> dict:
    return value(state_statement(fixture))["connection"]


def documents_statement(fixture: dict) -> str:
    org = q(fixture["org"])
    return ("select jsonb_build_object('documents',(select coalesce(jsonb_agg(to_jsonb(d) order by d.id),'[]') "
            "from private.company_documents d where organization_id=" + org + "),"
            "'invoices',(select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]') "
            "from private.invoice_documents i where organization_id=" + org + "))")


def documents(fixture: dict) -> dict:
    return value(documents_statement(fixture))


def last_json(output: bytes) -> dict:
    return [json.loads(line) for line in output.decode().splitlines() if line.startswith("{")][-1]


def seed(n: int) -> dict:
    registration = {"truckcontrol_registration": {
        "contact_name": "Synthetic Gmail owner", "company_name": "Synthetic Gmail PG " + str(n),
        "tax_id": "SYNTHETIC-GMAIL-PG-" + str(n), "address": "Synthetic isolated address 123",
        "phone": "+12025558" + str(100 + n), "requested_plan": "limited",
    }}
    sql("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values("
        + q(uid(n)) + "," + q("gmail-pg-" + str(n) + "@example.invalid") + ",now(),"
        + q(json.dumps(registration)) + "::jsonb);"
        "update private.tc_customers set module_overrides='{" + '"gmail":true,"documents":true' + "}'::jsonb "
        "where user_id=" + q(uid(n)) + ";")
    org = value("select jsonb_build_object('id',id) from public.organizations where owner_id=" + q(uid(n)))["id"]
    fixture = {"n": n, "user": uid(n), "org": org}
    apply("connect", connection_data(fixture, "a"))
    return fixture


def acquire(fixture: dict, worker: int = 1) -> None:
    check("Synthetic Gmail worker acquires its own permitted lease " + str(fixture["n"]),
          apply("lock_sync", context(fixture, worker)) is True)


def invoice(fixture: dict) -> dict:
    number = str(fixture["n"])
    document = "a8400000-0000-4000-8000-" + number.zfill(12)
    return {**context(fixture), "message_id": "synthetic-message-" + number,
            "attachment_id": "synthetic-attachment-" + number,
            "content_hash": hashlib.sha256(("synthetic-gmail-pdf-" + number).encode()).hexdigest(),
            "net_cents": None, "tax_cents": None, "total_cents": None,
            "document": {"id": document, "name": "Synthetic Gmail invoice.pdf",
                         "object_path": fixture["org"] + "/" + document + "/document.pdf",
                         "content_type": "application/pdf", "size_bytes": 20}}


def finish(fixture: dict, *, legacy: bool = False) -> dict:
    data = context(fixture)
    if legacy:
        data.pop("sync_lease_id")
    return {**data, "succeeded": True, "reauthorize": True, "page_token": "synthetic-stale-cursor"}


def reconnect_and_acquire(fixture: dict) -> str:
    return (service(rpc("connect", connection_data(fixture, "b"))) + ";"
            + rpc("lock_sync", context(fixture, 2)) + ";" + state_statement(fixture))


def check_replacement(fixture: dict, expected: dict, name: str) -> None:
    current = state(fixture)
    check(name, current == expected and current["status"] == "connected"
          and current["sync_lease_id"] == lease(fixture["n"], 2)
          and current["sync_lease_actor"] == fixture["user"]
          and current["google_subject"] == connection_data(fixture, "b")["google_subject"])


def run_races() -> None:
    fixture = seed(1)
    acquire(fixture)
    first, second = pg.concurrent(reconnect_and_acquire(fixture),
                                 service(rpc("finish_sync", finish(fixture))), "gmail-reconnect-versus-old-finish")
    check_replacement(fixture, last_json(first)["connection"],
                      "Reconnect and new lease survive stale success, invalid_grant status and cursor")
    check("Stale fenced finish is an acknowledged no-op", last_json(second) == {"result": {}})

    fixture = seed(2)
    acquire(fixture)
    before = documents(fixture)
    first, _ = pg.concurrent(reconnect_and_acquire(fixture),
                             service(rpc("record_invoice", invoice(fixture))),
                             "gmail-reconnect-versus-old-invoice", second_error="42501")
    check_replacement(fixture, last_json(first)["connection"], "Rejected old document cannot change the replacement mailbox")
    check("Rejected stale record_invoice leaves no partial private document or invoice",
          documents(fixture) == before == {"documents": [], "invoices": []})

    fixture = seed(3)
    first, second = pg.concurrent(service(rpc("lock_sync", context(fixture))) + ";" + state_statement(fixture),
                                 service(rpc("lock_sync", context(fixture, 2))), "gmail-two-lease-acquisitions")
    check("Exactly one concurrent sync acquisition wins and the loser preserves its lease",
          last_json(second) == {"result": False} and state(fixture) == last_json(first)["connection"]
          and state(fixture)["sync_lease_id"] == lease(3, 1))

    fixture = seed(4)
    acquire(fixture)
    sql("update private.gmail_connections set sync_lease_until=now()-interval '1 second' where organization_id=" + q(fixture["org"]))
    first, _ = pg.concurrent(service(rpc("lock_sync", context(fixture, 2))) + ";" + state_statement(fixture),
                             service(rpc("finish_sync", finish(fixture))), "gmail-expired-a-versus-new-b")
    check("Expired A cannot clear new B's lease, status, cursor or last_sync_at",
          state(fixture) == last_json(first)["connection"] and state(fixture)["sync_lease_id"] == lease(4, 2)
          and apply("assert_sync", context(fixture)) is False
          and apply("assert_sync", context(fixture, 2)) is True)

    fixture = seed(5)
    acquire(fixture)
    valid_finish = {**context(fixture), "succeeded": True, "reauthorize": False,
                    "page_token": "synthetic-valid-cursor-a"}
    first, _ = pg.concurrent(service(rpc("record_invoice", invoice(fixture))) + ";"
                             + rpc("finish_sync", valid_finish) + ";" + documents_statement(fixture),
                             reconnect_and_acquire(fixture), "gmail-valid-invoice-before-reconnect")
    committed = last_json(first)
    check("A valid invoice committed before reconnect remains exactly once in both private tables",
          documents(fixture) == committed and len(committed["documents"]) == len(committed["invoices"]) == 1
          and committed["invoices"][0]["document_id"] == committed["documents"][0]["id"])
    current = state(fixture)
    check("Later reconnect replaces the lease and cursor while retaining the valid earlier invoice",
          current["sync_lease_id"] == lease(5, 2) and current["sync_page_token"] is None
          and current["last_sync_at"] is not None and current["status"] == "connected")

    fixture = seed(6)
    legacy = {"organization_id": fixture["org"], "user_id": fixture["user"]}
    check("Synthetic legacy sync obtains its initial lease", apply("lock_sync", legacy) is True)
    first, _ = pg.concurrent(reconnect_and_acquire(fixture),
                             service(rpc("finish_sync", finish(fixture, legacy=True))), "gmail-reconnect-versus-legacy-finish")
    check_replacement(fixture, last_json(first)["connection"],
                      "Legacy finish rechecks under the row lock and preserves the new fenced lease")

    fixture = seed(7)
    acquire(fixture)
    sql("update private.gmail_connections set sync_lease_until=now()-interval '1 second' where organization_id=" + q(fixture["org"]))
    legacy = {"organization_id": fixture["org"], "user_id": fixture["user"]}
    first, second = pg.concurrent(service(rpc("lock_sync", legacy)) + ";" + state_statement(fixture),
                                 service(rpc("assert_sync", context(fixture))), "gmail-legacy-replaces-expired-fenced-lease")
    current = state(fixture)
    check("Legacy acquisition cannot revive expired fenced A's capability",
          current == last_json(first)["connection"] and current["sync_lease_id"] is None
          and current["sync_lease_actor"] is None and current["sync_lease_until"] is not None
          and last_json(second) == {"result": False})


def main() -> None:
    verify_ci_target()
    before = value("select jsonb_build_object('payments',(select payments_enabled from private.tc_settings where id),"
                   "'prices_are_examples',(select prices_are_examples from private.tc_settings where id),"
                   "'enforce_access',(select enforce_access from private.tc_settings where id))")
    check("Gmail concurrency runs with commercial charging disabled and access enforced",
          before == {"payments": False, "prices_are_examples": True, "enforce_access": True})
    run_races()
    check("Gmail races preserve all commercial and access switches",
          value("select jsonb_build_object('payments',(select payments_enabled from private.tc_settings where id),"
                "'prices_are_examples',(select prices_are_examples from private.tc_settings where id),"
                "'enforce_access',(select enforce_access from private.tc_settings where id))") == before)
    pg.REPORT["real_contention_pairs"] = 7
    pg.REPORT["passed"] = True


if __name__ == "__main__":
    pg.RESULTS.mkdir(exist_ok=True)
    try:
        if sys.argv[1:]:
            raise AssertionError("This CI-only harness accepts no command-line target or credential")
        main()
    except BaseException as error:
        pg.REPORT["passed"] = False
        pg.REPORT["failure"] = str(error)[-2000:]
        raise
    finally:
        pg.REPORT["passed_checks"] = len(pg.REPORT["checks"])
        (pg.RESULTS / "gmail-sync-report.json").write_text(json.dumps(pg.REPORT, indent=2) + "\n")
