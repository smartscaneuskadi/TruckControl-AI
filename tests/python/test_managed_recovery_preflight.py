"""No-network tests for the managed-recovery evidence preflight.

The fixtures below are fabricated locally; they never represent an actual
Supabase restore and may not be used to authorize commercial launch.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "managed_recovery_preflight.py"
spec = importlib.util.spec_from_file_location("managed_recovery_preflight", SCRIPT)
assert spec and spec.loader
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)

SOURCE = "kkkemaycedexymrpaqtp"


class RecoveryPreflightTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="tc-recovery-fixture-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.manifest = {
            "schema_version": 1,
            "source_project_ref": SOURCE,
            "destination_project_ref": "synthetic-test-destination",
            "destination_kind": "isolated_test",
            "synthetic_data_only": True,
            "backup_captured_at": "2026-11-07T10:00:00+00:00",
            "restore_started_at": "2026-11-07T10:10:00+00:00",
            "restore_completed_at": "2026-11-07T10:30:00+00:00",
            "artifacts": [],
            "checks": {},
        }
        for kind in sorted(gate.ARTIFACTS):
            filename, checksum = self.file(f"artifacts/{kind}.bin", kind.encode())
            self.manifest["artifacts"].append({"kind": kind, "path": filename, "sha256": checksum})
        for name in sorted(gate.CHECKS):
            filename, checksum = self.file(f"evidence/{name}.json", b'{"synthetic":true}')
            self.manifest["checks"][name] = {
                "passed": True, "evidence_path": filename, "sha256": checksum
            }
        self.save()

    def file(self, relative: str, content: bytes) -> tuple[str, str]:
        target = self.root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        return relative, hashlib.sha256(content).hexdigest()

    def save(self) -> None:
        (self.root / "manifest.json").write_text(json.dumps(self.manifest), encoding="utf-8")

    def inspect(self) -> dict[str, object]:
        self.save()
        return gate.inspect(self.root / "manifest.json", SOURCE)

    def test_complete_synthetic_manifest_passes_preflight_but_never_certifies(self) -> None:
        result = self.inspect()
        self.assertTrue(result["preflight_passed"])
        self.assertFalse(result["certified_managed_restore"])
        self.assertEqual(result["observed_restore_duration_seconds"], 1200)
        self.assertEqual(len(result["checked_controls"]), len(gate.CHECKS))

    def test_prevents_wrong_source_or_live_destination(self) -> None:
        self.manifest["source_project_ref"] = "another-project"
        with self.assertRaises(gate.PreflightError):
            self.inspect()
        self.manifest["source_project_ref"] = SOURCE
        self.manifest["destination_project_ref"] = SOURCE
        with self.assertRaises(gate.PreflightError):
            self.inspect()
        self.manifest["destination_project_ref"] = "other"
        self.manifest["destination_kind"] = "production"
        with self.assertRaises(gate.PreflightError):
            self.inspect()

    def test_requires_all_backups_and_checks(self) -> None:
        self.manifest["artifacts"].pop()
        with self.assertRaises(gate.PreflightError):
            self.inspect()
        self.manifest["artifacts"].append(self.manifest["artifacts"][0])
        with self.assertRaises(gate.PreflightError):
            self.inspect()
        self.manifest["checks"].pop("cross_tenant_rls")
        with self.assertRaises(gate.PreflightError):
            self.inspect()

    def test_rejects_tampering_and_missing_files(self) -> None:
        path = self.root / self.manifest["artifacts"][0]["path"]
        path.write_bytes(b"changed after recording the hash")
        with self.assertRaises(gate.PreflightError):
            self.inspect()
        path.unlink()
        with self.assertRaises(gate.PreflightError):
            self.inspect()

    def test_blocks_path_traversal_and_external_symlink(self) -> None:
        self.manifest["artifacts"][0]["path"] = "../outside.bin"
        with self.assertRaises(gate.PreflightError):
            self.inspect()
        link = self.root / "escape.bin"
        with tempfile.TemporaryDirectory() as outside:
            target = Path(outside) / "backups"
            target.write_bytes(b"external")
            link.symlink_to(target)
            self.manifest["artifacts"][0]["path"] = "escape.bin"
            self.manifest["artifacts"][0]["sha256"] = hashlib.sha256(b"external").hexdigest()
            with self.assertRaises(gate.PreflightError):
                self.inspect()

    def test_rejects_symlinks_even_to_files_inside_evidence_directory(self) -> None:
        item = self.manifest["artifacts"][0]
        original = self.root / item["path"]
        link = self.root / "local-link.bin"
        link.symlink_to(original)
        item["path"] = "local-link.bin"
        with self.assertRaisesRegex(gate.PreflightError, "symlinked evidence"):
            self.inspect()

        parent_link = self.root / "linked-artifacts"
        parent_link.symlink_to(self.root / "artifacts", target_is_directory=True)
        item["path"] = "linked-artifacts/" + original.name
        with self.assertRaisesRegex(gate.PreflightError, "symlinked evidence"):
            self.inspect()

    def test_rejects_hardlinks_to_internal_and_external_evidence(self) -> None:
        item = self.manifest["artifacts"][0]
        original = self.root / item["path"]
        internal_alias = self.root / "same-inode.bin"
        os.link(original, internal_alias)
        item["path"] = internal_alias.name
        with self.assertRaisesRegex(gate.PreflightError, "hardlinked evidence"):
            self.inspect()

        # Even when a different path has the expected checksum, a hard link
        # to an external inode must not enter the evidence inventory.
        internal_alias.unlink()
        with tempfile.TemporaryDirectory(prefix="tc-recovery-external-") as other:
            foreign = Path(other) / "foreign.bin"
            foreign.write_bytes(b"foreign-private-content")
            alias = self.root / "foreign-link.bin"
            os.link(foreign, alias)
            item["path"] = alias.name
            item["sha256"] = hashlib.sha256(foreign.read_bytes()).hexdigest()
            with self.assertRaisesRegex(gate.PreflightError, "hardlinked evidence"):
                self.inspect()

    def test_rejects_manifest_symlink(self) -> None:
        alias = self.root / "manifest-alias.json"
        alias.symlink_to(self.root / "manifest.json")
        with self.assertRaisesRegex(gate.PreflightError, "symlinked manifest"):
            gate.inspect(alias, SOURCE)

    def test_requires_distinct_files_for_each_inventory_and_check(self) -> None:
        first = self.manifest["artifacts"][0]
        second = self.manifest["artifacts"][1]
        saved = second.copy()
        second["path"], second["sha256"] = first["path"], first["sha256"]
        with self.assertRaisesRegex(gate.PreflightError, "reused"):
            self.inspect()

        second.update(saved)
        check = self.manifest["checks"]["auth_login"]
        check["evidence_path"], check["sha256"] = first["path"], first["sha256"]
        with self.assertRaisesRegex(gate.PreflightError, "reused"):
            self.inspect()

    def test_rejects_duplicate_json_keys_even_when_values_are_identical(self) -> None:
        manifest_file = self.root / "manifest.json"
        original = manifest_file.read_text(encoding="utf-8")
        duplicate_top = original.replace(
            '"schema_version": 1', '"schema_version": 1, "schema_version": 1', 1
        )
        self.assertNotEqual(duplicate_top, original)
        manifest_file.write_text(duplicate_top, encoding="utf-8")
        with self.assertRaisesRegex(gate.PreflightError, "duplicate JSON field"):
            gate.inspect(manifest_file, SOURCE)

        duplicate_nested = original.replace(
            '"passed": true', '"passed": true, "passed": true', 1
        )
        self.assertNotEqual(duplicate_nested, original)
        manifest_file.write_text(duplicate_nested, encoding="utf-8")
        with self.assertRaisesRegex(gate.PreflightError, "duplicate JSON field"):
            gate.inspect(manifest_file, SOURCE)

    def test_rejects_undocumented_fields_at_every_manifest_level(self) -> None:
        self.manifest["claim_certified"] = True
        with self.assertRaisesRegex(gate.PreflightError, "unexpected or missing"):
            self.inspect()
        self.manifest.pop("claim_certified")

        self.manifest["artifacts"][0]["source_url"] = "https://example.invalid"
        with self.assertRaisesRegex(gate.PreflightError, "unexpected or missing"):
            self.inspect()
        self.manifest["artifacts"][0].pop("source_url")

        self.manifest["checks"]["auth_login"]["native_verified"] = True
        with self.assertRaisesRegex(gate.PreflightError, "unexpected or missing"):
            self.inspect()

    def test_no_secrets_or_personal_data_backups_in_manifest(self) -> None:
        self.manifest["api_token"] = "not-a-real-token"
        with self.assertRaises(gate.PreflightError):
            self.inspect()
        self.manifest.pop("api_token")
        self.manifest["synthetic_data_only"] = False
        with self.assertRaises(gate.PreflightError):
            self.inspect()

    def test_rejects_unverified_controls_and_fake_timestamps(self) -> None:
        self.manifest["checks"]["sales_disabled"]["passed"] = False
        with self.assertRaises(gate.PreflightError):
            self.inspect()
        self.manifest["checks"]["sales_disabled"]["passed"] = True
        self.manifest["restore_completed_at"] = "2026-11-07T09:00:00+00:00"
        with self.assertRaises(gate.PreflightError):
            self.inspect()


if __name__ == "__main__":
    unittest.main()
