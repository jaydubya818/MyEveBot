import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync,
  linkSync, renameSync, rmSync, writeSync, type Stats,
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
 *  - One atomic pointer: the state is an append-only sequence of immutable files committed by link(2) (exclusive create of the next
 *    sequence number = lock-free compare-and-swap; a concurrent writer loses with a conflict and re-evaluates). Rollback moves the pointer to a
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
  /** Private directory (0700, this uid, not a symlink) holding releases/ and states/. */
  root: string; environment: "myeve-qdev-20261029"; appId: string; ownerId: string; projectSha256: string; installationId: string;
  activation?: { permit(request: ActivationRequest): Promise<boolean> };
  now?: () => Date; maxVersions?: number;
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
    mkdirSync(join(root, "states"), { recursive: true, mode: 0o700 });
  }

  private get statesDir() { return join(this.c.root, "states"); }
  private releaseDir(hex: string) { return join(this.c.root, "releases", hex); }
  private now() { return (this.c.now?.() ?? new Date()).toISOString(); }
  private initialState(): State {
    return { schema: "myeve.qdev-static-release-state/v1", appId: this.c.appId, ownerId: this.c.ownerId, projectSha256: this.c.projectSha256, seq: 0, installed: null, versions: [], events: [] };
  }

  /** The state is an append-only sequence of immutable files states/<seq>.json; the installed pointer is the highest one. */
  private loadState(): State {
    const names = readdirSync(this.statesDir).filter(n => !n.startsWith(".tmp-"));
    if (names.some(n => !/^[0-9]{10}\.json$/.test(n))) throw new StaticPublishRefused("QDEV_PUBLISH_STATE_INVALID");
    names.sort();
    names.forEach((n, i) => { if (Number(n.slice(0, 10)) !== i + 1) throw new StaticPublishRefused("QDEV_PUBLISH_STATE_INVALID"); });
    if (!names.length) return this.initialState();
    let s: State;
    try { s = JSON.parse(readNoFollow(join(this.statesDir, names.at(-1)!), MAX_STATE).toString("utf8")); } catch { throw new StaticPublishRefused("QDEV_PUBLISH_STATE_INVALID"); }
    if (s?.schema !== "myeve.qdev-static-release-state/v1" || !Array.isArray(s.versions) || !Array.isArray(s.events) || s.seq !== names.length) throw new StaticPublishRefused("QDEV_PUBLISH_STATE_INVALID");
    if (s.appId !== this.c.appId || s.ownerId !== this.c.ownerId || s.projectSha256 !== this.c.projectSha256) throw new StaticPublishRefused("QDEV_PUBLISH_STATE_FOREIGN");
    if (s.installed !== null && !s.versions.some(v => v.version === s.installed)) throw new StaticPublishRefused("QDEV_PUBLISH_STATE_INVALID");
    return s;
  }
  /**
   * Atomic compare-and-swap with no lock: the next state is fully written and fsynced to a private temp file, then committed by
   * link(2) to states/<seq+1>.json, which fails with EEXIST if any other writer already committed that sequence number. Exactly one
   * of any number of concurrent writers based on the same state wins; the others get QDEV_PUBLISH_STATE_CONFLICT and re-evaluate.
   */
  private commit(next: State, expectedSeq: number) {
    if (next.seq !== expectedSeq + 1) throw new StaticPublishRefused("QDEV_PUBLISH_STATE_INVALID");
    const tmp = join(this.statesDir, ".tmp-" + randomBytes(8).toString("hex"));
    const fd = openSync(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o444);
    try { writeSync(fd, JSON.stringify(next)); fsyncSync(fd); } finally { closeSync(fd); }
    try { linkSync(tmp, join(this.statesDir, String(next.seq).padStart(10, "0") + ".json")); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new StaticPublishRefused("QDEV_PUBLISH_STATE_CONFLICT"); throw e; }
    finally { try { rmSync(tmp); } catch { /* already gone */ } }
    fsyncDir(this.statesDir);
  }
  /** Serializes within this process (fewer conflicts) and retries on a lost CAS; correctness never depends on the serialization. */
  private async mutate<T>(fn: (state: State) => { next: State; result: T } | { result: T }): Promise<T> {
    const run = this.chain.then(async () => {
      for (let attempt = 0; ; attempt++) {
        const state = this.loadState(), out = fn(state);
        if (!("next" in out)) return out.result;
        try { this.commit(out.next, state.seq); return out.result; }
        catch (e) { if (e instanceof StaticPublishRefused && e.code === "QDEV_PUBLISH_STATE_CONFLICT" && attempt < 16) { await sleep(5 + attempt * 5); continue; } throw e; }
      }
    });
    this.chain = run.catch(() => undefined);
    return run;
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

  /** Install the exact retained artifact as the served revision. Idempotent for the already-installed digest. `seq` identifies the committed state for compensation. */
  async publish(artifact: StaticArtifactCandidate): Promise<{ appId: string; version: number; digest: string; changed: boolean; seq: number }> {
    if (!isRetainedStaticArtifact(artifact)) throw new StaticPublishRefused("QDEV_PUBLISH_NOT_RETAINED");
    const hex = artifact.artifactDigest.replace(/^sha256:/, "");
    if (!HEX.test(hex)) throw new StaticPublishRefused("QDEV_PUBLISH_NOT_RETAINED");
    await this.permit("PUBLISH", hex);
    this.loadState();   // refuse a foreign or invalid state before writing anything
    this.writeRelease(artifact, hex);
    return this.mutate(s => {
      const current = s.installed === null ? undefined : s.versions.find(v => v.version === s.installed);
      const done = (version: number, seq: number, changed: boolean) => ({ appId: this.c.appId, version, digest: "sha256:" + hex, changed, seq });
      if (current?.digest === hex) return { result: done(current.version, s.seq, false) };
      if (s.versions.length >= (this.c.maxVersions ?? 64)) throw new StaticPublishRefused("QDEV_PUBLISH_HISTORY_FULL");
      this.verifyRelease(hex);
      const version = (s.versions.at(-1)?.version ?? 0) + 1, at = this.now(), seq = s.seq + 1;
      const next: State = { ...s, seq, installed: version, versions: [...s.versions, { version, digest: hex, publishedAt: at }], events: [...s.events, { seq, kind: "PUBLISH", version, at }] };
      return { next, result: done(version, seq, true) };
    });
  }

  /**
   * Move the served pointer exactly as planned by planRollback. Nothing is deleted; the restore target is re-verified first.
   * `expected` makes the move a compensation: it applies only while the committed state is still exactly the one the caller
   * published (sequence, installed version and digest); any newer commit refuses with QDEV_PUBLISH_COMPENSATION_SUPERSEDED
   * and a newer release is never undone.
   */
  async rollback(plan: RollbackPlan, expected?: { seq: number; version: number; digest: string }): Promise<{ installed: number | null; changed: boolean; seq: number }> {
    if (plan?.installation?.environment !== this.c.environment || plan.installation.installationId !== this.c.installationId) throw new StaticPublishRefused("QDEV_PUBLISH_INSTALLATION_IDENTITY");
    const superseded = (s: State) => {
      if (!expected) return;
      const cur = s.installed === null ? undefined : s.versions.find(v => v.version === s.installed);
      if (s.seq !== expected.seq || cur?.version !== expected.version || "sha256:" + cur.digest !== expected.digest) throw new StaticPublishRefused("QDEV_PUBLISH_COMPENSATION_SUPERSEDED");
    };
    if (plan.kind === "RESTORE_REVISION") {
      const m = /^(.+)@([1-9][0-9]*)$/.exec(plan.revisionId);
      if (!m || m[1] !== this.c.appId || !HEX.test(plan.revisionSha256)) throw new StaticPublishRefused("QDEV_PUBLISH_ROLLBACK_TARGET");
      const target = Number(m[2]);
      await this.permit("ROLLBACK", plan.revisionSha256, target);
      return this.mutate<{ installed: number | null; changed: boolean; seq: number }>(s => {
        superseded(s);
        const v = s.versions.find(x => x.version === target);
        if (!v || v.digest !== plan.revisionSha256 || plan.restorePointId !== `myapps-restore:${this.c.appId}@${target}:${v.digest.slice(0, 16)}`) throw new StaticPublishRefused("QDEV_PUBLISH_ROLLBACK_TARGET");
        this.verifyRelease(v.digest);
        if (s.installed === target) return { result: { installed: target, changed: false, seq: s.seq } };
        const at = this.now(), seq = s.seq + 1;
        return { next: { ...s, seq, installed: target, events: [...s.events, { seq, kind: "ROLLBACK" as const, version: target, at }] }, result: { installed: target, changed: true, seq } };
      });
    }
    const auth = sha(JSON.stringify({ kind: "ABSENT", appId: this.c.appId, ownerId: this.c.ownerId, projectSha256: this.c.projectSha256 }));
    if (plan.kind !== "REMOVE_INSTALLATION" || plan.absenceAuthenticationSha256 !== auth || plan.restorePointId !== "myapps-absent:" + auth.slice(0, 32)) throw new StaticPublishRefused("QDEV_PUBLISH_ROLLBACK_TARGET");
    await this.permit("ROLLBACK", auth);
    return this.mutate<{ installed: number | null; changed: boolean; seq: number }>(s => {
      superseded(s);
      if (s.installed === null) return { result: { installed: null, changed: false, seq: s.seq } };
      const at = this.now(), seq = s.seq + 1;
      return { next: { ...s, seq, installed: null, events: [...s.events, { seq, kind: "REMOVE" as const, version: null, at }] }, result: { installed: null, changed: true, seq } };
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
