"""Offline saved-backup integrity checks; no restore, network or logging side effects.

The manifest digest is retained by the capturing process. This protects the
readback boundary, not the authenticity or retention of a managed backup.
"""
from __future__ import annotations

import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import tarfile

MANIFEST_LIMIT = 64 * 1024
ARTIFACT_LIMIT = 512 * 1024 * 1024
NAME = re.compile(r"^[a-z0-9][a-z0-9._-]{0,127}$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")
KINDS = {"postgresql", "storage_objects"}


class BackupIntegrityError(ValueError):
    """Only fixed codes escape this module; never paths or backup contents."""


def _require(condition: bool, code: str) -> None:
    if not condition:
        raise BackupIntegrityError(code)


def _name(value: object) -> str:
    _require(isinstance(value, str) and bool(NAME.fullmatch(value))
             and value not in (".", ".."), "backup_path_invalid")
    return value


def _root_fd(root: Path) -> int:
    """Walk every directory through pinned descriptors without following links."""
    path = Path(root).absolute()
    _require(".." not in path.parts, "backup_path_invalid")
    descriptor = None
    try:
        flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
        descriptor = os.open(path.anchor, flags)
        for part in path.parts[1:]:
            child = os.open(part, flags, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
        info = os.fstat(descriptor)
        _require(info.st_uid == os.getuid() and not info.st_mode & 0o022,
                 "backup_path_invalid")
        return descriptor
    except (OSError, ValueError):
        if descriptor is not None:
            os.close(descriptor)
        raise BackupIntegrityError("backup_path_invalid") from None


def _metadata(info: os.stat_result) -> tuple:
    return (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid,
            info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def _read_file(root: int, name: str, size: int | None, limit: int) -> bytes:
    descriptor = None
    try:
        # NONBLOCK ensures a substituted FIFO cannot hang before fstat rejects it.
        descriptor = os.open(_name(name), os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC,
                             dir_fd=root)
        before = os.fstat(descriptor)
        _require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1
                 and before.st_uid == os.getuid() and not before.st_mode & 0o022,
                 "backup_file_metadata_invalid")
        with os.fdopen(descriptor, "rb", closefd=False) as stream:
            _require(0 < before.st_size <= limit, "backup_size_mismatch")
            _require(size is None or before.st_size == size, "backup_size_mismatch")
            data = stream.read(before.st_size + 1)
            _require(_metadata(before) == _metadata(os.fstat(stream.fileno())),
                     "backup_file_changed")
            _require(len(data) == before.st_size, "backup_size_mismatch")
            return data
    except OSError:
        raise BackupIntegrityError("backup_file_unavailable") from None
    finally:
        if descriptor is not None:
            os.close(descriptor)


def _write_file(root: int, name: str, data: bytes) -> None:
    try:
        descriptor = os.open(_name(name), os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                             0o600, dir_fd=root)
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
    except OSError:
        raise BackupIntegrityError("backup_write_failed") from None


def _inventory(expected: dict[str, str], manifest_name: str) -> None:
    _name(manifest_name)
    _require(isinstance(expected, dict) and 0 < len(expected) <= 2,
             "backup_inventory_invalid")
    for name, kind in expected.items():
        _name(name)
        _require(name != manifest_name and isinstance(kind, str) and kind in KINDS,
                 "backup_inventory_invalid")


def save_backup(root: Path, manifest_name: str, artifacts: dict[str, tuple[str, bytes]]) -> str:
    """Persist files and a strict manifest; return its trusted in-process digest."""
    _require(isinstance(artifacts, dict), "backup_inventory_invalid")
    _require(all(isinstance(item, tuple) and len(item) == 2 for item in artifacts.values()),
             "backup_inventory_invalid")
    _inventory({name: item[0] for name, item in artifacts.items()}, manifest_name)
    records = {}
    for name, (kind, data) in artifacts.items():
        _require(isinstance(data, bytes) and 0 < len(data) <= ARTIFACT_LIMIT,
                 "backup_size_mismatch")
        records[name] = {"kind": kind, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
    manifest = json.dumps({"schema_version": 1, "artifacts": records}, sort_keys=True,
                          separators=(",", ":")).encode()
    descriptor = _root_fd(root)
    try:
        for name, (_, data) in artifacts.items():
            _write_file(descriptor, name, data)
        _write_file(descriptor, manifest_name, manifest)
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    return hashlib.sha256(manifest).hexdigest()


def _unique_object(pairs: list[tuple[str, object]]) -> dict:
    result = {}
    for key, value in pairs:
        _require(key not in result, "backup_manifest_invalid")
        result[key] = value
    return result


def validate_storage_archive(data: bytes) -> None:
    """Accept only complete uncompressed file/directory archives, never links."""
    try:
        _require(len(data) % 512 == 0 and data[-1024:] == bytes(1024),
                 "backup_storage_archive_invalid")
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:") as archive:
            members = archive.getmembers()
            _require(0 < len(members) <= 10000, "backup_storage_archive_invalid")
            seen = set()
            for member in members:
                path = PurePosixPath(member.name)
                _require(bool(member.name) and not path.is_absolute()
                         and ".." not in path.parts and "\\" not in member.name
                         and "\x00" not in member.name and path not in seen
                         and member.type in (tarfile.REGTYPE, tarfile.AREGTYPE, tarfile.DIRTYPE)
                         and (path != PurePosixPath(".") or member.isdir())
                         and 0 <= member.size <= len(data) and (not member.isdir() or member.size == 0),
                         "backup_storage_archive_invalid")
                seen.add(path)
                if member.isfile():
                    stream = archive.extractfile(member)
                    _require(stream is not None and len(stream.read()) == member.size,
                             "backup_storage_archive_invalid")
            # tarfile otherwise ignores an appended archive or arbitrary trailing data.
            _require(len(data) - archive.offset >= 1024 and not any(data[archive.offset:]),
                     "backup_storage_archive_invalid")
    except (tarfile.TarError, OSError, ValueError):
        raise BackupIntegrityError("backup_storage_archive_invalid") from None


def read_backup(root: Path, manifest_name: str, manifest_sha256: str,
                expected: dict[str, str]) -> dict[str, bytes]:
    """Read and verify every artifact before returning any bytes to a restorer."""
    _inventory(expected, manifest_name)
    _require(isinstance(manifest_sha256, str) and bool(SHA256.fullmatch(manifest_sha256)),
             "backup_manifest_invalid")
    descriptor = _root_fd(root)
    try:
        raw = _read_file(descriptor, manifest_name, None, MANIFEST_LIMIT)
        _require(hashlib.sha256(raw).hexdigest() == manifest_sha256, "backup_manifest_digest_mismatch")
        try:
            manifest = json.loads(raw, object_pairs_hook=_unique_object)
        except (ValueError, UnicodeError, RecursionError):
            raise BackupIntegrityError("backup_manifest_invalid") from None
        _require(isinstance(manifest, dict) and set(manifest) == {"schema_version", "artifacts"}
                 and type(manifest["schema_version"]) is int and manifest["schema_version"] == 1,
                 "backup_manifest_invalid")
        records = manifest["artifacts"]
        _require(isinstance(records, dict), "backup_manifest_invalid")
        for name in records:
            _name(name)
        _require(set(records) == set(expected), "backup_inventory_mismatch")
        verified = {}
        for name, kind in expected.items():
            item = records[name]
            _require(isinstance(item, dict) and set(item) == {"kind", "bytes", "sha256"}
                     and item["kind"] == kind and type(item["bytes"]) is int
                     and 0 < item["bytes"] <= ARTIFACT_LIMIT
                     and isinstance(item["sha256"], str) and bool(SHA256.fullmatch(item["sha256"])),
                     "backup_manifest_invalid")
            data = _read_file(descriptor, name, item["bytes"], ARTIFACT_LIMIT)
            _require(hashlib.sha256(data).hexdigest() == item["sha256"], "backup_digest_mismatch")
            if kind == "postgresql":
                _require(len(data) > 5 and data.startswith(b"PGDMP"), "backup_database_format_invalid")
            else:
                validate_storage_archive(data)
            verified[name] = data
        return verified
    finally:
        os.close(descriptor)
