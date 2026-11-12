import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("local_service_recovery", Path(__file__).resolve().parents[2] / "scripts/verify-local-service-recovery.py")
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)


class LocalRecoveryGuards(unittest.TestCase):
    def test_accepts_only_the_four_owned_loopback_endpoints(self):
        for port in lab.PORTS:
            self.assertEqual(lab.local_url(f"http://127.0.0.1:{port}/"), f"http://127.0.0.1:{port}")

    def test_rejects_remote_urls_userinfo_and_unowned_ports(self):
        for url in ["https://kkkemaycedexymrpaqtp.supabase.co", "http://0.0.0.0:55431", "http://localhost:55431", "http://127.0.0.1:54321", "http://user:password@127.0.0.1:55431", "http://127.0.0.1:55431?x=1", "http://127.0.0.1:55431#x"]:
            with self.subTest(url=url), self.assertRaises(lab.LabFailure):
                lab.local_url(url)

    def fixture(self):
        return {"Name": "/supabase_db_tc-recovery-test-source", "Config": {"Labels": {"com.supabase.cli.project": "tc-recovery-test-source"}}, "HostConfig": {"NetworkMode": "test-offline", "Privileged": False}, "NetworkSettings": {"Networks": {"test-offline": {}}, "Ports": {"5432/tcp": [{"HostIp": "127.0.0.1"}]}}, "Mounts": []}

    def test_accepts_owned_unprivileged_internal_container(self):
        self.assertTrue(lab.container_allowed(self.fixture(), "tc-recovery-test-source", "test-offline"))

    def test_rejects_foreign_labels_extra_networks_socket_and_exposed_ports(self):
        import copy
        original = self.fixture()
        for mutation in [lambda x: x["Config"]["Labels"].clear(), lambda x: x["NetworkSettings"]["Networks"].update({"bridge": {}}), lambda x: x["NetworkSettings"]["Ports"]["5432/tcp"][0].update({"HostIp": "0.0.0.0"}), lambda x: x["HostConfig"].update({"Privileged": True}), lambda x: x["Mounts"].append({"Source": "/var/run/docker.sock"})]:
            value = copy.deepcopy(original)
            mutation(value)
            self.assertFalse(lab.container_allowed(value, "tc-recovery-test-source", "test-offline"))

    def test_configuration_change_stays_in_its_exact_section(self):
        text = "[api]\nport = 54321\n[db]\nport = 54322\n"
        self.assertEqual(lab.toml_set(text, "api", "port", "55431"), "[api]\nport = 55431\n[db]\nport = 54322\n")
        with self.assertRaises(lab.LabFailure):
            lab.toml_set(text, "missing", "port", "55431")

    def test_pdf_fixture_is_explicitly_synthetic_and_has_a_real_xref(self):
        pdf = lab.synthetic_pdf()
        self.assertTrue(pdf.startswith(b"%PDF-1.4"))
        self.assertIn(b"NOT A FISCAL INVOICE", pdf)
        offset = int(pdf.split(b"startxref\n")[1].splitlines()[0])
        self.assertEqual(pdf[offset:offset + 4], b"xref")


if __name__ == "__main__":
    unittest.main()
