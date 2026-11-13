"""Inspect the actual unsigned release AAB with checksum-pinned Google bundletool.

No signing, installation, account access or network calls. Fixtures passed to
the policy functions establish policy behavior, never compiled-release evidence.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
ANDROID = "{http://schemas.android.com/apk/res/android}"
PACKAGE = "com.truckcontrolai.app"
HOME = "https://truckcontrolai.com/"
MAIN = PACKAGE + ".TruckControlActivity"
SHORTCUT = "com.google.androidbrowserhelper.trusted.ShortcutTrampolineActivity"
PROFILE = "androidx.profileinstaller.ProfileInstallReceiver"
DEFAULT_URL = "android.support.customtabs.trusted.DEFAULT_URL"
TRUSTED_META = {DEFAULT_URL, "android.support.customtabs.trusted.STATUS_BAR_COLOR",
                "android.support.customtabs.trusted.NAVIGATION_BAR_COLOR"}


class ReleaseManifestError(ValueError):
    """Fixed errors only; no subprocess output or arbitrary manifest values."""


def require(ok: bool, code: str) -> None:
    if not ok:
        raise ReleaseManifestError(code)


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "android_json_ambiguous")
        result[key] = value
    return result


def tool_pin() -> dict:
    try:
        pin = json.loads((ROOT / "android/bundletool.lock.json").read_text(), object_pairs_hook=unique_object)
        require(set(pin) == {"version", "url", "sha256", "bytes"}
                and re.fullmatch(r"\d+\.\d+\.\d+", pin["version"])
                and pin["url"] == "https://github.com/google/bundletool/releases/download/"
                    + pin["version"] + "/bundletool-all-" + pin["version"] + ".jar"
                and re.fullmatch(r"[0-9a-f]{64}", pin["sha256"])
                and type(pin["bytes"]) is int and 0 < pin["bytes"] < 100 * 1024 * 1024,
                "android_tool_pin_invalid")
        return pin
    except (OSError, ValueError, TypeError, KeyError):
        raise ReleaseManifestError("android_tool_pin_invalid") from None


def invoke(tool: Path, args: list[str]) -> str:
    try:
        result = subprocess.run(["java", "-jar", str(tool), *args], capture_output=True,
                                text=True, timeout=60, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise ReleaseManifestError("android_inspector_failed") from None
    require(result.returncode == 0 and len(result.stdout) <= 1024 * 1024, "android_inspector_failed")
    return result.stdout


def verify_tool(tool: Path) -> dict:
    pin = tool_pin()
    try:
        require(not tool.is_symlink() and tool.is_file() and tool.stat().st_size == pin["bytes"],
                "android_tool_checksum_mismatch")
        with tool.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        require(digest == pin["sha256"], "android_tool_checksum_mismatch")
    except OSError:
        raise ReleaseManifestError("android_tool_checksum_mismatch") from None
    require(invoke(tool, ["version"]).strip() == pin["version"], "android_tool_version_mismatch")
    return pin


def one(parent: ET.Element, tag: str, code: str) -> ET.Element:
    values = parent.findall(tag)
    require(len(values) == 1, code)
    return values[0]


def resource_dump(text: str, name: str, kind: str) -> tuple[str, str]:
    """Exact pinned bundletool format; reject missing/variant/ambiguous resources."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    require(len(lines) == 3 and lines[0] == "Package '" + PACKAGE + "':", "android_resource_invalid")
    header = re.fullmatch(r"(0x[0-9a-f]{8}) - " + re.escape(name), lines[1])
    value = re.fullmatch(r"\(default\) - \[" + re.escape(kind) + r"\] (.+)", lines[2])
    require(header is not None and value is not None, "android_resource_invalid")
    if kind == "STR":
        try:
            content = json.loads(value[1])
        except ValueError:
            raise ReleaseManifestError("android_resource_invalid") from None
        require(isinstance(content, str), "android_resource_invalid")
    else:
        content = value[1]
        path = PurePosixPath(content)
        require(not path.is_absolute() and ".." not in path.parts and "\\" not in content
                and content.startswith("res/") and content.endswith(".xml"), "android_resource_invalid")
    return header[1], content


def reference_matches(reference: str | None, identifier: str, name: str) -> bool:
    return reference in (identifier, "@" + identifier, "@" + name)


def verify_manifest(xml: str, assets_text: str, rules_text: str) -> dict:
    try:
        require("<!DOCTYPE" not in xml.upper() and "<!ENTITY" not in xml.upper(), "android_manifest_invalid")
        manifest = ET.fromstring(xml)
    except ET.ParseError:
        raise ReleaseManifestError("android_manifest_invalid") from None
    require(manifest.tag == "manifest" and manifest.get("package") == PACKAGE, "android_release_package_invalid")
    sdk = one(manifest, "uses-sdk", "android_sdk_invalid")
    require(sdk.get(ANDROID + "minSdkVersion") == "24" and sdk.get(ANDROID + "targetSdkVersion") == "36",
            "android_sdk_invalid")
    permissions = [child.get(ANDROID + "name") for child in manifest if child.tag.startswith("uses-permission")]
    allowed = {"android.permission.INTERNET", PACKAGE + ".DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"}
    require(len(permissions) == len(set(permissions)) and "android.permission.INTERNET" in permissions
            and set(permissions) <= allowed
            and all(child.tag == "uses-permission" and set(child.attrib) == {ANDROID + "name"}
                    for child in manifest if child.tag.startswith("uses-permission")), "android_permission_invalid")
    for declaration in manifest.findall("permission"):
        require(declaration.get(ANDROID + "name") == PACKAGE + ".DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"
                and declaration.get(ANDROID + "protectionLevel") in ("signature", "2", "0x00000002"),
                "android_permission_invalid")
    application = one(manifest, "application", "android_application_invalid")
    require(all(application.get(ANDROID + name) == "false" for name in
                ("allowBackup", "fullBackupContent", "usesCleartextTraffic"))
            and all(application.get(ANDROID + name) in (None, "false") for name in ("debuggable", "testOnly"))
            and application.get(ANDROID + "networkSecurityConfig") is None
            and all(child.get(ANDROID + "shell") in (None, "false") for child in application.findall("profileable")),
            "android_release_security_invalid")
    components = [child for child in application if child.tag in
                  ("activity", "activity-alias", "receiver", "service", "provider")]
    names = [child.get(ANDROID + "name") for child in components]
    require(None not in names and len(names) == len(set(names)), "android_component_invalid")
    exported = []
    for component in components:
        name = component.get(ANDROID + "name")
        flag = component.get(ANDROID + "exported")
        require(flag in (None, "true", "false"), "android_component_invalid")
        # Target 36 requires explicit exported for intent filters. Other defaults
        # are private at minSdk24, including providers (API17+).
        require(flag is not None or not component.findall("intent-filter"), "android_component_invalid")
        if flag != "true":
            continue
        exported.append(name)
        if name == MAIN:
            require(component.tag == "activity", "android_component_invalid")
        elif name == SHORTCUT:
            require(component.tag == "activity" and not component.findall("intent-filter")
                    and component.get(ANDROID + "taskAffinity") == ""
                    and component.get(ANDROID + "excludeFromRecents") == "true", "android_component_invalid")
        elif name == PROFILE:
            require(component.tag == "receiver" and component.get(ANDROID + "permission") == "android.permission.DUMP",
                    "android_component_invalid")
        else:
            raise ReleaseManifestError("android_exported_component_unexpected")
    require(MAIN in exported, "android_twa_invalid")
    activity = next(child for child in components if child.get(ANDROID + "name") == MAIN)
    require(application.get(ANDROID + "enabled") in (None, "true")
            and activity.get(ANDROID + "enabled") in (None, "true"), "android_twa_invalid")
    metadata = activity.findall("meta-data")
    require(len(metadata) == len({child.get(ANDROID + "name") for child in metadata})
            and {child.get(ANDROID + "name") for child in metadata} == TRUSTED_META,
            "android_twa_invalid")
    default = next(child for child in metadata if child.get(ANDROID + "name") == DEFAULT_URL)
    require(default.attrib == {ANDROID + "name": DEFAULT_URL, ANDROID + "value": HOME}, "android_twa_invalid")
    filters = activity.findall("intent-filter")
    launcher, links = [], []
    for intent in filters:
        actions = [child.get(ANDROID + "name") for child in intent.findall("action")]
        categories = [child.get(ANDROID + "name") for child in intent.findall("category")]
        if actions == ["android.intent.action.MAIN"] and categories == ["android.intent.category.LAUNCHER"]:
            require(not intent.findall("data"), "android_origin_invalid")
            launcher.append(intent)
        elif actions == ["android.intent.action.VIEW"] and len(categories) == 2 and set(categories) == {
                "android.intent.category.DEFAULT", "android.intent.category.BROWSABLE"}:
            data = one(intent, "data", "android_origin_invalid")
            require(intent.get(ANDROID + "autoVerify") == "true" and data.attrib == {
                ANDROID + "scheme": "https", ANDROID + "host": "truckcontrolai.com"}, "android_origin_invalid")
            links.append(intent)
        else:
            raise ReleaseManifestError("android_origin_invalid")
    require(len(filters) == 2 and len(launcher) == len(links) == 1, "android_origin_invalid")
    app_assets = [child for child in application.findall("meta-data") if child.get(ANDROID + "name") == "asset_statements"]
    require(len(app_assets) == 1 and set(app_assets[0].attrib) == {ANDROID + "name", ANDROID + "resource"},
            "android_asset_statements_invalid")
    asset_id, asset_value = resource_dump(assets_text, "string/asset_statements", "STR")
    require(reference_matches(app_assets[0].get(ANDROID + "resource"), asset_id, "string/asset_statements"),
            "android_asset_statements_invalid")
    try:
        statements = json.loads(asset_value, object_pairs_hook=unique_object)
    except ValueError:
        raise ReleaseManifestError("android_asset_statements_invalid") from None
    require(statements == [{"relation": ["delegate_permission/common.handle_all_urls"],
                            "target": {"namespace": "web", "site": HOME.rstrip("/")}}],
            "android_asset_statements_invalid")
    rules_id, rules_file = resource_dump(rules_text, "xml/data_extraction_rules", "FILE")
    require(reference_matches(application.get(ANDROID + "dataExtractionRules"), rules_id, "xml/data_extraction_rules"),
            "android_release_security_invalid")
    return {"package": PACKAGE, "min_sdk": 24, "target_sdk": 36, "permissions": sorted(permissions),
            "exported_components": sorted(exported), "twa_origin": HOME, "asset_statements_verified": True,
            "data_extraction_rules_file": rules_file, "cleartext_disabled": True, "backup_disabled": True}


def inspect_release(bundle: Path, tool: Path) -> tuple[dict, dict[str, str]]:
    pin = verify_tool(tool)
    try:
        before = hashlib.sha256(bundle.read_bytes()).hexdigest()
        with zipfile.ZipFile(bundle) as archive:
            names = archive.namelist()
            require(len(names) == len(set(names)) and
                    {name for name in names if name.endswith("/manifest/AndroidManifest.xml")} == {"base/manifest/AndroidManifest.xml"},
                    "android_bundle_invalid")
            require(not any(name.upper().startswith("META-INF/") and
                            name.upper().endswith((".RSA", ".DSA", ".EC")) for name in names), "android_release_signed_unexpected")
    except (OSError, zipfile.BadZipFile):
        raise ReleaseManifestError("android_bundle_invalid") from None
    manifests = {
        "manifest.xml": invoke(tool, ["dump", "manifest", "--bundle=" + str(bundle), "--module=base"]),
        "asset_statements.txt": invoke(tool, ["dump", "resources", "--bundle=" + str(bundle), "--resource=string/asset_statements", "--values"]),
        "data_extraction_rules.txt": invoke(tool, ["dump", "resources", "--bundle=" + str(bundle), "--resource=xml/data_extraction_rules", "--values"]),
    }
    verified = verify_manifest(manifests["manifest.xml"], manifests["asset_statements.txt"], manifests["data_extraction_rules.txt"])
    require("base/" + verified["data_extraction_rules_file"] in names, "android_resource_invalid")
    require(hashlib.sha256(bundle.read_bytes()).hexdigest() == before, "android_bundle_changed")
    return {**verified, "bundletool": pin, "bundle_sha256": before}, manifests


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tool", type=Path, required=True)
    parser.add_argument("--verify-tool-only", action="store_true")
    parser.add_argument("--bundle", type=Path)
    parser.add_argument("--candidate-report", type=Path)
    parser.add_argument("--evidence-dir", type=Path)
    args = parser.parse_args(argv)
    try:
        if args.verify_tool_only:
            print(json.dumps({"verified_bundletool": verify_tool(args.tool)}, sort_keys=True))
            return 0
        require(all((args.bundle, args.candidate_report, args.evidence_dir)), "android_arguments_invalid")
        verified, evidence = inspect_release(args.bundle, args.tool)
        report = json.loads(args.candidate_report.read_text(), object_pairs_hook=unique_object)
        require(isinstance(report, dict) and
                all(report.get(key) is False for key in ("commercial_signed", "play_published", "physical_device_verified"))
                and report.get("debug_compiled_manifest_verified") is True, "android_candidate_report_invalid")
        files = report.get("files")
        require(isinstance(files, list) and all(isinstance(item, dict) for item in files)
                and any(item.get("name") == args.bundle.name and item.get("sha256") == verified["bundle_sha256"]
                        for item in files), "android_candidate_report_invalid")
        args.evidence_dir.mkdir(parents=True, exist_ok=True)
        for name, content in evidence.items():
            (args.evidence_dir / name).write_text(content)
        report.update({"release_aab_manifest_verified": True, "release_aab_manifest": verified,
                       "compiled_manifest_scope": ["debug_apk", "release_aab"]})
        args.candidate_report.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps({"release_aab_manifest_verified": True, "commercial_signed": False,
                          "play_published": False, "physical_device_verified": False}, sort_keys=True))
        return 0
    except ReleaseManifestError as error:
        print(json.dumps({"release_aab_manifest_verified": False, "error": str(error)}))
        return 1
    except (OSError, ValueError):
        print(json.dumps({"release_aab_manifest_verified": False, "error": "android_release_verification_failed"}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
