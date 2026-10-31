import importlib.util
import io
import json
import unittest
from pathlib import Path
from urllib.error import HTTPError

spec = importlib.util.spec_from_file_location("auth_mail_setup", Path(__file__).resolve().parents[2] / "scripts" / "configure_auth_mail.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class FakeManagement:
    def __init__(self, host="", foreign=False):
        self.project = {"id": module.PROJECT_REF, "name": "truckcontrol-ai", "organization_id": module.ORGANIZATION_ID}
        if foreign:
            self.project["id"] = "another-project"
        self.config = {"site_url": "http://localhost:3000", "uri_allow_list": "", "mailer_autoconfirm": False,
                       "external_email_enabled": True, "password_min_length": 16, "smtp_host": host,
                       "smtp_user": "private-user", "smtp_pass": "private-password", "smtp_admin_email": ""}
        self.writes = []

    def request(self, method, suffix="", body=None):
        if not suffix:
            return self.project.copy()
        if method == "PATCH":
            self.writes.append(body.copy())
            self.config.update(body)
        return self.config.copy()


class MailConfigurationTests(unittest.TestCase):
    def test_target_guard_rejects_every_other_project(self):
        with self.assertRaises(module.SetupError):
            module.check_project("another-project")
        client = FakeManagement(foreign=True)
        with self.assertRaises(module.SetupError):
            module.configure(client, apply=True)
        self.assertEqual(client.writes, [])

    def test_check_is_read_only_and_never_reports_credentials(self):
        client = FakeManagement()
        result = module.configure(client)
        serialized = json.dumps(result)
        self.assertNotIn("private-user", serialized)
        self.assertNotIn("private-password", serialized)
        self.assertEqual(client.writes, [])

    def test_free_default_smtp_does_not_receive_unsupported_templates(self):
        client = FakeManagement()
        result = module.configure(client, apply=True)
        self.assertTrue(result["templates_pending_custom_smtp"])
        self.assertEqual(client.config["site_url"], module.APP_ORIGIN)
        self.assertFalse(client.config["mailer_autoconfirm"])
        self.assertEqual(client.config["password_min_length"], 16)
        self.assertFalse(any(key.startswith("mailer_templates_") for key in client.writes[0]))

    def test_custom_smtp_gets_templates_without_replacing_smtp_or_opening_signup(self):
        client = FakeManagement(host="smtp.example.com")
        result = module.configure(client, apply=True)
        patch = client.writes[0]
        self.assertIn("{{ .ConfirmationURL }}", patch["mailer_templates_recovery_content"])
        self.assertFalse(any(key.startswith("smtp_") for key in patch))
        self.assertNotIn("disable_signup", patch)
        self.assertEqual(client.config["smtp_pass"], "private-password")
        self.assertFalse(result["customer_registration_opened"])

    def test_foreign_or_ambiguous_redirects_are_not_overwritten(self):
        for redirect in ("https://other.example/", module.APP_ORIGIN + "/**", module.APP_ORIGIN + "/?token=private"):
            client = FakeManagement()
            client.config["uri_allow_list"] = redirect
            with self.assertRaises(module.SetupError):
                module.configure(client, apply=True)
            self.assertEqual(client.writes, [])

    def test_remote_errors_cannot_echo_authorization_or_smtp_secrets(self):
        client = module.ManagementClient("private-token")

        class FailedOpener:
            def open(self, *args, **kwargs):
                raise HTTPError("https://api.supabase.com/", 400, "private-password", {}, io.BytesIO(b"private-token"))

        client.opener = FailedOpener()
        with self.assertRaises(module.SetupError) as caught:
            client.request("GET")
        self.assertIn("HTTP 400", str(caught.exception))
        self.assertNotIn("private-password", str(caught.exception))
        self.assertNotIn("private-token", str(caught.exception))

    def test_unconfirmed_write_is_not_reported_as_success(self):
        client = FakeManagement()
        original = client.request

        def ignore_write(method, suffix="", body=None):
            return {} if method == "PATCH" else original(method, suffix, body)

        client.request = ignore_write
        with self.assertRaises(module.SetupError):
            module.configure(client, apply=True)


if __name__ == "__main__":
    unittest.main()
