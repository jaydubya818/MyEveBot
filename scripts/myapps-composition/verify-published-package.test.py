"""Pure synthetic archives/file trees; no SDK import, extraction or execution."""
import base64
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "published_package", Path(__file__).with_name("verify-published-package.py"))
subject = importlib.util.module_from_spec(spec)
spec.loader.exec_module(subject)


class PublishedPackageTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="package-input-")
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name).resolve()
        self.root = self.base / "installed"
        self.root.mkdir()
        self.archive = self.base / "fixture.tgz"
        self.files = {"package.json": json.dumps({"name": "fixture", "version": "1.2.3"}).encode(),
                      "index.js": b"throw new Error('must never execute');\n",
                      "bin/native": bytes([0, 255, 17]), "data/table.wasm": b"\x00asm"}
        self.members = []

    def prepare(self):
        with tarfile.open(self.archive, "w:gz") as archive:
            for filename, body in self.files.items():
                member = tarfile.TarInfo("package/" + filename)
                member.size = len(body)
                member.mode = 0o755 if filename == "bin/native" else 0o644
                archive.addfile(member, io.BytesIO(body))
                target = self.root / filename
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(body)
                target.chmod(member.mode)
            for member, body in self.members:
                archive.addfile(member, io.BytesIO(body) if body else None)
        self.integrity = "sha512-" + base64.b64encode(
            hashlib.sha512(self.archive.read_bytes()).digest()).decode()

    def verify(self, **overrides):
        args = dict(name="fixture", version="1.2.3", integrity=self.integrity)
        args.update(overrides)
        return subject.authenticate_package(self.archive, self.root, **args)

    def test_all_published_files_including_native_and_data_authenticated_without_execution(self):
        self.prepare()
        result = self.verify()
        self.assertEqual(result["status"], "AUTHENTICATED_PACKAGE_INPUT_ONLY")
        self.assertEqual(len(result["files"]), 4)
        self.assertTrue(result["files"]["bin/native"]["executable"])
        self.assertFalse(result["nestedDependenciesPresentNotAttested"])

    def test_bad_sri_and_changed_compressed_archive_rejected(self):
        self.prepare()
        with self.assertRaisesRegex(ValueError, "INTEGRITY_MISMATCH"):
            self.verify(integrity="sha512-" + base64.b64encode(bytes(64)).decode())
        self.archive.write_bytes(self.archive.read_bytes() + b"changed")
        with self.assertRaisesRegex(ValueError, "INTEGRITY_MISMATCH"):
            self.verify()

    def test_identity_mismatch_fails(self):
        self.prepare()
        with self.assertRaisesRegex(ValueError, "IDENTITY_MISMATCH"):
            self.verify(version="1.2.4")

    def test_installed_missing_added_changed_and_native_mode_rejected(self):
        for kind in ["missing", "added", "changed", "mode"]:
            with self.subTest(kind=kind):
                self.prepare()
                native = self.root / "bin/native"
                extra = self.root / "unexpected"
                if kind == "missing":
                    native.unlink()
                elif kind == "added":
                    extra.write_bytes(b"extra")
                elif kind == "changed":
                    native.write_bytes(b"corrupt")
                else:
                    native.chmod(0o644)
                with self.assertRaisesRegex(ValueError, "BODY_MISMATCH"):
                    self.verify()
                extra.unlink(missing_ok=True)

    def test_nested_dependency_boundary_is_explicit_and_not_attested(self):
        self.prepare()
        dependency = self.root / "node_modules/unattested"
        dependency.mkdir(parents=True)
        (dependency / "index.js").write_text("unattested dependency")
        self.assertTrue(self.verify()["nestedDependenciesPresentNotAttested"])

    def test_installed_file_or_directory_alias_rejected(self):
        for directory in [False, True]:
            with self.subTest(directory=directory):
                self.prepare()
                target = self.root / ("bin" if directory else "index.js")
                previous = target.with_name(target.name + "-old")
                target.rename(previous)
                target.symlink_to(previous.name, target_is_directory=directory)
                with self.assertRaisesRegex(ValueError, "ALIAS|REGULAR_FILE"):
                    self.verify()
                target.unlink()
                previous.rename(target)

    def test_aliased_root_rejected(self):
        self.prepare()
        alias = self.base / "alias"
        alias.symlink_to(self.root, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "CANONICAL_ROOT"):
            subject.authenticate_package(self.archive, alias, name="fixture", version="1.2.3",
                                         integrity=self.integrity)

    def test_duplicate_paths_and_traversal_rejected(self):
        for path in ["package/index.js", "package/../escape", "/package/absolute",
                     "package/./index.js", "package/back\\slash", "package/node_modules/hidden"]:
            with self.subTest(path=path):
                member = tarfile.TarInfo(path)
                member.size = 1
                self.members = [(member, b"x")]
                self.prepare()
                with self.assertRaisesRegex(ValueError, "DUPLICATE|PATH_REJECTED|BUNDLED_DEPENDENCY"):
                    self.verify()

    def test_archive_symlink_hardlink_and_fifo_rejected(self):
        for kind in [tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.FIFOTYPE]:
            with self.subTest(kind=kind):
                member = tarfile.TarInfo("package/foreign")
                member.type = kind
                member.linkname = "../outside"
                self.members = [(member, None)]
                self.prepare()
                with self.assertRaisesRegex(ValueError, "LINK_OR_SPECIAL_FILE"):
                    self.verify()

    def test_unreadable_extra_subtree_cannot_silently_disappear_from_comparison(self):
        self.prepare()
        extra = self.root / "unreadable-extra"
        extra.mkdir()
        (extra / "unexpected-code.js").write_text("unexpected")
        original = os.listdir
        def denied(path):
            if Path(path) == extra:
                raise PermissionError("synthetic denied subtree")
            return original(path)
        with patch.object(subject.os, "listdir", side_effect=denied):
            with self.assertRaisesRegex(PermissionError, "denied subtree"):
                self.verify()

    def test_changed_directory_inventory_cannot_hide_an_extra_file(self):
        self.prepare()
        original = os.listdir
        root_reads = 0
        def changed(path):
            nonlocal root_reads
            values = original(path)
            if Path(path) == self.root:
                root_reads += 1
                if root_reads == 2:
                    return values + ["injected-after-observation"]
            return values
        with patch.object(subject.os, "listdir", side_effect=changed):
            with self.assertRaisesRegex(ValueError, "DIRECTORY_CHANGED"):
                self.verify()


if __name__ == "__main__":
    unittest.main()
