"""Read-only, no-extraction authentication of a locked registry package body.

This proves input bytes only. Nested dependencies, a compiler invocation, emitted
artifacts and a running process require separate contemporaneous witnesses.
"""
import base64
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import tarfile

MAX_ARCHIVE_BYTES = 64 * 1024**2
MAX_PACKAGE_BYTES = 512 * 1024**2
MAX_MEMBERS = 50_000


def require(condition, message):
    if not condition:
        raise ValueError(message)


def stamp(observed):
    return (observed.st_dev, observed.st_ino, observed.st_mode, observed.st_size,
            observed.st_mtime_ns, observed.st_ctime_ns)


def stable_file(path, maximum=MAX_PACKAGE_BYTES):
    before = path.lstat()
    require(stat.S_ISREG(before.st_mode), "PACKAGE_REGULAR_FILE_REQUIRED")
    require(before.st_size <= maximum, "PACKAGE_SIZE_EXCEEDED")
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        opened = os.fstat(descriptor)
        require(stamp(before) == stamp(opened), "PACKAGE_FILE_CHANGED")
        digest = hashlib.sha256()
        size = 0
        while block := os.read(descriptor, 1024 * 1024):
            size += len(block)
            require(size <= maximum, "PACKAGE_SIZE_EXCEEDED")
            digest.update(block)
        require(stamp(before) == stamp(os.fstat(descriptor)) == stamp(path.lstat()),
                "PACKAGE_FILE_CHANGED")
        return {"bytes": size, "sha256": digest.hexdigest(),
                "executable": bool(before.st_mode & 0o111)}
    finally:
        os.close(descriptor)


def authenticate_package(archive_path, installed_root, *, name, version, integrity):
    """Expected identity/SRI must come from the separately frozen profile/lock."""
    root = Path(installed_root).absolute()
    require(root.is_dir() and not root.is_symlink() and root.resolve() == root,
            "PACKAGE_CANONICAL_ROOT_REQUIRED")
    require(re.fullmatch(r"sha512-[A-Za-z0-9+/]{86}==", integrity) is not None,
            "PACKAGE_SHA512_SRI_REQUIRED")
    archive = Path(archive_path)
    archive_before = stable_file(archive, MAX_ARCHIVE_BYTES)
    require(archive_before["bytes"] <= MAX_ARCHIVE_BYTES, "PACKAGE_ARCHIVE_TOO_LARGE")
    # Authenticate the complete compressed stream before tar parsing. Never extract.
    descriptor = os.open(archive, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, "rb") as verified_archive:
        opened = os.fstat(verified_archive.fileno())
        require(stat.S_ISREG(opened.st_mode), "PACKAGE_REGULAR_FILE_REQUIRED")
        digest = hashlib.file_digest(verified_archive, "sha512").digest()
        require("sha512-" + base64.b64encode(digest).decode() == integrity,
                "PACKAGE_ARCHIVE_INTEGRITY_MISMATCH")
        verified_archive.seek(0)
        published = {}
        names = set()
        count = total = 0
        metadata = None
        with tarfile.open(fileobj=verified_archive, mode="r|gz") as package:
            for member in package:
                count += 1
                require(count <= MAX_MEMBERS, "PACKAGE_MEMBERS_EXCEEDED")
                path = PurePosixPath(member.name)
                require(member.name == path.as_posix() and "\\" not in member.name
                        and not path.is_absolute() and path.parts[:1] == ("package",)
                        and ".." not in path.parts and len(path.parts) >= 2,
                        "PACKAGE_ARCHIVE_PATH_REJECTED")
                relative = PurePosixPath(*path.parts[1:]).as_posix()
                require(relative not in names, "PACKAGE_DUPLICATE_MEMBER")
                names.add(relative)
                require(path.parts[1] != "node_modules", "PACKAGE_BUNDLED_DEPENDENCY_REJECTED")
                require(member.isdir() or member.isreg(), "PACKAGE_ARCHIVE_LINK_OR_SPECIAL_FILE")
                require(not member.issparse(), "PACKAGE_SPARSE_FILE_REJECTED")
                if member.isdir():
                    continue
                total += member.size
                require(0 <= member.size <= MAX_PACKAGE_BYTES and total <= MAX_PACKAGE_BYTES,
                        "PACKAGE_SIZE_EXCEEDED")
                digest = hashlib.sha256()
                size = 0
                manifest_bytes = bytearray() if relative == "package.json" else None
                handle = package.extractfile(member)
                require(handle is not None, "PACKAGE_MEMBER_UNREADABLE")
                with handle:
                    while block := handle.read(1024 * 1024):
                        size += len(block)
                        require(size <= member.size, "PACKAGE_MEMBER_SIZE_MISMATCH")
                        digest.update(block)
                        if manifest_bytes is not None:
                            require(size <= 1024 * 1024, "PACKAGE_METADATA_TOO_LARGE")
                            manifest_bytes.extend(block)
                require(size == member.size, "PACKAGE_MEMBER_SIZE_MISMATCH")
                published[relative] = {"bytes": size, "sha256": digest.hexdigest(),
                                       "executable": bool(member.mode & 0o111)}
                if manifest_bytes is not None:
                    metadata = json.loads(manifest_bytes)
        require(stamp(opened) == stamp(os.fstat(verified_archive.fileno()))
                == stamp(archive.lstat()), "PACKAGE_ARCHIVE_CHANGED")
    require(metadata is not None and metadata.get("name") == name
            and metadata.get("version") == version, "PACKAGE_IDENTITY_MISMATCH")
    require(stable_file(archive) == archive_before, "PACKAGE_ARCHIVE_CHANGED")
    installed = {}
    installed_bytes = inspected_members = 0
    nested = False
    def inspect(current):
        nonlocal nested, installed_bytes, inspected_members
        before = current.lstat()
        require(stat.S_ISDIR(before.st_mode), "PACKAGE_INSTALLED_DIRECTORY_ALIAS")
        # listdir errors propagate. Unlike default os.walk, no inaccessible
        # subtree can silently disappear from the observed package inventory.
        names = sorted(os.listdir(current))
        for filename in names:
            child = current / filename
            observed = child.lstat()
            inspected_members += 1
            require(inspected_members <= MAX_MEMBERS, "PACKAGE_MEMBERS_EXCEEDED")
            require(not stat.S_ISLNK(observed.st_mode), "PACKAGE_INSTALLED_ALIAS")
            if stat.S_ISDIR(observed.st_mode):
                if current == root and filename == "node_modules":
                    nested = True  # Separate locked dependency boundary.
                else:
                    inspect(child)
            else:
                key = child.relative_to(root).as_posix()
                installed[key] = stable_file(child)
                installed_bytes += installed[key]["bytes"]
                require(installed_bytes <= MAX_PACKAGE_BYTES, "PACKAGE_SIZE_EXCEEDED")
        require(sorted(os.listdir(current)) == names and stamp(current.lstat()) == stamp(before),
                "PACKAGE_INSTALLED_DIRECTORY_CHANGED")
    inspect(root)
    require(installed == published, "PACKAGE_INSTALLED_BODY_MISMATCH")
    return {"format": "myapps.published-package-input.v1",
            "status": "AUTHENTICATED_PACKAGE_INPUT_ONLY", "name": name, "version": version,
            "integrity": integrity, "archiveSha256": archive_before["sha256"],
            "files": dict(sorted(published.items())), "totalBytes": total,
            "nestedDependenciesPresentNotAttested": nested,
            "scope": "No build derivation, dependency closure, runtime or release qualification"}
