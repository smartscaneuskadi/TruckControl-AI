"""Offline guard/algorithm tests. Native acceptance requires the separate CI lab."""
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("native_totp_acceptance", ROOT / "scripts/verify-native-totp.py")
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


class NativeTotpTargetGuards(unittest.TestCase):
    def test_requires_exact_repository_and_both_explicit_isolated_opt_ins(self):
        env = {"GITHUB_ACTIONS": "true", "GITHUB_REPOSITORY": native.REPOSITORY,
               "TRUCKCONTROL_LOCAL_SERVICE_ACCEPTANCE": "synthetic-only",
               "TRUCKCONTROL_NATIVE_TOTP_ACCEPTANCE": "synthetic-only"}
        native.isolated_context(env)
        for key in env:
            with self.subTest(key=key), self.assertRaises(native.LabFailure):
                native.isolated_context({**env, key: "foreign"})

    def test_native_worker_cannot_forward_local_credentials_to_environment_proxy(self):
        with patch.dict(os.environ, {"HTTP_PROXY": "http://foreign.test:8080", "https_proxy": "http://foreign.test:8080",
                                     "ALL_PROXY": "http://foreign.test:8080", "NODE_USE_ENV_PROXY": "1",
                                     "NODE_OPTIONS": "--use-env-proxy", "OPENAI_API_KEY": "unusable-fixture"}):
            env = native.native_environment()
        for name in ["HTTP_PROXY", "https_proxy", "ALL_PROXY", "NODE_USE_ENV_PROXY", "NODE_OPTIONS", "OPENAI_API_KEY"]:
            self.assertNotIn(name, env)

    def test_refuses_missing_candidate_and_symlinks(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            path = root / "supabase/migrations" / native.CANDIDATE
            path.parent.mkdir(parents=True)
            with self.assertRaises(native.LabFailure):
                native.candidate_path(root)
            path.write_text("-- candidate fixture; no execution\n")
            self.assertEqual(native.candidate_path(root), path)
            path.unlink()
            target = root / "outside.sql"
            target.write_text("-- never staged\n")
            path.symlink_to(target)
            with self.assertRaises(native.LabFailure):
                native.candidate_path(root)

    def test_python_worker_parent_refuses_foreign_targets_and_nonfictional_actors(self):
        actor = {"email": "recovery-a@example.invalid", "user": "fc110000-0000-4000-8000-000000000001"}
        stack = SimpleNamespace(url="http://127.0.0.1:55431", project="tc-recovery-0123456789-native")
        native.actor_guard(stack, actor)
        for url in ["https://kkkemaycedexymrpaqtp.supabase.co", "https://foreign.supabase.co",
                    "http://localhost:55431", "http://127.0.0.1:54321", "http://0.0.0.0:55431"]:
            with self.subTest(url=url), self.assertRaises(native.LabFailure):
                native.actor_guard(SimpleNamespace(url=url, project=stack.project), actor)
        for project in ["kkkemaycedexymrpaqtp", "tc-recovery-production-native", "foreign", "tc-recovery-0123456789-native/other"]:
            with self.subTest(project=project), self.assertRaises(native.LabFailure):
                native.actor_guard(SimpleNamespace(url=stack.url, project=project), actor)
        for email in ["real@example.com", "pedidos@smartscaneuskadi.com", "recovery-a@example.invalid.attacker.test"]:
            with self.subTest(email=email), self.assertRaises(native.LabFailure):
                native.actor_guard(stack, {**actor, "email": email})
        with self.assertRaises(native.LabFailure):
            native.actor_guard(stack, {**actor, "user": "not-a-uuid"})

    def test_native_sdk_fetch_guard_rejects_remote_and_unowned_requests(self):
        # Imports the real installed SDK, but never constructs a client or sends HTTP.
        code = """
          import { ownedAuthUrl } from './scripts/native-totp-sdk.mjs';
          const project = 'tc-recovery-0123456789-native';
          ownedAuthUrl('http://127.0.0.1:55431', project);
          ownedAuthUrl('http://127.0.0.1:55431/auth/v1/factors/x/challenge', project, true);
          const targets = [
            ['https://kkkemaycedexymrpaqtp.supabase.co/auth/v1/user', project, true],
            ['http://127.0.0.1:54321/auth/v1/user', project, true],
            ['http://localhost:55431/auth/v1/user', project, true],
            ['http://user:password@127.0.0.1:55431/auth/v1/user', project, true],
            ['http://127.0.0.1:55431/rest/v1/trucks', project, true],
            ['http://127.0.0.1:55431/auth/v1/user#fragment', project, true],
            ['http://127.0.0.1:55431', 'tc-recovery-production-native', false],
            ['http://127.0.0.1:55431/?foreign=true', project, false],
          ];
          for (const args of targets) {
            let rejected = false;
            try { ownedAuthUrl(...args); } catch { rejected = true; }
            if (!rejected) process.exit(1);
          }
          process.stdout.write('guarded');
        """
        result = subprocess.run(["node", "--input-type=module", "-e", code], cwd=ROOT, capture_output=True, timeout=15)
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        self.assertEqual(result.stdout, b"guarded")

    def test_published_rfc6238_vectors_match_six_digit_native_totp(self):
        # Public RFC6238 Appendix B test key; never a generated/user factor.
        public_test_key = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
        for timestamp, expected in [(59, "287082"), (1111111109, "081804"),
                                    (1111111111, "050471"), (1234567890, "005924"),
                                    (2000000000, "279037"), (20000000000, "353130")]:
            with self.subTest(timestamp=timestamp):
                self.assertEqual(native.totp(public_test_key, timestamp // 30), expected)

    def test_rejects_arbitrary_secret_shapes_without_echoing_material(self):
        for value in ["invalid", "https://foreign.test", "A" * 129, None]:
            with self.subTest(type=type(value).__name__), self.assertRaisesRegex(native.LabFailure, "^native_totp_secret_shape_invalid$"):
                native.totp(value, 1)

if __name__ == "__main__":
    unittest.main()
