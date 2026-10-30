import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync,
  renameSync, rmSync, writeSync, type Stats,
} from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { dirname, join } from "node:path";
import { digest } from "../../../../packages/myapps/src/contracts.ts";
import { isRetainedStaticArtifact, type StaticArtifactCandidate, type StaticFile } from "../../../../packages/myapps/src/static-artifact.ts";
import type { InstallationStateSource } from "./myapps-revisions.ts";
import type { RollbackPlan } from "./rollback.ts";

/**
 * Concrete MyApps static release controller for the isolated journey: publish, serve and rollback of the EXACT retained
 * StaticArtifactCandidate bytes. It is the "separately authorized host" that StaticArtifactCandidate.candidateBytes names.
 *
 *  - Owner/project/app scoped: the durable state is bound to one (appId, ownerId, projectSha256) and refuses any other.
 *  - Immutable releases: `releases/<artifact hex>/` is written once from the retained bytes (0444 files, 0555 dirs), then
 *    re-verified byte-for-byte (manifest digest, every file, no extra entries, no links) before it can be installed or restored.
 *  - One atomic pointer: `state.json` (tmp + fsync + rename + dir fsync) names the installed version. Rollback moves the pointer to a
 *    retained version whose digest and restore-point id exactly match the plan; nothing is deleted or rewritten.
 *  - Serving reads the installed release, verifies each file's length and sha256 against the manifest on every response, and fails
 *    closed (404 when nothing is installed, 500 on any integrity mismatch).
 *  - Activation authority is NOT here: every mutation needs the host-injected `activation.permit`; absent means every mutation
 *    refuses. This module has no credential, network egress, deployment or tester authority. The optional Node transport binds
 *    loopback only; exposing it publicly (TLS, domain, tester access) is a separate protected owner action.
 */
export class StaticPublishRefused extends Error { constructor(readonly code: string) { super(code); } }
export type ActivationOperation = "PUBLISH" | "ROLLBACK";
export type ActivationRequest = { operation: ActivationOperation; appId: string; ownerId: string; projectSha256: string; digest: string; version?: number };
export type StaticReleaseConfig = {
  /** Private directory (0700, this uid, not a symlink) holding releases/ and state.json. */
  root: string; environment: "myeve-qdev-20261029"; appId: string; ownerId: string; projectSha256: string; installationId: string;
  activation?: { permit(request: ActivationRequest): Promise<boolean> };
  now?: () => Date; maxVersions?: number; lockWaitMs?: number;
};
type Version = { version: number; digest: string; publishedAt: string };
type State = {
  schema: "myeve.qdev-static-release-state/v1"; appId: string; ownerId: string; projectSha256: string; seq: number;
  installed: number | null; versions: Version[];
  events: { seq: number; kind: "PUBLISH" | "ROLLBACK" | "REMOVE"; version: number | null; at: string }[];
};
type Manifest = { schema: "myeve.qdev-static-release/v1"; artifactDigest: string; inventoryDigest: string; source: unknown; files: StaticFile[] };

const HEX = /^[a-f0-9]{64}$/;
const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const MAX_MANIFEST = 1 << 20, MAX_STATE = 1 << 20, MAX_FILE = 8 * 1024 * 1024;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8",
  json: "application/json", map: "application/json", webmanifest: "application/manifest+json", svg: "image/svg+xml", png: "image/png",
  jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", ico: "image/x-icon", woff: "font/woff", woff2: "font/woff2",
  txt: "text/plain; charset=utf-8", wasm: "application/wasm",
};
const SERVE_PATH = /^\/[A-Za-z0-9._~@+-]+(\/[A-Za-z0-9._~@+-]+)*$/;
const safeRelative = (p: string) => typeof p === "string" && p.startsWith("dist/") && p.length < 400
  && p.split("/").every(s => s !== "" && s !== "." && s !== ".." && !/[\\\0-\x1f]/.test(s));

function readNoFollow(path: string, max: number): Buffer {
  let fd: number;
  try { fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW); } catch { throw new StaticPublishRefused("QDEV_PUBLISH_RELEASE_TAMPERED"); }
  try {
    const st = fstatSync(fd) as Stats;
    if (!st.isFile() || st.size > max) throw new StaticPublishRefused("QDEV_PUBLISH_RELEASE_TAMPERED");
    return readFileSync(fd);
  } finally { closeSync(fd); }
}
function fsyncDir(path: string) { const fd = openSync(path, "r"); try { fsyncSync(fd); } finally { closeSync(fd); } }
function makeWritable(path: string) {
  let st: Stats; try { st = lstatSync(path); } catch { return; }
  if (st.isSymbolicLink()) return;
  if (st.isDirectory()) { try { chmodSync(path, 0o700); } catch { /* best effort */ } for (const e of readdirSync(path)) makeWritable(join(path, e)); }
}
function removeTree(path: string) { makeWritable(path); rmSync(path, { recursive: true, force: true }); }
function walk(dir: string, rel = ""): { files: string[]; bad: boolean } {
  const out = { files: [] as string[], bad: false };
  for (const name of readdirSync(dir)) {
    const p = join(dir, name), r = rel ? rel + "/" + name : name, st = lstatSync(p);
    if (st.isDirectory()) { const sub = walk(p, r); out.files.push(...sub.files); out.bad ||= sub.bad; }
    else if (st.isFile() && st.nlink === 1) out.files.push(r);
    else out.bad = true;
  }
  return out;
}

export class StaticReleaseController {
  private chain: Promise<unknown> = Promise.resolve();
  private readonly verified = new Map<string, Manifest>();
  constructor(private readonly c: StaticReleaseConfig) {
    if (!/^[A-Za-z0-9._:-]{1,160}$/.test(c.appId) || !c.ownerId || !HEX.test(c.projectSha256) || !c.installationId) throw new StaticPublishRefused("QDEV_PUBLISH_CONFIG");
    const root = c.root;
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const st = lstatSync(root);
    if (st.isSymbolicLink() || !st.isDirectory() || (st.mode & 0o077) !== 0 || (typeof process.getuid === "function" && st.uid !== process.getuid())) throw new StaticPublishRefused("QDEV_PUBLISH_ROOT");
    mkdirSync(join(root, "releases"), { recursive: true, mode: 0o700 });
  }

  private get statePath() { return join(this.c.root, "state.json"); }
  private releaseDir(hex: string) { return join(this.c.root, "releases", hex); }
  private now() { return (this.c.now?.() ?? new Date()).toISOString(); }

  private loadState(): State {
    let raw: Buffer;
    try { raw = readNoFollow(this.statePath, MAX_STATE); }
    catch (e) {
      try { lstatSync(this.statePath); } catch { return { schema: "myeve.qdev-static-release-state/v1", appId: this.c.appId, ownerId: this.c.ownerId, projectSha256: this.c.projectSha256, seq: 0, installed: null, versions: [], events: [] }; }
      throw e;
    }
    let s: State;
    try { s = JSON.parse(raw.toString("utf8")); } catch { throw new StaticPublishRefused("QDEV_PUBLISH_STATE_INVALID"); }
    if (s?.schema !== "myeve.qdev-static-release-state/v1" || !Array.isArray(s.versions) || !Array.isArray(s.events) || !Number.isInteger(s.seq)) throw new StaticPublishRefused("QDEV_PUBLISH_STATE_INVALID");
    if (s.appId !== this.c.appId || s.ownerId !== this.c.ownerId || s.projectSha256 !== this.c.projectSha256) throw new StaticPublishRefused("QDEV_PUBLISH_STATE_FOREIGN");
    if (s.installed !== null && !s.versions.some(v => v.version === s.installed)) throw new StaticPublishRefused("QDEV_PUBLISH_STATE_INVALID");
    return s;
  }
  private saveState(next: State, expectedSeq: number) {
    if (this.loadState().seq !== expectedSeq) throw new StaticPublishRefused("QDEV_PUBLISH_STATE_CONFLICT");
    const tmp = join(this.c.root, "state.json." + randomBytes(6).toString("hex"));
    const fd = openSync(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    try { writeSync(fd, JSON.stringify(next)); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(tmp, this.statePath);
    fsyncDir(this.c.root);
  }

  private async locked<T>(fn: () => T | Promise<T>): Promise<T> {
    const run = this.chain.then(() => this.fileLocked(fn));
    this.chain = run.catch(() => undefined);
    return run;
  }
  private async fileLocked<T>(fn: () => T | Promise<T>): Promise<T> {
    const lock = join(this.c.root, "lock"), deadline = Date.now() + (this.c.lockWaitMs ?? 2000);
    for (;;) {
      try { const fd = openSync(lock, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600); try { writeSync(fd, String(process.pid)); } finally { closeSync(fd); } break; }
      catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
        let pid = NaN; try { pid = Number(readFileSync(lock, "utf8")); } catch { /* vanished */ }
        if (Number.isInteger(pid) && pid > 0) {
          try { process.kill(pid, 0); } catch (k) { if ((k as NodeJS.ErrnoException).code === "ESRCH") { try { rmSync(lock); } catch { /* raced */ } continue; } }
        }
        if (Date.now() >= deadline) throw new StaticPublishRefused("QDEV_PUBLISH_BUSY");
        await sleep(20);
      }
    }
    try { return await fn(); } finally { try { rmSync(lock); } catch { /* already gone */ } }
  }
  private async permit(operation: ActivationOperation, hex: string, version?: number) {
    const ok = await this.c.activation?.permit({ operation, appId: this.c.appId, ownerId: this.c.ownerId, projectSha256: this.c.projectSha256, digest: "sha256:" + hex, ...(version === undefined ? {} : { version }) });
    if (ok !== true) throw new StaticPublishRefused("QDEV_PUBLISH_NOT_AUTHORIZED");
  }

  /** Byte-exact verification of a stored release. Returns its manifest or throws QDEV_PUBLISH_RELEASE_TAMPERED. */
  verifyRelease(hex: string): Manifest {
    const tampered = () => new StaticPublishRefused("QDEV_PUBLISH_RELEASE_TAMPERED");
    if (!HEX.test(hex)) throw tampered();
    const dir = this.releaseDir(hex);
    let st: Stats; try { st = lstatSync(dir); } catch { throw tampered(); }
    if (st.isSymbolicLink() || !st.isDirectory()) throw tampered();
    let m: Manifest;
    try { m = JSON.parse(readNoFollow(join(dir, "manifest.json"), MAX_MANIFEST).toString("utf8")); } catch { throw tampered(); }
    if (m?.schema !== "myeve.qdev-static-release/v1" || m.artifactDigest !== "sha256:" + hex || !Array.isArray(m.files)) throw tampered();
    if (digest({ source: m.source, files: m.files }) !== m.artifactDigest) throw tampered();
    const expected = new Set<string>(["manifest.json"]);
    for (const f of m.files) {
      if (!safeRelative(f.path) || !Number.isInteger(f.bytes) || !HEX.test(f.sha256) || expected.has(f.path)) throw tampered();
      expected.add(f.path);
      const bytes = readNoFollow(join(dir, f.path), MAX_FILE);
      if (bytes.length !== f.bytes || sha(bytes) !== f.sha256) throw tampered();
    }
    const tree = walk(dir);
    if (tree.bad || tree.files.length !== expected.size || tree.files.some(f => !expected.has(f))) throw tampered();
    this.verified.set(hex, m);
    return m;
  }

  private writeRelease(artifact: StaticArtifactCandidate, hex: string) {
    const final = this.releaseDir(hex);
    let exists = true;
    try { lstatSync(final); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; exists = false; }
    if (exists) { this.verifyRelease(hex); return; }
    const stage = join(this.c.root, "releases", ".stage-" + randomBytes(8).toString("hex"));
    const dirs = new Set<string>();
    try {
      mkdirSync(stage, { mode: 0o700 }); dirs.add(stage);
      for (const f of artifact.files) {
        if (!safeRelative(f.path)) throw new StaticPublishRefused("QDEV_PUBLISH_ARTIFACT_PATH");
        const bytes = artifact.candidateBytes(f.path);
        if (bytes.length !== f.bytes || sha(bytes) !== f.sha256) throw new StaticPublishRefused("QDEV_PUBLISH_ARTIFACT_BYTES");
        const target = join(stage, f.path);
        for (let d = dirname(target); d.length > stage.length; d = dirname(d)) dirs.add(d);
        mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
        const fd = openSync(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o444);
        try { writeSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
      }
      const manifest: Manifest = { schema: "myeve.qdev-static-release/v1", artifactDigest: artifact.artifactDigest, inventoryDigest: artifact.inventoryDigest, source: artifact.source, files: artifact.files.map(f => ({ ...f })) };
      const fd = openSync(join(stage, "manifest.json"), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o444);
      try { writeSync(fd, JSON.stringify(manifest)); fsyncSync(fd); } finally { closeSync(fd); }
      for (const d of [...dirs].sort((a, b) => b.length - a.length)) { fsyncDir(d); chmodSync(d, 0o555); }
      renameSync(stage, final);
      fsyncDir(join(this.c.root, "releases"));
    } catch (e) { removeTree(stage); throw e; }
    this.verifyRelease(hex);
  }

  /** Install the exact retained artifact as the served revision. Idempotent for the already-installed digest. */
  async publish(artifact: StaticArtifactCandidate): Promise<{ appId: string; version: number; digest: string; changed: boolean }> {
    if (!isRetainedStaticArtifact(artifact)) throw new StaticPublishRefused("QDEV_PUBLISH_NOT_RETAINED");
    const hex = artifact.artifactDigest.replace(/^sha256:/, "");
    if (!HEX.test(hex)) throw new StaticPublishRefused("QDEV_PUBLISH_NOT_RETAINED");
    await this.permit("PUBLISH", hex);
    return this.locked(() => {
      const s = this.loadState(), seq = s.seq;
      this.writeRelease(artifact, hex);
      const current = s.installed === null ? undefined : s.versions.find(v => v.version === s.installed);
      if (current?.digest === hex) return { appId: this.c.appId, version: current.version, digest: "sha256:" + hex, changed: false };
      if (s.versions.length >= (this.c.maxVersions ?? 64)) throw new StaticPublishRefused("QDEV_PUBLISH_HISTORY_FULL");
      const version = (s.versions.at(-1)?.version ?? 0) + 1, at = this.now();
      const next: State = { ...s, seq: seq + 1, installed: version,
        versions: [...s.versions, { version, digest: hex, publishedAt: at }], events: [...s.events, { seq: seq + 1, kind: "PUBLISH", version, at }] };
      this.saveState(next, seq);
      return { appId: this.c.appId, version, digest: "sha256:" + hex, changed: true };
    });
  }

  /** Move the served pointer exactly as planned by planRollback. Nothing is deleted; the restore target is re-verified first. */
  async rollback(plan: RollbackPlan): Promise<{ installed: number | null; changed: boolean }> {
    if (plan?.installation?.environment !== this.c.environment || plan.installation.installationId !== this.c.installationId) throw new StaticPublishRefused("QDEV_PUBLISH_INSTALLATION_IDENTITY");
    if (plan.kind === "RESTORE_REVISION") {
      const m = /^(.+)@([1-9][0-9]*)$/.exec(plan.revisionId);
      if (!m || m[1] !== this.c.appId || !HEX.test(plan.revisionSha256)) throw new StaticPublishRefused("QDEV_PUBLISH_ROLLBACK_TARGET");
      const target = Number(m[2]);
      await this.permit("ROLLBACK", plan.revisionSha256, target);
      return this.locked(() => {
        const s = this.loadState(), v = s.versions.find(x => x.version === target);
        if (!v || v.digest !== plan.revisionSha256 || plan.restorePointId !== `myapps-restore:${this.c.appId}@${target}:${v.digest.slice(0, 16)}`) throw new StaticPublishRefused("QDEV_PUBLISH_ROLLBACK_TARGET");
        this.verifyRelease(v.digest);
        if (s.installed === target) return { installed: target, changed: false };
        const at = this.now();
        this.saveState({ ...s, seq: s.seq + 1, installed: target, events: [...s.events, { seq: s.seq + 1, kind: "ROLLBACK", version: target, at }] }, s.seq);
        return { installed: target, changed: true };
      });
    }
    const auth = sha(JSON.stringify({ kind: "ABSENT", appId: this.c.appId, ownerId: this.c.ownerId, projectSha256: this.c.projectSha256 }));
    if (plan.kind !== "REMOVE_INSTALLATION" || plan.absenceAuthenticationSha256 !== auth || plan.restorePointId !== "myapps-absent:" + auth.slice(0, 32)) throw new StaticPublishRefused("QDEV_PUBLISH_ROLLBACK_TARGET");
    await this.permit("ROLLBACK", auth);
    return this.locked(() => {
      const s = this.loadState();
      if (s.installed === null) return { installed: null, changed: false };
      const at = this.now();
      this.saveState({ ...s, seq: s.seq + 1, installed: null, events: [...s.events, { seq: s.seq + 1, kind: "REMOVE", version: null, at }] }, s.seq);
      return { installed: null, changed: true };
    });
  }

  /** Read-only installation state in the shape MyAppsRevisionReader consumes. Only fully verified releases are restorable. */
  stateSource(): InstallationStateSource {
    return {
      read: async appId => {
        if (appId !== this.c.appId) throw new StaticPublishRefused("QDEV_PUBLISH_STATE_FOREIGN");
        const s = this.loadState(), restorable: number[] = [];
        for (const v of s.versions) { try { this.verifyRelease(v.digest); restorable.push(v.version); } catch { /* not restorable */ } }
        const cur = s.installed === null ? null : s.versions.find(v => v.version === s.installed)!;
        return { installedVersion: cur?.version ?? null, installedDigest: cur ? "sha256:" + cur.digest : null, restorableVersions: restorable };
      },
    };
  }

  /** Framework-neutral GET/HEAD handler for the installed release. Fails closed. */
  handler(): (request: Request) => Promise<Response> {
    const base = { "cache-control": "no-cache", "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" };
    const fail = (status: number, code: string) => Response.json({ error: code }, { status, headers: base });
    return async request => {
      if (request.method !== "GET" && request.method !== "HEAD") return fail(405, "QDEV_PUBLISH_METHOD");
      let path = new URL(request.url).pathname;
      if (path === "/") path = "/index.html";
      if (!SERVE_PATH.test(path)) return fail(404, "QDEV_PUBLISH_NOT_FOUND");
      try {
        const s = this.loadState();
        const cur = s.installed === null ? undefined : s.versions.find(v => v.version === s.installed);
        if (!cur) return fail(404, "QDEV_PUBLISH_NOT_INSTALLED");
        const manifest = this.verified.get(cur.digest) ?? this.verifyRelease(cur.digest);
        const entry = manifest.files.find(f => f.path === "dist" + path);
        if (!entry) return fail(404, "QDEV_PUBLISH_NOT_FOUND");
        const bytes = readNoFollow(join(this.releaseDir(cur.digest), entry.path), MAX_FILE);
        if (bytes.length !== entry.bytes || sha(bytes) !== entry.sha256) return fail(500, "QDEV_PUBLISH_SERVE_INTEGRITY");
        const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
        const headers = { ...base, "content-type": TYPES[ext] ?? "application/octet-stream", "content-length": String(bytes.length), etag: '"sha256-' + entry.sha256 + '"' };
        return new Response(request.method === "HEAD" ? null : new Uint8Array(bytes), { status: 200, headers });
      } catch { return fail(500, "QDEV_PUBLISH_SERVE_INTEGRITY"); }
    };
  }
}

/** Minimal Node transport for the handler. Loopback only: public exposure (TLS, domain, tester access) is a protected owner action. */
export async function listenLoopback(handler: (request: Request) => Promise<Response>, options: { host?: string; port?: number } = {}): Promise<{ origin: string; close(): Promise<void> }> {
  const host = options.host ?? "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "::1" && host !== "localhost") throw new StaticPublishRefused("QDEV_PUBLISH_NOT_LOOPBACK");
  const server: Server = createServer(async (req: IncomingMessage, res) => {
    try {
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
      const response = await handler(new Request("http://" + host + (req.url ?? "/"), { method: req.method, headers }));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.writeHead(500); res.end(); }
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(options.port ?? 0, host, () => resolve()); });
  const addr = server.address() as { port: number };
  return { origin: `http://${host === "::1" ? "[::1]" : host}:${addr.port}`, close: () => new Promise<void>(r => { server.close(() => r()); server.closeAllConnections?.(); }) };
}
