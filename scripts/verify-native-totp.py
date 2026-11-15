#!/usr/bin/env python3
"""Real, bounded native TOTP + candidate SQL acceptance in an offline CI stack.

Uses the existing owned Auth/Postgres/Storage recovery lab and the repository's
pinned Supabase SDK. Passwords, factor secrets, QR codes, OTPs and signed tokens
remain in private memory/pipes. Only fixed-code, non-secret evidence is saved.
This does not enable managed MFA or certify a managed-platform restore.
"""
from __future__ import annotations

import base64
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

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("native_totp_recovery", ROOT / "scripts/verify-local-service-recovery.py")
assert spec and spec.loader
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)
LabFailure = lab.LabFailure
check = lab.check
q = lab.quote
RESULTS = ROOT / "native-totp-results"
CANDIDATE = "20261115143612_optional_totp_session_protection.sql"
REPOSITORY = "smartscaneuskadi/TruckControl-AI"


def isolated_context(env: dict) -> None:
    if (env.get("GITHUB_ACTIONS") != "true"
            or env.get("TRUCKCONTROL_LOCAL_SERVICE_ACCEPTANCE") != "synthetic-only"
            or env.get("TRUCKCONTROL_NATIVE_TOTP_ACCEPTANCE") != "synthetic-only"):
        raise LabFailure("ci_only_explicit_native_totp_opt_in_required")
    if env.get("GITHUB_REPOSITORY") != REPOSITORY:
        raise LabFailure("exclusive_repository_required")


def candidate_path(root: Path = ROOT) -> Path:
    path = root / "supabase/migrations" / CANDIDATE
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
    primary = native.enroll("Isolated primary")
    access(stack, a, original, True, "pending factor")
    counter = int(time.time()) // 30
    valid_window = {totp(primary["secret"], counter + offset) for offset in [-1, 0, 1]}
    wrong = next(f"{value:06d}" for value in range(10) if f"{value:06d}" not in valid_window)
    rejected = native.call("challengeAndVerify", {"factorId": primary["id"], "code": wrong})
    del wrong, valid_window
    check("native Auth rejects an incorrect TOTP without verifying the pending factor",
          "error" in rejected and factor_state(stack, a, primary).get("status") == "unverified")
    upgraded = native.verify(primary)
    check("pre-enrollment AAL1 JWT uses the same SID as the native upgrade",
          claims(original)["aal"] == "aal1" and claims(original)["session_id"] == claims(upgraded)["session_id"])
    access(stack, a, original, False, "old AAL1 replay after same-SID upgrade")
    capability(stack, original)
    access(stack, a, upgraded, True, "native AAL2")
    status, _ = stack.http("POST", "/rest/v1/rpc/tc_admin_control", {"p_action": "snapshot", "p_data": {}}, token=upgraded)
    check("native AAL2 cannot promote an ordinary tenant to administrator", status >= 400)
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
    backup = native.enroll()  # Real native backup enrollment without friendlyName.
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
    access(stack, a, before_removal, False, "removed current factor with verified backup")
    refreshed = native.native("refreshSession")
    refresh_session = refreshed.get("session") or {}
    refresh_aal = claims(refresh_session.get("access_token", "")).get("aal")
    check("native refresh after removal returns an explicit known assurance level", refresh_aal in {"aal1", "aal2"})
    native.accept(refreshed, refresh_aal)
    bound = live_session(stack, native.actor["token"])
    lab.REPORT["native_current_factor_removal"] = {
        "refreshed_jwt_aal": refresh_aal,
        "live_session_aal": bound.get("aal"),
        "live_factor_binding_present": bound.get("factor_id") is not None,
        "remaining_verified_factor_requires_challenge": True,
    }
    access(stack, a, native.actor["token"], False, "refreshed session still requires backup challenge")
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
