"""Pure CI-target guards for Gmail concurrency; no Docker, SQL or provider calls."""
from __future__ import annotations

from copy import deepcopy
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("gmail_postgres_scope", ROOT / "scripts/verify-gmail-sync-postgres.py")
assert spec and spec.loader
gmail = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gmail)


class GmailPostgresScope(unittest.TestCase):
    def setUp(self):
        self.environment = {"GITHUB_ACTIONS": "true", "TRUCKCONTROL_POSTGRES_CONTAINER": "a" * 64}
        self.source = "synthetic-exact-source"
        self.initial = {
            "contract": "truckcontrol-isolated-postgres-v1", "passed": True,
            "source_commit": self.source, "provider_calls": 0, "managed_service_restore": False,
            "image": gmail.pg.IMAGE, "container_image_id": "sha256:synthetic-pinned-image",
        }
        self.financial = {
            "contract": "truckcontrol-financial-incidents-postgres-v1", "passed": True,
            "source_commit": self.source, "provider_calls": 0, "managed_service_restore": False,
        }

    def test_only_fixed_explicit_ci_container_is_accepted(self):
        with patch.object(gmail.pg, "run") as run:
            self.assertEqual(gmail.validate_environment(self.environment), "a" * 64)
            self.assertEqual(gmail.validate_environment({**self.environment, "DOCKER_HOST": "unix:///var/run/docker.sock"}), "a" * 64)
            run.assert_not_called()

    def test_missing_ci_and_ambiguous_or_remote_targets_fail_before_execution(self):
        for change in (
            {"GITHUB_ACTIONS": "false"}, {"GITHUB_ACTIONS": ""},
            {"TRUCKCONTROL_POSTGRES_CONTAINER": "postgres"},
            {"TRUCKCONTROL_POSTGRES_CONTAINER": "tcp://production.example.invalid"},
            {"TRUCKCONTROL_POSTGRES_CONTAINER": ""},
        ):
            with self.subTest(change=change), patch.object(gmail.pg, "run") as run:
                with self.assertRaisesRegex(AssertionError, "isolated GitHub Actions"):
                    gmail.validate_environment({**self.environment, **change})
                run.assert_not_called()

    def test_other_database_cannot_replace_the_fixed_ci_database(self):
        with patch.object(gmail.pg, "SOURCE", "production"), patch.object(gmail.pg, "run") as run:
            with self.assertRaisesRegex(AssertionError, "fixed disposable CI database"):
                gmail.validate_environment(self.environment)
            run.assert_not_called()

    def test_remote_docker_contexts_tls_and_host_selectors_fail_before_execution(self):
        for name, value in (
            ("DOCKER_HOST", "tcp://remote.example.invalid:2376"), ("DOCKER_CONTEXT", "remote"),
            ("DOCKER_TLS", "1"), ("DOCKER_TLS_VERIFY", "1"), ("DOCKER_CERT_PATH", "/not-used"),
        ):
            with self.subTest(name=name), patch.object(gmail.pg, "run") as run:
                with self.assertRaisesRegex(AssertionError, "Remote Docker"):
                    gmail.validate_environment({**self.environment, name: value})
                run.assert_not_called()

    def test_provider_credentials_are_rejected_without_reading_or_printing_their_values(self):
        for name in gmail.EXTERNAL_CREDENTIALS:
            with self.subTest(name=name), patch.object(gmail.pg, "run") as run:
                with self.assertRaisesRegex(AssertionError, "^External credentials must be absent$"):
                    gmail.validate_environment({**self.environment, name: "synthetic-value-never-used"})
                run.assert_not_called()

    def test_preceding_reports_must_both_pass_for_this_exact_source(self):
        gmail.validate_receipts(self.initial, self.financial, self.source)
        for receipt_name in ("initial", "financial"):
            for name, value in (
                ("passed", False), ("passed", None), ("source_commit", "different-source"),
                ("provider_calls", 1), ("managed_service_restore", True), ("contract", "other-contract"),
            ):
                initial, financial = deepcopy(self.initial), deepcopy(self.financial)
                (initial if receipt_name == "initial" else financial)[name] = value
                with self.subTest(receipt=receipt_name, name=name), self.assertRaisesRegex(AssertionError, "preceding isolated acceptance"):
                    gmail.validate_receipts(initial, financial, self.source)

    def test_prior_image_proof_cannot_be_missing_or_changed(self):
        for name, value in (("image", "postgres:latest"), ("container_image_id", "")):
            with self.subTest(name=name), self.assertRaisesRegex(AssertionError, "immutable PostgreSQL image"):
                gmail.validate_receipts({**self.initial, name: value}, self.financial, self.source)

    def test_invalid_environment_stops_main_before_schema_or_fixture_access(self):
        with patch.dict("os.environ", {}, clear=True), patch.object(gmail.pg, "run") as run, patch.object(gmail, "value") as value, patch.object(gmail, "run_races") as races:
            with self.assertRaisesRegex(AssertionError, "isolated GitHub Actions"):
                gmail.main()
            run.assert_not_called()
            value.assert_not_called()
            races.assert_not_called()

    def test_ci_reuses_verified_steps_and_compiles_new_script_before_running_it(self):
        workflow = (ROOT / ".github/workflows/isolated-postgres.yml").read_text()
        self.assertLess(workflow.index("run: python3 scripts/verify-financial-incidents-postgres.py"),
                        workflow.index("run: python3 scripts/verify-gmail-sync-postgres.py"))
        compile_line = next(line for line in workflow.splitlines() if "run: python3 -m py_compile" in line)
        self.assertIn("scripts/verify-gmail-sync-postgres.py", compile_line)
        self.assertIn("run: python3 -m unittest discover -s tests/python -p 'test_gmail_sync_postgres_scope.py'", workflow)
        self.assertEqual(workflow.count('- "scripts/verify-gmail-sync-postgres.py"'), 2)
        self.assertEqual(workflow.count('- "tests/python/test_gmail_sync_postgres_scope.py"'), 2)
        self.assertIn("image: " + gmail.pg.IMAGE, workflow)


if __name__ == "__main__":
    unittest.main()
