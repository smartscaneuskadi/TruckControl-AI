"""Pure isolation-boundary tests; no Docker, provider, SQL or acceptance call."""
from __future__ import annotations

from copy import deepcopy
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("subscription_postgres_scope", ROOT / "tests/postgres/subscription_contracts.py")
assert spec and spec.loader
contracts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contracts)


class LocalPostgresScope(unittest.TestCase):
    def setUp(self):
        self.environment = {
            "TRUCKCONTROL_LOCAL_POSTGRES_CONTRACT": "synthetic-only",
            "DOCKER_HOST": "unix:///var/run/docker.sock",
        }
        self.image = {"Id": "sha256:local-pinned-image", "RepoDigests": ["postgres@sha256:fixed-official-digest"]}
        self.inspected = {
            "Image": self.image["Id"],
            "Config": {"Image": "postgres:17@sha256:fixed-official-digest", "Labels": {"truckcontrol.acceptance": contracts.LOCAL_LABEL}},
            "HostConfig": {"NetworkMode": "none", "PortBindings": {}, "Binds": None, "VolumesFrom": None,
                           "Privileged": False, "PidMode": "", "IpcMode": "private"},
            "NetworkSettings": {"Ports": {"5432/tcp": None}},
            "Mounts": [{"Type": "volume"}],
        }

    def target(self, inspected=None, image=None):
        outputs = [inspected or self.inspected, image or self.image]
        return SimpleNamespace(CONTAINER="a" * 64, IMAGE=self.inspected["Config"]["Image"],
            run=Mock(side_effect=[SimpleNamespace(stdout=json.dumps([item]).encode()) for item in outputs]))

    def test_explicit_networkless_pinned_local_target_is_accepted(self):
        target = self.target()
        self.assertEqual(contracts.verify_local_target(target, self.environment), (self.inspected, self.image))
        self.assertEqual(target.run.call_count, 2)

    def test_absent_opt_in_and_ambiguous_container_id_fail_before_docker(self):
        for environment, container in (({}, "a" * 64), (self.environment, "postgres")):
            with self.subTest(environment=environment, container=container):
                target = self.target()
                target.CONTAINER = container
                with self.assertRaises(AssertionError):
                    contracts.verify_local_target(target, environment)
                target.run.assert_not_called()

    def test_remote_context_and_tls_selectors_fail_before_docker(self):
        for key, value in (("DOCKER_HOST", "tcp://remote.example.invalid:2376"), ("DOCKER_CONTEXT", "remote"),
                           ("DOCKER_TLS", "1"), ("DOCKER_TLS_VERIFY", "1"), ("DOCKER_CERT_PATH", "/not-used")):
            with self.subTest(key=key):
                target = self.target()
                with self.assertRaises(AssertionError):
                    contracts.verify_local_target(target, {**self.environment, key: value})
                target.run.assert_not_called()

    def test_external_credential_presence_fails_without_exposing_or_using_it(self):
        for key in contracts.EXTERNAL_CREDENTIALS:
            with self.subTest(key=key):
                target = self.target()
                with self.assertRaisesRegex(AssertionError, "External credentials must be absent"):
                    contracts.verify_local_target(target, {**self.environment, key: "synthetic-value-never-used"})
                target.run.assert_not_called()

    def test_network_host_mount_ports_and_privilege_escape_routes_are_rejected(self):
        changes = (
            ("NetworkMode", "bridge"), ("PortBindings", {"5432/tcp": [{"HostPort": "5432"}]}),
            ("Binds", ["/host:/container"]), ("VolumesFrom", ["other-container"]),
            ("Privileged", True), ("PidMode", "host"), ("IpcMode", "host"),
        )
        for key, value in changes:
            with self.subTest(key=key):
                inspected = deepcopy(self.inspected)
                inspected["HostConfig"][key] = value
                with self.assertRaises(AssertionError):
                    contracts.verify_local_target(self.target(inspected), self.environment)
        for key, value in (("Mounts", [{"Type": "bind"}]), ("NetworkSettings", {"Ports": {"5432/tcp": [{"HostPort": "5432"}]}})):
            with self.subTest(key=key):
                inspected = {**self.inspected, key: value}
                with self.assertRaises(AssertionError):
                    contracts.verify_local_target(self.target(inspected), self.environment)

    def test_other_image_or_unowned_container_is_rejected(self):
        for change in ("digest", "image_id", "image_tag", "label"):
            with self.subTest(change=change):
                inspected, image = deepcopy(self.inspected), deepcopy(self.image)
                if change == "digest": image["RepoDigests"] = ["postgres@sha256:wrong"]
                if change == "image_id": inspected["Image"] = "sha256:wrong"
                if change == "image_tag": inspected["Config"]["Image"] = "postgres:latest"
                if change == "label": inspected["Config"]["Labels"] = {}
                with self.assertRaises(AssertionError):
                    contracts.verify_local_target(self.target(inspected, image), self.environment)

    def test_local_mode_refuses_nonempty_database_before_schema_or_fixture_writes(self):
        target = self.target()
        target.run.side_effect = [
            SimpleNamespace(stdout=json.dumps([item]).encode()) for item in (self.inspected, self.image)
        ] + [SimpleNamespace(stdout=b"synthetic-source-commit")]
        target.REPORT = {}
        target.sql = Mock(return_value="17.6")
        target.value = Mock(return_value={"tables": 1})
        def check(name, condition):
            if not condition:
                raise AssertionError(name)
        target.check = check
        financial = SimpleNamespace(ROOT=ROOT, seed_context=Mock())
        from unittest.mock import patch
        with patch.dict("os.environ", self.environment, clear=True):
            with self.assertRaisesRegex(AssertionError, "empty disposable database"):
                contracts.run_local(target, financial)
        target.sql.assert_called_once_with("select current_setting('server_version')")
        financial.seed_context.assert_not_called()


if __name__ == "__main__":
    unittest.main()
