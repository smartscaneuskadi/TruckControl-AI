#!/usr/bin/env python3
"""Offline integrity gate for a *documented* isolated managed-service restore.

This verifies local evidence and consistency only. It never connects to
Supabase, moves customer data, certifies a restore, or enables billing.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime
from pathlib import Path

ARTIFACTS = {"postgresql", "storage_objects", "edge_functions", "service_config"}
CHECKS = {
    "auth_login",
    "cross_tenant_rls",
    "private_storage",
    "edge_functions",
    "sales_disabled",
    "outbound_email_disabled",
    "data_consistency",
}
SHA256 = re.compile(r"^[0-9a-f]{64}$")
SENSITIVE_KEYS = {"password", "secret", "token", "api_key", "private_key", "credential"}


class PreflightError(ValueError):
    pass


def _require(ok: bool, message: str) -> None:
    if not ok:
        raise PreflightError(message)


def _no_secrets(value: object) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            _require(
                not any(word in str(key).lower() for word in SENSITIVE_KEYS),
                "manifest contains a credential-related field; keep secrets in an external vault",
            )
            _no_secrets(child)
    elif isinstance(value, list):
        for child in value:
            _no_secrets(child)


def _local_digest(root: Path, relative: object, expected: object) -> None:
    _require(isinstance(relative, str) and bool(relative), "missing evidence filename")
    _require(isinstance(expected, str) and bool(SHA256.fullmatch(expected)), "invalid SHA-256")
    name = Path(relative)
    _require(not name.is_absolute() and ".." not in name.parts, "unsafe evidence path")
    try:
        file = (root / name).resolve(strict=True)
        file.relative_to(root)
        _require(file.is_file() and not file.is_symlink(), "evidence is not a regular file")
        digest = hashlib.sha256()
        with file.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
    except (OSError, ValueError) as exc:
        raise PreflightError("evidence missing or outside its private directory") from exc
    _require(digest.hexdigest() == expected, "evidence SHA-256 mismatch")


def _date(value: object) -> datetime:
    _require(isinstance(value, str), "missing timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise PreflightError("invalid timestamp") from exc
    _require(parsed.utcoffset() is not None, "timestamp requires timezone")
    return parsed


def inspect(manifest_file: Path, source_ref: str) -> dict[str, object]:
    manifest_file = manifest_file.resolve(strict=True)
    root = manifest_file.parent
    try:
        manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise PreflightError("cannot read JSON manifest") from exc
    _require(isinstance(manifest, dict), "manifest must be an object")
    _no_secrets(manifest)
    _require(manifest.get("schema_version") == 1, "unsupported manifest schema")
    _require(
        manifest.get("source_project_ref") == source_ref and bool(source_ref),
        "source Supabase project does not match the authorized reference",
    )
    _require(
        manifest.get("destination_kind") == "isolated_test"
        and isinstance(manifest.get("destination_project_ref"), str)
        and manifest["destination_project_ref"] != source_ref
        and bool(manifest["destination_project_ref"]),
        "restore destination must be a different, isolated test project",
    )
    _require(manifest.get("synthetic_data_only") is True, "only synthetic-data rehearsals are accepted")

    artifacts = manifest.get("artifacts")
    _require(isinstance(artifacts, list), "missing artifact inventory")
    kinds: set[str] = set()
    for item in artifacts:
        _require(isinstance(item, dict), "invalid artifact")
        kind = item.get("kind")
        _require(kind in ARTIFACTS and kind not in kinds, "invalid or duplicated artifact kind")
        kinds.add(kind)
        _local_digest(root, item.get("path"), item.get("sha256"))
    _require(kinds == ARTIFACTS, "incomplete database/storage/functions/config inventory")

    checks = manifest.get("checks")
    _require(isinstance(checks, dict) and set(checks) == CHECKS, "incomplete or unknown recovery checks")
    for name in sorted(CHECKS):
        check = checks[name]
        _require(isinstance(check, dict) and check.get("passed") is True, "recovery check not passed: " + name)
        _local_digest(root, check.get("evidence_path"), check.get("sha256"))

    capture = _date(manifest.get("backup_captured_at"))
    start = _date(manifest.get("restore_started_at"))
    end = _date(manifest.get("restore_completed_at"))
    _require(capture <= start <= end, "backup/restore timestamps are not chronological")
    elapsed = int((end - start).total_seconds())
    _require(0 < elapsed <= 604800, "restore duration is not plausible")
    return {
        "preflight_passed": True,
        "certified_managed_restore": False,
        "source_project_ref": source_ref,
        "artifact_kinds": sorted(kinds),
        "checked_controls": sorted(CHECKS),
        "observed_restore_duration_seconds": elapsed,
        "note": "Local evidence consistency only; reviewer must independently confirm provider restore, RPO, RTO and isolation.",
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path, help="private local JSON evidence manifest")
    parser.add_argument("--expect-source", required=True, help="authorized Supabase project reference")
    args = parser.parse_args(argv)
    try:
        report = inspect(args.manifest, args.expect_source)
    except (OSError, PreflightError) as exc:
        print(json.dumps({"preflight_passed": False, "reason": str(exc)}, ensure_ascii=False))
        return 1
    print(json.dumps(report, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
