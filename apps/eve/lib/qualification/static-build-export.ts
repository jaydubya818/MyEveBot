import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, closeSync, constants as fsConstants, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, readSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import type { Stats } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { STATIC_ARTIFACT_LIMITS, type StaticFile, type StaticSourcePins } from "../../../../packages/myapps/src/static-artifact.ts";
import { StaticArtifactCandidate } from "../../../../packages/myapps/src/static-artifact.ts";
import { STATIC_BUILD_CLAIM_DOMAIN, type StaticBuildBinding } from "../../../../packages/myapps/src/static-build-claim.ts";
import { canonical } from "../../../../packages/myapps/src/contracts.ts";
import type { StaticBuildSource } from "./static-build.ts";

/**
 * Host-side static build export and provenance attestation for the accepted stage-3 candidate. Factory Results carry no built bytes and the
 * static-build claim contract defines only a verifier, so this adds the missing ordinary producer half:
 *
 *   1. `captureSource(dir)` reads the COMPLETE candidate tree exactly once into memory (no symlinks, special files, hard links, setuid bits,
 *      repository or filesystem metadata, case aliases, or over-limit trees) and `gitTreeIdOf` proves those captured bytes ARE the accepted
 *      tree by computing the git tree id with no git binary. Everything later is derived from the captured bytes, never from the directory again.
 *   2. `createSourceLease` materializes exactly those bytes into a fresh private directory (files 0444/0555, directories 0555, owned by this
 *      process, mounted read-only) that no host writer to the original path can reach. It is verified byte-exact before the container starts and
 *      again after it exits; any difference refuses the build. This is the same lease model as MyFactory's verification lease, not a writable copy.
 *   3. The build runs in the host-pinned immutable image with no network, a read-only root and source, fixed CPU/memory/process bounds and a
 *      tmpfs, under a named+labelled container that `createBoundedDockerRunner` force-removes on timeout, overflow or failure. The built `dist`
 *      leaves only as a tar stream on stdout, which `parseDistTar` reads strictly (regular files only, safe names, bounded sizes, no aliases).
 *   4. `exportStaticBuild` returns the inventory + reader that `StaticBuildMyAppsPort` retains through `StaticArtifactCandidate.retain`; the
 *      inventory's source tree/lock are those of the captured bytes the container actually saw.
 *   5. `attestStaticBuild` signs the claim over the retained artifact digests with an INJECTED issuer signer; the private key is custody's.
 *
 * A claim is provenance only: it never replaces the independent verdict, grants no release or installation, and does not prove the
 * producer ran its declared compiler. No network, credential, deployment or provider authority is added here.
 */
export class StaticBuildExportRefused extends Error { constructor(readonly code: string) { super(code); } }
const refuse = (code: string): never => { throw new StaticBuildExportRefused(code); };
const sha1 = (b: Uint8Array) => createHash("sha1").update(b).digest();
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const blobId = (bytes: Uint8Array) => sha1(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]));
const treeId = (entries: { name: string; mode: string; id: Buffer; tree: boolean }[]) => {
  const sorted = [...entries].sort((a, b) => {
    const x = Buffer.from(a.name + (a.tree ? "/" : "")), y = Buffer.from(b.name + (b.tree ? "/" : ""));
    return Buffer.compare(x, y);
  });
  const body = Buffer.concat(sorted.map(e => Buffer.concat([Buffer.from(`${e.mode} ${e.name}\0`), e.id])));
  return sha1(Buffer.concat([Buffer.from(`tree ${body.length}\0`), body]));
};
const MAX_SOURCE_FILES = 4096, MAX_SOURCE_BYTES = 64 * 1024 * 1024, MAX_SOURCE_DEPTH = 32;

export type CapturedFile = { bytes: Buffer; exec: boolean };
export type CapturedSource = { files: Map<string, CapturedFile>; tree: string };

/** Opens without following links and returns the bytes with the descriptor's own metadata, so a swapped path can never be read as a file. */
function readNoFollow(path: string, limit: number): { bytes: Buffer; st: Stats } {
  let fd: number;
  try { fd = openSync(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0)); } catch { return refuse("QDEV_EXPORT_SOURCE_ENTRY"); }
  try {
    const st: Stats = fstatSync(fd) as Stats;
    if (!st.isFile()) refuse("QDEV_EXPORT_SOURCE_ENTRY");
    if (st.size > limit) refuse("QDEV_EXPORT_SOURCE_LIMIT");
    const bytes = Buffer.alloc(st.size);
    let offset = 0;
    while (offset < st.size) { const n = readSync(fd, bytes, offset, st.size - offset, offset); if (!n) break; offset += n; }
    if (offset !== st.size || fstatSync(fd).size !== st.size) refuse("QDEV_EXPORT_SOURCE_UNSTABLE");
    return { bytes, st };
  } finally { closeSync(fd); }
}

/**
 * Reads the whole candidate tree ONCE. The result is the only source of truth for the build: the tree id, lock and package digests, and the
 * lease are all derived from these bytes. Metadata that could carry or hide state (a repository, Finder/AppleDouble files), aliases that a
 * case-insensitive filesystem would merge, links, special files and setuid/setgid/sticky bits are refused rather than ignored.
 */
export function captureSource(root: string, options: { ignoreRootGit?: boolean } = {}): CapturedSource {
  let rootMeta;
  try { rootMeta = lstatSync(root); } catch { return refuse("QDEV_EXPORT_SOURCE_ROOT"); }
  if (rootMeta.isSymbolicLink() || !rootMeta.isDirectory()) refuse("QDEV_EXPORT_SOURCE_ROOT");
  const files = new Map<string, CapturedFile>();
  let bytes = 0;
  const walk = (dir: string, rel: string, depth: number) => {
    if (depth > MAX_SOURCE_DEPTH) refuse("QDEV_EXPORT_SOURCE_LIMIT");
    const aliases = new Set<string>();
    for (const name of readdirSync(dir)) {
      if (!rel && name === ".git" && options.ignoreRootGit) continue;
      if (name === ".git" || name === ".DS_Store" || name.startsWith("._")) refuse("QDEV_EXPORT_SOURCE_METADATA");
      if (!name || name.includes("\0") || name.includes("/") || name.length > 255) refuse("QDEV_EXPORT_SOURCE_NAME");
      const alias = name.normalize("NFC").toLowerCase();
      if (aliases.has(alias)) refuse("QDEV_EXPORT_SOURCE_ALIAS");
      aliases.add(alias);
      const path = join(dir, name), childRel = rel ? `${rel}/${name}` : name;
      if (childRel.length > 1024) refuse("QDEV_EXPORT_SOURCE_NAME");
      const meta = lstatSync(path);
      if (meta.isSymbolicLink() || !(meta.isFile() || meta.isDirectory())) refuse("QDEV_EXPORT_SOURCE_ENTRY");
      if (meta.isDirectory()) { walk(path, childRel, depth + 1); continue; }
      if (files.size >= MAX_SOURCE_FILES) refuse("QDEV_EXPORT_SOURCE_LIMIT");
      const read = readNoFollow(path, MAX_SOURCE_BYTES - bytes);
      if (read.st.nlink !== 1) refuse("QDEV_EXPORT_SOURCE_LINKED");
      if (read.st.mode & 0o7000) refuse("QDEV_EXPORT_SOURCE_MODE");
      bytes += read.bytes.length;
      files.set(childRel, { bytes: read.bytes, exec: (read.st.mode & 0o111) !== 0 });
    }
  };
  walk(root, "", 0);
  return { files, tree: gitTreeIdOf(files) };
}

/** Git tree id (hex) of captured regular files. Empty directories are not part of a git tree and are never captured. */
export function gitTreeIdOf(files: Map<string, CapturedFile>): string {
  type Node = { files: Map<string, CapturedFile>; dirs: Map<string, Node> };
  const top: Node = { files: new Map(), dirs: new Map() };
  for (const [path, file] of files) {
    const parts = path.split("/");
    let node = top;
    for (const part of parts.slice(0, -1)) { if (!node.dirs.has(part)) node.dirs.set(part, { files: new Map(), dirs: new Map() }); node = node.dirs.get(part)!; }
    node.files.set(parts[parts.length - 1], file);
  }
  const build = (node: Node): Buffer | null => {
    const entries: { name: string; mode: string; id: Buffer; tree: boolean }[] = [];
    for (const [name, child] of node.dirs) { const id = build(child); if (id) entries.push({ name, mode: "40000", id, tree: true }); }
    for (const [name, file] of node.files) entries.push({ name, mode: file.exec ? "100755" : "100644", id: blobId(file.bytes), tree: false });
    return entries.length ? treeId(entries) : null;
  };
  return (build(top) ?? treeId([])).toString("hex");
}

/** Git tree id (hex) of a directory of regular files, read once. A root `.git` is ignored here only; `exportStaticBuild` refuses it. */
export function gitTreeId(root: string): string { return captureSource(root, { ignoreRootGit: true }).tree; }

export type SourceLease = { readonly dir: string; verify(): void; release(): void };
const depthOf = (rel: string) => rel === "" ? 0 : rel.split("/").length;

/**
 * Materializes EXACTLY the captured bytes into a fresh private directory: parent 0700, directories 0555, files 0444/0555, owned by this process.
 * Nothing that writes to the original path can reach it, and `verify()` re-reads it byte-for-byte (and its modes, owner, entry set and path
 * identity) so a build is attributed to the pinned tree only if the leased bytes were unchanged before and after the container ran.
 */
export function createSourceLease(captured: CapturedSource, leaseRoot: string = tmpdir()): SourceLease {
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  let base: string;
  try { base = realpathSync(mkdtempSync(join(realpathSync(leaseRoot), "qdev-lease-"))); } catch { return refuse("QDEV_EXPORT_LEASE"); }
  const dir = join(base, "src"), dirs = new Set<string>([""]);
  const release = () => {
    const unlock = (path: string) => {
      let meta;
      try { meta = lstatSync(path); } catch { return; }
      if (!meta.isDirectory()) return;
      try { chmodSync(path, 0o700); } catch { /* removal below reports nothing further */ }
      for (const name of readdirSync(path)) unlock(join(path, name));
    };
    try { unlock(base); } catch { /* best effort */ }
    rmSync(base, { recursive: true, force: true });
  };
  try {
    mkdirSync(dir, { mode: 0o700 });
    for (const [rel, file] of captured.files) {
      const parts = rel.split("/");
      for (let i = 1; i < parts.length; i++) {
        const parent = parts.slice(0, i).join("/");
        if (!dirs.has(parent)) { mkdirSync(join(dir, parent), { mode: 0o700 }); dirs.add(parent); }
      }
      writeFileSync(join(dir, rel), file.bytes, { flag: "wx", mode: 0o600 });
      chmodSync(join(dir, rel), file.exec ? 0o555 : 0o444);
    }
    for (const rel of [...dirs].sort((a, b) => depthOf(b) - depthOf(a))) chmodSync(join(dir, rel), 0o555);
  } catch { release(); return refuse("QDEV_EXPORT_LEASE"); }

  const verify = () => {
    try {
      if (realpathSync(dir) !== dir) throw new Error("path");
      const visitedDirs = new Set<string>();
      let fileCount = 0;
      const walk = (abs: string, rel: string) => {
        const st = lstatSync(abs);
        if (!st.isDirectory() || (st.mode & 0o7777) !== 0o555 || (uid !== undefined && st.uid !== uid) || !dirs.has(rel)) throw new Error("dir");
        visitedDirs.add(rel);
        for (const name of readdirSync(abs)) {
          const childRel = rel ? `${rel}/${name}` : name, childAbs = join(abs, name), meta = lstatSync(childAbs);
          if (meta.isDirectory()) { walk(childAbs, childRel); continue; }
          const expected = captured.files.get(childRel);
          if (!expected || !meta.isFile() || meta.isSymbolicLink() || meta.nlink !== 1 || (uid !== undefined && meta.uid !== uid) || (meta.mode & 0o7777) !== (expected.exec ? 0o555 : 0o444)) throw new Error("file");
          if (!readNoFollow(childAbs, MAX_SOURCE_BYTES).bytes.equals(expected.bytes)) throw new Error("bytes");
          fileCount++;
        }
      };
      walk(dir, "");
      if (fileCount !== captured.files.size || visitedDirs.size !== dirs.size) throw new Error("entries");
    } catch (error) { throw new StaticBuildExportRefused("QDEV_EXPORT_LEASE_CHANGED"); }
  };
  return { dir, verify, release };
}

/** Strict ustar reader for the exported `dist` tree: regular files and directories only, `dist/` prefix, bounded, no case aliases. */
export function parseDistTar(tar: Uint8Array): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>(), seen = new Set<string>();
  let offset = 0, total = 0;
  const text = (b: Uint8Array) => Buffer.from(b).toString("utf8").replace(/\0.*$/s, "");
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const sum = parseInt(text(header.subarray(148, 156)).trim(), 8);
    let calc = 0;
    for (let i = 0; i < 512; i++) calc += i >= 148 && i < 156 ? 32 : header[i];
    if (!Number.isFinite(sum) || sum !== calc) refuse("QDEV_EXPORT_TAR_CHECKSUM");
    const magic = text(header.subarray(257, 262));
    const prefix = text(header.subarray(345, 500));
    if (magic !== "ustar") refuse("QDEV_EXPORT_TAR_FORMAT");
    const name = (prefix ? prefix + "/" : "") + text(header.subarray(0, 100)).replace(/^\.\//, "");
    const type = String.fromCharCode(header[156] || 48);
    const size = parseInt(text(header.subarray(124, 136)).trim() || "0", 8);
    if (!Number.isSafeInteger(size) || size < 0 || size > STATIC_ARTIFACT_LIMITS.fileBytes) refuse("QDEV_EXPORT_TAR_SIZE");
    offset += 512;
    const clean = name.replace(/\/$/, "");
    // Same path grammar as the retained-artifact inventory, so a name the MyApps contract would refuse never leaves this reader.
    const part = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/;
    if (!(clean === "dist" || clean.startsWith("dist/")) || clean.length > 240 || clean.split("/").some(p => !part.test(p) || p.endsWith("."))) refuse("QDEV_EXPORT_TAR_NAME");
    if (type === "5") { if (size) refuse("QDEV_EXPORT_TAR_ENTRY"); continue; }
    if (type !== "0" || clean === "dist") refuse("QDEV_EXPORT_TAR_ENTRY");
    if (offset + size > tar.length) refuse("QDEV_EXPORT_TAR_TRUNCATED");
    const alias = clean.toLowerCase();
    if (seen.has(alias) || files.size >= STATIC_ARTIFACT_LIMITS.files || (total += size) > STATIC_ARTIFACT_LIMITS.totalBytes) refuse("QDEV_EXPORT_TAR_LIMIT");
    seen.add(alias);
    files.set(clean, Uint8Array.from(tar.subarray(offset, offset + size)));
    offset += Math.ceil(size / 512) * 512;
  }
  if (!files.has("dist/index.html")) refuse("QDEV_EXPORT_ENTRY_MISSING");
  return files;
}

export type DockerRunner = (args: string[]) => Promise<Uint8Array>;
/** The only bounds a pinned build runs under. The image is an immutable local image ID chosen by the host, never by the candidate. */
export const PINNED_BUILD_LIMITS = Object.freeze({ cpus: "1", memory: "1g", pids: "192", tmpfsMb: 256, timeoutMs: 120_000 });
export const BUILD_CONTAINER_LABEL = "myeve.qdev=static-build";
const CONTAINER_NAME = /^qdev-build-[a-f0-9]{16}$/;
export const newBuildContainerName = () => "qdev-build-" + randomBytes(8).toString("hex");
export function pinnedBuildArgs(image: string, sourceDir: string, containerName: string = newBuildContainerName()): string[] {
  if (!/^sha256:[a-f0-9]{64}$/.test(image)) refuse("QDEV_EXPORT_IMAGE");
  if (!sourceDir.startsWith("/") || /[,:\0\s]/.test(sourceDir)) refuse("QDEV_EXPORT_SOURCE_PATH");
  if (!CONTAINER_NAME.test(containerName)) refuse("QDEV_EXPORT_CONTAINER_NAME");
  // `--name` and `--label` make the container identifiable so a timeout, overflow or crash can always be cleaned up by name.
  return ["run", "--rm", "--name", containerName, "--label", BUILD_CONTAINER_LABEL, "--pull=never", "--network", "none", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
    "--cpus", PINNED_BUILD_LIMITS.cpus, "--memory", PINNED_BUILD_LIMITS.memory, "--pids-limit", PINNED_BUILD_LIMITS.pids,
    "--tmpfs", `/tmp:rw,nosuid,size=${PINNED_BUILD_LIMITS.tmpfsMb}m`, "--env", "HOME=/tmp", "--user", "1000:1000", "--mount", `type=bind,source=${sourceDir},target=/src,readonly`,
    image, "sh", "-c",
    // Build output of the project goes to stderr; stdout carries only the tar stream of dist.
    "cd /src && npm run build -- --configLoader runner --outDir /tmp/qdev-dashboard/dist >&2 && tar --format=ustar -C /tmp/qdev-dashboard -cf - dist"];
}

/**
 * The real bounded Docker runner: spawns the docker CLI with no shell, caps stdout (the tar stream) and stderr, enforces a hard wall-clock
 * timeout, and on timeout, overflow, spawn failure or non-zero exit force-removes the NAMED container (`docker rm -f`) so no build outlives
 * its bounds. A cleanup that cannot be confirmed is reported (QDEV_EXPORT_CLEANUP_FAILED, with the container name) rather than ignored.
 */
export function createBoundedDockerRunner(options: { docker?: string; timeoutMs?: number; maxStdoutBytes?: number; cleanupTimeoutMs?: number; env?: NodeJS.ProcessEnv } = {}): DockerRunner {
  const bin = options.docker ?? "docker", timeoutMs = options.timeoutMs ?? PINNED_BUILD_LIMITS.timeoutMs, cleanupTimeoutMs = options.cleanupTimeoutMs ?? 20_000;
  const maxStdout = options.maxStdoutBytes ?? STATIC_ARTIFACT_LIMITS.totalBytes + 2 * 1024 * 1024;
  const run = (args: string[], limitMs: number, capture: boolean) => new Promise<{ code: number | null; stdout: Buffer; stderr: string; timedOut: boolean; overflow: boolean; spawnFailed: boolean }>(resolve => {
    const chunks: Buffer[] = [];
    let size = 0, stderr = "", timedOut = false, overflow = false, spawnFailed = false, done = false;
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], env: options.env ?? process.env, shell: false });
    const finish = (code: number | null) => { if (done) return; done = true; clearTimeout(timer); resolve({ code, stdout: Buffer.concat(chunks), stderr, timedOut, overflow, spawnFailed }); };
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); finish(null); }, limitMs);
    child.stdout.on("data", (chunk: Buffer) => {
      if (!capture) return;
      size += chunk.length;
      if (size > maxStdout) { overflow = true; child.kill("SIGKILL"); finish(null); } else chunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString("utf8")).slice(-4000); });
    child.on("error", () => { spawnFailed = true; finish(null); });
    child.on("close", code => finish(code));
  });
  return async args => {
    const at = args.indexOf("--name"), name = at >= 0 ? args[at + 1] : undefined;
    if (args[0] === "run" && !(name && CONTAINER_NAME.test(name))) refuse("QDEV_EXPORT_RUNNER_UNNAMED");
    const result = await run(args, timeoutMs, true);
    // A docker CLI that could not even start created nothing, so there is nothing to remove.
    if (result.spawnFailed) throw new StaticBuildExportRefused("QDEV_EXPORT_DOCKER_UNAVAILABLE");
    const ok = result.code === 0 && !result.timedOut && !result.overflow;
    if (!ok && name) {
      const cleanup = await run(["rm", "-f", name], cleanupTimeoutMs, false);
      // `rm -f` of a container that already exited under --rm is the expected case; only an unconfirmed removal is an error.
      if (!(cleanup.code === 0 || /No such container/i.test(cleanup.stderr))) throw new StaticBuildExportRefused("QDEV_EXPORT_CLEANUP_FAILED:" + name);
    }
    if (result.timedOut) throw new StaticBuildExportRefused("QDEV_EXPORT_DOCKER_TIMEOUT");
    if (result.overflow) throw new StaticBuildExportRefused("QDEV_EXPORT_DOCKER_OUTPUT_LIMIT");
    if (result.code !== 0) throw new StaticBuildExportRefused("QDEV_EXPORT_DOCKER_EXIT");
    return new Uint8Array(result.stdout);
  };
}

export type ExportConfig = {
  /** Candidate source directory and the TRUSTED pins it must equal (from Result/Work custody, never from the directory). The directory is read ONCE. */
  sourceDir: string; pins: { commit: string; tree: string };
  /** SHA-256 of the dependency lock of the frozen build profile; the candidate's package-lock.json must equal it. */
  profileLockSha256: string; profilePackageSha256: string; image: string; nodeVersion: string; docker: DockerRunner;
  /** Where the private read-only lease is created (default: the OS temp directory). */
  leaseRoot?: string;
};
export async function exportStaticBuild(c: ExportConfig): Promise<{ inventory: unknown; pins: StaticSourcePins; load(path: string): Promise<Uint8Array> }> {
  if (!/^[a-f0-9]{40}$/.test(c.pins.commit) || !/^[a-f0-9]{40}$/.test(c.pins.tree) || !/^[a-f0-9]{64}$/.test(c.profileLockSha256) || !/^[a-f0-9]{64}$/.test(c.profilePackageSha256)) refuse("QDEV_EXPORT_PINS");
  if (!/^v24\.\d+\.\d+$/.test(c.nodeVersion)) refuse("QDEV_EXPORT_NODE");
  // One read of the tree. The pin is checked against THESE bytes, and these bytes (not the directory) are what the container is given.
  const captured = captureSource(c.sourceDir);
  if (captured.tree !== c.pins.tree) refuse("QDEV_EXPORT_SOURCE_TREE_MISMATCH");
  const lock = captured.files.get("package-lock.json")?.bytes;
  if (!lock) return refuse("QDEV_EXPORT_LOCK_MISSING");
  const lockSha256 = sha256(lock);
  if (lockSha256 !== c.profileLockSha256) refuse("QDEV_EXPORT_LOCK_PROFILE");
  const pkg = captured.files.get("package.json")?.bytes;
  if (!pkg) return refuse("QDEV_EXPORT_PACKAGE_MISSING");
  if (sha256(pkg) !== c.profilePackageSha256) refuse("QDEV_EXPORT_PACKAGE_PROFILE");
  const lease = createSourceLease(captured, c.leaseRoot);
  let tar: Uint8Array;
  try {
    lease.verify();
    tar = await c.docker(pinnedBuildArgs(c.image, lease.dir));
    // A lease that changed while the container ran means the output cannot be attributed to the pinned tree.
    lease.verify();
  } finally { lease.release(); }
  const dist = parseDistTar(tar);
  const files: StaticFile[] = [...dist.entries()].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha256(bytes) })).sort((a, b) => a.path < b.path ? -1 : 1);
  const inventory = { schema: "myeve.dashboard.build-inventory/v1", scope: "BROWSER_BUILD_ONLY", sourceCommit: c.pins.commit, sourceTree: c.pins.tree, lockSha256,
    node: c.nodeVersion, files, independentVerification: "NOT_ESTABLISHED", signedResult: false, releaseQualified: false };
  return { inventory, pins: { sourceCommit: c.pins.commit, sourceTree: c.pins.tree, lockSha256 },
    async load(path) { const bytes = dist.get(path); if (!bytes) throw new StaticBuildExportRefused("QDEV_EXPORT_UNKNOWN_FILE"); return Uint8Array.from(bytes); } };
}

/** Builds the signed claim for a retained artifact. The signer is the issuer custody's; nothing else here can produce a valid claim. */
export async function attestStaticBuild(input: {
  binding: StaticBuildBinding; artifact: { inventoryDigest: string; artifactDigest: string }; keyId: string; builtAt: string;
  sign(message: Uint8Array): Promise<Uint8Array> | Uint8Array;
}): Promise<string> {
  const payload = { schema: "myeve.static-build-claim/v1", keyId: input.keyId, binding: input.binding, inventoryDigest: input.artifact.inventoryDigest,
    artifactDigest: input.artifact.artifactDigest, builtAt: input.builtAt };
  const signature = await input.sign(Buffer.from(STATIC_BUILD_CLAIM_DOMAIN + canonical(payload)));
  return canonical({ payload, signature: Buffer.from(signature).toString("base64url") });
}

/** `StaticBuildPortConfig.source` for the accepted stage-3 candidate: export, retain through the port, then attest with the issuer signer. */
export function staticBuildSourceFor(input: {
  export(candidate: { commit: string; tree: string }): Promise<Awaited<ReturnType<typeof exportStaticBuild>>>;
  binding(candidate: { commit: string; tree: string }): StaticBuildBinding | Promise<StaticBuildBinding>;
  issuer: StaticBuildSource["issuer"]; sign(message: Uint8Array): Promise<Uint8Array> | Uint8Array; now?: () => number;
}): (candidate: { commit: string; tree: string }) => Promise<StaticBuildSource> {
  return async candidate => {
    const exported = await input.export(candidate), binding = await input.binding(candidate);
    const artifact = await StaticArtifactCandidate.retain(exported.inventory, exported.pins, exported.load);
    const builtAt = new Date(Math.min(input.now?.() ?? Date.now(), Date.parse(binding.deadline))).toISOString();
    const claim = await attestStaticBuild({ binding, artifact, keyId: input.issuer.keyId, builtAt, sign: input.sign });
    return { inventory: exported.inventory, claim, load: exported.load, lockSha256: exported.pins.lockSha256, binding, issuer: input.issuer };
  };
}
