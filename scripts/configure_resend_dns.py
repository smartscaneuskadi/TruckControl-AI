"""Create only verified provider DNS records under facturas.truckcontrolai.com."""
import argparse
import copy
import datetime as dt
import fcntl
import importlib.util
import json
from pathlib import Path
import re

ROOT = Path(__file__).parent
spec = importlib.util.spec_from_file_location("truckcontrol_existing_dns", ROOT / "configure_domain_dns.py")
dns = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dns)
api = dns.api
SUBDOMAIN = "facturas.truckcontrolai.com"
PLAN = api.auth.PRIVATE / "resend-dns-plan.json"
JOURNAL = api.auth.PRIVATE / "resend-dns-journal.json"

def fail(code):
    raise api.auth.SetupError(code)

def records(resource):
    if resource.get("ok") is not True or resource.get("name") != SUBDOMAIN:
        fail("receiving_resource_mismatch")
    rows = resource.get("records")
    if not isinstance(rows, list) or not 1 <= len(rows) <= 30:
        fail("receiving_records_unavailable")
    result = []
    for r in rows:
        if not isinstance(r, dict):
            fail("invalid_receiving_record")
        raw = r.get("name")
        if not isinstance(raw, str):
            fail("invalid_receiving_hostname")
        raw = raw.rstrip(".").lower()
        if raw in ("", "@"):
            host = SUBDOMAIN
        elif raw == SUBDOMAIN or raw.endswith("." + SUBDOMAIN):
            host = raw
        elif raw == "facturas" or raw.endswith(".facturas"):
            # The current API also returns names relative to the parent zone.
            host = raw + "." + api.DOMAIN
        elif raw == api.DOMAIN or raw.endswith("." + api.DOMAIN):
            fail("receiving_record_outside_subdomain")
        else:
            host = raw + "." + SUBDOMAIN
        short = host[: -(len(api.DOMAIN) + 1)]
        kind = r.get("type")
        if short not in api.RECEIVING_HOST_TYPES or kind not in api.RECEIVING_HOST_TYPES[short]:
            fail("receiving_hostname_or_type_not_allowed")
        value = r.get("value")
        if not isinstance(value, str) or not value or len(value) > 8192 or any(ord(c) < 32 or ord(c) == 127 for c in value):
            fail("invalid_receiving_value")
        if kind == "TXT" and value.startswith('"') and value.endswith('"'):
            try:
                value = json.loads(value)
            except ValueError:
                fail("invalid_receiving_txt")
            if not isinstance(value, str) or any(ord(c) < 32 or ord(c) == 127 for c in value):
                fail("invalid_receiving_txt")
        if kind in ("MX", "CNAME"):
            value = value.rstrip(".").lower()
            if not re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?", value) or ".." in value:
                fail("invalid_receiving_target")
        row = {"name": host, "type": kind, "value": value, "ttl": 300}
        if kind == "MX":
            priority = r.get("priority")
            if isinstance(priority, bool) or not isinstance(priority, (int, str)) or not str(priority).isdigit() or not 0 <= int(priority) <= 65535:
                fail("invalid_receiving_priority")
            row["priority"] = int(priority)
        if any(dns.name(x) == host and (kind == "CNAME" or x["type"] == "CNAME") and dns.signature(x) != dns.signature(row) for x in result):
            fail("receiving_cname_conflict")
        if kind == "TXT" and value.startswith("v=spf1") and any(x["name"] == host and x["type"] == "TXT" and x["value"].startswith("v=spf1") and x["value"] != value for x in result):
            fail("multiple_receiving_spf")
        if not any(dns.signature(x) == dns.signature(row) for x in result):
            result.append(row)
    return result

def build(existing, wanted):
    additions = []
    for row in wanted:
        if any(dns.signature(old) == dns.signature(row) for old in existing):
            continue
        same_host = [old for old in existing if dns.name(old) == row["name"]]
        if any(dns.record_type(old) == row["type"] or dns.record_type(old) == "CNAME" or row["type"] == "CNAME" for old in same_host):
            fail("existing_receiving_record_requires_review")
        additions.append(dns.payload(row))
    return additions

def prepare(path):
    wanted = records(json.loads(Path(path).read_text()))
    before = api.inventory()
    additions = build(before, wanted)
    plan = {"subdomain": SUBDOMAIN, "source_records": before, "source_digest": dns.fingerprint(before),
            "desired_records": wanted, "additions": additions, "reviewed": True, "edits": 0, "deletions": 0}
    api.auth.write_private(PLAN, plan)
    return {"status": "review_ready", "subdomain": SUBDOMAIN, "creates": len(additions), "edits": 0, "deletions": 0, "records": wanted}

def apply():
    plan = api.auth.read_private(PLAN)
    if plan.get("subdomain") != SUBDOMAIN or plan.get("reviewed") is not True:
        fail("receiving_plan_unverified")
    expected = api.inventory()
    if dns.fingerprint(expected) != plan["source_digest"]:
        fail("zone_changed_after_receiving_review")
    wanted = records({"ok": True, "name": SUBDOMAIN, "records": plan["desired_records"]})
    if build(expected, wanted) != plan["additions"]:
        fail("receiving_plan_changed")
    journal = {"subdomain": SUBDOMAIN, "complete": False, "created": [], "started_at": dt.datetime.now(dt.timezone.utc).isoformat()}
    api.auth.write_private(JOURNAL, journal)
    for index, body in enumerate(plan["additions"]):
        if dns.fingerprint(api.inventory()) != dns.fingerprint(expected):
            fail("zone_changed_during_receiving_configuration")
        operation = "resend/" + plan["source_digest"] + "/" + str(index) + "/" + api.digest(body)
        route = "/dns/create/" + api.DOMAIN
        dry = api.call("POST", route, {**body, "dryRun": True}, "validate/" + operation)
        if dry.get("wouldSucceed") is not True:
            fail("receiving_dns_dry_run_unconfirmed")
        answer = api.call("POST", route, body, "apply/" + operation)
        record_id = str(answer.get("id", ""))
        if not record_id.isdigit():
            fail("receiving_created_id_unconfirmed")
        live = api.inventory()
        if not all(old in live for old in expected) or len(live) != len(expected) + 1:
            fail("unrelated_dns_record_changed")
        target = {**body, "name": body["name"] + "." + api.DOMAIN}
        if not any(str(row.get("id")) == record_id and dns.signature(row) == dns.signature(target) for row in live):
            fail("receiving_dns_readback_mismatch")
        journal["created"].append({"id": record_id, "body": copy.deepcopy(body)})
        api.auth.write_private(JOURNAL, journal)
        expected = live
    if build(expected, wanted):
        fail("receiving_records_missing")
    journal.update(complete=True, records=expected)
    api.auth.write_private(JOURNAL, journal)
    return {"status": "configured_and_readback_verified", "subdomain": SUBDOMAIN, "created": len(journal["created"]),
            "preserved_records": len(plan["source_records"]), "edits": 0, "deletions": 0}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("prepare", "apply"))
    parser.add_argument("--provider-json")
    args = parser.parse_args()
    try:
        api.auth.private_directory()
        with open(api.auth.PRIVATE / "dns-operation.lock", "a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            if args.action == "prepare" and not args.provider_json:
                fail("provider_json_required")
            result = prepare(args.provider_json) if args.action == "prepare" else apply()
        print(json.dumps(result))
        return 0
    except (api.auth.SetupError, OSError, ValueError, KeyError, TypeError) as exc:
        print(json.dumps({"status": "not_completed", "error": str(exc) if isinstance(exc, api.auth.SetupError) else "receiving_dns_unconfirmed"}))
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
