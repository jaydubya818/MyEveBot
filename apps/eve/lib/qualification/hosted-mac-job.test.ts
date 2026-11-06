/**
 * P1 regression (review EVE-REVIEW-1): the Mac worker executes only hosted jobs bound to a Factory-signed stage-3 Result for this installation's
 * owner/ownerScope, with a durable single-use claim, and refuses fabricated, replayed and foreign jobs BEFORE any Docker or signing.
 * SYNTHETIC: throwaway keys, in-process verifier service, fake hosted routes; `build` is a spy (no Docker).
 */
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StaticArtifactCandidate } from "../../../../packages/myapps/src/static-artifact.ts";
import { ArtifactStagingStore } from "./artifact-staging.ts";
import type { MacBuildRequest } from "./hosted-mac-build.ts";
import { fileMacJobClaims, macBuildAuthority, MacJobRefused, memoryMacJobClaims, verifyMacBuildJob, type MacJobTrust } from "./hosted-mac-job.ts";
import { stage3ResultFixture } from "./hosted-mac-job-test-fixture.ts";
import { macWorker } from "./hosted-mac-worker.ts";
import { attestStaticBuild } from "./static-build-export.ts";
import { createVerifierHandler, ed25519Signer, memoryVerifierStore } from "./verifier-service.ts";

const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const f = stage3ResultFixture();
const installation = { installationId: "prj_hosted_owner", ownerId: "jay" };
const trust: MacJobTrust = { ...installation, resultKeys: [f.resultKey], lockSha256: "a".repeat(64), buildProfileDigest: "b".repeat(64) };
const project = { projectSha256: "5".repeat(64), sourceSha256: "6".repeat(64), protectedSpecificationSha256: "7".repeat(64) };
const job = (over: Partial<MacBuildRequest> = {}): MacBuildRequest => ({ schema: "myeve.hosted-mac-build-request/v2", candidate: f.candidate, binding: f.binding as never,
  ...project, appId: "myeve-dashboard", authority: macBuildAuthority(installation, f.signed), ...over });
const code = (fn: () => unknown) => { try { fn(); return "accepted"; } catch (e) { return (e as MacJobRefused).code; } };

describe("verifyMacBuildJob (pure)", () => {
  it("accepts exactly the Factory-signed, owned, pinned, unexpired job and derives a stable claim key", () => {
    const a = verifyMacBuildJob(job(), trust), b = verifyMacBuildJob(structuredClone(job()), trust);
    expect(a.claimKey).toMatch(/^[a-f0-9]{64}$/);
    expect(b.claimKey).toBe(a.claimKey);
  });
  it("refuses fabricated, foreign, expired and mis-bound jobs", () => {
    const other = stage3ResultFixture();                                   // signed by a key this Mac does not pin
    const unsigned = { ...job().authority, factoryResult: { ...job().authority.factoryResult, signature: Buffer.alloc(64).toString("base64url") } };
    expect(code(() => verifyMacBuildJob({ ...job(), authority: unsigned }, trust))).toBe("MAC_JOB_RESULT_SIGNATURE");
    expect(code(() => verifyMacBuildJob({ ...job(), authority: macBuildAuthority(installation, other.signed) }, trust))).toBe("MAC_JOB_RESULT_SIGNATURE");
    const { authority: _none, ...withoutAuthority } = job();
    expect(code(() => verifyMacBuildJob(withoutAuthority, trust))).toBe("MAC_JOB_SHAPE");
    expect(code(() => verifyMacBuildJob({ ...job(), authority: undefined } as never, trust))).toBe("MAC_JOB_FOREIGN");
    expect(code(() => verifyMacBuildJob({ ...job(), schema: "myeve.hosted-mac-build-request/v1" } as never, trust))).toBe("MAC_JOB_SHAPE");
    // Foreign installation / owner / ownerScope.
    expect(code(() => verifyMacBuildJob({ ...job(), authority: macBuildAuthority({ installationId: "prj_tester", ownerId: "jay" }, f.signed) }, trust))).toBe("MAC_JOB_FOREIGN");
    expect(code(() => verifyMacBuildJob({ ...job(), authority: { ...job().authority, ownerScope: "jay" } }, trust))).toBe("MAC_JOB_FOREIGN");
    expect(code(() => verifyMacBuildJob(job({ binding: { ...f.binding, ownerId: "tester" } as never }), trust))).toBe("MAC_JOB_FOREIGN");
    // The candidate must be the Factory Result's candidate; the binding must be the Result's request/run/pins.
    const candidate = { commit: "c".repeat(40), tree: "d".repeat(40) };
    expect(code(() => verifyMacBuildJob(job({ candidate, binding: { ...f.binding, candidateCommit: candidate.commit, candidateTree: candidate.tree } as never }), trust))).toBe("MAC_JOB_RESULT_CANDIDATE");
    expect(code(() => verifyMacBuildJob(job({ binding: { ...f.binding, runId: "33333333-3333-4333-8333-333333333333" } as never }), trust))).toBe("MAC_JOB_RESULT_BINDING");
    expect(code(() => verifyMacBuildJob(job({ binding: { ...f.binding, candidateCommit: "c".repeat(40) } as never }), trust))).toBe("MAC_JOB_BINDING");
    expect(code(() => verifyMacBuildJob(job({ binding: { ...f.binding, lockSha256: "9".repeat(64) } as never }), trust))).toBe("MAC_JOB_PINS");
    expect(code(() => verifyMacBuildJob(job({ binding: { ...f.binding, deadline: new Date(Date.now() - 1000).toISOString() } as never }), trust))).toBe("MAC_JOB_EXPIRED");
    // Revoked Factory key.
    expect(code(() => verifyMacBuildJob(job(), { ...trust, resultKeys: [{ ...f.resultKey, revokedAt: "2026-11-05T11:00:00.000Z" }] }))).toBe("MAC_JOB_RESULT_KEY_WINDOW");
    // A tampered (re-encoded) manifest no longer matches the signature.
    const tampered = JSON.parse(Buffer.from(f.signed.encoded, "base64url").toString("utf8"));
    tampered.candidate.commit = "e".repeat(40);
    const encoded = Buffer.from(JSON.stringify(tampered)).toString("base64url");
    expect(code(() => verifyMacBuildJob({ ...job(), authority: { ...job().authority, factoryResult: { ...job().authority.factoryResult, encoded } } }, trust))).not.toBe("accepted");
  });
});

describe("macWorker executes only verified, claimed jobs", () => {
  let stagingRoot: string;
  beforeEach(async () => { stagingRoot = await mkdtemp(join(tmpdir(), "mac-job-staging-")); });
  afterEach(async () => { await rm(stagingRoot, { recursive: true, force: true }); });
  const issuer = generateKeyPairSync("ed25519"), verifierKey = generateKeyPairSync("ed25519"), VERIFIER_CREDENTIAL = "verifier-credential-synthetic-0001";
  const files: Record<string, Buffer> = { "dist/index.html": Buffer.from("<!doctype html>hi") };
  const inventory = (c: { commit: string; tree: string }) => ({ schema: "myeve.dashboard.build-inventory/v1", scope: "BROWSER_BUILD_ONLY", sourceCommit: c.commit, sourceTree: c.tree,
    lockSha256: "a".repeat(64), node: "v24.0.0", files: Object.entries(files).map(([path, b]) => ({ path, bytes: b.length, sha256: sha(b) })),
    independentVerification: "NOT_ESTABLISHED", signedResult: false, releaseQualified: false });
  const setup = (builds: Array<{ request: unknown; state: string; artifactSha256: string | null; previewReady: boolean }>, claims = memoryMacJobClaims()) => {
    const verifier = createVerifierHandler({ credentialSha256: [sha(VERIFIER_CREDENTIAL)], expected: project, assurance: "PRIVATE_BETA_LOCAL", paid: false,
      evaluator: { run: async () => ({ outcome: "PASS", usedMicrousd: 0 }) }, signer: ed25519Signer("verifier-1", String(verifierKey.privateKey.export({ type: "pkcs8", format: "pem" }))),
      store: memoryVerifierStore(), artifacts: new ArtifactStagingStore({ root: stagingRoot }), evaluationDeadlineMs: 10_000 });
    const uploads: string[] = [];
    const hosted = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (init?.method === "GET") return Response.json({ builds });
      uploads.push(`${init?.method} ${url.pathname}`);
      return Response.json({ missing: [] });
    }) as typeof fetch;
    const build = vi.fn(async (request: MacBuildRequest) => {
      const inv = inventory(request.candidate), load = async (p: string) => files[p];
      const artifact = await StaticArtifactCandidate.retain(inv, { sourceCommit: request.candidate.commit, sourceTree: request.candidate.tree, lockSha256: "a".repeat(64) }, load);
      const claim = await attestStaticBuild({ binding: request.binding, artifact, keyId: "build-1", builtAt: "2026-11-05T12:00:00.000Z", sign: m => sign(null, Buffer.from(m), issuer.privateKey) });
      return { inventory: inv, lockSha256: "a".repeat(64), claim, load };
    });
    const worker = macWorker({ hosted: { origin: "https://sofie.example.com", credential: "m".repeat(43), fetch: hosted },
      verifier: { origin: "http://127.0.0.1:8795", credential: VERIFIER_CREDENTIAL, fetch: (async (i, init) => verifier(new Request(String(i), init))) as typeof fetch },
      trust, claims, build });
    return { worker, build, uploads, claims };
  };

  it("a fabricated (unsigned) job never reaches build(); nothing is uploaded", async () => {
    const forged = { ...job(), authority: { ...job().authority, factoryResult: { ...job().authority.factoryResult, signature: Buffer.alloc(64).toString("base64url") } } };
    const { worker, build, uploads, claims } = setup([{ request: forged, state: "REQUESTED", artifactSha256: null, previewReady: false }]);
    expect(await worker.once()).toEqual([{ candidate: `${f.candidate.commit}.${f.candidate.tree}`, step: "REFUSED", code: "MAC_JOB_RESULT_SIGNATURE" }]);
    expect(build).not.toHaveBeenCalled();
    expect(uploads).toEqual([]);
    expect(claims.claimed.size).toBe(0);
  });

  it("a foreign or expired job never reaches build()", async () => {
    for (const request of [{ ...job(), authority: macBuildAuthority({ installationId: "prj_tester", ownerId: "tester" }, f.signed) },
      job({ binding: { ...f.binding, deadline: new Date(Date.now() - 1).toISOString() } as never })]) {
      const { worker, build } = setup([{ request, state: "REQUESTED", artifactSha256: null, previewReady: false }]);
      expect((await worker.once())[0]).toMatchObject({ step: "REFUSED" });
      expect(build).not.toHaveBeenCalled();
    }
  });

  it("a valid job builds exactly once; a replay (new worker, same durable claims) never builds again", async () => {
    const claims = memoryMacJobClaims();
    const first = setup([{ request: job(), state: "REQUESTED", artifactSha256: null, previewReady: false }], claims);
    expect(await first.worker.once()).toEqual([{ candidate: `${f.candidate.commit}.${f.candidate.tree}`, step: "BUILT_AND_STAGED" }]);
    expect(first.build).toHaveBeenCalledTimes(1);
    // Restart (fresh process, same claims): the job is re-sent; the recorded output is reused, Docker is never run again.
    const replay = setup([{ request: job(), state: "UPLOADING", artifactSha256: null, previewReady: false }], claims);
    expect(await replay.worker.once()).toEqual([{ candidate: `${f.candidate.commit}.${f.candidate.tree}`, step: "BUILT_AND_STAGED" }]);
    expect(replay.build).not.toHaveBeenCalled();
  });

  it("a claimed-but-unfinished job (crash during build) stays refused; a VERIFIED job without a recorded build is never rebuilt", async () => {
    const claims = memoryMacJobClaims();
    await claims.claim(verifyMacBuildJob(job(), trust).claimKey, {});
    const crashed = setup([{ request: job(), state: "REQUESTED", artifactSha256: null, previewReady: false }], claims);
    expect((await crashed.worker.once())[0]).toMatchObject({ step: "REFUSED", code: "MAC_JOB_ALREADY_CLAIMED" });
    expect(crashed.build).not.toHaveBeenCalled();
    const verified = setup([{ request: job(), state: "VERIFIED", artifactSha256: "f".repeat(64), previewReady: false }]);
    expect((await verified.worker.once())[0]).toMatchObject({ step: "REFUSED", code: "MAC_JOB_NOT_RETAINED" });
    expect(verified.build).not.toHaveBeenCalled();
  });

  it("file claims are durable, exclusive and owner-only", async () => {
    const root = await mkdtemp(join(tmpdir(), "mac-claims-"));
    try {
      expect(() => fileMacJobClaims(join(root, "missing"))).toThrow();
      const claims = fileMacJobClaims(root), key = "a".repeat(64);
      expect(await claims.claim(key, { x: 1 })).toBe("CLAIMED");
      expect(await fileMacJobClaims(root).claim(key, { x: 1 })).toBe("ALREADY");   // a second process sees the claim
      expect(((await stat(join(root, key))).mode & 0o077)).toBe(0);
      expect(await claims.loadBuilt(key)).toBeNull();
      await claims.saveBuilt(key, { inventory: { files: [] }, lockSha256: "a".repeat(64), claim: "{}", files: [{ path: "dist/index.html", bytes: Buffer.from("hi") }] });
      const stored = (await fileMacJobClaims(root).loadBuilt(key))!;
      expect(Buffer.from(await stored.load("dist/index.html")).toString()).toBe("hi");
      await expect(claims.claim("../x", {})).rejects.toBeInstanceOf(MacJobRefused);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
