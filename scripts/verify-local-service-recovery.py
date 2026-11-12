#!/usr/bin/env python3
"""Real GoTrue/PostgREST/Storage recovery in two throwaway offline CLI stacks.

CI only. No managed project, provider credential, external email or model call.
Only the sanitized receipt is publishable; dumps, keys and logs stay private.
This is NOT managed-platform restore acceptance, a fiscal invoice or an SLA.
"""
from __future__ import annotations

import base64
import hashlib
import html
import io
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import tarfile
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
CLI = ["npx", "--yes", "supabase@3.1.0"]
DOCKER = ["docker", "--host=unix:///var/run/docker.sock"]
RESULTS = ROOT / "local-service-recovery-results"
PRODUCTION = "kkkemaycedexymrpaqtp"
PORTS = {55431, 55434, 55531, 55534}
REPORT = {
    "contract": "truckcontrol-local-service-recovery-v1",
    "managed_platform_restore_verified": False,
    "production_modified": False,
    "real_customer_data": False,
    "external_provider_calls": 0,
    "fiscal_emission_verified": False,
    "physical_devices": False,
    "checks": [],
}


class LabFailure(Exception):
    pass


def local_url(url: str) -> str:
    parsed = urllib.parse.urlsplit(url)
    if (parsed.scheme != "http" or parsed.hostname != "127.0.0.1"
            or parsed.port not in PORTS or parsed.username or parsed.password
            or parsed.fragment or parsed.query):
        raise LabFailure("refuse_nonlocal_service_url")
    return url.rstrip("/")


def container_allowed(info: dict, project: str, network: str) -> bool:
    labels = info.get("Config", {}).get("Labels", {}) or {}
    ports = info.get("NetworkSettings", {}).get("Ports", {}) or {}
    return (
        project.startswith("tc-recovery-") and project != PRODUCTION
        and info.get("Name", "").endswith("_" + project)
        and labels.get("com.supabase.cli.project") == project
        and info.get("HostConfig", {}).get("NetworkMode") != "host"
        and not info.get("HostConfig", {}).get("Privileged", False)
        and set(info.get("NetworkSettings", {}).get("Networks", {})) == {network}
        and all(p.get("HostIp") in ("127.0.0.1", "::1")
                for bindings in ports.values() if bindings for p in bindings)
        and not any(m.get("Source", "").endswith("docker.sock") for m in info.get("Mounts", []))
    )


def check(name: str, condition: bool, **evidence):
    if not condition:
        raise LabFailure(name)
    REPORT["checks"].append({"name": name, "passed": True, **evidence})
    print("PASS " + name, flush=True)


def child_env() -> dict:
    env = dict(os.environ)
    for name in ("DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH",
                 "SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "OPENAI_API_KEY", "STRIPE_SECRET_KEY",
                 "RESEND_API_KEY", "GOOGLE_CLIENT_SECRET"):
        env.pop(name, None)
    env["SUPABASE_TELEMETRY_DISABLED"] = "1"
    return env


def safe_diagnostics(raw: bytes) -> dict:
    """Extract only fixed codes and source identifiers, never raw messages."""
    text = raw.decode("utf-8", "replace")
    migrations = re.findall(r"Applying migration ([0-9]{14}_[a-z0-9_]+\.sql)", text)
    states = sorted(set(re.findall(r"SQLSTATE[ :]+([A-Z0-9]{5})", text)))
    identifiers = re.findall(r'''(?:relation|schema|table|function|extension|column|role) "([a-z_][a-z0-9_.]{0,100})"''', text)
    # A name alone is diagnostic, not a statement or a credential value.
    identifiers = sorted(set(x for x in identifiers if x.split(".")[0] in
                             {"public", "private", "auth", "storage", "extensions", "cron", "vault", "postgres", "service_role", "http", "pg_cron"}))
    signatures = [name for name, pattern in {
        "registry_auth": "unauthorized: authentication required",
        "registry_rate_limit": "toomanyrequests",
        "image_missing": "manifest unknown",
        "disk_full": "no space left on device",
        "untrusted_certificate": "certificate signed by unknown authority",
        "health_check_failed": "not healthy",
        "connection_refused": "connection refused",
        "network_unreachable": "network is unreachable",
        "configuration_invalid": "failed to parse config",
    }.items() if pattern in text.lower()]
    return {"last_migration": migrations[-1] if migrations else None,
            "sqlstates": states, "identifiers": identifiers, "codes": signatures,
            "all_registry_candidates_failed": "failed to pull docker image from all registries" in text.lower(),
            "images": sorted(set(re.findall(r"(?:public\.ecr\.aws|ghcr\.io|docker\.io)/supabase/[a-z0-9._/-]+:[a-zA-Z0-9._-]+", text)))}


def command(args: list[str], *, data: bytes | None = None, timeout: int = 60,
            failure: str = "local_command_failed", allow_failure: bool = False):
    result = subprocess.run(args, input=data, capture_output=True, timeout=timeout, env=child_env())
    if result.returncode and not allow_failure:
        # Never print raw CLI/status/Auth responses or private SQL/COPY errors.
        if PRIVATE:
            (PRIVATE / "last-error.private.log").write_bytes(result.stderr + result.stdout)
        REPORT["command_diagnostics"] = safe_diagnostics(result.stderr + result.stdout)
        raise LabFailure(failure)
    return result


def docker(*args: str, **kwargs):
    return command(DOCKER + list(args), **kwargs)


def json_output(result) -> object:
    text = result.stdout.decode().strip()
    # --output json emits a single object. No secret-bearing output is logged.
    return json.loads(text)


def toml_set(text: str, section: str, name: str, value: str) -> str:
    pattern = r"(?ms)(^\[" + re.escape(section) + r"\]\n)(.*?)(?=^\[|\Z)"
    matches = list(re.finditer(pattern, text))
    if len(matches) != 1:
        raise LabFailure("unexpected_cli_configuration_section")
    m = matches[0]
    body = m.group(2)
    line = re.compile(r"(?m)^" + re.escape(name) + r"\s*=.*$")
    body = line.sub(name + " = " + value, body) if line.search(body) else name + " = " + value + "\n" + body
    return text[:m.start()] + m.group(1) + body + text[m.end():]


PRIVATE: Path | None = None


class Stack:
    def __init__(self, suffix: str, base_port: int, run_id: str):
        self.project = "tc-recovery-" + run_id + "-" + suffix
        self.network = self.project + "-offline"
        self.folder = PRIVATE / suffix
        self.folder.mkdir(mode=0o700)
        self.port = base_port
        self.containers: list[dict] = []
        self.settings: dict = {}

    def cli(self, *args: str, **kwargs):
        if (not self.project.startswith("tc-recovery-") or self.project == PRODUCTION
                or not self.folder.is_relative_to(PRIVATE) or self.folder.is_symlink()
                or (self.folder / "supabase/.temp/project-ref").exists()):
            raise LabFailure("refuse_linked_or_unowned_stack")
        return command(CLI + list(args) + ["--workdir", str(self.folder)], **kwargs)

    def prepare(self):
        self.cli("init", failure="local_cli_init_failed")
        config = self.folder / "supabase/config.toml"
        text = config.read_text()
        text = re.sub(r'(?m)^project_id\s*=.*$', 'project_id = "' + self.project + '"', text)
        values = {
            "api": {"port": str(self.port), "schemas": '["public"]'},
            "db": {"port": str(self.port + 1), "shadow_port": str(self.port - 1), "major_version": "17"},
            "db.seed": {"enabled": "false"},
            "studio": {"enabled": "false"},
            "realtime": {"enabled": "false"},
            "analytics": {"enabled": "false"},
            "edge_runtime": {"enabled": "false"},
            "storage.vector": {"enabled": "false"},
            "local_smtp": {"port": str(self.port + 3)},
            "auth": {"site_url": json.dumps("http://127.0.0.1:" + str(self.port)),
                     "external_url": json.dumps("http://127.0.0.1:" + str(self.port) + "/auth/v1"),
                     "additional_redirect_urls": "[]", "minimum_password_length": "12"},
            "auth.email": {"enable_confirmations": "true"},
            "auth.rate_limit": {"email_sent": "12"},
        }
        for section, items in values.items():
            for name, value in items.items():
                text = toml_set(text, section, name, value)
        # Unique ES256 keys for each source/destination. Nothing from production.
        key = json_output(self.cli("gen", "signing-key", "--algorithm", "ES256", "--output-format", "json"))
        key_path = self.folder / "signing.private.json"
        key_path.write_text(json.dumps([key]))
        key_path.chmod(0o600)
        self.key_digest = hashlib.sha256(key_path.read_bytes()).digest()
        text = toml_set(text, "auth", "signing_keys_path", json.dumps(str(key_path)))
        config.write_text(text)
        target = self.folder / "supabase/migrations"
        target.mkdir(exist_ok=True)
        migrations = sorted((ROOT / "supabase/migrations").glob("*.sql"))
        committed = command(["git", "-C", str(ROOT), "ls-files", "supabase/migrations/*.sql"]).stdout.decode().splitlines()
        # Remote history has65 entries, but the reviewed repository currently
        # consolidates that schema in42 files. Never substitute a remote counter
        # for exact committed source provenance.
        actual = [str(p.relative_to(ROOT)) for p in migrations]
        check(self.project + ": only the complete committed schema is staged",
              bool(committed) and sorted(committed) == actual and not any(p.is_symlink() for p in migrations))
        frozen = {
            "20261108013000_manual_subscription_invoice_intake.sql": "7323ded662cf8ec4560662a86c9224d21eb3d45ad4689caa919cf2638672da7b",
            "20261108100352_manual_subscription_payment_and_documents.sql": "cbfe47861f20129c4fbc51ebf35b2e37b46784489aee406f49291896fa81e069",
            "20261108134217_subscription_payment_incidents.sql": "f1be3f3f8b5220f0ce7c84767c0f564be4f4fd5f003a44cecf8c93b910ee8bc7",
            "20261108141748_truck_second_driver.sql": "dedceb1ce213bb3ed8f923de385303d251e53402522d143a55076245dc3f0375",
        }
        check(self.project + ": reviewed fiscal, session and crew migration hashes retained",
              all((ROOT / "supabase/migrations" / name).is_file() and hashlib.sha256((ROOT / "supabase/migrations" / name).read_bytes()).hexdigest() == digest
                  for name, digest in frozen.items()))
        REPORT["committed_schema_file_count"] = len(migrations)
        for p in migrations:
            shutil.copyfile(p, target / p.name)
        docker("network", "create", "--internal", "--opt", "com.docker.network.bridge.host_binding_ipv4=127.0.0.1",
               "--label", "truckcontrol.recovery=" + self.project, self.network,
               failure="isolated_network_creation_failed")
        net = json_output(docker("network", "inspect", self.network))[0]
        check(self.project + ": internal network and loopback-only binding", net["Internal"] is True
              and net["Options"].get("com.docker.network.bridge.host_binding_ipv4") == "127.0.0.1")
        print("Starting disposable " + self.project + " (private output suppressed)", flush=True)
        self.cli("start", "--network-id", self.network,
                 "--exclude", "realtime,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor",
                 timeout=600, failure="isolated_stack_start_failed")
        self.inspect()
        self.load_settings()
        check(self.project + ": all staged migrations actually applied",
              self.scalar("select count(*) from supabase_migrations.schema_migrations") == len(migrations))
        # No test job may queue work or call a remote provider.
        self.sql("do $$begin if to_regclass('cron.job') is not null then perform cron.unschedule(jobid) from cron.job;end if;end$$;")
        # Reproduce the verified production access requirement only in the new
        # loopback fixture. Payments and all provider switches remain false.
        self.sql("update private.tc_settings set registration_open=true,enforce_access=true where id;")
        check(self.project + ": source starts without users", self.scalar("select count(*) from auth.users") == 0)
        self.safety()

    def inspect(self):
        ids = docker("ps", "-aq", "--filter", "label=com.supabase.cli.project=" + self.project).stdout.decode().split()
        if not ids:
            raise LabFailure("no_owned_cli_containers")
        self.containers = json_output(docker("inspect", *ids))
        check(self.project + ": all containers owned, offline and loopback bound",
              all(container_allowed(c, self.project, self.network) for c in self.containers))
        self.db = next(c["Id"] for c in self.containers if c["Name"].startswith("/supabase_db_"))
        self.storage = next(c["Id"] for c in self.containers if c["Name"].startswith("/supabase_storage_"))

    def load_settings(self):
        self.settings = json_output(self.cli("status", "--output", "json", failure="local_status_unavailable"))
        def field(*names):
            return next((self.settings[n] for n in names if self.settings.get(n)), None)
        self.url = local_url(field("API_URL", "api_url"))
        self.public = field("PUBLISHABLE_KEY", "publishable_key", "ANON_KEY", "anon_key")
        self.service = field("SECRET_KEY", "secret_key", "SERVICE_ROLE_KEY", "service_role_key")
        if not isinstance(self.public, str) or not isinstance(self.service, str):
            raise LabFailure("missing_disposable_client_keys")

    def sql(self, text: str, *, user="postgres") -> str:
        return docker("exec", "-i", self.db, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", user, "-d", "postgres",
                      data=text.encode(), failure="local_sql_failed").stdout.decode().strip()

    def scalar(self, text: str):
        return json.loads(self.sql("select to_jsonb(x) from (" + text + ") x;").splitlines()[-1]).popitem()[1]

    def safety(self):
        data = json.loads(self.sql("select jsonb_build_object('payments',(select payments_enabled from private.tc_settings where id),'channels',(select count(*) from private.tc_manual_stripe_channels where enabled),'pdf_uploads',(select uploads_enabled from private.tc_manual_subscription_document_runtime where id),'notices',(select enabled from private.tc_manual_invoice_notice_settings where id),'ai_keys',(select count(*) from vault.secrets where name in ('truckcontrol_openai_api_key','truckcontrol_resend_api_key','truckcontrol_stripe_secret_key')));").splitlines()[-1])
        check(self.project + ": external billing, fiscal uploads, notices and provider credentials OFF",
              data == {"payments": False, "channels": 0, "pdf_uploads": False, "notices": False, "ai_keys": 0})

    def http(self, method: str, path: str, data=None, *, token=None, service=False, content_type="application/json"):
        if not path.startswith("/") or path.startswith("//"):
            raise LabFailure("refuse_nonlocal_path")
        key = self.service if service else self.public
        headers = {"apikey": key, "Authorization": "Bearer " + (token or key), "Content-Type": content_type}
        body = data if isinstance(data, bytes) else json.dumps(data).encode() if data is not None else None
        request = urllib.request.Request(self.url + path, data=body, method=method, headers=headers)
        # Do not inherit an external proxy for loopback and never follow redirects.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs):
                return None
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect)
        try:
            response = opener.open(request, timeout=25)
        except urllib.error.HTTPError as e:
            response = e
        with response:
            raw = response.read(12 * 1024 * 1024)
            try:
                parsed = json.loads(raw)
            except (ValueError, UnicodeError):
                parsed = raw
            return response.code, parsed

    def rpc(self, name: str, data: dict, token: str):
        status, result = self.http("POST", "/rest/v1/rpc/" + name, data, token=token)
        if status != 200:
            raise LabFailure("rpc_" + name + "_status_" + str(status))
        return result

    def mail_token(self, recipient: str, kind: str) -> str:
        """Consume only the actual locally captured SMTP link; never log it."""
        base = local_url("http://127.0.0.1:" + str(self.port + 3))
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        end = time.monotonic() + 15
        while time.monotonic() < end:
            with opener.open(base + "/api/v1/messages", timeout=10) as response:
                listing = json.load(response)
            for message in listing.get("messages", []):
                if recipient not in [item.get("Address") for item in message.get("To", [])]:
                    continue
                message_id = message.get("ID", "")
                if not re.fullmatch(r"[A-Za-z0-9_-]+", message_id):
                    raise LabFailure("invalid_local_message_identifier")
                with opener.open(base + "/api/v1/message/" + message_id, timeout=10) as response:
                    content = json.load(response)
                for href in re.findall(r'''href=["']([^"']+)["']''', content.get("HTML", "")):
                    parsed = urllib.parse.urlsplit(html.unescape(href))
                    if (parsed.scheme != "http" or parsed.hostname != "127.0.0.1"
                            or parsed.port != self.port or parsed.path != "/auth/v1/verify"
                            or parsed.username or parsed.password or parsed.fragment):
                        continue
                    values = urllib.parse.parse_qs(parsed.query)
                    token = values.get("token", [])
                    if values.get("type") == [kind] and len(token) == 1 and token[0]:
                        check("actual isolated SMTP message carries " + kind + " link", True)
                        return token[0]
            time.sleep(0.3)
        raise LabFailure("local_smtp_confirmation_not_delivered")

    def freeze(self):
        others = [c["Id"] for c in self.containers if c["Id"] != self.db]
        docker("stop", "--time", "10", *others, timeout=90, failure="freeze_local_services_failed")

    def resume(self):
        others = [c["Id"] for c in self.containers if c["Id"] != self.db]
        docker("start", *others, timeout=90, failure="restart_local_services_failed")
        end = time.monotonic() + 60
        while time.monotonic() < end:
            try:
                status, _ = self.http("GET", "/auth/v1/health")
                if status == 200:
                    return
            except (OSError, urllib.error.URLError):
                pass
            time.sleep(1)
        raise LabFailure("restored_auth_not_ready")

    def cleanup(self):
        # Only the two newly owned workdirs/project IDs; never --all or remote.
        if self.project.startswith("tc-recovery-") and self.folder.is_relative_to(PRIVATE):
            self.cli("stop", "--no-backup", "--project-id", self.project,
                     timeout=120, allow_failure=True)
            remaining = docker("ps", "-aq", "--filter", "label=com.supabase.cli.project=" + self.project).stdout.strip()
            if remaining:
                raise LabFailure("owned_stack_cleanup_incomplete")
            docker("network", "rm", self.network, allow_failure=True)


def quote(value: str):
    return "'" + value.replace("'", "''") + "'"


def synthetic_pdf() -> bytes:
    parts = [b"%PDF-1.4\n"]
    objects = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
               b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>"]
    stream = b"BT /F1 12 Tf 20 100 Td (SYNTHETIC RECOVERY TEST - NOT A FISCAL INVOICE) Tj ET"
    objects += [b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
                b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    offsets = [0]
    for n, obj in enumerate(objects, 1):
        offsets.append(sum(map(len, parts)))
        parts.append(str(n).encode() + b" 0 obj\n" + obj + b"\nendobj\n")
    at = sum(map(len, parts))
    parts.append(b"xref\n0 6\n0000000000 65535 f \n" + b"".join(f"{o:010d} 00000 n \n".encode() for o in offsets[1:]))
    parts.append(b"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + str(at).encode() + b"\n%%EOF\n")
    return b"".join(parts)


def signup(stack: Stack, letter: str):
    email = "recovery-" + letter.lower() + "@example.invalid"
    password = secrets.token_urlsafe(28) + "aA1!"
    body = {"email": email, "password": password, "data": {"truckcontrol_registration": {
        "contact_name": "Synthetic operator " + letter, "company_name": "Synthetic recovery " + letter,
        "tax_id": "DEMO-RECOVERY-" + letter, "address": "Synthetic recovery street 112",
        "phone": "+1202555090" + ("1" if letter == "A" else "2"), "requested_plan": "limited"}}}
    status, result = stack.http("POST", "/auth/v1/signup", body)
    check("real Auth signup requires email confirmation " + letter, status == 200
          and result.get("session") is None and not result.get("user", result).get("email_confirmed_at"))
    user = result.get("user", result)["id"]
    uuid.UUID(user)
    # The production custom-mail service records trusted consent. This is its
    # explicit isolated SQL fixture, not a claim of Resend production delivery.
    stack.sql("insert into private.tc_auth_legal_consents(user_id,legal_version,source) values(" + quote(user) + ",'2026-11-02','authenticated_profile');")
    token_hash = stack.mail_token(email, "signup")
    status, verified = stack.http("POST", "/auth/v1/verify", {"type": "signup", "token_hash": token_hash})
    check("real Auth confirms the synthetic email " + letter, status == 200 and bool(verified.get("user", {}).get("email_confirmed_at")))
    status, reused = stack.http("POST", "/auth/v1/verify", {"type": "signup", "token_hash": token_hash})
    check("confirmation link is single-use " + letter, status >= 400)
    status, login = stack.http("POST", "/auth/v1/token?grant_type=password", {"email": email, "password": password})
    check("real password login succeeds " + letter, status == 200 and isinstance(login.get("access_token"), str))
    token = login["access_token"]
    claims = json.loads(base64.urlsafe_b64decode(token.split(".")[1] + "=="))
    check("native session exists and passes the current session predicate " + letter,
          stack.rpc("tc_verified_session", {}, token) is True and isinstance(claims.get("session_id"), str))
    access = stack.rpc("tc_finish_registration", {}, token)
    check("new company receives only Basic trial " + letter, access.get("plan") == "limited")
    status, organizations = stack.http("GET", "/rest/v1/organizations?select=id&owner_id=eq." + user, token=token)
    check("one company provisioned through actual REST " + letter, status == 200 and len(organizations) == 1)
    return {"user": user, "email": email, "password": password, "token": token, "org": organizations[0]["id"]}


def snapshot(stack: Stack) -> dict:
    tables = ["auth.users", "auth.sessions", "public.organizations", "public.drivers", "public.trucks",
              "private.tc_customers", "private.tc_auth_legal_consents", "private.company_documents", "private.tc_document_details", "storage.buckets", "storage.objects"]
    result = {}
    for table in tables:
        result[table] = json.loads(stack.sql("select jsonb_build_object('n',count(*),'digest',md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]')::text)) from " + table + " t;").splitlines()[-1])
    return result


def exercise(source: Stack, target: Stack):
    a, b = signup(source, "A"), signup(source, "B")
    pdf = synthetic_pdf()
    document = str(uuid.uuid4())
    path = a["org"] + "/" + document + "/document.pdf"
    # Full is granted ONLY in the disposable fixture after Basic was asserted.
    source.sql("update private.tc_customers set trial_plan_id='full' where user_id=" + quote(a["user"]) + ";")
    status, _ = source.http("POST", "/storage/v1/object/truckcontrol-documents/" + path, pdf,
                            token=a["token"], content_type="application/pdf")
    check("authorized company uploads actual private PDF bytes", status in (200, 201))
    source.rpc("tc_register_document", {"p_org": a["org"], "p_document": {
        "id": document, "name": "SYNTHETIC - NOT FISCAL.pdf", "object_path": path, "content_type": "application/pdf",
        "size_bytes": len(pdf), "truck_id": None, "driver_id": None}, "p_tracking": {
            "category": "other", "status": "active", "expires_on": None, "remind_days": 30}}, a["token"])
    status, content = source.http("GET", "/storage/v1/object/authenticated/truckcontrol-documents/" + path, token=a["token"])
    check("authorized download matches PDF bytes exactly", status == 200 and content == pdf)
    status, _ = source.http("GET", "/storage/v1/object/authenticated/truckcontrol-documents/" + path, token=b["token"])
    check("another company cannot download the private original", status >= 400)
    status, _ = source.http("GET", "/storage/v1/object/public/truckcontrol-documents/" + path)
    check("public URL cannot expose the private original", status >= 400)
    attack = a["org"] + "/" + str(uuid.uuid4()) + "/attack.pdf"
    status, _ = source.http("POST", "/storage/v1/object/truckcontrol-documents/" + attack, pdf, token=b["token"], content_type="application/pdf")
    check("another company cannot upload into the first company namespace", status >= 400)
    for actor, plate in [(a, "QA REC A"), (b, "QA REC B")]:
        status, _ = source.http("POST", "/rest/v1/trucks", {"id": str(uuid.uuid4()), "organization_id": actor["org"],
            "plate": plate, "brand": "MAN", "model": "Synthetic", "year": 2026, "inspection_due_on": "2027-11-12"}, token=actor["token"])
        check("real REST inserts only the authorized company truck " + plate, status == 201)
    status, rows = source.http("GET", "/rest/v1/trucks?select=organization_id,plate", token=a["token"])
    check("actual signed JWT and RLS hide the other company truck", status == 200 and len(rows) == 1 and rows[0]["organization_id"] == a["org"])
    # Genuine recovery token verification and password change, no token is logged.
    status, _ = source.http("POST", "/auth/v1/recover", {"email": a["email"]})
    check("forgot-password request succeeds without external SMTP", status == 200)
    token_hash = source.mail_token(a["email"], "recovery")
    status, recovery = source.http("POST", "/auth/v1/verify", {"type": "recovery", "token_hash": token_hash})
    check("real Auth verifies the recovery token", status == 200 and isinstance(recovery.get("access_token"), str))
    replacement = secrets.token_urlsafe(28) + "bB2!"
    status, _ = source.http("PUT", "/auth/v1/user", {"password": replacement}, token=recovery["access_token"])
    check("verified recovery changes the password", status == 200)
    status, _ = source.http("POST", "/auth/v1/token?grant_type=password", {"email": a["email"], "password": a["password"]})
    check("old password no longer authenticates", status >= 400)
    a["password"] = replacement
    # Consistent snapshot: freeze non-DB services, then dump schema+data and raw objects.
    before = snapshot(source)
    source.freeze()
    dump = docker("exec", source.db, "pg_dump", "-U", "postgres", "-d", "postgres", "-Fc",
                  timeout=120, failure="source_dump_failed").stdout
    storage = docker("cp", source.storage + ":/var/lib/storage/.", "-", timeout=60, failure="storage_backup_failed").stdout
    with tarfile.open(fileobj=io.BytesIO(storage)) as archive:
        members = archive.getmembers()
        check("storage archive contains no symlinks, devices or escaping paths", all(
            not m.name.startswith("/") and ".." not in Path(m.name).parts and (m.isdir() or m.isfile()) for m in members))
        check("backup contains the actual original PDF", any(m.isfile() and archive.extractfile(m).read() == pdf for m in members))
    (PRIVATE / "database.private.dump").write_bytes(dump)
    (PRIVATE / "storage.private.tar").write_bytes(storage)
    REPORT["private_backup"] = {"database_sha256": hashlib.sha256(dump).hexdigest(), "database_bytes": len(dump),
        "storage_sha256": hashlib.sha256(storage).hexdigest(), "storage_bytes": len(storage), "raw_artifacts_uploaded": False}
    target.freeze()
    docker("exec", "-i", target.db, "pg_restore", "-U", "postgres", "-d", "postgres", "--clean", "--if-exists", "--exit-on-error",
           data=dump, timeout=180, failure="destination_restore_failed")
    docker("cp", "-a", "-", target.storage + ":/var/lib/storage/", data=storage, timeout=60, failure="storage_restore_failed")
    after = snapshot(target)
    check("restored Auth, company, document and Storage metadata match the snapshot exactly", before == after)
    target.resume()
    target.safety()
    status, _ = target.http("GET", "/auth/v1/user", token=b["token"])
    check("source access token is rejected by the distinct destination signing key", status >= 400)
    status, login = target.http("POST", "/auth/v1/token?grant_type=password", {"email": a["email"], "password": a["password"]})
    check("restored account logs in with its recovered password", status == 200 and isinstance(login.get("access_token"), str))
    fresh = login["access_token"]
    check("restored session passes the current permission predicate", target.rpc("tc_verified_session", {}, fresh) is True)
    status, content = target.http("GET", "/storage/v1/object/authenticated/truckcontrol-documents/" + path, token=fresh)
    check("restored authenticated download preserves the original bytes", status == 200 and content == pdf)
    status, second = target.http("POST", "/auth/v1/token?grant_type=password", {"email": b["email"], "password": b["password"]})
    check("second company also authenticates after restoration", status == 200)
    status, _ = target.http("GET", "/storage/v1/object/authenticated/truckcontrol-documents/" + path, token=second["access_token"])
    check("cross-company Storage isolation survives restoration", status >= 400)
    status, _ = target.http("POST", "/auth/v1/logout?scope=global", token=fresh)
    check("real global sign-out succeeds", status in (200, 204))
    status, rows = target.http("GET", "/rest/v1/trucks?select=id", token=fresh)
    check("unexpired but signed-out token cannot read private fleet data", status >= 400 or rows == [])
    status, _ = target.http("GET", "/storage/v1/object/authenticated/truckcontrol-documents/" + path, token=fresh)
    check("signed-out token cannot retrieve restored private document", status >= 400)


def main():
    global PRIVATE
    if os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("TRUCKCONTROL_LOCAL_SERVICE_ACCEPTANCE") != "synthetic-only":
        raise LabFailure("ci_only_explicit_isolated_opt_in_required")
    if os.environ.get("GITHUB_REPOSITORY") != "smartscaneuskadi/TruckControl-AI":
        raise LabFailure("exclusive_repository_required")
    RESULTS.mkdir(exist_ok=True)
    PRIVATE = Path(tempfile.mkdtemp(prefix="truckcontrol-service-private-", dir=os.environ.get("RUNNER_TEMP")))
    PRIVATE.chmod(0o700)
    run_id = uuid.uuid4().hex[:10]
    stacks = [Stack("source", 55431, run_id), Stack("target", 55531, run_id)]
    REPORT["started_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    try:
        check("runner has at least 8GB free for disposable service images", shutil.disk_usage(PRIVATE).free >= 8 * 1024**3)
        for stack in stacks:
            stack.prepare()
        check("source and destination have distinct asymmetric signing keys", stacks[0].key_digest != stacks[1].key_digest)
        exercise(*stacks)
        REPORT["all_passed"] = True
    except (LabFailure, subprocess.TimeoutExpired, OSError, ValueError, KeyError, StopIteration) as error:
        REPORT["all_passed"] = False
        REPORT["failure_code"] = str(error) if isinstance(error, LabFailure) else type(error).__name__
        print("FAIL " + REPORT["failure_code"], flush=True)
    finally:
        for stack in reversed(stacks):
            try:
                stack.cleanup()
            except Exception:
                REPORT["cleanup_failed"] = True
        REPORT["completed_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        (RESULTS / "receipt.json").write_text(json.dumps(REPORT, indent=2) + "\n")
        # No dumps, JWTs, passwords, keys, raw SMTP messages or CLI logs in output.
        print(json.dumps({"passed_checks": len(REPORT["checks"]), "all_passed": REPORT.get("all_passed"),
                          "managed_platform_restore_verified": False, "external_provider_calls": 0,
                          "diagnostics": REPORT.get("command_diagnostics")}), flush=True)
    return 0 if REPORT.get("all_passed") and not REPORT.get("cleanup_failed") else 1


if __name__ == "__main__":
    raise SystemExit(main())
