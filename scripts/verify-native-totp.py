#!/usr/bin/env python3
"""Real, bounded native TOTP + candidate SQL acceptance in an offline CI stack.

Uses the existing owned Auth/Postgres/Storage recovery lab and the repository's
pinned Supabase SDK. Passwords, factor secrets, QR codes, OTPs and signed tokens
remain in private memory/pipes. Only fixed-code, non-secret evidence is saved.
This does not enable managed MFA or certify a managed-platform restore.
"""
from __future__ import annotations

import base64
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
import hashlib
import hmac
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import tempfile
import time
import uuid
from xml.parsers import expat

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("native_totp_recovery", ROOT / "scripts/verify-local-service-recovery.py")
assert spec and spec.loader
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)
LabFailure = lab.LabFailure
check = lab.check
q = lab.quote
RESULTS = ROOT / "native-totp-results"
CANDIDATE_SUFFIX = "_optional_totp_session_protection.sql"
REPOSITORY = "smartscaneuskadi/TruckControl-AI"
QR_PREFIX = "data:image/svg+xml;utf-8,"
QR_MAX_LENGTH = 2 * 1024 * 1024


def native_qr_profile(value: str) -> dict:
    """Inspect native SVG only in RAM; return names and compatibility booleans.

    Auth2.197 pins goqrsvg17e843f1dd40/svgo1546f124cd8b. Its root has
    xmlns:xlink and its rectangles use exactly two fixed, inert style strings.
    The UI discards that unused namespace and converts those exact styles to
    fill/stroke attributes. No SVG, dimensions, coordinates, paths or values
    from the enrollment response enter this profile or an error message.
    """
    profile = {"tag_names": [], "attribute_names": [],
               "prefix_compatible": isinstance(value, str) and value.startswith(QR_PREFIX),
               "within_2_mib": isinstance(value, str) and len(value) <= QR_MAX_LENGTH,
               "namespace_compatible": False, "exact_native_style_compatible": False,
               "structure_compatible": False}
    if not profile["prefix_compatible"] or not profile["within_2_mib"]:
        return profile
    svg = value[len(QR_PREFIX):]
    tags, attributes, parents = set(), set(), []
    namespace_ok, style_ok, structure_ok, has_rect = True, True, True, False
    root_attrs = {"xmlns", "xmlns:xlink", "width", "height"}
    rect_attrs = {"x", "y", "width", "height", "style"}

    def start(name: str, attrs: dict) -> None:
        nonlocal namespace_ok, style_ok, structure_ok, has_rect
        tags.add(name)
        attributes.update(attrs)
        if not parents:
            structure_ok &= name == "svg" and set(attrs) == root_attrs
            namespace_ok &= (attrs.get("xmlns") == "http://www.w3.org/2000/svg"
                             and attrs.get("xmlns:xlink") == "http://www.w3.org/1999/xlink")
        else:
            structure_ok &= name == "rect" and parents == ["svg"] and set(attrs) == rect_attrs
            namespace_ok &= not any(key.startswith("xmlns") for key in attrs)
            style_ok &= name == "rect" and attrs.get("style") in {"fill:black;stroke:none", "fill:white;stroke:none"}
            has_rect |= name == "rect"
        parents.append(name)

    def characters(data: str) -> None:
        nonlocal structure_ok
        structure_ok &= not data.strip()

    def forbidden(*args) -> None:
        # Never let a DTD/entity/processing instruction resolve external data.
        raise ValueError("native_qr_declaration_forbidden")

    parser = expat.ParserCreate()
    parser.StartElementHandler = start
    parser.EndElementHandler = lambda name: parents.pop()
    parser.CharacterDataHandler = characters
    parser.StartDoctypeDeclHandler = forbidden
    parser.EntityDeclHandler = forbidden
    parser.ExternalEntityRefHandler = forbidden
    parser.ProcessingInstructionHandler = forbidden
    try:
        parser.Parse(svg, True)
    except (expat.ExpatError, ValueError, IndexError):
        namespace_ok = style_ok = structure_ok = False
    profile.update(tag_names=sorted(tags), attribute_names=sorted(attributes),
                   namespace_compatible=bool(namespace_ok and tags),
                   exact_native_style_compatible=bool(style_ok and has_rect),
                   structure_compatible=bool(structure_ok and has_rect and not parents))
    return profile


def isolated_context(env: dict) -> None:
    if (env.get("GITHUB_ACTIONS") != "true"
            or env.get("TRUCKCONTROL_LOCAL_SERVICE_ACCEPTANCE") != "synthetic-only"
            or env.get("TRUCKCONTROL_NATIVE_TOTP_ACCEPTANCE") != "synthetic-only"):
        raise LabFailure("ci_only_explicit_native_totp_opt_in_required")
    if env.get("GITHUB_REPOSITORY") != REPOSITORY:
        raise LabFailure("exclusive_repository_required")


def candidate_path(root: Path = ROOT) -> Path:
    candidates = [path for path in (root / "supabase/migrations").glob("*" + CANDIDATE_SUFFIX)
                  if re.fullmatch(r"[0-9]{14}" + re.escape(CANDIDATE_SUFFIX), path.name)]
    if len(candidates) != 1:
        raise LabFailure("exactly_one_committed_shaped_optional_totp_candidate_required")
    path = candidates[0]
    if not path.is_file() or path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
        raise LabFailure("committed_optional_totp_candidate_required")
    return path


def actor_guard(stack, actor: dict) -> None:
    lab.local_url(stack.url)
    if (not re.fullmatch(r"tc-recovery-[a-f0-9]{10}-[a-z]+", stack.project)
            or actor.get("email") not in {"recovery-a@example.invalid", "recovery-b@example.invalid"}):
        raise LabFailure("refuse_nonfictional_native_totp_actor")
    try:
        uuid.UUID(actor["user"])
    except (ValueError, KeyError, TypeError):
        raise LabFailure("refuse_invalid_native_totp_actor") from None


def native_environment() -> dict:
    env = lab.child_env()
    for name in list(env):
        if name.lower() in {"http_proxy", "https_proxy", "all_proxy", "no_proxy"} or name in {"NODE_USE_ENV_PROXY", "NODE_OPTIONS"}:
            env.pop(name, None)
    return env


def claims(token: str) -> dict:
    try:
        return json.loads(base64.urlsafe_b64decode(token.split(".")[1] + "=="))
    except (ValueError, IndexError, TypeError):
        raise LabFailure("native_signed_jwt_claims_unavailable") from None


def totp(secret: str, counter: int) -> str:
    """RFC6238/HMAC-SHA1, six digits; secret and code never leave private RAM."""
    if not isinstance(secret, str) or not re.fullmatch(r"[A-Z2-7]{16,128}", secret):
        raise LabFailure("native_totp_secret_shape_invalid")
    key = base64.b32decode(secret + "=" * (-len(secret) % 8))
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    at = digest[-1] & 15
    value = struct.unpack(">I", digest[at:at + 4])[0] & 0x7fffffff
    return f"{value % 1000000:06d}"


def live_session(stack, token: str) -> dict:
    sid = str(uuid.UUID(claims(token)["session_id"]))
    raw = stack.sql("select jsonb_build_object('aal',aal::text,'factor_id',factor_id,"
                    "'user_id',user_id,'live',not_after is null or not_after>now()) "
                    "from auth.sessions where id=" + q(sid) + ";")
    return json.loads(raw) if raw else {}


def factor_state(stack, actor: dict, factor: dict) -> dict:
    actor_guard(stack, actor)
    fid = str(uuid.UUID(factor["id"]))
    raw = stack.sql("select jsonb_build_object('status',status::text,'kind',factor_type::text,"
                    "'same_user',user_id=" + q(actor["user"]) + "::uuid) "
                    "from auth.mfa_factors where id=" + q(fid) + ";")
    return json.loads(raw) if raw else {}


def factor_inventory(stack, actor: dict) -> dict:
    actor_guard(stack, actor)
    return json.loads(stack.sql("select coalesce(jsonb_object_agg(id::text,status::text),'{}') "
                                "from auth.mfa_factors where user_id=" + q(actor["user"])
                                + " and factor_type='totp';"))


class NativeClient:
    def __init__(self, stack, actor: dict):
        actor_guard(stack, actor)
        self.stack, self.actor = stack, dict(actor)

    def call(self, action: str, data: dict | None = None) -> dict:
        actor_guard(self.stack, self.actor)
        payload = {"url": self.stack.url, "project": self.stack.project, "publicKey": self.stack.public,
                   "session": {"access_token": self.actor["token"], "refresh_token": self.actor["refresh_token"]},
                   "action": action, "data": data}
        # Node24's optional environment proxy must not receive local credentials.
        # Private worker errors are fixed codes; raw responses are never logged.
        result = subprocess.run(["node", str(ROOT / "scripts/native-totp-sdk.mjs")],
                                input=json.dumps(payload).encode(), capture_output=True,
                                timeout=45, env=native_environment())
        if result.returncode:
            raise LabFailure("native_auth_sdk_worker_failed")
        return json.loads(result.stdout)

    def native(self, action: str, data: dict | None = None) -> dict:
        result = self.call(action, data)
        if "error" in result:
            lab.REPORT["native_error"] = {"operation": action, **result["error"]}
            raise LabFailure("native_" + action.lower() + "_rejected")
        return result.get("data") or {}

    def accept(self, data: dict, expected_aal: str, *, sid: str | None = None) -> str:
        session = data.get("session") or data
        token, refresh = session.get("access_token"), session.get("refresh_token")
        if not isinstance(token, str) or not isinstance(refresh, str):
            raise LabFailure("native_session_response_required")
        current = claims(token)
        check("native signed session has the expected actor and " + expected_aal,
              current.get("sub") == self.actor["user"] and current.get("role") == "authenticated"
              and current.get("aal") == expected_aal and isinstance(current.get("session_id"), str)
              and (sid is None or current["session_id"] == sid))
        self.actor.update(token=token, refresh_token=refresh)
        actual = self.native("user").get("user", {})
        check("real Auth validates the returned signed JWT", actual.get("id") == self.actor["user"])
        return token

    def enroll(self, label: str | None = None) -> dict:
        response = self.native("enroll", {"friendlyName": label} if label else {})
        profile = native_qr_profile(response.get("totp", {}).get("qr_code"))
        lab.REPORT.setdefault("native_qr_profiles", []).append(profile)
        check("native QR has the exact inert upstream structure within the UI bound",
              all(value is True for key, value in profile.items() if key not in {"tag_names", "attribute_names"}))
        factor = {"id": str(uuid.UUID(response["id"])), "secret": response.get("totp", {}).get("secret"),
                  "last_counter": -1}
        # Discard the native QR/URI immediately; neither is a receipt field.
        del response
        check("native enrollment creates only a pending TOTP factor",
              factor_state(self.stack, self.actor, factor) == {"status": "unverified", "kind": "totp", "same_user": True})
        return factor

    def verify(self, factor: dict) -> str:
        end = time.monotonic() + 33
        while int(time.time()) // 30 <= factor["last_counter"]:
            if time.monotonic() >= end:
                raise LabFailure("bounded_native_totp_counter_wait_expired")
            time.sleep(.2)
        counter = int(time.time()) // 30
        old_sid = claims(self.actor["token"])["session_id"]
        response = self.native("challengeAndVerify", {"factorId": factor["id"], "code": totp(factor["secret"], counter)})
        factor["last_counter"] = counter
        token = self.accept(response, "aal2", sid=old_sid)
        check("native challengeAndVerify upgrades the same live SID and binds its verified factor",
              live_session(self.stack, token) == {"aal": "aal2", "factor_id": factor["id"],
                                                   "user_id": self.actor["user"], "live": True}
              and factor_state(self.stack, self.actor, factor) == {"status": "verified", "kind": "totp", "same_user": True})
        return token


def capability(stack, token: str) -> None:
    check("candidate SQL capability is exact and reachable while a challenge is pending",
          stack.rpc("tc_mfa_protection_status", {}, token) == {"schema_version": 1, "totp_enforcement": True})


def access(stack, actor: dict, token: str, allowed: bool, label: str) -> None:
    check(label + ": candidate predicate matches native assurance", stack.rpc("tc_verified_session", {}, token) is allowed)
    status, rows = stack.http("GET", "/rest/v1/trucks?select=organization_id,plate", token=token)
    if allowed:
        check(label + ": tenant RLS preserves exactly the own fleet",
              status == 200 and isinstance(rows, list) and len(rows) == 1 and rows[0]["organization_id"] == actor["org"])
    else:
        check(label + ": real REST denies private fleet data", status >= 400 or rows == [])


def password_login(stack, actor: dict) -> NativeClient:
    status, response = stack.http("POST", "/auth/v1/token?grant_type=password", {"email": actor["email"], "password": actor["password"]})
    check("native password login returns a real AAL1 session", status == 200 and claims(response.get("access_token", "")).get("aal") == "aal1")
    login = NativeClient(stack, actor)
    login.accept(response, "aal1")
    return login


def restore_native_factor(stack, actor: dict, factor: dict) -> NativeClient:
    """Logical restore into the same disposable stack keeps isolated key custody.

    All Auth services are stopped. A real dump is held only in RAM; the factor
    rows are removed, then recreated by pg_restore. This proves local recovery,
    not a cross-environment/managed restore, key rotation or production custody.
    """
    stack.inspect()
    auth = next(c for c in stack.containers if c["Name"] == "/supabase_auth_" + stack.project)
    env_digest = hashlib.sha256(json.dumps(auth["Config"]["Env"], sort_keys=True).encode()).digest()
    signing_digest = hashlib.sha256((stack.folder / "signing.private.json").read_bytes()).digest()
    stack.freeze()
    snapshot_sql = "select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]')::text) from auth.mfa_factors t;"
    before = stack.sql(snapshot_sql)
    dump = lab.docker("exec", stack.db, "pg_dump", "-U", "supabase_admin", "-d", "postgres", "-Fc",
                      timeout=120, failure="isolated_auth_dump_failed").stdout
    stack.sql("delete from auth.mfa_factors;")
    check("isolated factor rows are absent before actual logical restore", stack.scalar("select count(*) from auth.mfa_factors") == 0)
    lab.docker("exec", "-i", stack.db, "pg_restore", "-U", "supabase_admin", "-d", "postgres",
               "--clean", "--if-exists", "--exit-on-error", data=dump, timeout=180,
               failure="isolated_auth_restore_failed")
    del dump
    check("real pg_restore recreates the exact native factor rows", stack.sql(snapshot_sql) == before)
    after = lab.json_output(lab.docker("inspect", auth["Id"]))[0]
    check("isolated Auth container and private signing/encryption configuration retain key custody",
          after["Id"] == auth["Id"]
          and hmac.compare_digest(env_digest, hashlib.sha256(json.dumps(after["Config"]["Env"], sort_keys=True).encode()).digest())
          and hmac.compare_digest(signing_digest, hashlib.sha256((stack.folder / "signing.private.json").read_bytes()).digest()))
    stack.resume()
    stack.safety()
    restored = password_login(stack, actor)
    access(stack, actor, restored.actor["token"], False, "restored factor and password session")
    restored.verify(factor)
    access(stack, actor, restored.actor["token"], True, "restored factor after native challenge")
    lab.REPORT["isolated_auth_logical_restore_verified"] = True
    return restored


def pending_enrollment_contract(native: NativeClient, primary: dict, primary_name: str) -> tuple[dict, dict]:
    """Bounded native API calls; no extra challenge, OTP wait or policy flag."""
    stack, actor = native.stack, native.actor
    original = {primary["id"]: "unverified"}
    duplicate = native.call("enroll", {"friendlyName": primary_name})
    check("native duplicate pending friendly name is rejected without creating a factor",
          duplicate.get("error", {}).get("code") == "mfa_factor_name_conflict"
          and factor_inventory(stack, actor) == original)
    unnamed = native.enroll()  # Deliberate blank-name regression, not the normal UI path.
    first_two = {**original, unnamed["id"]: "unverified"}
    duplicate = native.call("enroll", {})
    check("native duplicate blank friendly name is rejected without creating a factor",
          duplicate.get("error", {}).get("code") == "mfa_factor_name_conflict"
          and factor_inventory(stack, actor) == first_two)
    spare = native.enroll("Isolated pending " + uuid.uuid4().hex)
    full = {**first_two, spare["id"]: "unverified"}
    check("three pending native TOTP factors occupy all three isolated slots",
          factor_inventory(stack, actor) == full)
    overflow = native.call("enroll", {"friendlyName": "Isolated overflow " + uuid.uuid4().hex})
    check("native pending factors count toward the unchanged max three quota",
          overflow.get("error", {}).get("code") == "too_many_enrolled_mfa_factors"
          and factor_inventory(stack, actor) == full)
    native.native("unenroll", {"factorId": unnamed["id"]})
    check("selected pending native unenrollment at AAL1 frees exactly one slot and preserves both others",
          claims(actor["token"]).get("aal") == "aal1"
          and live_session(stack, actor["token"]) == {"aal": "aal1", "factor_id": None,
                                                       "user_id": actor["user"], "live": True}
          and factor_inventory(stack, actor) == {**original, spare["id"]: "unverified"})
    replacement = native.enroll("Isolated replacement " + uuid.uuid4().hex)
    check("one new native enrollment consumes exactly the selected freed slot",
          factor_inventory(stack, actor) == {**original, spare["id"]: "unverified", replacement["id"]: "unverified"})
    access(stack, actor, actor["token"], True, "only pending factors after explicit selected cleanup")
    return spare, replacement


def verify_queued_behind_retirement_guard(native: NativeClient, primary: dict) -> str:
    """An actual native verification waits while retirement is rejected.

    The row lock belongs only to this owned disposable stack. A separate Auth
    request must be observed blocked by that exact backend before running the
    reviewed SQL guard. No Auth row, secret or provider flag is changed by the
    retirement attempt, and releasing the holder lets native Auth finish.
    """
    stack = native.stack
    actor_guard(stack, native.actor)
    factor = str(uuid.UUID(primary["id"]))
    marker = "tc-totp-retirement-" + uuid.uuid4().hex[:12]
    body_before = stack.scalar("select md5(prosrc) from pg_proc where oid='private.tc_actor_verified(uuid,boolean)'::regprocedure")
    holder = subprocess.Popen(lab.DOCKER + ["exec", "-i", stack.db, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
                                           "-U", "postgres", "-d", "postgres"],
                              stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=lab.child_env())
    pool = ThreadPoolExecutor(max_workers=1)
    try:
        holder.stdin.write(("set application_name=" + q(marker) + ";begin;select 1 from auth.mfa_factors where id="
                            + q(factor) + " for update;\n").encode())
        holder.stdin.flush()
        deadline = time.monotonic() + 15
        while not stack.scalar("select exists(select 1 from pg_stat_activity where application_name=" + q(marker)
                               + " and state='idle in transaction')"):
            if holder.poll() is not None or time.monotonic() >= deadline:
                raise LabFailure("bounded_native_retirement_holder_not_ready")
            time.sleep(.1)
        future = pool.submit(native.verify, primary)
        deadline = time.monotonic() + 15
        while not stack.scalar("select exists(select 1 from pg_stat_activity waiting where exists("
                               "select 1 from pg_stat_activity holding where holding.application_name=" + q(marker)
                               + " and holding.pid=any(pg_blocking_pids(waiting.pid))))"):
            if future.done() or time.monotonic() >= deadline:
                raise LabFailure("bounded_native_verification_was_not_queued")
            time.sleep(.1)
        check("actual native factor verification is queued behind the owned pending-factor row lock", True)
        guard = lab.docker("exec", "-i", stack.db, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
                           "-U", "postgres", "-d", "postgres",
                           data=(ROOT / "docs/verification/optional-totp-protection-rollback.sql").read_bytes(),
                           allow_failure=True, timeout=15)
        check("retirement guard rejects before an in-flight native verification can complete",
              guard.returncode != 0
              and b"optional_totp_enforcement_retirement_requires_forward_migration" in guard.stderr)
        del guard
        holder.communicate(input=b"commit;\n", timeout=10)
        check("owned native retirement row lock is released without deleting the factor", holder.returncode == 0)
        try:
            token = future.result(timeout=45)
        except FutureTimeout:
            raise LabFailure("bounded_native_queued_verification_timed_out") from None
        check("retirement attempt preserves the exact server enforcement predicate after native verification",
              stack.scalar("select md5(prosrc) from pg_proc where oid='private.tc_actor_verified(uuid,boolean)'::regprocedure") == body_before)
        lab.REPORT["retirement_native_race"] = {
            "verified_native_wait_observed": True,
            "guard_rejected": True,
            "native_verify_completed": True,
            "server_enforcement_preserved": True,
        }
        return token
    finally:
        if holder.poll() is None:
            try:
                holder.communicate(input=b"rollback;\n", timeout=10)
            except (OSError, ValueError, subprocess.TimeoutExpired):
                holder.kill()
                holder.communicate(timeout=10)
        pool.shutdown(wait=True, cancel_futures=True)


def full_call(stack, token: str, action: str, *, org=None, expected=None, operation=None, data=None):
    body = {"p_action": action, "p_data": data or {}}
    for name, value in [("p_org", org), ("p_expected", expected), ("p_operation", operation)]:
        if value is not None:
            body[name] = value
    return stack.http("POST", "/rest/v1/rpc/tc_admin_company_full", body, token=token)


def full_set(root: NativeClient, org: str, expected: int, *, enabled=True, expires=None, operation=None) -> dict:
    operation = operation or str(uuid.uuid4())
    status, result = full_call(root.stack, root.actor["token"], "set", org=org, expected=expected,
                               operation=operation, data={"enabled": enabled, "expires_at": expires})
    check("MFA+FULL: verified native Root receives the company revision and operation receipt",
          status == 200 and result.get("schema_version") == 1 and result.get("operation_id") == operation
          and result.get("item", {}).get("organization_id") == org
          and result.get("item", {}).get("manual_full", {}).get("revision") == expected + 1)
    return result


def full_company_access(stack, actor: dict, active: bool, state: str, label: str) -> None:
    token = actor["token"]
    check("MFA+FULL: " + label + " retains a verified native session",
          stack.rpc("tc_verified_session", {}, token) is True)
    access = stack.rpc("tc_organization_access", {"p_org": actor["org"]}, token)
    check("MFA+FULL: " + label + " respects the independent commercial state",
          access.get("active") is active and access.get("manual_full", {}).get("status") == state)
    status, rows = stack.http("GET", "/rest/v1/trucks?select=organization_id,plate", token=token)
    check("MFA+FULL: " + label + " keeps fleet RLS scoped to the licensed company",
          status == 200 and isinstance(rows, list)
          and (len(rows) == 1 and rows[0]["organization_id"] == actor["org"] if active else rows == []))


def exercise_manual_full_mfa(stack, company: NativeClient, original: str, root_actor: dict) -> NativeClient:
    """Real signed AAL1/AAL2 sessions exercise the already shipped Full RPC.

    The grant below exists only in the owned fixture DB. MFA never supplies a
    role, changes global service flags, authorizes payments or consumes AI.
    """
    started = len(lab.REPORT["checks"])
    org = company.actor["org"]
    unchanged = stack.sql("select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]')::text) from public.trucks t;")
    stack.sql("insert into private.tc_admins(user_id) values(" + q(root_actor["user"]) + ");")
    root = NativeClient(stack, root_actor)
    root_original = root.actor["token"]
    factor = root.enroll("Isolated Root " + uuid.uuid4().hex)
    root.verify(factor)
    for action in ["capabilities", "list", "set", "history"]:
        status, result = full_call(stack, root_original, action, org=org,
                                   expected=0 if action == "set" else None,
                                   operation=str(uuid.uuid4()) if action == "set" else None,
                                   data={"enabled": True, "expires_at": None} if action == "set" else {})
        check("MFA+FULL: Root old AAL1 bearer cannot " + action + " after its same SID upgrades",
              status == 403 and isinstance(result, dict) and result.get("code") == "42501"
              and claims(root_original)["session_id"] == claims(root.actor["token"])["session_id"])
    check("MFA+FULL: denied AAL1 Root operations create no licence or audit",
          stack.scalar("select count(*) from private.tc_company_full_licenses") == 0
          and stack.scalar("select count(*) from private.tc_company_full_audit") == 0)
    operation = str(uuid.uuid4())
    granted = full_set(root, org, 0, operation=operation)
    check("MFA+FULL: AAL2 Root activates only the selected commercial company",
          granted.get("item", {}).get("manual_full", {}).get("status") == "active")
    status, replay = full_call(stack, root.actor["token"], "set", org=org, expected=0,
                               operation=operation, data={"enabled": True, "expires_at": None})
    check("MFA+FULL: native AAL2 Root replay is idempotent",
          status == 200 and replay.get("replayed") is True and replay.get("applied_revision") == 1
          and replay.get("item", {}).get("manual_full", {}).get("revision") == 1)
    status, history = full_call(stack, root.actor["token"], "history", org=org)
    items = history.get("items") if isinstance(history, dict) else None
    check("MFA+FULL: the one immutable audit binds the real AAL2 Root actor",
          status == 200 and isinstance(items, list) and len(items) == 1
          and items[0].get("actor_id") == root.actor["user"] and items[0].get("actor_email") == root.actor["email"]
          and items[0].get("operation_id") == operation)
    for target in [org, root.actor["org"]]:
        status, result = full_call(stack, company.actor["token"], "set", org=target, expected=0,
                                   operation=str(uuid.uuid4()), data={"enabled": True, "expires_at": None})
        check("MFA+FULL: an AAL2 company administrator cannot self-grant or grant a foreign company",
              status == 403 and isinstance(result, dict) and result.get("code") == "42501")
    full_company_access(stack, company.actor, True, "active", "verified factor and active licence")
    access(stack, company.actor, original, False, "MFA+FULL: active Full cannot upgrade an AAL1 bearer")
    status, _ = stack.http("POST", "/rest/v1/rpc/tc_organization_access", {"p_org": org}, token=original)
    check("MFA+FULL: active Full cannot bypass the human AAL1 organization RPC guard", status == 403)
    full_set(root, org, 1, enabled=False)
    full_company_access(stack, company.actor, False, "disabled", "AAL2 with company OFF")
    full_set(root, org, 2, expires="2000-01-01T00:00:00Z")
    full_company_access(stack, company.actor, False, "expired", "AAL2 with company expired")
    full_set(root, org, 3)
    full_company_access(stack, company.actor, True, "active", "AAL2 reactivation")
    full_set(root, root.actor["org"], 0, enabled=False)
    status, capability = full_call(stack, root.actor["token"], "capabilities")
    check("MFA+FULL: AAL2 Root keeps management when its own company is OFF",
          status == 200 and capability.get("manual_company_full") is True)
    check("MFA+FULL: native licence changes preserve every original fleet record",
          stack.sql("select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]')::text) from public.trucks t;") == unchanged)
    lab.REPORT["mfa_manual_full_integration"] = {"checks": len(lab.REPORT["checks"]) - started,
        "real_native_jwt_and_totp": True, "root_aal1_denied": True,
        "root_aal2_allowed": True, "tenant_self_grant_denied": True,
        "company_off_and_expiry_override_aal2": True, "business_data_preserved": True}
    return root


def exercise_full_after_last_factor(company: NativeClient, root: NativeClient) -> None:
    stack, org = company.stack, company.actor["org"]
    started = len(lab.REPORT["checks"])
    check("MFA+FULL: removal compatibility starts only after the company has no verified TOTP",
          not factor_inventory(stack, company.actor))
    full_set(root, org, 4, enabled=False)
    full_company_access(stack, company.actor, False, "disabled", "last factor removed but company OFF")
    full_set(root, org, 5, expires="2000-01-01T00:00:00Z")
    full_company_access(stack, company.actor, False, "expired", "last factor removed but company expired")
    full_set(root, org, 6)
    full_company_access(stack, company.actor, True, "active", "last factor removed and company reactivated")
    lab.REPORT["mfa_manual_full_integration"]["checks"] += len(lab.REPORT["checks"]) - started
    lab.REPORT["mfa_manual_full_integration"]["last_factor_removal_preserves_licence_denial"] = True


def exercise(stack) -> None:
    a, b = lab.signup(stack, "A"), lab.signup(stack, "B")
    for actor, plate in [(a, "NATIVE MFA A"), (b, "NATIVE MFA B")]:
        status, _ = stack.http("POST", "/rest/v1/trucks", {"id": str(uuid.uuid4()), "organization_id": actor["org"],
                              "plate": plate, "brand": "MAN", "model": "Synthetic", "year": 2026,
                              "inspection_due_on": "2027-11-15"}, token=actor["token"])
        check("native MFA fixture owns its fictional fleet " + plate[-1], status == 201)
    native = NativeClient(stack, a)
    original = a["token"]
    capability(stack, original)
    access(stack, a, original, True, "no factor")
    primary_name = "Isolated primary " + uuid.uuid4().hex
    primary = native.enroll(primary_name)
    access(stack, a, original, True, "pending factor")
    pending_factors = pending_enrollment_contract(native, primary, primary_name)
    counter = int(time.time()) // 30
    valid_window = {totp(primary["secret"], counter + offset) for offset in [-1, 0, 1]}
    wrong = next(f"{value:06d}" for value in range(10) if f"{value:06d}" not in valid_window)
    rejected = native.call("challengeAndVerify", {"factorId": primary["id"], "code": wrong})
    del wrong, valid_window
    check("native Auth rejects an incorrect TOTP without verifying the pending factor",
          "error" in rejected and factor_state(stack, a, primary).get("status") == "unverified")
    upgraded = verify_queued_behind_retirement_guard(native, primary)
    check("successful native TOTP verification removes other pending TOTP factors and preserves the verified primary",
          all(factor_state(stack, a, pending_factor) == {} for pending_factor in pending_factors)
          and factor_inventory(stack, a) == {primary["id"]: "verified"})
    check("pre-enrollment AAL1 JWT uses the same SID as the native upgrade",
          claims(original)["aal"] == "aal1" and claims(original)["session_id"] == claims(upgraded)["session_id"])
    access(stack, a, original, False, "old AAL1 replay after same-SID upgrade")
    capability(stack, original)
    access(stack, a, upgraded, True, "native AAL2")
    status, _ = stack.http("POST", "/rest/v1/rpc/tc_admin_control", {"p_action": "snapshot", "p_data": {}}, token=upgraded)
    check("native AAL2 cannot promote an ordinary tenant to administrator", status >= 400)
    manual_root = exercise_manual_full_mfa(stack, native, original, b)
    stack.sql("update auth.users set banned_until=now()+interval '1 hour' where id=" + q(a["user"]) + ";")
    access(stack, a, upgraded, False, "live user ban with native AAL2")
    stack.sql("update auth.users set banned_until=null where id=" + q(a["user"]) + ";")
    access(stack, a, upgraded, True, "live user ban removed")
    pending = password_login(stack, a)
    capability(stack, pending.actor["token"])
    access(stack, a, pending.actor["token"], False, "password-only login with a verified factor")
    check("native SDK reports the remaining required AAL2 challenge",
          pending.native("assurance").get("currentLevel") == "aal1"
          and pending.native("assurance").get("nextLevel") == "aal2")
    backup = native.enroll("Isolated backup " + uuid.uuid4().hex)
    native.verify(backup)
    check("both independent native TOTP factors remain verified",
          factor_state(stack, a, primary).get("status") == "verified"
          and factor_state(stack, a, backup).get("status") == "verified")
    native = restore_native_factor(stack, a, backup)
    native.verify(primary)
    before_removal = native.actor["token"]
    native.native("unenroll", {"factorId": primary["id"]})
    check("native unenrollment removes only the current factor and preserves the backup",
          factor_state(stack, a, primary) == {} and factor_state(stack, a, backup).get("status") == "verified")
    immediate = live_session(stack, before_removal)
    lab.REPORT["native_current_factor_removal"] = {
        "immediate_live_session_aal": immediate.get("aal"),
        "immediate_live_factor_binding_present": immediate.get("factor_id") is not None,
    }
    access(stack, a, before_removal, False, "removed current factor with verified backup")
    refreshed = native.native("refreshSession")
    refresh_session = refreshed.get("session") or {}
    refresh_aal = claims(refresh_session.get("access_token", "")).get("aal")
    check("native refresh after removal returns an explicit known assurance level", refresh_aal in {"aal1", "aal2"})
    native.accept(refreshed, refresh_aal)
    bound = live_session(stack, native.actor["token"])
    lab.REPORT["native_current_factor_removal"].update({
        "refreshed_jwt_aal": refresh_aal,
        "live_session_aal": bound.get("aal"),
        "live_factor_binding_present": bound.get("factor_id") is not None,
    })
    access(stack, a, native.actor["token"], False, "refreshed session still requires backup challenge")
    lab.REPORT["native_current_factor_removal"]["remaining_verified_factor_requires_challenge"] = True
    native.verify(backup)
    access(stack, a, native.actor["token"], True, "backup native challenge restores access")
    status, _ = stack.http("POST", "/auth/v1/recover", {"email": a["email"]})
    check("native recovery request stays inside the isolated SMTP service", status == 200)
    recovery_hash = stack.mail_token(a["email"], "recovery")
    status, response = stack.http("POST", "/auth/v1/verify", {"type": "recovery", "token_hash": recovery_hash})
    check("real native recovery issues a signed session", status == 200 and isinstance(response.get("access_token"), str))
    recovery = NativeClient(stack, a)
    recovery.accept(response, "aal1")
    del recovery_hash, response
    capability(stack, recovery.actor["token"])
    access(stack, a, recovery.actor["token"], False, "email recovery with remaining verified factor")
    rejected = recovery.call("unenroll", {"factorId": backup["id"]})
    check("native recovery at AAL1 cannot silently remove the remaining verified factor",
          "error" in rejected and factor_state(stack, a, backup).get("status") == "verified")
    recovery.verify(backup)
    access(stack, a, recovery.actor["token"], True, "recovery completes a real backup challenge")
    recovery.native("unenroll", {"factorId": backup["id"]})
    check("native last-factor removal leaves no verified TOTP",
          stack.scalar("select count(*) from auth.mfa_factors where user_id=" + q(a["user"]) + " and status='verified' and factor_type='totp'") == 0)
    refreshed = recovery.native("refreshSession")
    last_aal = claims((refreshed.get("session") or {}).get("access_token", "")).get("aal")
    check("native last-factor refresh returns an explicit known assurance level", last_aal in {"aal1", "aal2"})
    recovery.accept(refreshed, last_aal)
    lab.REPORT["native_last_factor_removal"] = {"refreshed_jwt_aal": last_aal,
                                                "live_session_aal": live_session(stack, recovery.actor["token"]).get("aal")}
    access(stack, a, recovery.actor["token"], True, "optional policy returns to baseline only after the last factor")
    exercise_full_after_last_factor(recovery, manual_root)
    final = recovery.actor["token"]
    recovery.native("signOut")
    access(stack, a, final, False, "global native logout revokes the live SID")
    status, _ = stack.http("POST", "/rest/v1/rpc/tc_mfa_protection_status", {}, token=final)
    check("revoked session cannot use the rollout capability", status >= 400)
    stack.safety()


def main() -> int:
    isolated_context(os.environ)
    candidate = candidate_path()
    lab.REPORT.update(contract="truckcontrol-native-totp-acceptance-v1", checks=[],
                      all_passed=False, candidate_sql_composed=True,
                      candidate_filename=candidate.name,
                      candidate_sha256=hashlib.sha256(candidate.read_bytes()).hexdigest(),
                      native_sdk_version="2.118.0", managed_mfa_enabled=False,
                      isolated_auth_logical_restore_verified=False,
                      sensitive_artifacts_uploaded=False)
    RESULTS.mkdir(exist_ok=True)
    lab.PRIVATE = Path(tempfile.mkdtemp(prefix="truckcontrol-native-totp-private-", dir=os.environ.get("RUNNER_TEMP")))
    lab.PRIVATE.chmod(0o700)
    stack = lab.Stack("native", 55431, uuid.uuid4().hex[:10], enable_totp=True)
    lab.REPORT["started_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    try:
        check("runner has at least 8GB free for disposable official service images", shutil.disk_usage(lab.PRIVATE).free >= 8 * 1024**3)
        installed = json.loads((ROOT / "node_modules/@supabase/supabase-js/package.json").read_text())
        check("actual installed native SDK matches the exact repository pin", installed.get("version") == "2.118.0")
        stack.prepare()
        auth_image = next(c["Config"]["Image"] for c in stack.containers if c["Name"] == "/supabase_auth_" + stack.project)
        check("native execution uses the pinned CLI's official tagged Auth image",
              re.fullmatch(r"(?:ghcr\.io|public\.ecr\.aws|docker\.io)/supabase/gotrue:v[0-9]+\.[0-9]+\.[0-9]+(?:[-.][a-zA-Z0-9.]+)?", auth_image) is not None)
        lab.REPORT["official_auth_image"] = auth_image
        lab.REPORT["native_version_scope"] = "official_self_hosted_cli_3.1.0_only"
        exercise(stack)
        lab.REPORT["all_passed"] = True
    except (LabFailure, subprocess.TimeoutExpired, OSError, ValueError, KeyError, StopIteration, TypeError) as error:
        lab.REPORT["all_passed"] = False
        lab.REPORT["failure_code"] = str(error) if isinstance(error, LabFailure) else type(error).__name__
        print("FAIL " + lab.REPORT["failure_code"], flush=True)
    finally:
        try:
            stack.cleanup()
        except Exception:
            lab.REPORT["cleanup_failed"] = True
        shutil.rmtree(lab.PRIVATE, ignore_errors=True)
        lab.REPORT["completed_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        (RESULTS / "receipt.json").write_text(json.dumps(lab.REPORT, indent=2) + "\n")
        print(json.dumps({"passed_checks": len(lab.REPORT["checks"]), "all_passed": lab.REPORT["all_passed"],
                          "managed_platform_restore_verified": False, "managed_mfa_enabled": False,
                          "external_provider_calls": 0}), flush=True)
    return 0 if lab.REPORT["all_passed"] and not lab.REPORT.get("cleanup_failed") else 1


if __name__ == "__main__":
    raise SystemExit(main())
