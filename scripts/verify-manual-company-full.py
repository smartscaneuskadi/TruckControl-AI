#!/usr/bin/env python3
"""Real Auth/PostgREST/Storage acceptance for company-scoped manual Full.

CI only, in a new owned offline stack after the unchanged recovery lab. No MFA
enrollment, managed project, provider, real user, external message or payment.
The composed source may include exactly one later reviewed TOTP migration;
the separate native TOTP lab exercises its interaction with Full licences.
Only fixed check names and sanitized metadata are saved. Previously issued
signed URLs and already downloaded/offline bytes cannot be recalled by a
licence change; this checks fresh requests and preserves the underlying data.
"""
from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import tempfile
import time
import urllib.parse
import uuid

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("manual_full_recovery", ROOT / "scripts/verify-local-service-recovery.py")
assert spec and spec.loader
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)
LabFailure, check, q = lab.LabFailure, lab.check, lab.quote
RESULTS = ROOT / "manual-company-full-results"
REPOSITORY = "smartscaneuskadi/TruckControl-AI"
CANDIDATE_SUFFIX = "_company_manual_full_licenses.sql"
TOTP_SUFFIX = "_optional_totp_session_protection.sql"
RPC = "tc_admin_company_full"
ACTORS = {"A": 1, "B": 2, "R": 3, "C": 4}


def isolated_context(env: dict) -> None:
    if (env.get("GITHUB_ACTIONS") != "true"
            or env.get("TRUCKCONTROL_LOCAL_SERVICE_ACCEPTANCE") != "synthetic-only"
            or env.get("TRUCKCONTROL_MANUAL_COMPANY_FULL_ACCEPTANCE") != "synthetic-only"):
        raise LabFailure("ci_only_explicit_manual_full_opt_in_required")
    if env.get("GITHUB_REPOSITORY") != REPOSITORY:
        raise LabFailure("exclusive_repository_required")


def candidate_path(root: Path = ROOT) -> Path:
    paths = list((root / "supabase/migrations").glob("*" + CANDIDATE_SUFFIX))
    if len(paths) != 1 or not re.fullmatch(r"[0-9]{14}" + re.escape(CANDIDATE_SUFFIX), paths[0].name):
        raise LabFailure("exactly_one_committed_shaped_manual_full_candidate_required")
    path = paths[0]
    if not path.is_file() or path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
        raise LabFailure("refuse_foreign_or_symlinked_manual_full_candidate")
    composed_totp_path(root, path)
    return path


def composed_totp_path(root: Path, manual: Path) -> Path | None:
    """Admit only an explicit, canonical later TOTP source, never a mixed order.

    Both suites remain independently guarded/opted in. This source check does
    not apply migrations or enable enrollment; Stack stages the full committed
    schema and the distinct native TOTP receipt proves the composed policy.
    """
    harness = root / "scripts/verify-native-totp.py"
    paths = list((root / "supabase/migrations").glob("*" + TOTP_SUFFIX))
    if not paths and not harness.exists() and not harness.is_symlink():
        return None
    if (len(paths) != 1 or not harness.is_file() or harness.is_symlink()
            or not harness.resolve().is_relative_to(root.resolve())):
        raise LabFailure("composed_totp_requires_one_candidate_and_owned_harness")
    path = paths[0]
    if (not re.fullmatch(r"[0-9]{14}" + re.escape(TOTP_SUFFIX), path.name)
            or not path.is_file() or path.is_symlink()
            or not path.resolve().is_relative_to(root.resolve())
            or path.name[:14] <= manual.name[:14]):
        raise LabFailure("composed_totp_requires_canonical_unique_later_migration")
    return path


def actor_guard(stack, actor: dict) -> None:
    lab.local_url(stack.url)
    target = urllib.parse.urlsplit(stack.url)
    if (target.port != 55431 or target.path not in ("", "/")
            or not re.fullmatch(r"tc-recovery-[a-f0-9]{10}-manual", stack.project)
            or actor.get("email") not in {"manual-full-" + letter.lower() + "@example.invalid" for letter in ACTORS}):
        raise LabFailure("refuse_nonfictional_manual_full_actor_or_target")
    try:
        uuid.UUID(actor["user"])
    except (KeyError, ValueError, TypeError):
        raise LabFailure("refuse_invalid_manual_full_actor") from None


def instant(value: str) -> datetime:
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if result.tzinfo is None:
            raise ValueError
        return result.astimezone(timezone.utc)
    except (ValueError, TypeError, AttributeError):
        raise LabFailure("server_timestamp_required") from None


def claims(token: str) -> dict:
    try:
        return json.loads(base64.urlsafe_b64decode(token.split(".")[1] + "=="))
    except (ValueError, IndexError, TypeError):
        raise LabFailure("native_signed_jwt_claims_required") from None


def manual_state(value: dict, status: str | None = None) -> bool:
    if not isinstance(value, dict) or set(value) != {"schema_version", "configured", "status", "enabled", "expires_at", "revision", "updated_at"}:
        return False
    if (type(value["schema_version"]) is not int or value["schema_version"] != 1
            or type(value["configured"]) is not bool or type(value["revision"]) is not int
            or value["revision"] < 0 or value["status"] not in {"unconfigured", "active", "disabled", "expired"}
            or (status is not None and value["status"] != status)):
        return False
    if not value["configured"]:
        return value == {"schema_version": 1, "configured": False, "status": "unconfigured", "enabled": None,
                         "expires_at": None, "revision": 0, "updated_at": None}
    if type(value["enabled"]) is not bool or value["revision"] < 1 or not isinstance(value["updated_at"], str):
        return False
    if value["status"] == "expired" and value["expires_at"] is None:
        return False
    try:
        instant(value["updated_at"])
        if value["expires_at"] is not None:
            instant(value["expires_at"])
    except LabFailure:
        return False
    return value["enabled"] == (value["status"] in {"active", "expired"})


def response(stack, token: str, name: str, data: dict, *, service=False):
    return stack.http("POST", "/rest/v1/rpc/" + name, data, token=token, service=service)


def denied(name: str, result: tuple, *, code: str | None = None, status: int | None = None) -> None:
    actual, body = result
    check(name, actual >= 400 and (status is None or actual == status)
          and (code is None or isinstance(body, dict) and body.get("code") == code))


def login(stack, actor: dict) -> dict:
    actor_guard(stack, actor)
    status, result = stack.http("POST", "/auth/v1/token?grant_type=password", {"email": actor["email"], "password": actor["password"]})
    check("real native password login " + actor["label"], status == 200 and isinstance(result.get("access_token"), str))
    actor = {**actor, "token": result["access_token"]}
    signed = claims(actor["token"])
    status, user = stack.http("GET", "/auth/v1/user", token=actor["token"])
    check("Auth and PostgREST validate the actual signed session " + actor["label"],
          status == 200 and user.get("id") == actor["user"] and signed.get("sub") == actor["user"]
          and signed.get("role") == "authenticated" and isinstance(signed.get("session_id"), str)
          and stack.rpc("tc_verified_session", {}, actor["token"]) is True)
    return actor


def signup(stack, label: str) -> dict:
    if label not in ACTORS:
        raise LabFailure("refuse_nonfictional_manual_full_signup")
    email = "manual-full-" + label.lower() + "@example.invalid"
    password = secrets.token_urlsafe(28) + "aA1!"
    status, result = stack.http("POST", "/auth/v1/signup", {"email": email, "password": password,
        "data": {"truckcontrol_registration": {"contact_name": "Synthetic manual operator " + label,
            "company_name": "Synthetic manual company " + label, "tax_id": "DEMO-MANUAL-" + label,
            "address": "Synthetic manual street 150", "phone": "+1202555200" + str(ACTORS[label]), "requested_plan": "limited"}}})
    check("native signup requires real isolated confirmation " + label,
          status == 200 and result.get("session") is None and not result.get("user", result).get("email_confirmed_at"))
    user = str(uuid.UUID(result.get("user", result)["id"]))
    actor = {"label": label, "email": email, "password": password, "user": user}
    actor_guard(stack, actor)
    stack.sql("insert into private.tc_auth_legal_consents(user_id,legal_version,source) values(" + q(user) + ",'2026-11-02','authenticated_profile');")
    token_hash = stack.mail_token(email, "signup")
    status, verified = stack.http("POST", "/auth/v1/verify", {"type": "signup", "token_hash": token_hash})
    check("real isolated Auth confirms the fictional user " + label,
          status == 200 and verified.get("user", {}).get("id") == user and bool(verified["user"].get("email_confirmed_at")))
    del token_hash, verified
    actor = login(stack, actor)
    check("unconfigured native signup preserves Basic trial " + label,
          stack.rpc("tc_finish_registration", {}, actor["token"]).get("plan") == "limited")
    status, rows = stack.http("GET", "/rest/v1/organizations?select=id&owner_id=eq." + user, token=actor["token"])
    check("one native company is provisioned for fictional user " + label, status == 200 and len(rows) == 1)
    return {**actor, "org": rows[0]["id"]}


def access(stack, actor: dict, org: str) -> dict:
    actor_guard(stack, actor)
    result = stack.rpc("tc_organization_access", {"p_org": org}, actor["token"])
    check("company access exposes a validated server manual licence state", manual_state(result.get("manual_full")))
    instant(result.get("observed_at"))
    return result


class Control:
    def __init__(self, stack, root: dict):
        actor_guard(stack, root)
        self.stack, self.root = stack, root

    def call(self, action: str, *, org=None, expected=None, operation=None, data=None, after=None):
        actor_guard(self.stack, self.root)
        body = {"p_action": action, "p_data": {} if data is None else data}
        for key, value in [("p_org", org), ("p_expected", expected), ("p_operation", operation), ("p_after", after)]:
            if value is not None:
                body[key] = value
        return response(self.stack, self.root["token"], RPC, body)

    def rpc(self, action: str, **kwargs) -> dict:
        status, result = self.call(action, **kwargs)
        if status != 200:
            lab.REPORT["rpc_diagnostic"] = {"operation": action, "http_status": status,
                                             "sqlstate": result.get("code") if isinstance(result, dict) and re.fullmatch(r"[A-Z0-9]{5}", str(result.get("code"))) else None}
            raise LabFailure("manual_full_admin_rpc_rejected")
        return result

    def set(self, org: str, expected: int, enabled: bool, expires=None, operation=None) -> dict:
        operation = operation or str(uuid.uuid4())
        result = self.rpc("set", org=org, expected=expected, operation=operation,
                          data={"enabled": enabled, "expires_at": expires})
        item = result.get("item", {})
        check("root mutation returns current company state and a server operation receipt",
              result.get("schema_version") == 1 and item.get("organization_id") == org
              and manual_state(item.get("manual_full")) and result.get("operation_id") == operation
              and type(result.get("replayed")) is bool and type(result.get("applied_revision")) is int)
        instant(result.get("observed_at"))
        return result

    def history(self, org: str) -> list:
        items, before = [], None
        for _ in range(20):
            result = self.rpc("history", org=org, data={"limit": 2, **({"before_revision": before} if before is not None else {})})
            page = result.get("items")
            check("root audit history is bounded and paginated", isinstance(page, list) and len(page) <= 2)
            items.extend(page)
            next_before = result.get("next_before_revision")
            if next_before is None:
                return items
            if type(next_before) is not int or next_before < 1 or before is not None and next_before >= before:
                raise LabFailure("manual_audit_pagination_invalid")
            before = next_before
        raise LabFailure("bounded_manual_audit_pagination_exhausted")


def business_snapshot(stack, org: str) -> dict:
    rows = {}
    for table in ["public.trucks", "public.drivers", "public.finance_entries", "private.company_documents", "private.tc_document_details", "private.company_suppliers"]:
        rows[table] = stack.sql("select jsonb_build_object('count',count(*),'digest',md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]')::text)) from "
                               + table + " t where organization_id=" + q(org) + ";")
    return rows


def truck(org: str, plate: str) -> dict:
    return {"id": str(uuid.uuid4()), "organization_id": org, "plate": plate, "brand": "MAN", "model": "Synthetic manual",
            "year": 2026, "inspection_due_on": "2027-11-15"}


def scoped_data(stack, actor: dict, org: str, allowed: bool, label: str) -> None:
    status, rows = stack.http("GET", "/rest/v1/trucks?select=id,organization_id&organization_id=eq." + org, token=actor["token"])
    check(label + ": raw Data API respects company access",
          status == 200 and isinstance(rows, list) and bool(rows) and all(row["organization_id"] == org for row in rows)
          if allowed else status >= 400 or rows == [])


def background_access(stack, actor: dict, org: str, allowed: bool, label: str) -> None:
    status, result = response(stack, None, "tc_company_server_access", {"p_user": actor["user"], "p_org": org}, service=True)
    check(label + ": existing background guard respects the same company state",
          status == 200 and isinstance(result, dict) and result.get("active") is allowed)


def closed_company(stack, owner: dict, org: str, document_path: str, label: str) -> None:
    before = business_snapshot(stack, org)
    state = access(stack, owner, org)
    check(label + ": explicit company state closes every commercial feature",
          state.get("active") is False and state.get("can_write") is False and state.get("can_manage") is False
          and not any(value is True for value in state.get("features", {}).values()))
    for table in ["trucks", "drivers", "finance_entries"]:
        status, rows = stack.http("GET", "/rest/v1/" + table + "?select=id&organization_id=eq." + org, token=owner["token"])
        check(label + ": raw " + table + " reads are denied", status >= 400 or rows == [])
    denied(label + ": raw truck insert is denied", stack.http("POST", "/rest/v1/trucks", truck(org, "DENIED NEW"), token=owner["token"]))
    stack.http("PATCH", "/rest/v1/trucks?organization_id=eq." + org, {"brand": "Denied overwrite"}, token=owner["token"])
    stack.http("DELETE", "/rest/v1/drivers?organization_id=eq." + org, token=owner["token"])
    denied(label + ": commercial RPC is denied", response(stack, owner["token"], "tc_company_suppliers", {"p_org": org, "p_action": "list", "p_data": {}}), status=403)
    denied(label + ": document RPC is denied", response(stack, owner["token"], "tc_document_page", {"p_org": org}), status=403)
    denied(label + ": fresh authenticated private download is denied", stack.http("GET", "/storage/v1/object/authenticated/truckcontrol-documents/" + document_path, token=owner["token"]))
    denied(label + ": issuing a new signed document URL is denied", stack.http("POST", "/storage/v1/object/sign/truckcontrol-documents/" + document_path,
                                                                                  {"expiresIn": 60}, token=owner["token"]))
    background_access(stack, owner, org, False, label)
    check(label + ": denied mutations preserve all company records", business_snapshot(stack, org) == before)


def exercise(stack) -> None:
    a, b, root, member = [signup(stack, label) for label in ["A", "B", "R", "C"]]
    other_org = str(uuid.uuid4())
    status, _ = stack.http("POST", "/rest/v1/organizations", {"id": other_org, "owner_id": a["user"], "name": "Synthetic same owner A2"}, token=a["token"])
    check("one real signed owner creates a second distinct company", status == 201)
    vehicles = {}
    for actor, org, label in [(a, a["org"], "A"), (a, other_org, "A2"), (b, b["org"], "B"), (root, root["org"], "R")]:
        vehicles[org] = truck(org, "MANUAL " + label)
        status, _ = stack.http("POST", "/rest/v1/trucks", vehicles[org], token=actor["token"])
        check("real native owner inserts its initial fictional truck " + label, status == 201)
    for actor, org in [(a, a["org"]), (a, other_org), (b, b["org"])]:
        state = access(stack, actor, org)
        check("unconfigured company preserves the existing active Basic trial",
              state.get("active") is True and state.get("plan") == "limited"
              and manual_state(state["manual_full"], "unconfigured") and state.get("max_trucks") == 50)
    # This grant exists only in this new, owned database and binds a real Auth
    # identity. No production email, editable metadata or synthetic JWT grants it.
    stack.sql("insert into private.tc_admins(user_id) values(" + q(root["user"]) + ");")
    control = Control(stack, root)
    caps = control.rpc("capabilities")
    check("candidate manual company Full capability is exact and independently usable",
          set(caps) == {"schema_version", "manual_company_full", "observed_at"}
          and type(caps.get("schema_version")) is int and caps["schema_version"] == 1 and caps.get("manual_company_full") is True)
    first_observed = instant(caps.get("observed_at"))
    lab.REPORT["candidate_sql_composed"] = True
    listed, after = [], None
    for _ in range(10):
        page = control.rpc("list", data={"limit": 2}, after=after)
        check("root company listing is paginated without broad customer access", isinstance(page.get("items"), list) and len(page["items"]) <= 2)
        listed.extend(page["items"])
        next_after = page.get("next_after")
        if next_after is None:
            break
        if next_after == after:
            raise LabFailure("manual_company_list_cursor_did_not_advance")
        after = str(uuid.UUID(next_after))
    else:
        raise LabFailure("bounded_manual_company_list_exhausted")
    check("root listing distinguishes both companies of one owner",
          len({item["organization_id"] for item in listed}) == len(listed)
          and {a["org"], other_org, b["org"], root["org"]}.issubset({item["organization_id"] for item in listed})
          and all(manual_state(item.get("manual_full"), "unconfigured") for item in listed))
    root_off = control.set(root["org"], 0, False)
    check("root can disable its own company without losing account management",
          manual_state(root_off["item"]["manual_full"], "disabled") and access(stack, root, root["org"]).get("active") is False
          and control.rpc("capabilities").get("manual_company_full") is True
          and isinstance(stack.rpc("tc_admin_control", {"p_action": "snapshot", "p_data": {}}, root["token"]), dict))
    # Expire only the legacy commercial period; preserve native identity, legal
    # receipt, membership and every module/consent/provider permission.
    stack.sql("update private.tc_customers set trial_started_at=now()-interval '20 days',trial_ends_at=now()-interval '10 days',"
              "status='trial',paid_plan=null,paid_until=null where user_id=" + q(a["user"]) + ";")
    commercial_before = stack.sql("select to_jsonb(c)::text from private.tc_customers c where user_id=" + q(a["user"]) + ";")
    check("expired owner trial initially closes both same-owner companies",
          access(stack, a, a["org"]).get("active") is False and access(stack, a, other_org).get("active") is False)
    operation = str(uuid.uuid4())
    granted = control.set(a["org"], 0, True, operation=operation)
    revision = granted["item"]["manual_full"]["revision"]
    check("manual Full activation bypasses the expired commercial period only for its company",
          revision == 1 and granted.get("applied_revision") == 1 and granted.get("replayed") is False
          and manual_state(granted["item"]["manual_full"], "active") and granted["item"].get("effective_active") is True
          and granted["item"].get("effective_plan") == "full")
    current = access(stack, a, a["org"])
    enabled_modules = json.loads(stack.sql("select coalesce(jsonb_agg(m.id order by m.id),'[]') from private.tc_modules m "
        "join private.tc_plans p on p.id='full' where m.enabled and coalesce((p.modules->>m.id)::boolean,false) and m.id not in('invoice_ai','document_ai');"))
    check("manual Full exposes every enabled commercial Full module and retains the truck cap",
          current.get("active") is True and current.get("plan") == "full" and current.get("max_trucks") == 50
          and bool(enabled_modules) and all(current.get("features", {}).get(name) is True for name in enabled_modules)
          and current.get("features", {}).get("invoice_ai") is False and current.get("features", {}).get("document_ai") is False)
    check("manual Full does not rewrite the account paid plan, trial, consent or provider permissions",
          stack.sql("select to_jsonb(c)::text from private.tc_customers c where user_id=" + q(a["user"]) + ";") == commercial_before)
    sibling, foreign = access(stack, a, other_org), access(stack, b, b["org"])
    check("same-owner sibling and unrelated company retain their separate legacy states",
          sibling.get("active") is False and manual_state(sibling["manual_full"], "unconfigured")
          and foreign.get("active") is True and foreign.get("plan") == "limited"
          and manual_state(foreign["manual_full"], "unconfigured"))
    scoped_data(stack, a, other_org, False, "same owner without a company grant")
    denied("same owner cannot write into its ungranted expired sibling", stack.http("POST", "/rest/v1/trucks", truck(other_org, "DENIED SIBLING"), token=a["token"]))
    denied("unrelated owner cannot write into the granted company", stack.http("POST", "/rest/v1/trucks", truck(a["org"], "DENIED FOREIGN"), token=b["token"]))
    status, org_names = stack.http("GET", "/rest/v1/organizations?select=id,name", token=a["token"])
    check("owner can still list its company names and switch away from a closed company",
          status == 200 and {row["id"] for row in org_names} == {a["org"], other_org})
    background_access(stack, a, a["org"], True, "manual Full")
    background_access(stack, a, other_org, False, "same-owner sibling")
    background_access(stack, b, a["org"], False, "unrelated background identity")
    replay = control.set(a["org"], 0, True, operation=operation)
    check("exact operation replay is idempotent", replay.get("replayed") is True and replay.get("applied_revision") == 1 and replay["item"]["manual_full"]["revision"] == revision)
    initial_history = control.history(a["org"])
    check("activation and replay create exactly one immutable server audit row", len(initial_history) == 1)
    saved_audit = initial_history[0]
    denied("stale licence CAS is rejected", control.call("set", org=a["org"], expected=0, operation=str(uuid.uuid4()), data={"enabled": False, "expires_at": None}), code="40001")
    denied("operation reuse with a different payload is rejected", control.call("set", org=a["org"], expected=revision, operation=operation, data={"enabled": False, "expires_at": None}), code="22023")
    denied("root cannot forge audit actor or time in the mutation body", control.call("set", org=a["org"], expected=revision, operation=str(uuid.uuid4()),
        data={"enabled": True, "expires_at": None, "actor_id": b["user"], "changed_at": "2000-01-01T00:00:00Z"}), code="22023")
    check("rejected concurrency and forged bodies cannot change the audit or licence",
          control.history(a["org"]) == initial_history and access(stack, a, a["org"])["manual_full"]["revision"] == revision)
    # Actual team RPCs establish company roles without granting global admin.
    stack.rpc("tc_team_control", {"p_org": a["org"], "p_action": "invite", "p_data": {"email": member["email"], "role": "admin", "module_overrides": {}}}, a["token"])
    stack.rpc("tc_team_control", {"p_org": a["org"], "p_action": "accept", "p_data": {}}, member["token"])
    check("native company administrator retains only company-level permissions", access(stack, member, a["org"]).get("company_role") == "admin")
    forged = {"p_action": "set", "p_org": a["org"], "p_expected": revision, "p_operation": str(uuid.uuid4()),
              "p_data": {"enabled": True, "expires_at": None, "actor_id": root["user"]}}
    denied("company administrator cannot self-grant through a forged root body", response(stack, member["token"], RPC, forged), status=403)
    denied("company owner cannot grant Full to its own sibling", response(stack, a["token"], RPC, {**forged, "p_org": other_org}), status=403)
    denied("company administrator cannot read the global licence registry", response(stack, member["token"], RPC, {"p_action": "list", "p_data": {}}), status=403)
    for role in ["viewer", "operator"]:
        stack.rpc("tc_team_control", {"p_org": a["org"], "p_action": "update", "p_data": {"user_id": member["user"], "role": role, "module_overrides": {}}}, a["token"])
        role_access = access(stack, member, a["org"])
        check("manual Full preserves native company role " + role,
              role_access.get("active") is True and role_access.get("company_role") == role
              and role_access.get("can_write") is (role == "operator") and role_access.get("can_manage") is False)
        outcome = stack.http("POST", "/rest/v1/trucks", truck(a["org"], "ROLE " + role.upper()), token=member["token"])
        check("raw Data API enforces native write role " + role, outcome[0] == 201 if role == "operator" else outcome[0] >= 400)
        denied("non-manager cannot manage the team " + role, response(stack, member["token"], "tc_team_control", {"p_org": a["org"], "p_action": "list", "p_data": {}}), status=403)
    # Real private original, metadata and commercial RPC before revocation.
    pdf = lab.synthetic_pdf()
    document = str(uuid.uuid4())
    path = a["org"] + "/" + document + "/document.pdf"
    status, _ = stack.http("POST", "/storage/v1/object/truckcontrol-documents/" + path, pdf, token=a["token"], content_type="application/pdf")
    check("manual Full permits a real private synthetic document upload", status in (200, 201))
    stack.rpc("tc_register_document", {"p_org": a["org"], "p_document": {"id": document, "name": "SYNTHETIC MANUAL - NOT FISCAL.pdf", "object_path": path,
        "content_type": "application/pdf", "size_bytes": len(pdf), "truck_id": None, "driver_id": None},
        "p_tracking": {"category": "other", "status": "active", "expires_on": None, "remind_days": 30}}, a["token"])
    status, content = stack.http("GET", "/storage/v1/object/authenticated/truckcontrol-documents/" + path, token=a["token"])
    check("manual Full downloads the exact private original bytes", status == 200 and content == pdf)
    status, signed = stack.http("POST", "/storage/v1/object/sign/truckcontrol-documents/" + path, {"expiresIn": 60}, token=a["token"])
    check("active company can issue a short-lived private URL without logging it", status == 200 and isinstance(signed, dict)
          and any(isinstance(signed.get(key), str) for key in ["signedURL", "signedUrl"]))
    del signed
    stack.rpc("tc_team_control", {"p_org": a["org"], "p_action": "update", "p_data": {"user_id": member["user"], "role": "admin", "module_overrides": {"documents": False}}}, a["token"])
    check("manual Full respects existing per-member module restrictions", access(stack, member, a["org"]).get("features", {}).get("documents") is False)
    denied("restricted member cannot access private documents", response(stack, member["token"], "tc_document_page", {"p_org": a["org"]}), status=403)
    supplier = str(uuid.uuid4())
    stack.rpc("tc_company_suppliers", {"p_org": a["org"], "p_action": "save", "p_data": {"id": supplier, "expected_version": None,
        "fields": {"name": "Synthetic supplier", "tax_id": "DEMO-MANUAL-SUPPLIER", "email": "", "phone": "", "address": "", "notes": "", "archived": False}}}, a["token"])
    driver = {"id": str(uuid.uuid4()), "organization_id": a["org"], "name": "Synthetic manual driver", "license": "DEMO-MANUAL",
              "license_expires_on": "2027-11-15", "status": "active"}
    check("manual Full permits native driver writes", stack.http("POST", "/rest/v1/drivers", driver, token=a["token"])[0] == 201)
    finance = {"id": str(uuid.uuid4()), "organization_id": a["org"], "truck_id": vehicles[a["org"]]["id"], "kind": "income", "concept": "Synthetic manual income",
               "date": "2026-11-15", "amount_cents": 100, "category": "transport", "payment_status": "pending", "distance_km": 1}
    check("manual Full permits native accounting writes", stack.http("POST", "/rest/v1/finance_entries", finance, token=a["token"])[0] == 201)
    existing = stack.scalar("select count(*) from public.trucks where organization_id=" + q(a["org"]))
    check("native manual fixture is bounded before the 50-truck cap", 1 <= existing < 50)
    status, _ = stack.http("POST", "/rest/v1/trucks", [truck(a["org"], "CAP " + str(i)) for i in range(50 - existing)], token=a["token"])
    check("manual Full fills exactly the retained 50-truck allowance", status == 201 and stack.scalar("select count(*) from public.trucks where organization_id=" + q(a["org"])) == 50)
    denied("manual Full cannot insert truck number 51", stack.http("POST", "/rest/v1/trucks", truck(a["org"], "CAP OVERFLOW"), token=a["token"]))
    preserved = business_snapshot(stack, a["org"])
    disabled = control.set(a["org"], revision, False)
    revision = disabled["item"]["manual_full"]["revision"]
    check("explicit OFF is a server state", manual_state(disabled["item"]["manual_full"], "disabled"))
    closed_company(stack, a, a["org"], path, "explicit OFF")
    stack.sql("update private.tc_settings set enforce_access=false where id;")
    check("explicit company OFF survives the legacy enforcement shortcut", access(stack, a, a["org"]).get("active") is False)
    scoped_data(stack, a, a["org"], False, "explicit OFF with legacy shortcut disabled")
    stack.sql("update private.tc_settings set enforce_access=true where id;")
    stale_replay = control.set(a["org"], 0, True, operation=operation)
    check("old operation replay reports the current OFF state without reactivating",
          stale_replay.get("replayed") is True and stale_replay.get("applied_revision") == 1
          and manual_state(stale_replay["item"]["manual_full"], "disabled") and stale_replay["item"]["manual_full"]["revision"] == revision)
    reactivated = control.set(a["org"], revision, True)
    revision = reactivated["item"]["manual_full"]["revision"]
    check("unlimited manual Full reactivates immediately without deleting records",
          manual_state(reactivated["item"]["manual_full"], "active") and reactivated["item"]["manual_full"]["expires_at"] is None
          and access(stack, a, a["org"]).get("active") is True and business_snapshot(stack, a["org"]) == preserved)
    scoped_data(stack, a, a["org"], True, "reactivated company")
    # Cross a real server timestamp with a bounded wait, without changing clocks.
    expires = instant(reactivated["observed_at"]) + timedelta(seconds=12)
    dated = control.set(a["org"], revision, True, expires.isoformat())
    revision = dated["item"]["manual_full"]["revision"]
    check("future-dated Full is active before its server expiry", manual_state(dated["item"]["manual_full"], "active") and access(stack, a, a["org"]).get("active") is True)
    deadline = time.monotonic() + 25
    while True:
        observed = stack.rpc("tc_organization_access", {"p_org": a["org"]}, a["token"])
        if not manual_state(observed.get("manual_full")):
            raise LabFailure("expiry_observation_contract_invalid")
        if instant(observed.get("observed_at")) >= expires:
            break
        if time.monotonic() >= deadline:
            raise LabFailure("bounded_server_expiry_observation_timed_out")
        time.sleep(.25)
    check("fresh HTTP access denies at and after the authoritative server expiry",
          manual_state(observed["manual_full"], "expired") and observed.get("active") is False)
    closed_company(stack, a, a["org"], path, "automatic server expiry")
    past = control.set(a["org"], revision, True, (expires - timedelta(days=1)).isoformat())
    revision = past["item"]["manual_full"]["revision"]
    check("past-dated enabled Full remains expired", manual_state(past["item"]["manual_full"], "expired"))
    closed_company(stack, a, a["org"], path, "past expiry date")
    restored = control.set(a["org"], revision, True)
    revision = restored["item"]["manual_full"]["revision"]
    check("expired company reactivates immediately with the same business records",
          access(stack, a, a["org"]).get("active") is True and business_snapshot(stack, a["org"]) == preserved)
    stack.sql("update auth.users set banned_until=now()+interval '1 hour' where id=" + q(a["user"]) + ";")
    check("manual Full cannot bypass a live native user ban", stack.rpc("tc_verified_session", {}, a["token"]) is False)
    scoped_data(stack, a, a["org"], False, "native user ban")
    background_access(stack, a, a["org"], False, "native user ban")
    stack.sql("update auth.users set banned_until=null where id=" + q(a["user"]) + ";")
    stack.sql("update private.tc_customers set status='suspended' where user_id=" + q(a["user"]) + ";")
    check("manual Full cannot bypass an account suspension", access(stack, a, a["org"]).get("active") is False)
    stack.sql("update private.tc_customers set status='trial' where user_id=" + q(a["user"]) + ";")
    check("identity restrictions can be lifted without rewriting the manual grant", access(stack, a, a["org"])["manual_full"]["revision"] == revision and access(stack, a, a["org"]).get("active") is True)
    history = control.history(a["org"])
    check("server audit binds each successful revision to the actual root identity and time",
          len(history) == revision and {row.get("revision") for row in history} == set(range(1, revision + 1))
          and all(set(row) == {"operation_id", "organization_id", "revision", "actor_id", "actor_email", "changed_at", "before", "after"}
                  and row["organization_id"] == a["org"] and row["actor_id"] == root["user"] and row["actor_email"] == root["email"]
                  and first_observed <= instant(row["changed_at"]) <= instant(restored["observed_at"])
                  and manual_state(row["before"]) and manual_state(row["after"]) for row in history))
    denied("authenticated root cannot mutate private audit through raw Data API", stack.http("PATCH", "/rest/v1/tc_company_full_audit?organization_id=eq." + a["org"],
        {"actor_id": b["user"], "changed_at": "2000-01-01T00:00:00Z"}, token=root["token"]))
    check("the original server audit snapshot remains immutable", next(row for row in control.history(a["org"]) if row["revision"] == 1) == saved_audit)
    status, _ = stack.http("POST", "/auth/v1/logout?scope=global", token=root["token"])
    check("actual global root logout revokes the native session", status in (200, 204))
    denied("revoked signed root cannot list company licences", control.call("list"), status=403)
    denied("revoked signed root cannot mutate a company licence", control.call("set", org=a["org"], expected=revision,
        operation=str(uuid.uuid4()), data={"enabled": False, "expires_at": None}), status=403)
    root = login(stack, root)
    control = Control(stack, root)
    final = control.set(a["org"], revision, True)
    check("fresh root manages and reactivates while its own company remains OFF",
          manual_state(final["item"]["manual_full"], "active") and access(stack, root, root["org"]).get("active") is False
          and access(stack, a, a["org"]).get("active") is True)
    check("same-owner sibling and unrelated company remain unchanged after the complete lifecycle",
          access(stack, a, other_org).get("active") is False and manual_state(access(stack, a, other_org)["manual_full"], "unconfigured")
          and access(stack, b, b["org"]).get("plan") == "limited" and access(stack, b, b["org"]).get("active") is True
          and business_snapshot(stack, a["org"]) == preserved
          and stack.sql("select to_jsonb(c)::text from private.tc_customers c where user_id=" + q(a["user"]) + ";") == commercial_before)
    check("manual company Full creates no automatic payment or Stripe records",
          all(stack.scalar("select count(*) from " + table) == 0 for table in ["private.tc_payment_requests", "private.tc_payment_events", "private.tc_billing_subscriptions"]))
    stack.safety()


def main() -> int:
    isolated_context(os.environ)
    candidate = candidate_path()
    totp = composed_totp_path(ROOT, candidate)
    lab.REPORT.update(contract="truckcontrol-manual-company-full-acceptance-v1", checks=[], all_passed=False,
                      candidate_filename=candidate.name, candidate_sha256=hashlib.sha256(candidate.read_bytes()).hexdigest(),
                      composed_totp_candidate=totp is not None,
                      totp_candidate_filename=totp.name if totp else None,
                      totp_candidate_sha256=hashlib.sha256(totp.read_bytes()).hexdigest() if totp else None,
                      managed_mfa_enabled=False, stripe_calls=0, external_messages_sent=0,
                      issued_urls_or_cached_bytes_recall_claimed=False, sensitive_artifacts_uploaded=False)
    RESULTS.mkdir(exist_ok=True)
    lab.PRIVATE = Path(tempfile.mkdtemp(prefix="truckcontrol-manual-full-private-", dir=os.environ.get("RUNNER_TEMP")))
    lab.PRIVATE.chmod(0o700)
    stack = lab.Stack("manual", 55431, uuid.uuid4().hex[:10])
    lab.REPORT["started_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    try:
        check("runner has at least 8GB for disposable official service images", shutil.disk_usage(lab.PRIVATE).free >= 8 * 1024**3)
        stack.prepare()
        auth_image = next(c["Config"]["Image"] for c in stack.containers if c["Name"] == "/supabase_auth_" + stack.project)
        check("manual acceptance uses only the pinned CLI official Auth image",
              re.fullmatch(r"(?:ghcr\.io|public\.ecr\.aws|docker\.io)/supabase/gotrue:v[0-9]+\.[0-9]+\.[0-9]+(?:[-.][a-zA-Z0-9.]+)?", auth_image) is not None)
        lab.REPORT["official_auth_image"] = auth_image
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
                          "external_provider_calls": 0, "stripe_calls": 0, "production_modified": False}), flush=True)
    return 0 if lab.REPORT["all_passed"] and not lab.REPORT.get("cleanup_failed") else 1


if __name__ == "__main__":
    raise SystemExit(main())
