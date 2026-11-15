"""Offline target/contract guards; real acceptance requires the isolated CI job."""
import importlib.util
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("manual_company_full_acceptance", ROOT / "scripts/verify-manual-company-full.py")
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


class ManualCompanyFullGuards(unittest.TestCase):
    def test_requires_exact_repository_and_both_isolated_opt_ins(self):
        env = {"GITHUB_ACTIONS": "true", "GITHUB_REPOSITORY": native.REPOSITORY,
               "TRUCKCONTROL_LOCAL_SERVICE_ACCEPTANCE": "synthetic-only",
               "TRUCKCONTROL_MANUAL_COMPANY_FULL_ACCEPTANCE": "synthetic-only"}
        native.isolated_context(env)
        for key in env:
            with self.subTest(key=key), self.assertRaises(native.LabFailure):
                native.isolated_context({**env, key: "foreign"})

    def test_resolves_one_canonical_migration_and_rejects_duplicates_or_symlinks(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            migrations = root / "supabase/migrations"
            migrations.mkdir(parents=True)
            with self.assertRaises(native.LabFailure):
                native.candidate_path(root)
            first = migrations / ("20261115161323" + native.CANDIDATE_SUFFIX)
            first.write_text("-- fixture only; no SQL execution\n")
            canonical = migrations / ("20261115200000" + native.CANDIDATE_SUFFIX)
            first.rename(canonical)
            self.assertEqual(native.candidate_path(root), canonical)
            first.write_text(canonical.read_text())
            with self.assertRaises(native.LabFailure):
                native.candidate_path(root)
            first.unlink()
            canonical.unlink()
            external = root / "never-staged.sql"
            external.write_text("-- fixture\n")
            canonical.symlink_to(external)
            with self.assertRaises(native.LabFailure):
                native.candidate_path(root)

    def test_manual_source_refuses_an_accidentally_composed_mfa_candidate(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            migrations = root / "supabase/migrations"
            migrations.mkdir(parents=True)
            (migrations / ("20261115161323" + native.CANDIDATE_SUFFIX)).write_text("-- manual fixture\n")
            mfa = migrations / "20261115143612_optional_totp_session_protection.sql"
            mfa.write_text("-- separate candidate, never composed\n")
            with self.assertRaises(native.LabFailure):
                native.candidate_path(root)
            mfa.unlink()
            scripts = root / "scripts"
            scripts.mkdir()
            (scripts / "verify-native-totp.py").write_text("# separate harness\n")
            with self.assertRaises(native.LabFailure):
                native.candidate_path(root)

    def test_accepts_only_owned_manual_stack_and_four_fictional_actor_names(self):
        stack = SimpleNamespace(url="http://127.0.0.1:55431", project="tc-recovery-0123456789-manual")
        actor = {"email": "manual-full-a@example.invalid", "user": "fc110000-0000-4000-8000-000000000001"}
        native.actor_guard(stack, actor)
        for url in ["https://kkkemaycedexymrpaqtp.supabase.co", "https://foreign.supabase.co", "http://localhost:55431",
                    "http://127.0.0.1:54321", "http://127.0.0.1:55531", "http://127.0.0.1:55434", "http://127.0.0.1:55431/foreign"]:
            with self.subTest(url=url), self.assertRaises(native.LabFailure):
                native.actor_guard(SimpleNamespace(url=url, project=stack.project), actor)
        for project in ["kkkemaycedexymrpaqtp", "tc-recovery-production-manual", "tc-recovery-0123456789-source", "foreign"]:
            with self.subTest(project=project), self.assertRaises(native.LabFailure):
                native.actor_guard(SimpleNamespace(url=stack.url, project=project), actor)
        for email in ["pedidos@smartscaneuskadi.com", "real@example.com", "manual-full-a@example.invalid.foreign.test"]:
            with self.subTest(email=email), self.assertRaises(native.LabFailure):
                native.actor_guard(stack, {**actor, "email": email})
        with self.assertRaises(native.LabFailure):
            native.actor_guard(stack, {**actor, "user": "invalid"})

    def test_manual_server_state_rejects_forged_schema_types_and_extra_fields(self):
        unconfigured = {"schema_version": 1, "configured": False, "status": "unconfigured", "enabled": None,
                        "expires_at": None, "revision": 0, "updated_at": None}
        self.assertTrue(native.manual_state(unconfigured))
        for update in [{"schema_version": True}, {"configured": "false"}, {"enabled": True}, {"revision": True},
                       {"status": "active"}, {"server_secret": "never-returned"}]:
            with self.subTest(keys=list(update)):
                self.assertFalse(native.manual_state({**unconfigured, **update}))

    def test_active_disabled_and_expired_states_require_server_timestamps_and_matching_enabled(self):
        active = {"schema_version": 1, "configured": True, "status": "active", "enabled": True,
                  "expires_at": None, "revision": 1, "updated_at": "2026-11-15T16:00:00Z"}
        self.assertTrue(native.manual_state(active, "active"))
        self.assertTrue(native.manual_state({**active, "enabled": False, "status": "disabled"}, "disabled"))
        self.assertTrue(native.manual_state({**active, "status": "expired", "expires_at": "2026-11-14T16:00:00+00:00"}, "expired"))
        for update in [{"updated_at": None}, {"updated_at": "2026-11-15T16:00:00"}, {"expires_at": "invalid"},
                       {"enabled": False}, {"revision": 0}, {"status": "expired"}]:
            with self.subTest(keys=list(update)):
                self.assertFalse(native.manual_state({**active, **update}))

    def test_timestamp_validation_never_echoes_input_material(self):
        for value in [None, "private-input-fixture", "2026-11-15T16:00:00", "infinity"]:
            with self.subTest(type=type(value).__name__), self.assertRaisesRegex(native.LabFailure, "^server_timestamp_required$"):
                native.instant(value)
        self.assertEqual(native.instant("2026-11-15T17:00:00+01:00"), native.instant("2026-11-15T16:00:00Z"))


if __name__ == "__main__":
    unittest.main()
