"""Saved-file/fake-destination tests only: no Docker, provider or acceptance run."""
from __future__ import annotations

from contextlib import ExitStack, redirect_stdout
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / filename)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


backup = load("recovery_backup_tests", "recovery_backup.py")
local = load("service_restore_boundary_tests", "verify-local-service-recovery.py")
postgres = load("postgres_restore_boundary_tests", "verify-isolated-postgres.py")
incidents = load("incidents_restore_boundary_tests", "verify-financial-incidents-postgres.py")
DUMP = b"PGDMP\x01synthetic offline dump bytes; not an actual PostgreSQL acceptance"
PDF = b"%PDF-1.4 SYNTHETIC RECOVERY TEST - NOT A FISCAL INVOICE"


def archive(entries=None):
    result = io.BytesIO()
    with tarfile.open(fileobj=result, mode="w") as output:
        for name, kind, data in entries or [("tenant/document.pdf", tarfile.REGTYPE, PDF)]:
            member = tarfile.TarInfo(name)
            member.type = kind
            member.size = len(data) if kind == tarfile.REGTYPE else 0
            if kind in (tarfile.SYMTYPE, tarfile.LNKTYPE):
                member.linkname = "../../outside"
            output.addfile(member, io.BytesIO(data) if member.isfile() else None)
    return result.getvalue()


def rewrite_manifest(root, name, mutate):
    path = root / name
    value = json.loads(path.read_bytes())
    mutate(value)
    raw = json.dumps(value).encode()
    path.write_bytes(raw)
    return hashlib.sha256(raw).hexdigest()


class SavedBackupTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="tc-saved-backup-test-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.expected = {"database.dump": "postgresql", "storage.tar": "storage_objects"}
        self.files = {"database.dump": ("postgresql", DUMP), "storage.tar": ("storage_objects", archive())}
        self.manifest = "backup.manifest.json"
        self.digest = backup.save_backup(self.root, self.manifest, self.files)

    def read(self, digest=None):
        return backup.read_backup(self.root, self.manifest, digest or self.digest, self.expected)

    def error(self, code, digest=None):
        with self.assertRaises(backup.BackupIntegrityError) as caught:
            self.read(digest)
        self.assertEqual(str(caught.exception), code)

    def test_saved_manifest_and_both_artifacts_are_read_back(self):
        self.files["database.dump"] = ("postgresql", b"different in-process value")
        self.assertEqual(self.read(), {"database.dump": DUMP, "storage.tar": archive()})

    def test_docker_style_dot_directories_and_minimal_tar_padding_are_accepted(self):
        data = archive([(".", tarfile.DIRTYPE, b""), ("./tenant", tarfile.DIRTYPE, b""),
                        ("./tenant/document.pdf", tarfile.REGTYPE, PDF)])
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:") as opened:
            opened.getmembers()
            end = opened.offset
        backup.validate_storage_archive(data[:end + 1024])

    def test_truncation_empty_file_and_appended_bytes_fail_size_check(self):
        path = self.root / "database.dump"
        for data in (DUMP[:-1], b"", DUMP + b"unexpected"):
            with self.subTest(data_length=len(data)):
                path.write_bytes(data)
                self.error("backup_size_mismatch")

    def test_same_length_corruption_fails_digest_check(self):
        (self.root / "database.dump").write_bytes(DUMP[:-1] + b"!")
        self.error("backup_digest_mismatch")

    def test_manifest_digest_is_bound_to_captured_manifest(self):
        path = self.root / self.manifest
        path.write_bytes(path.read_bytes() + b" ")
        self.error("backup_manifest_digest_mismatch")

    def test_missing_file_has_fixed_error_without_private_path(self):
        (self.root / "database.dump").unlink()
        self.error("backup_file_unavailable")

    def test_unexpected_inventory_and_dangerous_paths_are_rejected(self):
        original = (self.root / self.manifest).read_bytes()
        for name in ("extra.dump", "../outside.dump", "/tmp/outside.dump", "folder/database.dump", "bad\\path.dump"):
            with self.subTest(name=name):
                (self.root / self.manifest).write_bytes(original)
                digest = rewrite_manifest(self.root, self.manifest,
                    lambda value: value["artifacts"].update({name: value["artifacts"]["database.dump"]}))
                self.error("backup_inventory_mismatch" if name == "extra.dump" else "backup_path_invalid", digest)

    def test_ambiguous_or_unknown_manifest_metadata_is_rejected(self):
        original = (self.root / self.manifest).read_bytes()
        mutations = [
            lambda value: value.update({"schema_version": True}),
            lambda value: value.update({"unexpected": "private-value-must-not-escape"}),
            lambda value: value["artifacts"]["database.dump"].update({"bytes": True}),
            lambda value: value["artifacts"]["database.dump"].update({"bytes": len(DUMP) + 0.0}),
            lambda value: value["artifacts"]["database.dump"].update({"kind": "storage_objects"}),
            lambda value: value["artifacts"]["database.dump"].update({"sha256": "not-a-digest"}),
            lambda value: value["artifacts"]["database.dump"].update({"extra": "private-value-must-not-escape"}),
        ]
        for mutate in mutations:
            with self.subTest(mutation=mutations.index(mutate)):
                (self.root / self.manifest).write_bytes(original)
                digest = rewrite_manifest(self.root, self.manifest, mutate)
                self.error("backup_manifest_invalid", digest)
        duplicate = original.replace(b'"schema_version":1', b'"schema_version":1,"schema_version":1')
        (self.root / self.manifest).write_bytes(duplicate)
        self.error("backup_manifest_invalid", hashlib.sha256(duplicate).hexdigest())

    def test_symlink_hardlink_directory_fifo_and_writable_file_are_rejected(self):
        path = self.root / "database.dump"
        original = path.read_bytes()
        other = self.root / "other.dump"
        other.write_bytes(original)
        for kind in ("symlink", "hardlink", "directory", "fifo", "writable"):
            with self.subTest(kind=kind):
                path.unlink()
                if kind == "symlink":
                    path.symlink_to(other)
                elif kind == "hardlink":
                    os.link(other, path)
                elif kind == "directory":
                    path.mkdir()
                elif kind == "fifo":
                    os.mkfifo(path)
                else:
                    path.write_bytes(original)
                    path.chmod(0o622)
                self.error("backup_file_unavailable" if kind == "symlink" else "backup_file_metadata_invalid")
                if path.is_dir():
                    path.rmdir()
                else:
                    path.unlink()
                path.write_bytes(original)
                path.chmod(0o600)

    def test_symlinked_root_parent_and_parent_traversal_are_rejected(self):
        alias = self.root / "alias"
        alias.symlink_to(self.root, target_is_directory=True)
        for root in (alias, alias / "nested", self.root / ".." / self.root.name):
            with self.subTest(root=str(root)), self.assertRaisesRegex(backup.BackupIntegrityError, "^backup_path_invalid$"):
                backup.read_backup(root, self.manifest, self.digest, self.expected)

    def test_file_metadata_change_during_read_is_rejected(self):
        original_open, original_fstat = os.open, os.fstat
        active = {"descriptor": None, "stats": 0}

        def opened(name, *args, **kwargs):
            descriptor = original_open(name, *args, **kwargs)
            if name == "database.dump":
                active.update(descriptor=descriptor, stats=0)
            return descriptor

        def inspected(descriptor):
            if descriptor == active["descriptor"]:
                active["stats"] += 1
                if active["stats"] == 2:
                    (self.root / "database.dump").write_bytes(DUMP[:-1])
            return original_fstat(descriptor)

        with patch.object(backup.os, "open", side_effect=opened), patch.object(backup.os, "fstat", side_effect=inspected):
            self.error("backup_file_changed")

    def test_wrong_database_format_is_rejected_even_with_matching_manifest(self):
        data = b"not a PostgreSQL custom archive"
        (self.root / "database.dump").write_bytes(data)
        digest = rewrite_manifest(self.root, self.manifest,
            lambda value: value["artifacts"]["database.dump"].update({
                "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}))
        self.error("backup_database_format_invalid", digest)

    def test_unsafe_ambiguous_and_incomplete_storage_archives_are_rejected(self):
        cases = [
            archive([("../outside", tarfile.REGTYPE, PDF)]),
            archive([("/absolute", tarfile.REGTYPE, PDF)]),
            archive([("bad\\path", tarfile.REGTYPE, PDF)]),
            archive([("link", tarfile.SYMTYPE, b"")]),
            archive([("link", tarfile.LNKTYPE, b"")]),
            archive([("device", tarfile.CHRTYPE, b"")]),
            archive([("fifo", tarfile.FIFOTYPE, b"")]),
            archive([("same", tarfile.REGTYPE, PDF), ("./same", tarfile.REGTYPE, PDF)]),
            archive()[:-1024],
            archive() + b"unexpected trailing data" + bytes(489),
            b"not a tar archive",
        ]
        # Remove enough padding to omit the two mandatory end-of-archive blocks.
        cases[8] = archive()[:1536]
        for index, data in enumerate(cases):
            with self.subTest(case=index), self.assertRaisesRegex(backup.BackupIntegrityError, "^backup_storage_archive_invalid$"):
                backup.validate_storage_archive(data)

    def test_writer_refuses_overwrite_and_preserves_saved_bytes(self):
        with self.assertRaisesRegex(backup.BackupIntegrityError, "^backup_write_failed$"):
            backup.save_backup(self.root, self.manifest, self.files)
        self.assertEqual(self.read()["database.dump"], DUMP)


class RestoreBoundaryTests(unittest.TestCase):
    def cases(self):
        return [
            ("services", local, "service-backup.manifest.json", {
                "database.private.dump": ("postgresql", DUMP), "storage.private.tar": ("storage_objects", archive())}),
            ("postgres", postgres, "postgres-backup.manifest.json", {"synthetic-postgres.dump": ("postgresql", DUMP)}),
            ("incidents", incidents, "incidents-backup.manifest.json", {"synthetic-financial-incidents.dump": ("postgresql", DUMP)}),
        ]

    def attempt(self, case, mutate=None, change_after_verification=False):
        name, module, manifest, files = case
        temporary = tempfile.TemporaryDirectory(prefix="tc-restore-boundary-test-")
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        digest = backup.save_backup(root, manifest, files)
        if mutate:
            digest = mutate(root, manifest, files) or digest
        mutations = []
        commands = []

        def altered():
            if change_after_verification:
                for filename in files:
                    (root / filename).write_bytes(b"changed after verification")

        def command(*args, **kwargs):
            mutations.append("command")
            commands.append((args, kwargs))
            altered()

        def freeze():
            mutations.append("freeze")
            altered()

        def prepare():
            mutations.append("prepare")
            altered()

        with ExitStack() as stack:
            stack.enter_context(redirect_stdout(io.StringIO()))
            if name == "services":
                stack.enter_context(patch.object(module, "PRIVATE", root, create=True))
                stack.enter_context(patch.object(module, "REPORT", {"checks": []}))
                stack.enter_context(patch.object(module, "docker", side_effect=command))
                target = SimpleNamespace(db="owned-disposable-db", storage="owned-disposable-storage", storage_path="/mnt",
                                         key_digest=b"distinct-destination-key-digest", prepare=prepare, freeze=freeze)
                call = lambda: module.restore_saved_backup(target, digest, PDF, b"source-key-digest")
            else:
                pg = module.pg if name == "incidents" else module
                stack.enter_context(patch.object(pg, "RESULTS", root))
                stack.enter_context(patch.object(pg, "REPORT", {"checks": []}))
                stack.enter_context(patch.object(pg, "run", side_effect=command))
                call = lambda: module.restore_saved_backup(digest)
            if mutate:
                with self.assertRaises(ValueError) as caught:
                    call()
                self.assertRegex(str(caught.exception), "^backup_[a-z_]+$")
                self.assertEqual(mutations, [], "invalid saved artifact reached a destination mutation")
            else:
                call()
                payloads = [kwargs["data"] for _, kwargs in commands if "data" in kwargs]
                self.assertEqual(payloads, [item[1] for item in files.values()])
                self.assertEqual(len(commands), 2)
                self.assertEqual(mutations[0], "prepare" if name == "services" else "command")

    def test_all_three_harnesses_restore_verified_saved_bytes_even_if_files_change_later(self):
        for case in self.cases():
            with self.subTest(harness=case[0]):
                self.attempt(case, change_after_verification=True)

    def test_truncated_and_corrupt_files_never_mutate_any_destination(self):
        for case in self.cases():
            for filename in case[3]:
                for kind in ("truncated", "corrupt"):
                    def mutate(root, manifest, files):
                        data = (root / filename).read_bytes()
                        (root / filename).write_bytes(data[:-1] if kind == "truncated" else b"!" + data[1:])
                    with self.subTest(harness=case[0], file=filename, kind=kind):
                        self.attempt(case, mutate)

    def test_missing_and_symlinked_files_never_mutate_any_destination(self):
        for case in self.cases():
            for kind in ("missing", "symlink"):
                def mutate(root, manifest, files):
                    filename = next(iter(files))
                    (root / filename).unlink()
                    if kind == "symlink":
                        (root / "outside").write_bytes(DUMP)
                        (root / filename).symlink_to(root / "outside")
                with self.subTest(harness=case[0], kind=kind):
                    self.attempt(case, mutate)

    def test_extra_inventory_or_dangerous_path_never_mutates_any_destination(self):
        for case in self.cases():
            for extra in ("unexpected.dump", "../outside.dump", "/tmp/outside.dump"):
                def mutate(root, manifest, files):
                    return rewrite_manifest(root, manifest,
                        lambda value: value["artifacts"].update({extra: copy.deepcopy(next(iter(value["artifacts"].values())))}))
                with self.subTest(harness=case[0], extra=extra):
                    self.attempt(case, mutate)

    def test_invalid_manifest_metadata_never_mutates_any_destination(self):
        for case in self.cases():
            def mutate(root, manifest, files):
                return rewrite_manifest(root, manifest,
                    lambda value: next(iter(value["artifacts"].values())).update({"bytes": True}))
            with self.subTest(harness=case[0]):
                self.attempt(case, mutate)

    def test_unsafe_storage_archive_with_valid_hash_never_freezes_or_restores_target(self):
        def mutate(root, manifest, files):
            data = archive([("../outside", tarfile.REGTYPE, PDF)])
            (root / "storage.private.tar").write_bytes(data)
            return rewrite_manifest(root, manifest,
                lambda value: value["artifacts"]["storage.private.tar"].update({
                    "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}))
        self.attempt(self.cases()[0], mutate)

    def test_invalid_backup_skips_cleanup_commands_for_unprepared_target(self):
        temporary = tempfile.TemporaryDirectory(prefix="tc-unprepared-target-test-")
        self.addCleanup(temporary.cleanup)
        with patch.object(local, "PRIVATE", Path(temporary.name), create=True), patch.object(local, "docker") as docker:
            target = local.Stack("target", 55531, "offline-test")
            target.cleanup()
            docker.assert_not_called()


if __name__ == "__main__":
    unittest.main()
