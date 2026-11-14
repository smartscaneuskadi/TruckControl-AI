#!/usr/bin/env python3
"""Offline integrity gate for a *documented* isolated managed-service restore.

This verifies local evidence and consistency only. It never connects to
Supabase, moves customer data, certifies a restore, or enables billing.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
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
# Bound untrusted JSON before decoding; individual evidence blobs remain streamed.
MAX_MANIFEST_BYTES = 1024 * 1024
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



# Fail closed on ambiguous or undocumented recovery manifests. JSON normally
# accepts duplicate keys with "last wins", which can mislead an independent
# reviewer inspecting the raw evidence.
MANIFEST_FIELDS = {
    "schema_version", "source_project_ref", "destination_project_ref",
    "destination_kind", "synthetic_data_only", "backup_captured_at",
    "restore_started_at", "restore_completed_at", "artifacts", "checks",
}
ARTIFACT_FIELDS = {"kind", "path", "sha256"}
CHECK_FIELDS = {"passed", "evidence_path", "sha256"}


def _unique_json_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        _require(key not in result, "duplicate JSON field in recovery manifest")
        result[key] = value
    return result


def _strict_fields(value: dict[str, object], expected: set[str]) -> None:
    _require(set(value) == expected, "unexpected or missing recovery manifest field")


def _local_digest(
    root: Path,
    relative: object,
    expected: object,
    used_files: set[tuple[int, int]],
) -> None:
    _require(isinstance(relative, str) and bool(relative), "missing evidence filename")
    _require(isinstance(expected, str) and bool(SHA256.fullmatch(expected)), "invalid SHA-256")
    name = Path(relative)
    _require(not name.is_absolute() and ".." not in name.parts, "unsafe evidence path")
    # resolve() dereferences symlinks, so is_symlink() on the resolved file
    # alone would silently accept links to other files under this directory.
    probe = root
    for part in name.parts:
        probe = probe / part
        _require(not probe.is_symlink(), "symlinked evidence path is not permitted")
    try:
        file = (root / name).resolve(strict=True)
        file.relative_to(root)
        _require(file.is_file() and not file.is_symlink(), "evidence is not a regular file")
        initial_stat = file.stat()
        # A hard link can refer to an unrelated file outside this folder.
        _require(initial_stat.st_nlink == 1, "hardlinked evidence is not permitted")
        identity = (initial_stat.st_dev, initial_stat.st_ino)
        _require(identity not in used_files, "evidence inode is reused")
        digest = hashlib.sha256()
        # Validate the descriptor actually opened, not only the earlier path.
        # NOFOLLOW rejects a final symlink swap; NONBLOCK avoids FIFO stalls.
        flags = os.O_RDONLY | getattr(os, "O_BINARY", 0)
        flags |= getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
        with os.fdopen(os.open(file, flags), "rb") as stream:
            fd_stat = os.fstat(stream.fileno())
            _require(stat.S_ISREG(fd_stat.st_mode), "evidence is not a regular file")
            _require(
                (fd_stat.st_dev, fd_stat.st_ino) == identity and fd_stat.st_nlink == 1,
                "evidence changed during validation",
            )
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
            final_fd_stat = os.fstat(stream.fileno())
            _require(
                final_fd_stat.st_size == fd_stat.st_size
                and final_fd_stat.st_mtime_ns == fd_stat.st_mtime_ns,
                "evidence changed during validation",
            )
        current_stat = file.stat()
        _require(
            not file.is_symlink()
            and (current_stat.st_dev, current_stat.st_ino) == identity
            and current_stat.st_nlink == 1
            and current_stat.st_size == fd_stat.st_size
            and current_stat.st_mtime_ns == fd_stat.st_mtime_ns,
            "evidence changed during validation",
        )
    except PreflightError:
        # Preserve explicit security failures (e.g. hardlinks) rather than
        # replacing them with a generic missing-file error.
        raise
    except (OSError, ValueError) as exc:
        raise PreflightError("evidence missing or outside its private directory") from exc
    _require(digest.hexdigest() == expected, "evidence SHA-256 mismatch")
    used_files.add(identity)


def _date(value: object) -> datetime:
    _require(isinstance(value, str), "missing timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise PreflightError("invalid timestamp") from exc
    _require(parsed.utcoffset() is not None, "timestamp requires timezone")
    return parsed


def inspect(manifest_file: Path, source_ref: str) -> dict[str, object]:
    _require(not manifest_file.is_symlink(), "symlinked manifest is not permitted")
    try:
        manifest_file = manifest_file.resolve(strict=True)
        root = manifest_file.parent
        # Check the opened descriptor, not just the path: an untrusted manifest
        # can be replaced between an initial symlink check and open().
        initial_stat = manifest_file.stat()
        _require(
            stat.S_ISREG(initial_stat.st_mode) and initial_stat.st_nlink == 1,
            "manifest is not a private regular file",
        )
        identity = (initial_stat.st_dev, initial_stat.st_ino)
        flags = os.O_RDONLY | getattr(os, "O_BINARY", 0)
        flags |= getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
        with os.fdopen(os.open(manifest_file, flags), "rb") as source:
            fd_stat = os.fstat(source.fileno())
            _require(stat.S_ISREG(fd_stat.st_mode), "manifest is not a regular file")
            _require(
                (fd_stat.st_dev, fd_stat.st_ino) == identity and fd_stat.st_nlink == 1,
                "manifest changed during validation",
            )
            payload = source.read(MAX_MANIFEST_BYTES + 1)
            final_fd_stat = os.fstat(source.fileno())
            _require(
                final_fd_stat.st_size == fd_stat.st_size
                and final_fd_stat.st_mtime_ns == fd_stat.st_mtime_ns,
                "manifest changed during validation",
            )
        current_stat = manifest_file.stat()
        _require(
            not manifest_file.is_symlink()
            and (current_stat.st_dev, current_stat.st_ino) == identity
            and current_stat.st_nlink == 1
            and current_stat.st_size == fd_stat.st_size
            and current_stat.st_mtime_ns == fd_stat.st_mtime_ns,
            "manifest changed during validation",
        )
        _require(len(payload) <= MAX_MANIFEST_BYTES, "recovery manifest exceeds size limit")
        manifest = json.loads(
            payload.decode("utf-8"),
            object_pairs_hook=_unique_json_object,
        )
    except PreflightError:
        raise
    except (OSError, ValueError, RecursionError) as exc:
        raise PreflightError("cannot read JSON manifest") from exc
    _require(isinstance(manifest, dict), "manifest must be an object")
    try:
        _no_secrets(manifest)
    except RecursionError as exc:
        raise PreflightError("recovery manifest nesting exceeds limit") from exc
    _strict_fields(manifest, MANIFEST_FIELDS)
    # bool and float compare equal to 1 in Python; JSON schema versions must be integers.
    _require(type(manifest.get("schema_version")) is int and manifest["schema_version"] == 1, "unsupported manifest schema")
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
    used_paths: set[str] = set()
    used_files: set[tuple[int, int]] = set()
    for item in artifacts:
        _require(isinstance(item, dict), "invalid artifact")
        _strict_fields(item, ARTIFACT_FIELDS)
        kind = item.get("kind")
        # Untrusted JSON may supply a list/object; never let set lookup raise TypeError.
        _require(isinstance(kind, str) and kind in ARTIFACTS and kind not in kinds, "invalid or duplicated artifact kind")
        relative = item.get("path")
        _require(isinstance(relative, str) and bool(relative), "missing evidence filename")
        key = Path(relative).as_posix()
        _require(key not in used_paths, "evidence file is reused across inventories or checks")
        used_paths.add(key)
        kinds.add(kind)
        _local_digest(root, relative, item.get("sha256"), used_files)
    _require(kinds == ARTIFACTS, "incomplete database/storage/functions/config inventory")

    checks = manifest.get("checks")
    _require(isinstance(checks, dict) and set(checks) == CHECKS, "incomplete or unknown recovery checks")
    for name in sorted(CHECKS):
        check = checks[name]
        _require(isinstance(check, dict), "invalid recovery check: " + name)
        _strict_fields(check, CHECK_FIELDS)
        _require(check.get("passed") is True, "recovery check not passed: " + name)
        relative = check.get("evidence_path")
        _require(isinstance(relative, str) and bool(relative), "missing evidence filename")
        key = Path(relative).as_posix()
        _require(key not in used_paths, "evidence file is reused across inventories or checks")
        used_paths.add(key)
        _local_digest(root, relative, check.get("sha256"), used_files)

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
