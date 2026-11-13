"""Source contracts and rejected fixtures, never compiled Android acceptance.

No SDK, Docker, network, account, device or signing key is used by these tests.
CI separately passes the actual built AAB through checksum-pinned bundletool.
"""
from contextlib import redirect_stdout
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("android_release_policy_tests", ROOT / "scripts/verify_android_release.py")
op = importlib.util.module_from_spec(spec)
spec.loader.exec_module(op)
A = op.ANDROID


def source_fixture():
    # Combine actual source facts for policy tests. This is deliberately not
    # described as a merged/compiled manifest or passed to a release publisher.
    root = ET.parse(ROOT / "android/app/src/main/AndroidManifest.xml").getroot()
    root.set("package", "com.truckcontrolai.app")
    ET.SubElement(root, "uses-sdk", {A + "minSdkVersion": "24", A + "targetSdkVersion": "36"})
    return root


def resource(name, kind, value, resource_id="0x7f010001"):
    return "Package 'com.truckcontrolai.app':\n" + resource_id + " - " + name + "\n\t(default) - [" + kind + "] " + value + "\n"


def asset_text(value=None):
    if value is None:
        strings = ET.parse(ROOT / "android/app/src/main/res/values/strings.xml").getroot()
        raw = strings.find("string[@name='asset_statements']").text
        # Current ASCII Android resource uses escaped quote characters only.
        value = json.loads(raw.replace(r'\"', '"'))
    return resource("string/asset_statements", "STR", json.dumps(json.dumps(value)))


RULES = resource("xml/data_extraction_rules", "FILE", "res/xml/data_extraction_rules.xml", "0x7f020001")


def verify(root=None, assets=None, rules=RULES):
    return op.verify_manifest(ET.tostring(root if root is not None else source_fixture(), encoding="unicode"),
                              assets if assets is not None else asset_text(), rules)


class ReleaseManifestPolicyTests(unittest.TestCase):
    def rejected(self, root, code=None, assets=None, rules=RULES):
        with self.assertRaises(op.ReleaseManifestError) as caught:
            verify(root, assets, rules)
        self.assertRegex(str(caught.exception), "^android_[a-z_]+$")
        if code:
            self.assertEqual(str(caught.exception), code)

    def test_actual_source_contract_matches_release_policy(self):
        result = verify()
        self.assertEqual(result["exported_components"], ["com.truckcontrolai.app.TruckControlActivity"])
        gradle = (ROOT / "android/app/build.gradle.kts").read_text()
        for literal in ('applicationId = "com.truckcontrolai.app"', 'minSdk = 24', 'targetSdk = 36',
                        'applicationIdSuffix = ".debug"', 'androidbrowserhelper:2.7.4', 'junit:junit:4.13.2'):
            self.assertIn(literal, gradle)
        self.assertNotIn("signingConfig", gradle)
        self.assertIn('version "9.5.1"', (ROOT / "android/build.gradle.kts").read_text())
        strings = ET.parse(ROOT / "android/app/src/main/res/values/strings.xml").getroot()
        self.assertEqual(strings.find("string[@name='asset_statements']").get("translatable"), "false")
        backup = ET.parse(ROOT / "android/app/src/main/res/xml/data_extraction_rules.xml").getroot()
        for section in ("cloud-backup", "device-transfer"):
            exclusions = backup.find(section).findall("exclude")
            self.assertEqual(len(exclusions), 5)
            self.assertEqual({x.get("domain") for x in exclusions}, {"root", "file", "database", "sharedpref", "external"})
            self.assertTrue(all(x.get("path") == "." for x in exclusions))

    def test_debug_package_wrong_sdk_and_duplicate_sdk_are_rejected(self):
        for package in ("com.truckcontrolai.app.debug", "unrelated.package"):
            root = source_fixture(); root.set("package", package)
            self.rejected(root, "android_release_package_invalid")
        for field, value in (("minSdkVersion", "23"), ("targetSdkVersion", "35")):
            root = source_fixture(); root.find("uses-sdk").set(A + field, value)
            self.rejected(root, "android_sdk_invalid")
        root = source_fixture(); ET.SubElement(root, "uses-sdk")
        self.rejected(root, "android_sdk_invalid")

    def test_missing_extra_duplicate_or_scoped_permissions_are_rejected(self):
        for case in ("missing", "extra", "duplicate", "scoped"):
            root = source_fixture()
            if case == "missing": root.remove(root.find("uses-permission"))
            elif case == "extra": ET.SubElement(root, "uses-permission", {A + "name": "android.permission.READ_CONTACTS"})
            elif case == "duplicate": ET.SubElement(root, "uses-permission", {A + "name": "android.permission.INTERNET"})
            else: root.find("uses-permission").set(A + "maxSdkVersion", "24")
            with self.subTest(case=case): self.rejected(root, "android_permission_invalid")

    def test_dynamic_receiver_permission_must_remain_signature_protected(self):
        for level in ("signature", "0x00000002", "normal"):
            root = source_fixture()
            ET.SubElement(root, "permission", {A + "name": op.PACKAGE + ".DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION",
                                               A + "protectionLevel": level})
            if level == "normal": self.rejected(root, "android_permission_invalid")
            else: verify(root)

    def test_release_network_backup_debug_and_test_flags_are_enforced(self):
        for field, value in (("usesCleartextTraffic", "true"), ("allowBackup", "true"), ("fullBackupContent", "true"),
                             ("debuggable", "true"), ("testOnly", "true"), ("networkSecurityConfig", "@xml/unsafe")):
            root = source_fixture(); root.find("application").set(A + field, value)
            with self.subTest(field=field): self.rejected(root, "android_release_security_invalid")
        for shell in ("true", "@bool/unresolved"):
            root = source_fixture(); ET.SubElement(root.find("application"), "profileable", {A + "shell": shell})
            self.rejected(root, "android_release_security_invalid")

    def test_unexpected_exports_implicit_exports_aliases_and_duplicate_components_are_rejected(self):
        for tag in ("activity", "activity-alias", "service", "receiver", "provider"):
            root = source_fixture()
            ET.SubElement(root.find("application"), tag, {A + "name": "unexpected.Component", A + "exported": "true"})
            with self.subTest(tag=tag): self.rejected(root, "android_exported_component_unexpected")
        root = source_fixture()
        receiver = ET.SubElement(root.find("application"), "receiver", {A + "name": "implicit.Component"})
        ET.SubElement(receiver, "intent-filter")
        self.rejected(root, "android_component_invalid")
        root = source_fixture()
        ET.SubElement(root.find("application"), "activity", {A + "name": op.MAIN, A + "exported": "false"})
        self.rejected(root, "android_component_invalid")

    def test_reviewed_dependency_components_require_their_original_restrictions(self):
        root = source_fixture()
        shortcut = ET.SubElement(root.find("application"), "activity", {
            A + "name": op.SHORTCUT, A + "exported": "true", A + "taskAffinity": "", A + "excludeFromRecents": "true"})
        profile = ET.SubElement(root.find("application"), "receiver", {
            A + "name": op.PROFILE, A + "exported": "true", A + "permission": "android.permission.DUMP"})
        self.assertEqual(len(verify(root)["exported_components"]), 3)
        profile.set(A + "permission", "android.permission.INTERNET")
        self.rejected(root, "android_component_invalid")
        profile.set(A + "permission", "android.permission.DUMP")
        shortcut.attrib.pop(A + "taskAffinity")
        self.rejected(root, "android_component_invalid")

    def test_deep_links_require_the_exact_verified_https_origin(self):
        for field, value in (("scheme", "http"), ("host", "evil.invalid"), ("port", "8443"), ("path", "/anything")):
            root = source_fixture(); root.find("application/activity/intent-filter/data").set(A + field, value)
            with self.subTest(field=field): self.rejected(root, "android_origin_invalid")
        root = source_fixture()
        links = root.find("application/activity/intent-filter[@" + A + "autoVerify='true']")
        links.set(A + "autoVerify", "false")
        self.rejected(root, "android_origin_invalid")
        root = source_fixture(); ET.SubElement(root.find("application/activity/intent-filter"), "data", {A + "scheme": "https"})
        self.rejected(root, "android_origin_invalid")

    def test_twa_default_url_additional_origins_and_missing_launcher_are_rejected(self):
        for url in ("http://truckcontrolai.com/", "https://www.truckcontrolai.com/", "https://truckcontrolai.com:8443/"):
            root = source_fixture(); root.find("application/activity/meta-data").set(A + "value", url)
            self.rejected(root, "android_twa_invalid")
        root = source_fixture()
        ET.SubElement(root.find("application/activity"), "meta-data", {
            A + "name": "android.support.customtabs.trusted.ADDITIONAL_TRUSTED_ORIGINS", A + "resource": "@array/other"})
        self.rejected(root, "android_twa_invalid")
        root = source_fixture(); root.find("application/activity").set(A + "exported", "false")
        self.rejected(root, "android_twa_invalid")
        root = source_fixture(); root.find("application/activity").set(A + "enabled", "false")
        self.rejected(root, "android_twa_invalid")
        root = source_fixture(); root.find("application/activity/meta-data").set(A + "resource", "@string/other")
        self.rejected(root, "android_twa_invalid")

    def test_numeric_and_named_compiled_resource_references_are_supported(self):
        root = source_fixture()
        root.find("application/meta-data").set(A + "resource", "0x7f010001")
        root.find("application").set(A + "dataExtractionRules", "0x7f020001")
        verify(root)
        root.find("application/meta-data").set(A + "resource", "0x7f010099")
        self.rejected(root, "android_asset_statements_invalid")

    def test_compiled_asset_statements_reject_foreign_origins_and_ambiguous_values(self):
        for site in ("http://truckcontrolai.com", "https://evil.invalid", "https://truckcontrolai.com/"):
            self.rejected(source_fixture(), "android_asset_statements_invalid", asset_text([
                {"relation": ["delegate_permission/common.handle_all_urls"], "target": {"namespace": "web", "site": site}}]))
        self.rejected(source_fixture(), "android_resource_invalid", asset_text() + '\tlocale: "en" - [STR] "other"\n')
        self.rejected(source_fixture(), "android_resource_invalid", asset_text().replace("Package 'com.truckcontrolai.app'", "Package 'foreign'"))
        root = source_fixture(); root.find("application").attrib.pop(A + "dataExtractionRules")
        self.rejected(root, "android_release_security_invalid")
        self.rejected(source_fixture(), "android_resource_invalid", rules=RULES.replace("res/xml/", "../"))

    def test_entities_malformed_xml_and_duplicate_applications_are_rejected(self):
        for xml in ("<manifest", '<!DOCTYPE manifest [<!ENTITY private "hidden">]><manifest/>'):
            with self.assertRaises(op.ReleaseManifestError): op.verify_manifest(xml, asset_text(), RULES)
        root = source_fixture(); ET.SubElement(root, "application")
        self.rejected(root, "android_application_invalid")


class InspectorBoundaryTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="tc-android-policy-test-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.bundle = self.root / "app-release.aab"
        with zipfile.ZipFile(self.bundle, "w") as archive:
            archive.writestr("base/manifest/AndroidManifest.xml", b"synthetic fixture; not compiled protobuf")
            archive.writestr("base/res/xml/data_extraction_rules.xml", b"synthetic fixture")
        self.pin = op.tool_pin()
        self.report = self.root / "android-candidate.json"
        self.report.write_text(json.dumps({"commercial_signed": False, "play_published": False, "physical_device_verified": False,
            "debug_compiled_manifest_verified": True, "release_aab_manifest_verified": False,
            "files": [{"name": self.bundle.name, "sha256": hashlib.sha256(self.bundle.read_bytes()).hexdigest()}]}))

    def inspector(self, tool, args):
        self.assertIn("--bundle=" + str(self.bundle), args)
        if args[1] == "manifest":
            self.assertIn("--module=base", args)
            return ET.tostring(source_fixture(), encoding="unicode")
        if "--resource=string/asset_statements" in args: return asset_text()
        self.assertIn("--resource=xml/data_extraction_rules", args)
        return RULES

    def run_cli(self, inspector=None):
        with patch.object(op, "verify_tool", return_value=self.pin), patch.object(op, "invoke", side_effect=inspector or self.inspector), redirect_stdout(io.StringIO()):
            return op.main(["--tool", str(self.root / "synthetic-tool.jar"), "--bundle", str(self.bundle),
                            "--candidate-report", str(self.report), "--evidence-dir", str(self.root / "evidence")])

    def test_pin_is_exact_official_asset_digest_and_workflow_uses_the_actual_aab(self):
        self.assertEqual(self.pin["version"], "1.18.3")
        self.assertEqual(self.pin["sha256"], "a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29")
        workflow = (ROOT / ".github/workflows/android.yml").read_text()
        self.assertIn(self.pin["url"], workflow)
        self.assertIn("--bundle android/app/build/outputs/bundle/release/app-release.aab", workflow)
        self.assertIn(":app:testDebugUnitTest :app:lintRelease :app:assembleDebug :app:bundleRelease", workflow)
        self.assertIn("Gradle 9\\.8\\.2", workflow)

    def test_unapproved_jar_is_rejected_before_any_java_execution(self):
        tool = self.root / "wrong.jar"; tool.write_bytes(b"unapproved binary")
        with patch.object(op.subprocess, "run") as run, self.assertRaisesRegex(op.ReleaseManifestError, "^android_tool_checksum_mismatch$"):
            op.verify_tool(tool)
        run.assert_not_called()

    def test_matching_fixture_checksum_still_requires_exact_version(self):
        tool = self.root / "fixture.jar"; tool.write_bytes(b"synthetic jar")
        pin = {**self.pin, "bytes": tool.stat().st_size, "sha256": hashlib.sha256(tool.read_bytes()).hexdigest()}
        with patch.object(op, "tool_pin", return_value=pin), patch.object(op.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, "wrong-version\n", "")):
            with self.assertRaisesRegex(op.ReleaseManifestError, "^android_tool_version_mismatch$"): op.verify_tool(tool)

    def test_same_size_modified_tool_is_rejected_before_java_execution(self):
        tool = self.root / "modified.jar"; tool.write_bytes(b"modified fixture")
        pin = {**self.pin, "bytes": tool.stat().st_size, "sha256": hashlib.sha256(b"approved fixture").hexdigest()}
        with patch.object(op, "tool_pin", return_value=pin), patch.object(op.subprocess, "run") as run:
            with self.assertRaisesRegex(op.ReleaseManifestError, "^android_tool_checksum_mismatch$"): op.verify_tool(tool)
        run.assert_not_called()

    def test_actual_aab_path_is_inspected_and_separate_report_flags_are_preserved(self):
        self.assertEqual(self.run_cli(), 0)
        report = json.loads(self.report.read_text())
        self.assertTrue(report["release_aab_manifest_verified"])
        self.assertEqual(report["compiled_manifest_scope"], ["debug_apk", "release_aab"])
        self.assertTrue(all(report[key] is False for key in ("commercial_signed", "play_published", "physical_device_verified")))
        self.assertEqual(len(list((self.root / "evidence").iterdir())), 3)

    def test_failed_manifest_never_upgrades_candidate_evidence(self):
        before = self.report.read_bytes()
        def failed(tool, args):
            value = self.inspector(tool, args)
            return value.replace("com.truckcontrolai.app", "private-unexpected-value") if args[1] == "manifest" else value
        self.assertEqual(self.run_cli(failed), 1)
        self.assertEqual(self.report.read_bytes(), before)
        self.assertFalse((self.root / "evidence").exists())

    def test_signed_or_additional_module_bundle_is_rejected_before_inspection(self):
        for name in ("META-INF/COMMERCIAL.RSA", "feature/manifest/AndroidManifest.xml"):
            with self.subTest(name=name):
                extra = self.root / ("signed.aab" if name.startswith("META") else "feature.aab")
                with zipfile.ZipFile(extra, "w") as archive:
                    archive.writestr("base/manifest/AndroidManifest.xml", b"fixture")
                    archive.writestr(name, b"fixture")
                with patch.object(op, "verify_tool", return_value=self.pin), patch.object(op, "invoke") as invoke, self.assertRaises(op.ReleaseManifestError):
                    op.inspect_release(extra, self.root / "fixture.jar")
                invoke.assert_not_called()

    def test_bundle_change_or_unbound_candidate_hash_cannot_produce_positive_evidence(self):
        before = self.report.read_bytes()
        def changed(tool, args):
            output = self.inspector(tool, args)
            if args[1] == "manifest":
                with self.bundle.open("ab") as stream: stream.write(b"changed after inventory")
            return output
        self.assertEqual(self.run_cli(changed), 1)
        self.assertEqual(self.report.read_bytes(), before)
        self.assertEqual(self.run_cli(), 1)
        self.assertEqual(self.report.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
