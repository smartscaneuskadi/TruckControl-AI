#!/usr/bin/env python3
"""Real PostgreSQL, two connections and logical restore, exclusively in CI.

This is NOT a managed Supabase/GoTrue/Storage restore or a Stripe settlement
test. All users, sessions, purchases and file metadata are synthetic. No
provider is contacted and no live payment/worker flag is enabled.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "postgres-recovery-results"
DATABASES = {"postgres", "tc_acceptance", "tc_restored"}
SOURCE = "tc_acceptance"
RESTORED = "tc_restored"
IMAGE = "postgres:17.6-bookworm@sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3"
FROZEN62 = "20261108013000_manual_subscription_invoice_intake.sql"
FROZEN62_SHA = "7323ded662cf8ec4560662a86c9224d21eb3d45ad4689caa919cf2638672da7b"
CANDIDATE63 = "20261108100352_manual_subscription_payment_and_documents.sql"
ACCOUNT = "acct_PostgresIsolated"
CONTAINER = os.environ.get("TRUCKCONTROL_POSTGRES_CONTAINER", "")
REPORT: dict = {
    "contract": "truckcontrol-isolated-postgres-v1",
    "scope": "synthetic SQL, real PostgreSQL locks and same-cluster logical dump/restore",
    "managed_service_restore": False,
    "real_provider_acceptance": False,
    "real_customer_data": False,
    "provider_calls": 0,
    "checks": [],
}


def quote(value: object) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def run(command: list[str], *, data: bytes | None = None, timeout: int = 40,
        check: bool = True) -> subprocess.CompletedProcess:
    result = subprocess.run(command, input=data, capture_output=True, timeout=timeout)
    if check and result.returncode:
        # Only synthetic SQL is ever loaded. Do not print command arguments or
        # an environment dump; this helper accepts no external credentials.
        raise AssertionError(result.stderr.decode("utf-8", "replace")[-2000:])
    return result


def pg_command(database: str = SOURCE) -> list[str]:
    if database not in DATABASES:
        raise AssertionError("Only the fixed disposable CI databases are allowed")
    return ["docker", "exec", "-i", CONTAINER, "psql", "-X", "-qAt",
            "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose",
            "-U", "postgres", "-d", database]


def sql(statement: str, database: str = SOURCE, *, check: bool = True) -> str:
    result = run(pg_command(database), data=statement.encode(), check=check)
    if not check:
        return result  # type: ignore[return-value]
    return result.stdout.decode().strip()


def value(statement: str, database: str = SOURCE):
    output = sql(statement, database)
    lines = [line for line in output.splitlines() if line.startswith(("{", "["))]
    if not lines:
        raise AssertionError("Expected a JSON result from the SQL assertion")
    return json.loads(lines[-1])


def check(name: str, condition: bool, **evidence):
    if not condition:
        raise AssertionError(name)
    REPORT["checks"].append({"name": name, "passed": True, **evidence})
    print("PASS " + name, flush=True)


def uid(n: int) -> str:
    return "fc110000-0000-4000-8000-" + str(n).zfill(12)


def sid(n: int) -> str:
    return "fc220000-0000-4000-8000-" + str(n).zfill(12)


def request(n: int) -> str:
    return "fc440000-0000-4000-8000-" + str(n).zfill(12)


def claims(n: int, session: str | None = "own") -> str:
    payload = {"sub": uid(n), "role": "authenticated"}
    if session == "own":
        payload["session_id"] = sid(n)
    elif session is not None:
        payload["session_id"] = session
    # PERFORM avoids writing even these synthetic tokens to the action log.
    return ("set local role authenticated; do $claims$ begin "
            "perform set_config('request.jwt.claim.sub'," + quote(uid(n)) + ",true);"
            "perform set_config('request.jwt.claims'," + quote(json.dumps(payload)) + ",true);"
            "end $claims$;")


def as_actor(n: int, statement: str, database: str = SOURCE,
             *, session: str | None = "own", readonly: bool = False):
    return value("begin" + (" read only" if readonly else "") + ";"
                 + claims(n, session) + statement + ";commit;", database)


def require_error(name: str, statement: str, error: str, database: str = SOURCE):
    result = sql(statement, database, check=False)
    check(name, result.returncode != 0
          and error in result.stderr.decode("utf-8", "replace"))


def access_rows(n: int, database: str = SOURCE, session: str | None = "own"):
    return as_actor(n, """select jsonb_build_object(
      'trucks',(select count(*) from public.trucks),
      'organizations',(select count(*) from public.organizations),
      'profile',public.tc_my_access()->'profile'
    )""", database, session=session)


def visible_counts(n: int, database: str = SOURCE, session: str | None = "own"):
    return as_actor(n, """select jsonb_build_object(
      'trucks',(select count(*) from public.trucks),
      'organizations',(select count(*) from public.organizations)
    )""", database, session=session)


def buyer_company(n: int) -> str:
    return value("select jsonb_build_object('id',id) from public.organizations where owner_id="
                 + quote(uid(n)))["id"]


def oneoff(n: int, event: str | None = None) -> dict:
    return {
        "provider_event_id": event or "evt_PostgresOneoff" + str(n),
        "provider_event_type": "checkout.session.completed",
        "provider_event_created": REPORT["epoch"],
        "provider_payment_id": "pi_PostgresOneoff" + str(n),
        "request_id": request(n), "user_id": uid(n), "company_id": buyer_company(n),
        "amount_cents": 36300, "currency": "EUR", "paid_at": REPORT["paid_at"],
        "livemode": False, "checkout_id": "cs_test_Postgres" + str(n),
        "customer_id": "cus_PostgresBuyer" + str(n),
    }


def monthly(*, renewal: bool = False, event: str = "evt_PostgresMonthlyA") -> dict:
    data = oneoff(3, event)
    start = REPORT["epoch"] + (30 * 86400 if renewal else 0)
    invoice = "in_PostgresRenewal" if renewal else "in_PostgresFirst"
    return {
        **data, "provider_event_type": "invoice.paid", "provider_payment_id": invoice,
        "invoice_id": invoice, "subscription_id": "sub_PostgresBuyer3",
        "invoice_period_start": start, "invoice_period_end": start + 30 * 86400,
        "subscription_current_period_end": start + 30 * 86400,
        "unit_amount": 36300, "subscription_state": "active",
        "cancel_at_period_end": False,
        "billing_reason": "subscription_cycle" if renewal else "subscription_create",
    }


def payment_statement(kind: str, data: dict) -> str:
    return ("select jsonb_build_object('pid',pg_backend_pid(),'result',"
            "public.tc_manual_subscription_apply_payment("
            + quote(kind) + "," + quote(ACCOUNT) + "," + quote(json.dumps(data))
            + "::jsonb))")


def apply(kind: str, data: dict):
    return value("begin;set local role service_role;"
                 + payment_statement(kind, data) + ";commit;")["result"]


def payment_snapshot(n: int) -> dict:
    return value("""select jsonb_build_object(
      'customer',(select jsonb_build_object('paid_until',paid_until,'paid_plan',paid_plan,
        'status',status,'updated_at',updated_at) from private.tc_customers where user_id=""" + quote(uid(n)) + """),
      'request_status',(select status from private.tc_payment_requests where id=""" + quote(request(n)) + """),
      'tasks',(select count(*) from private.tc_manual_subscription_invoice_tasks where request_id=""" + quote(request(n)) + """),
      'receipts',(select count(*) from private.tc_manual_stripe_bridge_receipts where request_id=""" + quote(request(n)) + """),
      'invoices',(select count(*) from private.tc_subscription_invoices where user_id=""" + quote(uid(n)) + """),
      'notices',(select count(*) from private.tc_manual_invoice_notice_outbox n join
        private.tc_manual_subscription_invoice_tasks t on t.id=n.task_id where t.request_id=""" + quote(request(n)) + """)
    )""")


def catalog_fingerprint(database: str) -> dict:
    tables = value("""select coalesce(jsonb_agg(jsonb_build_object(
      'schema',n.nspname,'name',c.relname,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
      'acl',c.relacl::text) order by n.nspname,c.relname),'[]')
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('auth','public','private','storage') and c.relkind='r'""", database)
    policies = value("""select coalesce(jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname),'[]')
      from pg_policies p where schemaname in ('auth','public','private','storage')""", database)
    functions = value("""select jsonb_build_object('sha',
      md5(coalesce(string_agg(pg_get_functiondef(p.oid),E'\n'
        order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),'')),
      'acl',coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,
        'args',pg_get_function_identity_arguments(p.oid),'acl',p.proacl::text)
        order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),'[]'))
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('auth','public','private','storage') and p.prokind='f'""", database)
    return {"tables": tables, "policies": policies, "functions": functions}


def database_fingerprint(database: str) -> dict:
    result = {"catalog": catalog_fingerprint(database), "rows": {}}
    for table in result["catalog"]["tables"]:
        name = identifier(table["schema"]) + "." + identifier(table["name"])
        result["rows"][name] = value("""select jsonb_build_object('count',count(*),
          'md5',md5(coalesce(string_agg(row_to_json(t)::text,E'\n'
            order by row_to_json(t)::text),''))) from """ + name + " t", database)
    return result


def fingerprint_differences(before, after, path: str = "") -> list:
    differences = []
    if isinstance(before, dict) and isinstance(after, dict):
        for key in sorted(set(before) | set(after)):
            if key not in before or key not in after:
                differences.append({"path": path + "/" + key, "kind": "missing"})
            else:
                differences.extend(fingerprint_differences(before[key], after[key], path + "/" + key))
    elif isinstance(before, list) and isinstance(after, list):
        if len(before) != len(after):
            differences.append({"path": path, "before_length": len(before), "after_length": len(after)})
        for index, (left, right) in enumerate(zip(before, after)):
            differences.extend(fingerprint_differences(left, right, path + "/" + str(index)))
    elif before != after:
        differences.append({"path": path, "before": str(before)[:400], "after": str(after)[:400]})
    return differences[:20]


def wait_for_backend(application: str, *, lock: bool) -> dict:
    deadline = time.monotonic() + 7
    while time.monotonic() < deadline:
        rows = value("""select coalesce(jsonb_agg(jsonb_build_object(
          'pid',pid,'wait_type',wait_event_type,'wait',wait_event,'blockers',pg_blocking_pids(pid)),'[]')
          from pg_stat_activity where application_name=""" + quote(application))
        if rows and ((lock and rows[0]["wait_type"] == "Lock")
                     or (not lock and rows[0]["wait"] == "PgSleep")):
            return rows[0]
        time.sleep(0.05)
    raise AssertionError("Did not observe the expected independent PostgreSQL lock/sleep")


def concurrent(first_sql: str, second_sql: str, prefix: str,
               *, second_error: str | None = None):
    first_name, second_name = prefix + "-holder", prefix + "-contender"
    first = subprocess.Popen(pg_command(), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE)
    assert first.stdin is not None
    first.stdin.write(("set application_name=" + quote(first_name) + ";"
                       + "set statement_timeout='20s';set lock_timeout='15s';begin;"
                       + first_sql + ";select pg_sleep(8);commit;").encode())
    first.stdin.close()
    first.stdin = None
    second = None
    try:
        holder = wait_for_backend(first_name, lock=False)
        second = subprocess.Popen(pg_command(), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE)
        assert second.stdin is not None
        second.stdin.write(("set application_name=" + quote(second_name) + ";"
                            + "set statement_timeout='20s';set lock_timeout='15s';begin;"
                            + second_sql + ";commit;").encode())
        second.stdin.close()
        second.stdin = None
        contender = wait_for_backend(second_name, lock=True)
        first_out, first_err = first.communicate(timeout=25)
        second_out, second_err = second.communicate(timeout=25)
        check(prefix + ": distinct backends and real row-lock contention",
              holder["pid"] != contender["pid"] and holder["pid"] in contender["blockers"],
              holder_pid=holder["pid"],
              contender_pid=contender["pid"], observed_wait=contender["wait_type"],
              blocking_pids=contender["blockers"])
        if first.returncode:
            raise AssertionError(first_err.decode()[-2000:])
        if second_error is not None:
            check(prefix + ": stale contender rejected",
                  second.returncode != 0 and second_error in second_err.decode())
        elif second.returncode:
            raise AssertionError(second_err.decode()[-2000:])
        else:
            check(prefix + ": both serialized deliveries committed",
                  first.returncode == second.returncode == 0)
        return first_out, second_out
    finally:
        for process in (first, second):
            if process is not None and process.poll() is None:
                process.kill()
                process.communicate(timeout=5)


def main():
    if os.environ.get("GITHUB_ACTIONS") != "true" or not re.fullmatch(r"[0-9a-f]{12,64}", CONTAINER):
        raise AssertionError("This harness only accepts an explicit GitHub Actions service container")
    for name in ("DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
                 "STRIPE_SECRET_KEY", "STRIPE_API_KEY", "OPENAI_API_KEY"):
        if os.environ.get(name):
            raise AssertionError("External credentials must not be available to this isolated harness")
    REPORT["source_commit"] = run(["git", "rev-parse", "HEAD"]).stdout.decode().strip()
    REPORT["image"] = IMAGE
    REPORT["server_version"] = sql("select current_setting('server_version')")
    check("PostgreSQL major 17 is running in the official pinned service", REPORT["server_version"].startswith("17."))
    REPORT["container_image_id"] = run(["docker", "inspect", "--format", "{{.Image}}", CONTAINER]).stdout.decode().strip()
    images = json.loads(run(["docker", "image", "inspect", IMAGE]).stdout)
    REPORT["resolved_repository_digests"] = images[0].get("RepoDigests", [])
    check("Official image digest resolves exactly",
          any("sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3" in digest
              for digest in REPORT["resolved_repository_digests"]))
    paths = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
    REPORT["local_migrations"] = [{"name": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()} for path in paths]
    check("Immutable native migration62 source is unchanged",
          next(item["sha256"] for item in REPORT["local_migrations"] if item["name"] == FROZEN62) == FROZEN62_SHA)
    check("Only the expected candidate63 follows immutable62",
          paths[-1].name == CANDIDATE63 and paths[-2].name == FROZEN62)
    sql((ROOT / "tests/postgres/prelude.sql").read_text())
    check("Provider/network extensions and Vault credentials are absent",
          value("select jsonb_build_object('network',exists(select 1 from pg_extension where extname in ('http','pg_net','pg_cron')),'vault',to_regclass('vault.secrets') is not null)") ==
          {"network": False, "vault": False})
    for path in paths[:-1]:
        sql("begin;" + path.read_text() + ";commit;")
    baseline = catalog_fingerprint(SOURCE)
    candidate = paths[-1].read_text()
    sql("begin;" + candidate + ";rollback;")
    check("Candidate63 DDL rolls back to the exact prior functions, ACLs, RLS and tables",
          catalog_fingerprint(SOURCE) == baseline)
    sql("begin;" + candidate + ";commit;")
    check("All repository migrations applied transactionally to the isolated database",
          value("select jsonb_build_object('bridge',to_regprocedure('public.tc_manual_subscription_apply_payment(text,text,jsonb)') is not null,'sessions',to_regprocedure('private.tc_actor_verified(uuid,boolean)') is not null)") ==
          {"bridge": True, "sessions": True}, local_file_count=len(paths))
    sql("update private.tc_settings set enforce_access=true,sms_ready=false where id=true;")
    sql((ROOT / "tests/postgres/fixtures.sql").read_text())
    REPORT["epoch"] = int(sql("select extract(epoch from now())::bigint"))
    REPORT["paid_at"] = sql("select to_char(to_timestamp(" + str(REPORT["epoch"] - 2) + ") at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')")
    check("Fresh owners see only their own company and vehicle",
          visible_counts(1) == visible_counts(2) == {"trucks": 1, "organizations": 1})
    readonly = as_actor(2, "select jsonb_build_object('trucks',(select count(*) from public.trucks),'active',(public.tc_my_access()->>'active')::boolean)", readonly=True)
    check("Fresh RLS/profile reads work in a real read-only transaction",
          readonly == {"trucks": 1, "active": True})
    check("Another user's valid SID grants no company data",
          visible_counts(1, session=sid(2)) == {"trucks": 0, "organizations": 0})
    check("Missing SID grants no company data",
          visible_counts(1, session=None) == {"trucks": 0, "organizations": 0})

    # Enforce the fiscal bucket even in the presence of an accidentally broad
    # permissive fleet policy; the real candidate restrictive policy must win.
    sql("create policy ci_broad_storage_read on storage.objects for select to authenticated using(true);")
    check("Private fiscal metadata remains hidden under a permissive Storage policy",
          as_actor(2, "select jsonb_build_object('count',(select count(*) from storage.objects where bucket_id='tc-subscription-fiscal'))") == {"count": 0})
    require_error("Browser role cannot call the atomic provider payment bridge",
                  "begin;" + claims(2) + payment_statement("initial_payment", oneoff(2)) + ";commit;",
                  "42501")

    paid = apply("initial_payment", oneoff(1))
    task = paid["task_id"]
    validation = {"company_name": "CI fictional validated buyer", "tax_id": "SYNTHETIC-VALIDATED",
                  "address": "Synthetic validated street 123", "email": "ci-buyer@example.invalid",
                  "evidence_reference": "Synthetic CI operator validation only"}
    def cas(operation: str):
        return (claims(90) + "select jsonb_build_object('pid',pg_backend_pid(),'result',"
                "public.tc_admin_manual_subscription_invoices('validate_buyer',"
                + quote(task) + "::uuid,1," + quote(operation) + "::uuid,"
                + quote(json.dumps(validation)) + "::jsonb,null))")
    concurrent(cas("fc550000-0000-4000-8000-000000000001"),
               cas("fc550000-0000-4000-8000-000000000002"),
               "fiscal-cas", second_error="40001")
    actions = value("select jsonb_build_object('count',count(*),'version',max(row_version)) from private.tc_manual_subscription_invoice_actions where task_id=" + quote(task))
    check("Concurrent CAS commits exactly one append-only operator action",
          actions == {"count": 1, "version": 2})
    require_error("Fiscal actions reject UPDATE even from the table owner",
                  "update private.tc_manual_subscription_invoice_actions set state=state where task_id=" + quote(task),
                  "manual_invoice_intake_immutable")

    first_month = monthly()
    duplicate_month = monthly(event="evt_PostgresMonthlyB")
    concurrent("set local role service_role;" + payment_statement("subscription_invoice", first_month),
               "set local role service_role;" + payment_statement("subscription_invoice", duplicate_month),
               "monthly-duplicate")
    month1 = payment_snapshot(3)
    check("Concurrent duplicate monthly invoice creates one licence period, task and notice",
          month1["tasks"] == month1["invoices"] == month1["notices"] == 1 and month1["receipts"] == 2,
          receipt_deliveries=month1["receipts"], fiscal_tasks=month1["tasks"])
    apply("subscription_invoice", first_month)
    check("Exact delivery replay leaves all persisted payment/fiscal state unchanged",
          payment_snapshot(3) == month1)
    apply("subscription_invoice", monthly(renewal=True, event="evt_PostgresRenewal"))
    month2 = payment_snapshot(3)
    periods = value("select jsonb_build_object('identities',count(distinct provider_invoice_id),'periods',count(distinct period_start),'licensed_until',(select extract(epoch from paid_until)::bigint from private.tc_customers where user_id=" + quote(uid(3)) + ")) from private.tc_manual_subscription_invoice_tasks where request_id=" + quote(request(3)))
    check("Renewal has an independent canonical invoice/task and a single paid-until boundary",
          month2["tasks"] == month2["invoices"] == month2["notices"] == 2
          and periods == {"identities": 2, "periods": 2, "licensed_until": REPORT["epoch"] + 60 * 86400})

    before_failure = payment_snapshot(4)
    sql("""create function public.tc_ci_fail_notice() returns trigger language plpgsql as $failure$
      begin if exists(select 1 from private.tc_manual_subscription_invoice_tasks
        where id=new.task_id and request_id='fc440000-0000-4000-8000-000000000004') then
        raise exception 'synthetic_notice_failure';end if;return new;end;$failure$;
      create trigger tc_ci_fail_notice before insert on private.tc_manual_invoice_notice_outbox
        for each row execute function public.tc_ci_fail_notice();""")
    try:
        require_error("Injected notice failure rejects the complete payment transaction",
                      "begin;set local role service_role;"
                      + payment_statement("initial_payment", oneoff(4, "evt_PostgresRollback"))
                      + ";commit;", "synthetic_notice_failure")
        check("Failed outbox insertion rolls back licence, payment, task and receipt together",
              payment_snapshot(4) == before_failure and
              value("select jsonb_build_object('events',(select count(*) from private.tc_payment_events where event_id='evt_PostgresRollback'))") == {"events": 0})
    finally:
        sql("drop trigger tc_ci_fail_notice on private.tc_manual_invoice_notice_outbox;"
            "drop function public.tc_ci_fail_notice();")

    sql("delete from auth.sessions where id=" + quote(sid(1)))
    check("A deleted Auth session immediately hides company data on the next connection",
          visible_counts(1) == {"trucks": 0, "organizations": 0})
    require_error("Revoked session cannot fetch its personal profile",
                  "begin;" + claims(1) + "select public.tc_my_access();commit;", "42501")
    denied_write = as_actor(1, """with changed as (
      update public.trucks set odometer_km=9999 returning id
    ) select jsonb_build_object('changed',(select count(*) from changed))""")
    check("Revoked session cannot write a previously visible vehicle", denied_write == {"changed": 0})
    sql("update auth.users set banned_until=now()+interval '1 day' where id=" + quote(uid(4)))
    background = value("begin;set local role service_role;select jsonb_build_object('active',"
                       "(public.tc_company_server_access(" + quote(uid(4))
                       + "::uuid," + quote(buyer_company(4)) + "::uuid)->>'active')::boolean);commit;")
    check("Banned explicit background actor is denied without requiring a human SID",
          background == {"active": False})
    allowed_background = value("begin;set local role service_role;select jsonb_build_object('active',"
                       "(public.tc_company_server_access(" + quote(uid(2))
                       + "::uuid," + quote(buyer_company(2)) + "::uuid)->>'active')::boolean);commit;")
    check("Verified background actor still works without a human SID",
          allowed_background == {"active": True})
    guards = value("""select jsonb_build_object(
      'payments',(select payments_enabled from private.tc_settings where id),
      'notices',(select enabled from private.tc_manual_invoice_notice_settings where id),
      'uploads',(select uploads_enabled from private.tc_manual_subscription_document_runtime where id),
      'downloads',(select downloads_enabled from private.tc_manual_subscription_document_runtime where id),
      'live_channels',(select count(*) from private.tc_manual_stripe_channels where mode='live' and enabled)
    )""")
    check("All live payment, document and email workers remain disabled",
          guards == {"payments": False, "notices": False, "uploads": False, "downloads": False, "live_channels": 0})
    sql("drop policy ci_broad_storage_read on storage.objects;")
    before_dump = database_fingerprint(SOURCE)
    dump = run(["docker", "exec", CONTAINER, "pg_dump", "-U", "postgres",
                "-d", SOURCE, "-Fc", "--no-owner"]).stdout
    (RESULTS / "synthetic-postgres.dump").write_bytes(dump)
    REPORT["dump_sha256"] = hashlib.sha256(dump).hexdigest()
    REPORT["dump_bytes"] = len(dump)
    run(["docker", "exec", CONTAINER, "createdb", "-U", "postgres", "-T", "template0", RESTORED])
    run(["docker", "exec", "-i", CONTAINER, "pg_restore", "-U", "postgres",
         "-d", RESTORED, "--no-owner", "--exit-on-error"], data=dump)
    after_restore = database_fingerprint(RESTORED)
    if before_dump != after_restore:
        REPORT["restore_differences"] = fingerprint_differences(before_dump, after_restore)
        (RESULTS / "before-fingerprint.json").write_text(json.dumps(before_dump, indent=2) + "\n")
        (RESULTS / "after-fingerprint.json").write_text(json.dumps(after_restore, indent=2) + "\n")
        print("RESTORE_DIFFERENCES " + json.dumps(REPORT["restore_differences"]), flush=True)
    check("Actual pg_dump/pg_restore preserves every synthetic row, function, RLS policy and ACL",
          before_dump == after_restore, tables=len(before_dump["rows"]))
    REPORT["fingerprint_sha256"] = hashlib.sha256(json.dumps(before_dump, sort_keys=True).encode()).hexdigest()
    check("Restored fresh session still has its isolated company access",
          visible_counts(2, RESTORED) == {"trucks": 1, "organizations": 1})
    check("Restored revoked session remains revoked",
          visible_counts(1, RESTORED) == {"trucks": 0, "organizations": 0})
    REPORT["passed"] = True


if __name__ == "__main__":
    RESULTS.mkdir(exist_ok=True)
    try:
        main()
    except BaseException as error:
        REPORT["passed"] = False
        REPORT["failure"] = str(error)[-2000:]
        raise
    finally:
        REPORT["passed_checks"] = len(REPORT["checks"])
        (RESULTS / "report.json").write_text(json.dumps(REPORT, indent=2) + "\n")
