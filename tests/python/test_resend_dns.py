"""Receiving subdomain boundaries; synthetic provider records, no network calls."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("resend_dns_tests", ROOT / "scripts/configure_resend_dns.py")
op = importlib.util.module_from_spec(spec)
spec.loader.exec_module(op)

def resource():
    return {"ok": True, "name": op.SUBDOMAIN, "records": [
        {"name": "resend._domainkey", "type": "TXT", "value": "p=synthetic-public-key", "ttl": "Auto"},
        {"name": "send", "type": "TXT", "value": '"v=spf1 include:amazonses.com ~all"'},
        {"name": "send", "type": "MX", "value": "feedback-smtp.eu-west-1.amazonses.com.", "priority": 10},
        {"name": "@", "type": "MX", "value": "inbound-smtp.eu-west-1.amazonaws.com", "priority": 10},
    ]}

class ReceivingDnsTests(unittest.TestCase):
    def test_relative_and_absolute_records_stay_under_the_receiving_subdomain(self):
        data = resource();data["records"][0]["name"] += "." + op.SUBDOMAIN + "."
        rows = op.records(data)
        self.assertEqual(len(rows), 4)
        self.assertTrue(all(r["name"] == op.SUBDOMAIN or r["name"].endswith("." + op.SUBDOMAIN) for r in rows))
        self.assertTrue(all(r["ttl"] == 300 for r in rows))
        self.assertEqual(rows[1]["value"], "v=spf1 include:amazonses.com ~all")

    def test_root_other_domains_and_unapproved_hostnames_are_rejected(self):
        for name in [op.api.DOMAIN, "www." + op.api.DOMAIN, "key1._domainkey." + op.api.DOMAIN, "other.invalid", "*." + op.SUBDOMAIN]:
            with self.subTest(name=name), self.assertRaises(op.api.auth.SetupError):
                data = resource();data["records"][0]["name"] = name;op.records(data)

    def test_parent_relative_provider_names_and_current_spf_cname(self):
        data = resource()
        for row in data["records"]:
            row["name"] = "facturas" if row["name"] == "@" else row["name"] + ".facturas"
        data["records"].append({"name": "rsend.facturas", "type": "CNAME", "value": "send.forge.rmta.net"})
        rows = op.records(data)
        self.assertEqual(len(rows), 5)
        self.assertEqual(rows[0]["name"], "resend._domainkey." + op.SUBDOMAIN)
        self.assertEqual(rows[-1]["name"], "rsend." + op.SUBDOMAIN)

    def test_bad_values_types_and_mx_priorities_are_rejected(self):
        for change in [{"value": "bad\nvalue"}, {"type": "A"}, {"type": "NS"}, {"type": "MX", "priority": -1}, {"type": "MX", "priority": True}]:
            with self.subTest(change=change), self.assertRaises(op.api.auth.SetupError):
                data = resource();data["records"][3].update(change);op.records(data)

    def test_existing_web_and_migadu_records_are_preserved_and_never_edited(self):
        before = [{"id": "1", "name": op.api.DOMAIN, "type": "MX", "content": "aspmx1.migadu.com", "prio": "10"},
                  {"id": "2", "name": "www." + op.api.DOMAIN, "type": "CNAME", "content": "demo.invalid"}]
        changes = op.build(before, op.records(resource()))
        self.assertEqual(len(changes), 4)
        self.assertTrue(all(c["name"] in op.api.RECEIVING_HOST_TYPES for c in changes))
        self.assertEqual(before[0]["content"], "aspmx1.migadu.com")

    def test_existing_receiving_conflict_blocks_all_mutations(self):
        rows = op.records(resource())
        with self.assertRaises(op.api.auth.SetupError):
            op.build([{"id": "1", "name": op.SUBDOMAIN, "type": "MX", "content": "existing.invalid", "prio": 5}], rows)

    def test_preconfigured_receiving_records_are_idempotent(self):
        rows = op.records(resource())
        existing = [{"id": str(i), **op.dns.payload(r), "name": r["name"]} for i, r in enumerate(rows)]
        self.assertEqual(op.build(existing, rows), [])

    def test_two_spf_policies_or_cname_conflicts_are_rejected(self):
        data = resource();data["records"].append({"name": "send", "type": "TXT", "value": "v=spf1 -all"})
        with self.assertRaises(op.api.auth.SetupError):op.records(data)
        data = resource();data["records"].append({"name": "resend._domainkey", "type": "CNAME", "value": "dkim.invalid"})
        with self.assertRaises(op.api.auth.SetupError):op.records(data)

    def test_low_level_client_still_denies_wrong_receiving_types(self):
        with patch.object(op.api.auth, "read_private", side_effect=AssertionError("Must reject before reading credentials")):
            for name, kind in [("facturas", "A"), ("send.facturas", "CNAME"), ("resend._domainkey.facturas", "MX")]:
                with self.subTest(name=name, kind=kind), self.assertRaises(op.api.auth.SetupError):
                    op.api.call("POST", "/dns/create/" + op.api.DOMAIN, {"name": name, "type": kind}, "synthetic")

if __name__ == "__main__":unittest.main()
