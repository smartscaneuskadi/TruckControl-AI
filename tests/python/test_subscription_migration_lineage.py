"""Regression guard for the exact applied SQL #67 and chronological new migration paths.

This module is purely offline. It makes no connection to GitHub, Supabase, Stripe,
a customer account or an external service. Never repairs migration history.
"""
from __future__ import annotations

import hashlib
from pathlib import Path
import re
import unittest

MIGRATIONS = Path(__file__).resolve().parents[2] / "supabase" / "migrations"
APPLIED_67 = "20261113084134_subscription_dispute_id_prefix.sql"
APPLIED_67_GIT_BLOB = "c8e85a223cab54be43be297d6dc38e29b6481a20"
CANDIDATES = (
    "20261113185620_subscription_snapshot_ordering.sql",
    "20261113185634_subscription_unlinked_incident_review.sql",
)
VERSIONS = re.compile(r"^(\d{14})_[a-z][a-z0-9_]*\.sql$")


class SubscriptionMigrationLineage(unittest.TestCase):
    def test_already_applied_67_is_byte_for_byte_immutable(self):
        source = (MIGRATIONS / APPLIED_67).read_bytes()
        blob = b"blob " + str(len(source)).encode("ascii") + b"\0" + source
        self.assertEqual(hashlib.sha1(blob).hexdigest(), APPLIED_67_GIT_BLOB)

    def test_only_the_correct_version_of_each_candidate_exists(self):
        for expected in (APPLIED_67, *CANDIDATES):
            suffix = expected.split("_", 1)[1]
            with self.subTest(suffix=suffix):
                matching = sorted(p.name for p in MIGRATIONS.glob("*_" + suffix))
                self.assertEqual(matching, [expected],
                    "Do not retain an old local version or create a second copy of a migration")

    def test_candidates_follow_applied_remote_67_in_cli_order(self):
        names = (APPLIED_67, *CANDIDATES)
        versions = []
        for name in names:
            match = VERSIONS.fullmatch(name)
            self.assertIsNotNone(match, name)
            self.assertTrue((MIGRATIONS / name).is_file(), name)
            versions.append(match.group(1))
        self.assertEqual(versions, sorted(set(versions)),
            "Unapplied migrations must follow #67, with unique increasing timestamps")


if __name__ == "__main__":
    unittest.main()
