import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
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
 *   1. `gitTreeId(dir)` recomputes the git tree id of a read-only candidate directory with no git binary, so the directory is PROVEN to be
 *      the accepted candidate tree (symlinks, special files and over-limit trees are refused).
 *   2. `runPinnedBuild` builds it in the host-pinned immutable image with no network, a read-only root and source, fixed CPU/memory/process
 *      bounds and a tmpfs; the built `dist` leaves only as a tar stream on stdout, which `parseDistTar` reads strictly (regular files only,
 *      safe names, bounded sizes, no aliases).
 *   3. `exportStaticBuild` returns the inventory + reader that `StaticBuildMyAppsPort` retains through `StaticArtifactCandidate.retain`.
 *   4. `attestStaticBuild` signs the claim over the retained artifact digests with an INJECTED issuer signer; the private key is custody's.
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
const MAX_SOURCE_FILES = 4096, MAX_SOURCE_BYTES = 64 * 1024 * 1024;

/** Git tree id (hex) of a directory of regular files. `.git` at the root is ignored; everything else must be a regular file or directory. */
export function gitTreeId(root: string): string {
  let files = 0, bytes = 0;
  const walk = (dir: string, top: boolean): Buffer | null => {
    const entries: { name: string; mode: string; id: Buffer; tree: boolean }[] = [];
    for (const name of readdirSync(dir)) {
      if (top && name === ".git") continue;
      if (!name || name.includes("\0") || name.includes("/")) refuse("QDEV_EXPORT_SOURCE_NAME");
      const path = join(dir, name), meta = lstatSync(path);
      if (meta.isSymbolicLink() || !(meta.isFile() || meta.isDirectory())) refuse("QDEV_EXPORT_SOURCE_ENTRY");
      if (meta.isDirectory()) {
        const id = walk(path, false);
        if (id) entries.push({ name, mode: "40000", id, tree: true });
      } else {
        if (++files > MAX_SOURCE_FILES || (bytes += meta.size) > MAX_SOURCE_BYTES) refuse("QDEV_EXPORT_SOURCE_LIMIT");
        entries.push({ name, mode: (meta.mode & 0o111) ? "100755" : "100644", id: blobId(readFileSync(path)), tree: false });
      }
    }
    return entries.length ? treeId(entries) : null;
  };
  return (walk(root, true) ?? treeId([])).toString("hex");
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
export function pinnedBuildArgs(image: string, sourceDir: string): string[] {
  if (!/^sha256:[a-f0-9]{64}$/.test(image)) refuse("QDEV_EXPORT_IMAGE");
  if (!sourceDir.startsWith("/") || /[,:\0\s]/.test(sourceDir)) refuse("QDEV_EXPORT_SOURCE_PATH");
  return ["run", "--rm", "--pull=never", "--network", "none", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
    "--cpus", PINNED_BUILD_LIMITS.cpus, "--memory", PINNED_BUILD_LIMITS.memory, "--pids-limit", PINNED_BUILD_LIMITS.pids,
    "--tmpfs", `/tmp:rw,nosuid,size=${PINNED_BUILD_LIMITS.tmpfsMb}m`, "--env", "HOME=/tmp", "--user", "1000:1000", "--mount", `type=bind,source=${sourceDir},target=/src,readonly`,
    image, "sh", "-c",
    // Build output of the project goes to stderr; stdout carries only the tar stream of dist.
    "cd /src && npm run build -- --configLoader runner --outDir /tmp/qdev-dashboard/dist >&2 && tar --format=ustar -C /tmp/qdev-dashboard -cf - dist"];
}

export type ExportConfig = {
  /** Read-only exported candidate directory and the TRUSTED pins it must equal (from Result/Work custody, never from the directory). */
  sourceDir: string; pins: { commit: string; tree: string };
  /** SHA-256 of the dependency lock of the frozen build profile; the candidate's package-lock.json must equal it. */
  profileLockSha256: string; profilePackageSha256: string; image: string; nodeVersion: string; docker: DockerRunner;
};
export async function exportStaticBuild(c: ExportConfig): Promise<{ inventory: unknown; pins: StaticSourcePins; load(path: string): Promise<Uint8Array> }> {
  if (!/^[a-f0-9]{40}$/.test(c.pins.commit) || !/^[a-f0-9]{40}$/.test(c.pins.tree) || !/^[a-f0-9]{64}$/.test(c.profileLockSha256) || !/^[a-f0-9]{64}$/.test(c.profilePackageSha256)) refuse("QDEV_EXPORT_PINS");
  if (!/^v24\.\d+\.\d+$/.test(c.nodeVersion)) refuse("QDEV_EXPORT_NODE");
  if (gitTreeId(c.sourceDir) !== c.pins.tree) refuse("QDEV_EXPORT_SOURCE_TREE_MISMATCH");
  let lock: Buffer;
  try { lock = readFileSync(join(c.sourceDir, "package-lock.json")); } catch { return refuse("QDEV_EXPORT_LOCK_MISSING"); }
  const lockSha256 = sha256(lock);
  if (lockSha256 !== c.profileLockSha256) refuse("QDEV_EXPORT_LOCK_PROFILE");
  let pkg: Buffer;
  try { pkg = readFileSync(join(c.sourceDir, "package.json")); } catch { return refuse("QDEV_EXPORT_PACKAGE_MISSING"); }
  if (sha256(pkg) !== c.profilePackageSha256) refuse("QDEV_EXPORT_PACKAGE_PROFILE");
  const dist = parseDistTar(await c.docker(pinnedBuildArgs(c.image, c.sourceDir)));
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
