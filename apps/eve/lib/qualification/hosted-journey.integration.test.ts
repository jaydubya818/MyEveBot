/**
 * HOSTED PRIVATE BETA, END TO END, OVER A LOCAL FAKE MAILBOX POLLER (synthetic; labelled).
 *  - REAL: PostgreSQL mailbox/build/preview tables (0110), hosted mailbox transport + routes, HostedMacMyAppsPort, HttpVerifierPort over the
 *    mailbox (target verifier), the Mac worker (build upload, loopback verifier staging, preview upload), the in-process verifier service
 *    (createVerifierHandler + ArtifactStagingStore, Ed25519 signer, PRIVATE_BETA_LOCAL), the delivery observer and acceptDelivery.
 *  - FAKE / FIXTURE: the poller loop (implements contract v1 lease -> forward -> respond in-process), MyFactory (a connect-protocol health
 *    fixture, not MyFactory), the static build output (synthetic dist files; the Mac's Docker export is not run), Vercel Blob (in-memory),
 *    the evaluator (always PASS, zero usage), the expected build binding (synthetic; production derives it from the retained V4 admission).
 * No network, no provider, no spend.
 */
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { canonical as myappsCanonical } from "../../../../packages/myapps/src/contracts.ts";
import { StaticArtifactCandidate } from "../../../../packages/myapps/src/static-artifact.ts";
import { digest } from "../engineering/contract.ts";
import { leaseMailboxRequest, mailboxFetch, pollerCredentialSha256, respondMailboxRequest, sha256Hex, type MailboxDb } from "../engineering/factory-mailbox.ts";
import { LiveFactoryAdapter } from "../engineering/factory-live-adapter.ts";
import { ArtifactStagingStore } from "./artifact-staging.ts";
import { acceptDelivery } from "./delivery.ts";
import { HostedMacMyAppsPort } from "./hosted-mac-build.ts";
import { macWorker } from "./hosted-mac-worker.ts";
import { HOSTED_ASSURANCE_LABEL, HOSTED_PROFILE, hostedProfileSchema } from "./hosted-profile.ts";
import { attestStaticBuild } from "./static-build-export.ts";
import { verifyVerdict } from "./verdict.ts";
import { buildVerifierHandoff } from "./verifier-handoff.ts";
import { HttpVerifierPort } from "./verifier-port.ts";
import { createVerifierHandler, ed25519Signer, memoryVerifierStore } from "./verifier-service.ts";

const query = vi.hoisted(() => vi.fn());
vi.mock("../../agent/lib/receipts-db.ts", () => ({ db: () => ({ query }) }));
const blobs = vi.hoisted(() => new Map<string, Uint8Array>());
vi.mock("@vercel/blob", () => ({
  put: async (key: string, bytes: Uint8Array, o: { access: string }) => { if (o.access !== "private") throw new Error("public"); blobs.set(key, Buffer.from(bytes)); return {}; },
  get: async (key: string, o: { access: string }) => { if (o.access !== "private") throw new Error("public"); const b = blobs.get(key); return b ? { statusCode: 200, stream: new Blob([new Uint8Array(b)]).stream() } : null; },
}));

const h = (c: string) => c.repeat(64), sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const pem = (k: { publicKey: { export(o: object): string | Buffer } }) => String(k.publicKey.export({ type: "spki", format: "pem" }));
const verifierKey = generateKeyPairSync("ed25519"), issuerKey = generateKeyPairSync("ed25519"), producerKey = generateKeyPairSync("ed25519");
const POLLER = "m".repeat(43), VERIFIER_CREDENTIAL = "verifier-credential-synthetic-0001";
const FACTORY_ORIGIN = "http://127.0.0.1:8792", VERIFIER_ORIGIN = "http://127.0.0.1:8795", HOSTED = "https://sofie.example.com";
const sourceDigest = h("1"), configurationDigest = h("2"), factoryVersion = sha(myappsCanonical({ sourceDigest, configurationDigest }));
const project = { projectSha256: h("5"), sourceSha256: h("6"), protectedSpecificationSha256: h("7"), environment: "myeve-hosted-owner" };
const candidate = { commit: "c".repeat(40), tree: "d".repeat(40) };
const profileJson = {
  profile: HOSTED_PROFILE, role: "OWNER", ownerId: "jay", installationId: "prj_hosted_owner",
  relayOrigin: "https://relay.example.com", missionControlOrigin: "https://mc.example.com", servedOrigin: HOSTED,
  build: { appId: "myeve-dashboard", lockSha256: h("a"), buildProfileDigest: h("b"), issuer: { keyId: "build-1", purpose: "STATIC_BUILD_PROVENANCE_V1", ownerId: "jay",
    factoryId: "myfactory-local-v4", factoryVersion, buildProfileDigest: h("b"), publicKeyPem: pem(issuerKey),
    spkiSha256: sha(issuerKey.publicKey.export({ type: "spki", format: "der" })), notBefore: "2026-01-01T00:00:00.000Z", notAfter: "2099-01-01T00:00:00.000Z", revoked: false } },
  factory: { transport: "MAILBOX", factoryOrigin: FACTORY_ORIGIN, verifierOrigin: VERIFIER_ORIGIN, ownerScope: "myeve.hosted:prj_hosted_owner:jay", spend: "METERED", qualificationMode: "LIVE" },
  verifier: { assurance: "PRIVATE_BETA_LOCAL", label: HOSTED_ASSURANCE_LABEL,
    keys: [{ keyId: "verifier-1", publicKeyPem: pem(verifierKey), activeFrom: "2026-01-01T00:00:00Z", notAfter: "2099-01-01T00:00:00Z" }], producerKeyIds: ["producer-1"], producerPublicKeysPem: [pem(producerKey)] },
  limits: { perWorkMicrousd: 1_300_000, maxWorksPerPerson: 4, automaticIncrease: false },
};
const profile = hostedProfileSchema.parse(profileJson);
const binding = { ownerId: "jay", agentId: "sofie", appId: "myeve-dashboard", workId: "work-3", workVersion: 1, workGeneration: 1, requestId: "request-3", runId: "run-3",
  factoryId: "myfactory-local-v4", factoryVersion, sourceDigest, configurationDigest, inputCommit: "e".repeat(40), inputTree: "f".repeat(40),
  candidateCommit: candidate.commit, candidateTree: candidate.tree, lockSha256: h("a"), buildProfileDigest: h("b"), deadline: "2099-01-01T00:00:00.000Z" };
const files: Record<string, Buffer> = { "dist/index.html": Buffer.from('<!doctype html><script src="/assets/app.js"></script>'), "dist/assets/app.js": Buffer.from("document.body.textContent='small dashboard'") };
const inventory = { schema: "myeve.dashboard.build-inventory/v1", scope: "BROWSER_BUILD_ONLY", sourceCommit: candidate.commit, sourceTree: candidate.tree, lockSha256: h("a"),
  node: "v24.0.0", files: Object.entries(files).map(([path, b]) => ({ path, bytes: b.length, sha256: sha(b) })), independentVerification: "NOT_ESTABLISHED", signedResult: false, releaseQualified: false };

const connection = process.env.MAILBOX_TEST_DATABASE_URL;
describe.skipIf(!connection)("hosted private beta end to end over a local fake mailbox poller (synthetic)", () => {
  let pool: pg.Pool, stagingRoot: string, stop = false, poller: Promise<void>;
  const db: MailboxDb = { query: async (sql, params) => (await pool.query(sql, params as unknown[])).rows };
  const forwarded: string[] = [];
  beforeAll(async () => {
    if (new URL(connection!).hostname !== "127.0.0.1") throw new Error("Use a disposable local fixture database.");
    pool = new pg.Pool({ connectionString: connection, options: "-c search_path=hosted_e2e_fixture", max: 8 });
    await pool.query("DROP SCHEMA IF EXISTS hosted_e2e_fixture CASCADE; CREATE SCHEMA hosted_e2e_fixture");
    await pool.query(await readFile(new URL("../../migrations/0110_hosted_factory_mailbox.sql", import.meta.url), "utf8"));
    await pool.query("INSERT INTO factory_mailbox_pollers(installation_id,owner_id,credential_sha256) VALUES($1,$2,$3)", [profile.installationId, profile.ownerId, pollerCredentialSha256(POLLER)]);
    query.mockImplementation(async (sql: string, params: unknown[]) => (await pool.query(sql, params)).rows);
    vi.stubEnv("MYEVE_HOSTED_PROFILE", JSON.stringify(profileJson)); vi.stubEnv("MYEVE_OWNER_ID", "jay"); vi.stubEnv("DATABASE_URL", connection!);
    vi.stubEnv("MYEVE_SESSION_SECRET", "synthetic fixture session secret at least 32 chars");
    stagingRoot = await mkdtemp(join(tmpdir(), "hosted-e2e-staging-"));
  });
  afterAll(async () => {
    stop = true; await poller;
    vi.unstubAllEnvs();
    if (stagingRoot) await rm(stagingRoot, { recursive: true, force: true });
    if (pool) { await pool.query("DROP SCHEMA hosted_e2e_fixture CASCADE"); await pool.end(); }
  });

  it("hosted Sofie -> mailbox -> Mac Factory (metered) and Mac verifier; Mac-side build and preview; hosted records and serves the private preview", async () => {
    // --- Mac side: the REAL verifier service on its own loopback (in process here) and a MyFactory connect-protocol FIXTURE.
    const verifier = createVerifierHandler({ credentialSha256: [sha(VERIFIER_CREDENTIAL)], expected: project, assurance: "PRIVATE_BETA_LOCAL", paid: false,
      evaluator: { run: async () => ({ outcome: "PASS", usedMicrousd: 0 }) }, signer: ed25519Signer("verifier-1", String(verifierKey.privateKey.export({ type: "pkcs8", format: "pem" }))),
      store: memoryVerifierStore(), artifacts: new ArtifactStagingStore({ root: stagingRoot }), evaluationDeadlineMs: 10_000 });
    const factoryFixture = async (request: Request) => new URL(request.url).pathname === "/api/connect/v1/actions"
      ? Response.json({ controls: ["factory.prepare", "factory.dispatch", "factory.observe", "factory.stop"], execution: { mode: "LIVE", spendEnforced: true } })
      : new Response(null, { status: 404 });
    // --- FAKE poller (contract v1): lease once, forward unchanged to the target's ONE pinned loopback origin, post the reply.
    const binding_ = { installationId: profile.installationId, ownerId: profile.ownerId };
    poller = (async () => {
      while (!stop) {
        const envelope = await leaseMailboxRequest(db, binding_, { waitMs: 200, pollMs: 10 });
        if (!envelope) continue;
        forwarded.push(`${envelope.target} ${envelope.method} ${envelope.path}`);
        const origin = envelope.target === "factory" ? FACTORY_ORIGIN : VERIFIER_ORIGIN, handler = envelope.target === "factory" ? factoryFixture : verifier;
        const body = Buffer.from(envelope.body, "base64");
        const response = await handler(new Request(origin + envelope.path, { method: envelope.method, headers: envelope.headers, ...(body.length ? { body } : {}) }));
        const out = Buffer.from(await response.arrayBuffer()), headers: Record<string, string> = {};
        response.headers.forEach((v, k) => { headers[k] = v; });
        await respondMailboxRequest(db, binding_, { id: envelope.id, leaseId: envelope.leaseId, requestBodySha256: envelope.bodySha256, status: response.status,
          headers, body: out.toString("base64"), bodySha256: sha256Hex(out), bodyEncoding: "base64" });
      }
    })();

    // 1. Hosted -> mailbox -> Factory: the metered LIVE route answers the existing health check.
    const h1 = (c: string) => c.repeat(64);
    const factoryConnection = { origin: FACTORY_ORIGIN, token: h1("a"), factoryId: "myfactory-local-v4", sourceDigest, configurationDigest, factoryVersion: digest({ sourceDigest, configurationDigest }),
      repositoryPath: "/Users/owner/repo", keys: [{ factoryId: "myfactory-local-v4", keyId: "k", publicKey: "pem", activeFrom: "2026-01-01T00:00:00Z", notAfter: "2099-01-01T00:00:00Z" }],
      spendContract: { version: "WORK_LEDGER_V2", sourceDigest },
      qualification: { scopeId: profile.factory.ownerScope, profileHash: h1("3"), evidenceRef: "ev", qualifiedAt: "2026-01-01T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z", mode: "LIVE", spendEnforced: true } } as never;
    expect(await new LiveFactoryAdapter(factoryConnection, mailboxFetch(db, binding_, "factory", FACTORY_ORIGIN, { pollMs: 10 })).healthy()).toBe(true);

    // 2. Hosted retainBuild: nothing built yet -> pending (the journey halts before acceptance and resumes later).
    const port = new HostedMacMyAppsPort({ db, profile, blob: { put: async (k, b) => { blobs.set(k, Buffer.from(b)); }, get: async k => blobs.get(k) ?? null },
      retained: async () => { throw new Error("unused: synthetic binding"); }, bindingFor: async () => binding, project });
    await expect(port.retainBuild(candidate)).rejects.toMatchObject({ code: "QDEV_HOSTED_BUILD_PENDING" });

    // 3. Mac worker: build (synthetic output, real claim signed with the Mac-only issuer key), stage to the local verifier, upload to hosted routes.
    const routes = await hostedRoutes();
    const worker = macWorker({
      hosted: { origin: HOSTED, credential: POLLER, fetch: routes }, verifier: { origin: VERIFIER_ORIGIN, credential: VERIFIER_CREDENTIAL, fetch: (async (input, init) => verifier(new Request(String(input), init))) as typeof fetch },
      build: async request => {
        const pins = { sourceCommit: request.candidate.commit, sourceTree: request.candidate.tree, lockSha256: h("a") };
        const load = async (path: string) => files[path];
        const artifact = await StaticArtifactCandidate.retain(inventory, pins, load);
        const claim = await attestStaticBuild({ binding: request.binding, artifact, keyId: "build-1", builtAt: "2026-11-05T12:00:00.000Z", sign: m => sign(null, Buffer.from(m), issuerKey.privateKey) });
        return { inventory, lockSha256: h("a"), claim, load };
      } });
    expect(await worker.once()).toEqual([{ candidate: `${candidate.commit}.${candidate.tree}`, step: "BUILT_AND_STAGED" }]);
    const { buildArtifactSha256 } = await port.retainBuild(candidate);
    expect(buildArtifactSha256).toMatch(/^[a-f0-9]{64}$/);

    // 4. Hosted -> mailbox -> Mac verifier: handoff + evaluation + verdict (only digest-only calls cross the mailbox; bytes stayed on the Mac).
    const verifierPort = new HttpVerifierPort({ enabled: true, origin: VERIFIER_ORIGIN, credential: () => VERIFIER_CREDENTIAL, fetch: mailboxFetch(db, binding_, "verifier", VERIFIER_ORIGIN, { pollMs: 10 }) });
    const full = { ...candidate, buildArtifactSha256 };
    const handoff = buildVerifierHandoff({ project: { protectedSpecificationSha256: project.protectedSpecificationSha256 } as never, binding: project, candidate: full });
    expect(await verifierPort.submit(handoff, 100_000)).toMatchObject({ known: true });
    const verdict = verifyVerdict({ signed: await verifierPort.fetchVerdict(full), verifierKeys: profile.verifier.keys, producerKeyIds: ["producer-1"],
      producerPublicKeysPem: [pem(producerKey), pem(issuerKey)], expected: { assurance: "PRIVATE_BETA_LOCAL", projectSha256: project.projectSha256, sourceSha256: project.sourceSha256, protectedSpecificationSha256: project.protectedSpecificationSha256, candidateCommit: candidate.commit, candidateTree: candidate.tree, buildArtifactSha256 } });
    expect(verdict.outcome).toBe("PASS");
    expect(forwarded.filter(f => f.startsWith("verifier")).map(f => f.split(" ")[2])).toEqual(["/qdev/v1/handoff", "/qdev/v1/evaluate", "/qdev/v1/verdict"]);

    // 5. Mac worker: PASS -> private preview upload (bytes already in the private store). 6. Hosted observes the served private preview.
    await expect(port.observe(candidate)).rejects.toMatchObject({ code: "QDEV_HOSTED_PREVIEW_PENDING" });
    expect(await worker.once()).toEqual([{ candidate: `${candidate.commit}.${candidate.tree}`, step: "PREVIEW_READY" }]);
    const delivery = acceptDelivery({ observation: await port.observe(candidate), verdict, projectSha256: project.projectSha256, sourceSha256: project.sourceSha256,
      environment: project.environment, baselineCommit: binding.inputCommit });
    expect(delivery.delivery).toMatchObject({ servedBytesSha256: buildArtifactSha256, priorRevision: { kind: "ABSENT" } });
    expect(await worker.once()).toEqual([]);
    expect(forwarded.every(f => !f.includes("/artifact/"))).toBe(true);
  });
});

/** Dispatches the Mac worker's HTTPS calls to the real hosted route handlers (in process). */
async function hostedRoutes(): Promise<typeof fetch> {
  const builds = await import("../../app/api/factory-mailbox/v1/builds/route");
  const buildFile = await import("../../app/api/factory-mailbox/v1/builds/[candidate]/files/[...path]/route");
  const buildDone = await import("../../app/api/factory-mailbox/v1/builds/[candidate]/complete/route");
  const previews = await import("../../app/api/factory-mailbox/v1/previews/route");
  const previewFile = await import("../../app/api/factory-mailbox/v1/previews/[artifact]/files/[...path]/route");
  const previewDone = await import("../../app/api/factory-mailbox/v1/previews/[artifact]/complete/route");
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input)), request = new Request(url, init), p = url.pathname.split("/").filter(Boolean).slice(3);
    const params = <T>(v: T) => ({ params: Promise.resolve(v) });
    if (p[0] === "builds" && p.length === 1) return request.method === "GET" ? builds.GET(request) : builds.POST(request);
    if (p[0] === "builds" && p[2] === "files") return buildFile.PUT(request, params({ candidate: p[1], path: p.slice(3).map(decodeURIComponent) }));
    if (p[0] === "builds" && p[2] === "complete") return buildDone.POST(request, params({ candidate: p[1] }));
    if (p[0] === "previews" && p.length === 1) return previews.POST(request);
    if (p[0] === "previews" && p[2] === "files") return previewFile.PUT(request, params({ artifact: p[1], path: p.slice(3).map(decodeURIComponent) }));
    if (p[0] === "previews" && p[2] === "complete") return previewDone.POST(request, params({ artifact: p[1] }));
    return new Response(null, { status: 404 });
  }) as typeof fetch;
}
