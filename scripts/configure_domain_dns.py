"""Review and apply only the prepared TruckControl DNS change, preserving other RRs."""
import argparse
import copy
import datetime as dt
import fcntl
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).parent
spec = importlib.util.spec_from_file_location("truckcontrol_dns", ROOT / "porkbun_client.py")
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
DOMAIN = api.DOMAIN
TARGET = Path(__file__).resolve().parents[1] / "docs/deployment/truckcontrolai.com.web-mail-plan.json"
PRIVATE = api.auth.PRIVATE
PLAN = PRIVATE / "dns-reviewed-plan.json"
JOURNAL = PRIVATE / "dns-journal.json"
PARK = {"207.207.210.23", "207.207.210.36", "207.207.210.50"}

def safe(value):
    raise api.auth.SetupError(value)

def name(row):
    return str(row.get("name", "")).rstrip(".").lower()

def record_type(row):
    return str(row.get("type", "")).upper()

def content(row):
    value = str(row.get("content", row.get("value", "")))
    if record_type(row) == "TXT":
        if value.startswith('"') and value.endswith('"'):
            try:
                value = json.loads(value)
            except ValueError:
                safe("unexpected_txt_encoding")
        return value
    return value.rstrip(".").lower()

def priority(row):
    return int(row.get("prio", row.get("priority", 0)) or 0) if record_type(row) in ("MX", "SRV") else None

def signature(row):
    value = content(row)
    if record_type(row) == "SRV" and "weight" in row:
        value = f'{row["weight"]} {row["port"]} ' + value
    return (name(row), record_type(row), value, priority(row))

def fingerprint(rows):
    return api.digest(sorted(rows, key=lambda row: str(row.get("id", ""))))

def payload(row):
    host = name(row)
    if host != DOMAIN and not host.endswith("." + DOMAIN):
        safe("desired_domain_mismatch")
    host = "" if host == DOMAIN else host[: -(len(DOMAIN) + 1)]
    value = row["value"]
    if row["type"] == "SRV":
        value = f'{row["weight"]} {row["port"]} ' + value
    value = {"name": host, "type": row["type"], "content": value, "ttl": int(row["ttl"])}
    if row["type"] in ("MX", "SRV"):
        value["prio"] = int(row["priority"])
    return value

def replacement(old, wanted):
    if name(old) != name(wanted):
        return False
    kind, oldkind = record_type(wanted), record_type(old)
    value = content(old)
    if name(wanted) == DOMAIN:
        if kind == "A":
            return (oldkind == "ALIAS" and value == "uixie.porkbun.com") or (oldkind == "A" and value in PARK)
        if kind == "MX" and oldkind == "MX":
            return value in {"fwd1.porkbun.com", "fwd2.porkbun.com", "aspmx1.migadu.com", "aspmx2.migadu.com"}
        if kind == "TXT" and wanted["value"].startswith("v=spf1"):
            return oldkind == "TXT" and value == "v=spf1 include:_spf.porkbun.com ~all"
    if kind in ("CNAME", "TXT") and oldkind == "CNAME" and value == "uixie.porkbun.com":
        return True
    return False

def validate_final(rows, wanted):
    required = {signature(row) for row in wanted}
    actual = [signature(row) for row in rows]
    if not required.issubset(set(actual)):
        safe("desired_records_missing")
    if len(required) != 20 or len(wanted) != 20:
        safe("unexpected_desired_record_count")
    for host, kind, value, prio in actual:
        if host != DOMAIN and not host.endswith("." + DOMAIN):
            safe("inventory_domain_mismatch")
        if host == DOMAIN and kind in ("A", "AAAA", "ALIAS", "MX") and (host, kind, value, prio) not in required:
            safe("unexpected_root_routing_record")
        if host == DOMAIN and kind == "TXT" and value.startswith("v=spf1") and (host, kind, value, prio) not in required:
            safe("unexpected_or_multiple_spf")
        if kind == "CNAME" and any(other[0] == host and other != (host, kind, value, prio) for other in actual):
            safe("cname_conflict")
        if host in {name(r) for r in wanted if name(r) != DOMAIN} and (host, kind, value, prio) not in required:
            safe("unrelated_record_on_managed_hostname")
    if sum(1 for host, kind, value, _ in actual if host == DOMAIN and kind == "TXT" and value.startswith("v=spf1")) != 1:
        safe("multiple_spf")

def build(existing, wanted):
    projected = copy.deepcopy(existing)
    used = set()
    operations = []
    for index, row in enumerate(wanted):
        body = payload(row)
        exact = next((r for r in projected if signature(r) == signature(row)), None)
        if exact:
            used.add(str(exact.get("id")))
            continue
        candidates = [r for r in projected if str(r.get("id")) not in used and replacement(r, row)]
        candidates.sort(key=lambda r: priority(r) != priority(row))
        before = candidates[0] if candidates else None
        if before:
            record_id = str(before["id"])
            if not record_id.isdigit():
                safe("invalid_record_id")
            op = {"action": "edit", "id": record_id, "before": copy.deepcopy(before), "body": body}
            before.update({"type": body["type"], "content": body["content"], "ttl": str(body["ttl"]), "prio": str(body["prio"]) if "prio" in body else None})
            used.add(record_id)
        else:
            record_id = "new-" + str(index)
            projected.append({"id": record_id, "name": name(row), "type": body["type"], "content": body["content"], "ttl": str(body["ttl"]), "prio": str(body["prio"]) if "prio" in body else None})
            op = {"action": "create", "id": None, "body": body}
        operations.append(op)
    validate_final(projected, wanted)
    return operations, projected

def prepare():
    target = json.loads(TARGET.read_text())
    if target.get("domain") != DOMAIN or target.get("project_id") != "appgprj_6ae655e56db481918fe18adfe9df8b66":
        safe("target_project_mismatch")
    existing = api.inventory()
    operations, projected = build(existing, target["records"])
    snapshot = {"recorded_at": dt.datetime.now(dt.timezone.utc).isoformat(), "domain": DOMAIN, "records": existing}
    api.auth.write_private(PRIVATE / "dns-before.json", snapshot)
    plan = {"domain": DOMAIN, "before_digest": fingerprint(existing), "target_digest": api.digest(target["records"]),
            "source_records": existing, "desired_records": target["records"], "operations": operations,
            "reviewed": True, "scope": "dns", "deletions": 0, "expected_records": len(projected)}
    api.auth.write_private(PLAN, plan)
    return {"status": "review_ready", "current_records": len(existing), "edits": sum(op["action"] == "edit" for op in operations),
            "creates": sum(op["action"] == "create" for op in operations), "deletions": 0,
            "operations": [{"action": op["action"], "id": op["id"], "body": op["body"]} for op in operations],
            "before_digest": plan["before_digest"]}

def apply():
    plan = api.auth.read_private(PLAN)
    target = json.loads(TARGET.read_text())
    if plan.get("domain") != DOMAIN or plan.get("reviewed") is not True or api.digest(target["records"]) != plan.get("target_digest"):
        safe("plan_changed")
    expected = copy.deepcopy(plan["source_records"])
    if fingerprint(api.inventory()) != plan["before_digest"]:
        safe("zone_changed_after_review")
    journal = {"domain": DOMAIN, "started_at": dt.datetime.now(dt.timezone.utc).isoformat(), "applied": [], "complete": False}
    api.auth.write_private(JOURNAL, journal)
    for index, op in enumerate(plan["operations"]):
        if fingerprint(api.inventory()) != fingerprint(expected):
            safe("zone_changed_during_configuration")
        body = dict(op["body"])
        operation = plan["before_digest"] + "/" + str(index) + "/" + api.digest(body)
        if op["action"] == "create":
            route = "/dns/create/" + DOMAIN
            check = api.call("POST", route, {**body, "dryRun": True}, "validate/" + operation)
            if check.get("wouldSucceed") is not True:
                safe("provider_dry_run_not_confirmed")
            result = api.call("POST", route, body, "apply/" + operation)
            record_id = str(result.get("id", ""))
            if not record_id.isdigit():
                safe("created_record_id_missing")
            wanted = copy.deepcopy(body)
            wanted.update({"id": record_id, "name": DOMAIN if not body["name"] else body["name"] + "." + DOMAIN})
            expected.append(wanted)
        elif op["action"] == "edit":
            record_id = op["id"]
            api.call("POST", "/dns/edit/" + DOMAIN + "/" + record_id, body, "apply/" + operation)
            before = next(r for r in expected if str(r["id"]) == record_id)
            before.update({"type": body["type"], "content": body["content"], "ttl": str(body["ttl"]), "prio": str(body["prio"]) if "prio" in body else None})
        else:
            safe("unsupported_mutation")
        journal["applied"].append({"action": op["action"], "id": record_id, "body": body})
        api.auth.write_private(JOURNAL, journal)
        live = api.inventory()
        if sorted(signature(r) for r in live) != sorted(signature(r) for r in expected):
            safe("provider_readback_mismatch")
        # Retain provider serialization/notes for the next concurrency comparison.
        expected = live
    validate_final(expected, plan["desired_records"])
    preserved = [r for r in plan["source_records"] if str(r["id"]) not in {op["id"] for op in plan["operations"] if op["id"]}]
    if not all(any(r == live for live in expected) for r in preserved):
        safe("unrelated_record_changed")
    journal.update({"complete": True, "completed_at": dt.datetime.now(dt.timezone.utc).isoformat(), "records": expected})
    api.auth.write_private(JOURNAL, journal)
    return {"status": "configured_and_readback_verified", "desired_records": 20, "records_total": len(expected),
            "operations": len(journal["applied"]), "preserved_records": len(preserved), "deletions": 0}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("prepare", "apply"))
    args = parser.parse_args()
    try:
        api.auth.private_directory()
        with open(PRIVATE / "dns-operation.lock", "a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            result = prepare() if args.action == "prepare" else apply()
        print(json.dumps(result))
        return 0
    except (api.auth.SetupError, OSError, ValueError, KeyError, TypeError, StopIteration) as exc:
        error = str(exc) if isinstance(exc, api.auth.SetupError) else "local_dns_operation_unverified"
        print(json.dumps({"status": "not_completed", "error": error}))
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
