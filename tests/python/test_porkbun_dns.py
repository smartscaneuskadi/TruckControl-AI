"""DNS maintenance boundaries with synthetic keys/records; no provider requests."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

op = load("truckcontrol_dns_operator_tests", ROOT / "scripts/configure_domain_dns.py")
auth = op.api.auth
DESIRED = json.loads(op.TARGET.read_text())["records"]

def rr(i, host, kind, value, prio=None):
    return {"id": str(i), "name": host, "type": kind, "content": value, "ttl": "600",
            "prio": str(prio) if prio is not None else None, "notes": None}

def defaults():
    return [rr(1, op.DOMAIN, "ALIAS", "uixie.porkbun.com"),
            rr(2, "*." + op.DOMAIN, "CNAME", "uixie.porkbun.com"),
            rr(3, op.DOMAIN, "MX", "fwd1.porkbun.com", 10),
            rr(4, op.DOMAIN, "MX", "fwd2.porkbun.com", 20),
            rr(5, op.DOMAIN, "TXT", "v=spf1 include:_spf.porkbun.com ~all")]

class AuthTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="truckcontrol-auth-tests-")
        private = Path(self.temp.name) / "porkbun"
        self.paths = patch.multiple(auth, PRIVATE=private, PENDING=private / "pending.json", CREDENTIAL=private / "credentials.json")
        self.paths.start()
        auth.private_directory()

    def tearDown(self):
        self.paths.stop()
        self.temp.cleanup()

    def pending(self):
        return {"status": "SUCCESS", "deliveryMode": "pkce", "requestToken": "a" * 64,
                "authUrl": "https://porkbun.com/account/apiKeyApproval/" + "a" * 64,
                "expiration": "2099-01-01 00:00:00"}

    def test_pkce_and_dns_only_request_keep_verifier_private(self):
        with patch.object(auth, "post", return_value=self.pending()) as send:
            result = auth.start()
        body = send.call_args.args[1]
        self.assertEqual(body["scopes"], ["dns"])
        self.assertEqual(len(body["codeChallenge"]), 43)
        self.assertEqual(body["codeChallengeMethod"], "S256")
        self.assertNotIn("code_verifier", result)
        self.assertNotIn("request_token", result)
        self.assertNotIn("secretapikey", result)
        self.assertEqual(auth.PENDING.stat().st_mode & 0o777, 0o600)
        self.assertEqual(auth.PRIVATE.stat().st_mode & 0o777, 0o700)

    def test_pending_request_is_reused_without_another_authorization(self):
        with patch.object(auth, "post", return_value=self.pending()) as send:
            first = auth.start()
            second = auth.start()
        self.assertEqual(first, second)
        self.assertEqual(send.call_count, 1)

    def test_legacy_secret_copy_flow_is_rejected(self):
        value = self.pending()
        value["deliveryMode"] = "legacy"
        with patch.object(auth, "post", return_value=value), self.assertRaises(auth.SetupError):
            auth.start()
        self.assertFalse(auth.PENDING.exists())

    def test_foreign_approval_origin_is_rejected(self):
        value = self.pending()
        value["authUrl"] = "https://other.example/account/apiKeyApproval/test"
        with patch.object(auth, "post", return_value=value), self.assertRaises(auth.SetupError):
            auth.start()
        self.assertFalse(auth.PENDING.exists())

    def test_excess_permissions_are_rejected(self):
        auth.write_private(auth.CREDENTIAL, {"apikey": "synthetic-public", "secretapikey": "synthetic-secret", "domain": op.DOMAIN})
        with patch.object(auth, "post", return_value={"status": "SUCCESS", "credentialsValid": True, "scopes": ["read", "dns", "purchase"]}), self.assertRaises(auth.SetupError):
            auth.verify()
        self.assertIsNot(auth.read_private(auth.CREDENTIAL).get("verified"), True)

    def test_dns_credentials_verified_without_disclosing_them(self):
        auth.write_private(auth.CREDENTIAL, {"apikey": "synthetic-public", "secretapikey": "synthetic-secret", "domain": op.DOMAIN})
        with patch.object(auth, "post", return_value={"status": "SUCCESS", "credentialsValid": True, "scopes": ["read", "dns"]}):
            result = auth.verify()
        self.assertEqual(result["status"], "connected")
        self.assertFalse(result["purchase_permission"])
        self.assertNotIn("synthetic-", json.dumps(result))
        self.assertTrue(auth.read_private(auth.CREDENTIAL)["verified"])

    def test_readable_or_symlinked_private_file_is_rejected(self):
        path = auth.PRIVATE / "bad.json"
        path.write_text("{}")
        path.chmod(0o644)
        with self.assertRaises(auth.SetupError):
            auth.read_private(path)
        path.chmod(0o600)
        link = auth.PRIVATE / "link.json"
        link.symlink_to(path)
        with self.assertRaises(auth.SetupError):
            auth.read_private(link)

    def test_no_purchase_or_other_domain_endpoint_can_be_called(self):
        for method, route in [("POST", "/domain/create/truckcontrolai.com"), ("GET", "/dns/retrieve/other.example"), ("POST", "/dns/delete/truckcontrolai.com/1")]:
            with self.assertRaises(op.api.auth.SetupError):
                op.api.call(method, route, {})
        for body in ({"name": "", "type": "NS"}, {"name": "unrelated", "type": "TXT"}):
            with self.assertRaises(op.api.auth.SetupError):
                op.api.call("POST", "/dns/create/" + op.DOMAIN, body, "synthetic-operation")

class PlannerTests(unittest.TestCase):
    def test_defaults_replaced_in_place_without_deleting_other_records(self):
        before = defaults()
        changes, after = op.build(before, DESIRED)
        self.assertEqual(sum(c["action"] == "edit" for c in changes), 4)
        self.assertEqual(sum(c["action"] == "create" for c in changes), 16)
        self.assertEqual(len(after), 21)
        self.assertIn(before[1], after)
        self.assertEqual(before[0]["type"], "ALIAS")
        self.assertNotIn("delete", {c["action"] for c in changes})

    def test_unrelated_verification_and_nameserver_are_preserved(self):
        extra = [rr(6, op.DOMAIN, "TXT", "other-verification=preserve"), rr(7, op.DOMAIN, "NS", "ns1.example.net")]
        changes, after = op.build(defaults() + extra, DESIRED)
        self.assertTrue(all(r in after for r in extra))
        self.assertFalse(any(c.get("id") in ("6", "7") for c in changes))

    def test_unknown_routing_or_managed_hostname_blocks_the_entire_plan(self):
        extras = [rr(6, op.DOMAIN, "MX", "other-company.example", 5),
                  rr(6, op.DOMAIN, "AAAA", "2001:db8::1"),
                  rr(6, "key1._domainkey." + op.DOMAIN, "CNAME", "other-company.example"),
                  rr(6, "www." + op.DOMAIN, "TXT", "other-verification=preserve")]
        for extra in extras:
            with self.subTest(kind=extra["type"], host=extra["name"]), self.assertRaises(op.api.auth.SetupError):
                op.build(defaults() + [extra], DESIRED)

    def test_correct_configuration_is_idempotent(self):
        ready = []
        for i, row in enumerate(DESIRED):
            b = op.payload(row)
            ready.append(rr(100 + i, op.name(row), b["type"], b["content"], b.get("prio")))
        self.assertEqual(op.build(ready, DESIRED)[0], [])

    def test_other_domain_and_duplicate_spf_rejected(self):
        with self.assertRaises(op.api.auth.SetupError):
            op.payload({"name": "other.example", "type": "A", "value": "192.0.2.1", "ttl": 600})
        with self.assertRaises(op.api.auth.SetupError):
            op.build(defaults() + [rr(6, op.DOMAIN, "TXT", "v=spf1 include:other.example -all")], DESIRED)

    def test_zone_order_is_irrelevant_but_content_changes_are_detected(self):
        records = defaults()
        self.assertEqual(op.fingerprint(records), op.fingerprint(list(reversed(records))))
        changed = copy.deepcopy(records)
        changed[0]["content"] = "changed.example"
        self.assertNotEqual(op.fingerprint(records), op.fingerprint(changed))

    def test_concurrent_change_stops_before_any_provider_write(self):
        initial = defaults()
        actions, projected = op.build(initial, DESIRED)
        plan = {"domain": op.DOMAIN, "reviewed": True, "target_digest": op.api.digest(DESIRED), "source_records": initial,
                "before_digest": op.fingerprint(initial), "operations": actions, "desired_records": DESIRED}
        with patch.object(op.api.auth, "read_private", return_value=plan), patch.object(op.api, "inventory", return_value=initial + [rr(90, op.DOMAIN, "TXT", "concurrent-change")]), patch.object(op.api, "call") as write:
            with self.assertRaises(op.api.auth.SetupError):
                op.apply()
        write.assert_not_called()

    def test_apply_checks_each_write_and_preserves_the_original_wildcard(self):
        live = defaults()
        original = copy.deepcopy(live)
        actions, projected = op.build(live, DESIRED)
        plan = {"domain": op.DOMAIN, "reviewed": True, "target_digest": op.api.digest(DESIRED), "source_records": original,
                "before_digest": op.fingerprint(original), "operations": actions, "desired_records": DESIRED}
        def call(method, route, body, operation_id):
            self.assertEqual(method, "POST")
            self.assertIn(op.DOMAIN, route)
            self.assertTrue(operation_id)
            if body.get("dryRun"):
                return {"status": "SUCCESS", "wouldSucceed": True}
            if "/create/" in route:
                record_id = 1000 + len(live)
                host = op.DOMAIN if not body["name"] else body["name"] + "." + op.DOMAIN
                live.append(rr(record_id, host, body["type"], body["content"], body.get("prio")))
                return {"status": "SUCCESS", "id": str(record_id)}
            self.assertIn("/edit/", route)
            row = next(r for r in live if r["id"] == route.rsplit("/", 1)[1])
            row.update({"type": body["type"], "content": body["content"], "ttl": str(body["ttl"]), "prio": str(body["prio"]) if "prio" in body else None})
            return {"status": "SUCCESS"}
        with patch.object(op.api.auth, "read_private", return_value=plan), patch.object(op.api.auth, "write_private") as save, patch.object(op.api, "inventory", side_effect=lambda: copy.deepcopy(live)), patch.object(op.api, "call", side_effect=call):
            result = op.apply()
        self.assertEqual(result["operations"], 20)
        self.assertEqual(result["deletions"], 0)
        self.assertEqual(result["preserved_records"], 1)
        self.assertIn(original[1], live)
        self.assertTrue(save.call_args.args[1]["complete"])

if __name__ == "__main__":
    unittest.main()
