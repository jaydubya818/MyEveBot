import { afterEach, describe, expect, it } from "vitest";
import { createHash, generateKeyPairSync, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { Env, connection } from "./work-test-fixture.ts";
import { SharedAlphaAccounting } from "./shared-accounting.ts";
import { digest } from "../engineering/contract.ts";
import { CanonicalBetaWork } from "../beta-integration/canonical-work.ts";
import { BetaIntegration } from "../beta-integration/runtime.ts";
import { WorkStore } from "../engineering/store.ts";
import { EngineeringWorkerProjectionStore } from "../engineering/worker-projection.ts";
import { canonicalAlphaTasksWork } from "./work-tuple.ts";
import { externalAlphaCanonicalCreate, externalAlphaFactoryAction } from "./work-action.ts";
import { externalAlphaFactoryPinSha256, externalAlphaWorkConfigSchema } from "./work-config.ts";
import { ExternalAlphaWorkController, HttpExternalAlphaFactoryClient, receiptKeys } from "./work-controller.ts";
import { reconcileExternalAlphaAuthorities } from "./reconciliation.ts";
import { publicKeyId } from "./work-authority.ts";
import { readExternalAlphaProofEvidence } from "./work-readback.ts";
import { ProductiveSandboxFixture } from "./productive-sandbox-test-fixture.ts";

// Explicitly opt-in offline qualification: three real disposable PostgreSQL
// databases, generic source, deterministic producer/model transport, and actual
// protected Linux verification. No production/paid call or live authority.
const root = process.env.MYFACTORY_SOURCE_ROOT;
const enabled = !!connection && !!root && process.env.MYEVE_EXTERNAL_ALPHA_PRODUCTIVE_FIXTURE === "1";
const privateCustodyAvailable = !!process.env.FACTORY_VERIFIER_CUSTODY_DIR;
const environments: Env[] = [], transports: ProductiveSandboxFixture[] = [], dockerApis: any[] = [];
afterEach(async () => { await Promise.all(dockerApis.splice(0).map(api => api.cleanup())); await Promise.all(transports.splice(0).map(t => t.close())); await Promise.all(environments.splice(0).map(e => e.close())); });
const imported = (path: string): Promise<any> => import(/* @vite-ignore */ pathToFileURL(join(root!, path)).href);
// Diagnosis reports only controlled status, stages and counts, never envelope,
// source, identity, Result/Proof, private custody or provider exception content.
const journeyDiagnostic = (row: any, transport: ProductiveSandboxFixture, out?: any) => {
  const select = (value: unknown, allowed: string[]) => typeof value === "string" && allowed.includes(value) ? value : null;
  return JSON.stringify({
    state: select(out?.state, ["CONSUMED", "COMPLETED", "CANCELLED", "UNKNOWN"]),
    failure: select(row.resource?.evidence?.failure, ["PROVIDER_OR_STORAGE_ERROR", "HARNESS_PROCESS_FAILED", "HARNESS_PHASE_FAILED", "RELAY_REQUEST_BINDING", "RELAY_DEADLINE", "IMPLEMENTATION_CHECKPOINT_FAILED", "LEASE_FENCED"]),
    failureStage: select(row.resource?.evidence?.failureStage, ["RECOVERY_SCHEDULING", "PRIVATE_SOURCE_CUSTODY", "ALLOCATION", "SANDBOX_READINESS", "HARNESS_INSTALLATION", "SOURCE_MATERIALIZATION", "SOURCE_READY", "EXECUTION", "MODEL_TRANSPORT_INITIALIZATION", "HARNESS_STARTUP", "MODEL_GATEWAY"]),
    producerCleanup: row.resource?.cleanup_confirmed === true, candidate: !!row.custody,
    verification: select(row.verification?.outcome, ["PASS", "FAIL", "UNKNOWN"]),
    verificationFailure: select(row.verification?.failure, ["VERIFIER_PARTIAL", "VERIFIER_EXECUTION_UNKNOWN", "VERIFIER_CUSTODY_BINDING"]),
    verifierCleanup: row.verification?.cleanup_confirmed === true,
    terminal: row.events.some((event: any) => event.type === "factory.terminal"),
    allocations: transport.allocations, modelCalls: transport.modelCalls, deleted: transport.deleted,
  });
};
async function modules() {
  const paths = { runtime: "external-alpha-runtime", control: "external-alpha-control", delivery: "external-alpha-delivery", authority: "external-alpha-authority", readback: "external-alpha-readback", provider: "cloud-work-provider", source: "private-source", custody: "candidate-custody", verifier: "external-alpha-verifier", install: "cloud-harness-install", plan: "cloud-harness-plan", checkpoint: "cloud-harness-checkpoint", workPlan: "cloud-work-plan", price: "production-model-provider" };
  return Object.fromEntries(await Promise.all([...Object.entries(paths).map(async ([key, path]) => [key, await imported("apps/cloud-control/src/" + path + ".mjs")]),
    imported("apps/cloud-control/test/fixtures/protected-docker-sandbox.mjs").then(value => ["docker", value]), imported("apps/supervisor/test/fixtures/alpha-tasks/index.mjs").then(value => ["generic", value])]));
}
async function fixture(kind: "PASS" | "FAIL" | "UNKNOWN" | "QUEUE_UNKNOWN" | "NO_CUSTODY" = "PASS") {
  const m = await modules();
  const sourceFiles = { ...m.generic.baseFiles, "test/priority.test.mjs": m.generic.baseFiles["test/tasks.test.mjs"] };
  const candidate = { ...m.generic.correctFiles(), ...(kind === "FAIL" ? { "src/render.js": m.generic.correctFiles()["src/render.js"].replace("<h1>Alpha Tasks</h1>", "<h1>Changed title</h1>") } : {}) };
  const tree = m.custody.fileTree(sourceFiles).sha, commitBytes = Buffer.from(`tree ${tree}\nauthor Generic Fixture <fixture@invalid> 0 +0000\ncommitter Generic Fixture <fixture@invalid> 0 +0000\n\nGeneric source\n`);
  const commit = createHash("sha1").update(`commit ${commitBytes.length}\0`).update(commitBytes).digest("hex");
  const allowed = ["src/render.js", "src/tasks.js", "test/priority.test.mjs", "test/tasks.test.mjs"].sort();
  const sourceDigest = JSON.parse(await readFile(join(root!, "apps/cloud-control/src/source-identity.json"), "utf8")).sourceDigest;
  const initial = { source: { repository: "fixture-org/myeve-alpha-workspace-01", baseSha: commit, treeSha: tree, sourceDigest, allowedFiles: allowed }, checkCommands: ["npm test"] };
  const factoryVersion = m.runtime.externalAlphaFactoryVersion(initial, sourceDigest);
  const a = await Env.create(true, { repository: initial.source.repository, baseSha: commit, treeSha: tree, sourceDigest, factoryVersion }); environments.push(a);
  const central = await Env.create(false, {}, false); environments.push(central);
  await central.pool.query(await readFile(new URL("./shared-accounting.sql", import.meta.url), "utf8"));
  const accountingToken = "1".repeat(64);
  await central.pool.query("INSERT INTO external_alpha_cohort(id,activated_at)VALUES($1,clock_timestamp())", [a.policy.cohortId]);
  await central.pool.query("INSERT INTO external_alpha_cohort_member(cohort_id,slot,owner_id,policy_sha256,credential_sha256)VALUES($1,'1',$2,$3,encode(sha256(convert_to($4,'UTF8')),'hex'))", [a.policy.cohortId, a.owner, digest(a.policy), accountingToken]);
  a.db.externalAlphaAccounting = new SharedAlphaAccounting(central.db, accountingToken);
  const factoryDb = await Env.create(false, {}, false); environments.push(factoryDb);
  await factoryDb.pool.query("CREATE SCHEMA factory");
  for (const name of ["002-canonical-execution-ledger", "004-canonical-dispatch", "005-cloud-custody", "006-cloud-verification", "009-paid-operation-release", "011-external-alpha-work-authority"]) await factoryDb.pool.query(await readFile(join(root!, "apps/cloud-control/migrations/" + name + ".sql"), "utf8"));
  const token = "generic-factory-test-token-only", claims = { project_id: a.policy.projectId, owner_id: "team_Fixture1", environment: "production", iss: "https://oidc.vercel.com/fixture-team", aud: "https://vercel.com/fixture-team", sub: "owner:fixture-team:project:fixture:environment:production", exp: Math.floor(Date.now() / 1000) + 600 };
  const oidc = "fixture." + Buffer.from(JSON.stringify(claims)).toString("base64url") + ".fixture";
  const installationConfig = { ...initial, factoryVersion, cohortId: a.policy.cohortId, slot: "1", ownerId: a.owner, policySha256: digest(a.policy), application: { clientId: a.policy.clientId, projectId: a.policy.projectId },
    caller: { credentialSha256: createHash("sha256").update(token).digest("hex"), oidc: { issuer: claims.iss, audience: claims.aud, subject: claims.sub, teamId: claims.owner_id } },
    keys: [{ keyId: a.signer.keyId, publicKeyPem: a.signer.publicKey.export({ type: "spki", format: "pem" }), notBefore: "2020-01-01T00:00:00.000Z", notAfter: "2100-01-01T00:00:00.000Z" }] };
  const installation = m.authority.parseExternalAlphaInstallation(installationConfig), receipt = generateKeyPairSync("ed25519"), result = generateKeyPairSync("ed25519");
  const signing = { factoryId: "myfactory-external-alpha", privateKey: result.privateKey.export({ type: "pkcs8", format: "pem" }), key: { factoryId: "myfactory-external-alpha", keyId: "external-alpha-result-v1", publicKey: result.publicKey.export({ type: "spki", format: "pem" }), activeFrom: "2020-01-01T00:00:00Z", notAfter: "2100-01-01T00:00:00Z" } };
  const config = externalAlphaWorkConfigSchema.parse({ allowedFiles: allowed, checkCommands: initial.checkCommands, factory: { origin: "https://fixture-alpha-factory.vercel.app", trustedTeamId: claims.owner_id,
    receiptKeys: [{ keyId: publicKeyId(receipt.publicKey), publicKey: receipt.publicKey.export({ type: "spki", format: "pem" }) }], resultVerification: { factoryId: signing.factoryId, sourceDigest, configurationDigest: digest(m.runtime.externalAlphaConfiguration(installation)), verifierPolicySha256: m.verifier.alphaTasksVerificationPolicySha256, resultKeys: [signing.key] } } });
  const entry = { slot: "slot-1", owner: "fixture-org", repo: "myeve-alpha-workspace-01", commit, tree }, snapshot = m.source.buildSnapshot(entry, { files: sourceFiles, commitBytes });
  const transport = new ProductiveSandboxFixture(m, candidate, kind === "UNKNOWN", sourceFiles); transports.push(transport);
  const docker = m.docker.protectedDockerSandboxApi(); dockerApis.push(docker);
  const queued: any[] = [], queue = { send: async (topic: string, payload: any) => { queued.push({ topic, payload }); if (kind === "QUEUE_UNKNOWN" && topic === m.delivery.externalAlphaWorkTopic) throw Error("ACK_LOST"); return { messageId: "fixture-message-" + queued.length }; } };
  let corruptSource = false;
  const deps = { pool: factoryDb.pool, installation, queue, signing, sourceDigest, deploymentId: "dpl_fixture", registry: { "slot-1": entry }, snapshots: { "slot-1": { repository: initial.source.repository, commit, tree, path: `factory/private-source/slot-1/${snapshot.sha256}.json`, bytes: snapshot.bytes.length, sha256: snapshot.sha256 } }, sourceCustody: { read: async () => ({ bytes: corruptSource ? Buffer.from(snapshot.bytes.toString().replace("Alpha Tasks", "Other Tasks")) : Buffer.from(snapshot.bytes), sha256: snapshot.sha256 }) }, signReceipt: m.authority.receiptSigner(receipt.privateKey.export({ type: "pkcs8", format: "pem" })), signReadback: m.readback.readbackSigner(receipt.privateKey.export({ type: "pkcs8", format: "pem" })),
    providerFactory: ({ spend, plan, privateSource }: any) => m.provider.cloudWorkProvider({ ledger: spend, plan, privateSource, custodyPrefix: "factory/production", sandboxApi: transport.api, blobPut: transport.blobPut, blobGet: transport.blobGet, modelProviderForRow: transport.modelProvider }),
    hostInstallation: { projectId: "prj_fixtureVerifier" }, verifierProfile: { id: "alpha-tasks-node-json-v1", kind: "PRODUCT", tree }, verification: { deps: { ...(kind === "NO_CUSTODY" ? { loadHidden: async () => { throw Error("VERIFIER_CUSTODY_UNAVAILABLE"); } } : {}), sandboxApi: docker, providerOptions: async () => ({ projectId: "prj_fixtureVerifier" }) } } };
  let runtime = m.runtime.externalAlphaRuntimeComponents(deps);
  const factoryEnv = { FACTORY_EXTERNAL_ALPHA_INSTALLATION: JSON.stringify([installationConfig]), FACTORY_EXTERNAL_ALPHA_INSTALLATION_SHA256: digest([installation.sha256]), VERCEL_DEPLOYMENT_ID: "dpl_fixture" };
  let httpReads = 0, httpPosts = 0; const faults = { tamperResult: false };
  const fetcher: typeof fetch = async (url, init) => { if (init?.method === "GET") httpReads++; else httpPosts++; const response = await m.control.handleExternalAlpha(new Request(String(url), init), factoryEnv, { withRuntime: async (_e: any, _i: any, action: any) => action(runtime), verifyToken: async (presented: string) => { if (presented !== oidc) throw Error("FIXTURE_OIDC"); return { payload: claims }; } }); if (faults.tamperResult && String(url).endsWith("/result")) { const payload = await response.json(); if (payload.result) payload.result.signature = "A".repeat(86); return Response.json(payload, { status: response.status }); } return response; };
  const env = { NODE_ENV: "test", MYEVE_EXTERNAL_ALPHA_AUTHORITY_SIGNING_KEY: generateKeyPairSync("ed25519").privateKey.export({type:"pkcs8",format:"pem"}) as string, VERCEL: "1", VERCEL_ENV: "production", VERCEL_PROJECT_ID: a.policy.projectId, MYEVE_OWNER_ID: a.owner, EVE_PROJECT_NAME: "myeve-alpha-tester-1", MYEVE_EXTERNAL_ALPHA_POLICY: JSON.stringify(a.policy), MYEVE_EXTERNAL_ALPHA_POLICY_SHA256: digest(a.policy), MYEVE_EXTERNAL_ALPHA_WORK_CONFIG: JSON.stringify(config), MYEVE_EXTERNAL_ALPHA_FACTORY_ORIGIN: config.factory.origin, MYEVE_EXTERNAL_ALPHA_FACTORY_PIN_SHA256: externalAlphaFactoryPinSha256(a.policy, config) } as NodeJS.ProcessEnv;
  const client = new HttpExternalAlphaFactoryClient(config, { projectId: a.policy.projectId }, { fetcher, token: () => token, oidc: async () => oidc, env }), controller = () => new ExternalAlphaWorkController(a.svc, client, config, receiptKeys(config));
  const actions = { database: a.db, factory: client, signer: a.signer, env }, canonical = canonicalAlphaTasksWork(a.policy.repository, a.owner);
  const created = await Promise.all(Array.from({ length: 4 }, () => a.store.create(externalAlphaCanonicalCreate(canonical, a.owner, env)))); expect(new Set(created.map(c => c.work.id)).size).toBe(1);
  const paused = created[0].work, oldProject = process.env.EVE_PROJECT_NAME; process.env.EVE_PROJECT_NAME = env.EVE_PROJECT_NAME;
  let work;
  try { work = (await new CanonicalBetaWork(new BetaIntegration(a.pool, { repository: a.policy.repository, maxCostUsd: 1.3, maxDurationSeconds: 180 }), () => { throw Error("LEGACY_ADMISSION_UNREACHABLE"); }).control(a.owner, paused.id, paused.version, paused.generation, "resume")).work; }
  finally { if (oldProject === undefined) delete process.env.EVE_PROJECT_NAME; else process.env.EVE_PROJECT_NAME = oldProject; }
  const input = { operation: "start", expectedWorkVersion: work.version, expectedWorkGeneration: work.generation };
  const start = () => externalAlphaFactoryAction(a.store, work.id, input, { sessionId: "fixture-owner-session", callId: randomUUID() }, actions);
  const deliver = (payload = queued.find(q => q.topic === m.delivery.externalAlphaWorkTopic)?.payload) => m.delivery.consumeExternalAlphaDelivery(factoryEnv, payload, { topicName: m.delivery.externalAlphaWorkTopic, region: "iad1", messageId: "fixture-message-1" }, false, { withRuntime: async (_e: any, _i: any, action: any) => action(runtime) });
  return { a, central, factoryDb, m, transport, config, work, paused, input, actions, client, controller, start, deliver, queued, faults, corruptSource: () => { corruptSource = true; }, restart: () => { runtime = m.runtime.externalAlphaRuntimeComponents(deps); }, runtime: () => runtime, reads: () => httpReads, posts: () => httpPosts };
}

describe.skipIf(!enabled)("actual canonical Sofie/Factory productive journey (offline transport qualification)", () => {
  it.skipIf(!privateCustodyAvailable).each(["PASS", "FAIL"] as const)("real queue/custody/protected independent %s Result survives duplicate, reconnect and restart", async verdict => {
    const f = await fixture(verdict); await Promise.all(Array.from({ length: 5 }, () => f.start()));
    expect(f.posts()).toBe(1); expect(f.queued.filter(q => q.topic === f.m.delivery.externalAlphaWorkTopic)).toHaveLength(1);
    await expect(externalAlphaFactoryAction(f.a.store, f.work.id, { ...f.input, expectedWorkVersion: f.paused.version }, { sessionId: "stale", callId: "stale" }, f.actions)).rejects.toThrow(/Reload/);
    const prior = (await f.a.svc.forWork(f.work.id))!;
    const prepare = (await f.a.pool.query("SELECT prepare FROM external_alpha_work_dispatch WHERE authority_id=$1", [prior.id])).rows[0].prepare;
    await Promise.all(Array.from({length: 4}, () => f.client.consume(prior.envelope, prepare, "a".repeat(32))));
    expect(f.queued.filter(q => q.topic === f.m.delivery.externalAlphaWorkTopic)).toHaveLength(1);
    f.restart(); await f.deliver(); expect(f.transport.allocations).toBe(1);
    const authority = (await f.a.svc.forWork(f.work.id))!, row = await f.runtime().store.read(f.a.policy.clientId, authority.requestId);
    expect(f.transport.modelCalls, JSON.stringify(row.resource.evidence)).toBe(2); expect(f.transport.deleted).toBe(1);
    expect(row.resource.evidence.privateSourceTree).toBe(f.a.policy.treeSha); expect(row.custody.candidate_tree).not.toBe(f.a.policy.treeSha);
    f.faults.tamperResult = true;
    const rejected = await f.controller().reconcile(f.work.id, { work: f.work });
    expect((rejected.result as any).rejected).toMatch(/RESULT/); expect(await f.a.count("engineering_native_results")).toBe(0);
    f.faults.tamperResult = false;
    const out = await f.controller().reconcile(f.work.id, { work: f.work }); expect((out.result as any).retained.verdict).toBe(verdict);
    await reconcileExternalAlphaAuthorities(f.controller(), f.a.store); f.restart(); await f.deliver(); await f.deliver();
    const reads = f.reads(), replay = await externalAlphaFactoryAction(f.a.store, f.work.id, { ...f.input, operation: "reconcile" }, { sessionId: "new-browser-session", callId: "reconnect" }, f.actions);
    expect(replay.result?.replay).toBe(true); expect(replay.result?.verdict).toBe(verdict); expect(f.reads()).toBe(reads);
    const projected = await new EngineeringWorkerProjectionStore(f.a.store).get(f.work.id);
    expect(projected.projection.externalAlpha?.result?.verdict).toBe(verdict); expect(projected.projection.nativeResult?.proof.outcome).toBe(verdict === "FAIL" ? "FAILED" : "PARTIAL");
    expect(projected.projection.externalAlpha?.result?.producerChecks).toBe("PASS");
    expect(projected.projection.externalAlpha?.result?.producerOutcome).toBe(verdict === "PASS" ? "COMPLETED" : "FAILED");
    const refs = projected.projection.nativeResult!.proof.artifactRefs.filter(r => r.startsWith("factory-evidence:")); expect(refs).toHaveLength(2);
    for (const ref of refs) expect(await readExternalAlphaProofEvidence(f.a.store, f.work.id, replay.result!.resultId, ref)).not.toBeNull();
    const foreign = new WorkStore({scopeId: randomUUID(), actorId: randomUUID(), scopeKind: "personal"}, f.a.db as any);
    await expect(readExternalAlphaProofEvidence(foreign, f.work.id, replay.result!.resultId, refs[0])).rejects.toThrow(/not found in this workspace/);
    expect(await f.a.count("external_alpha_work_authority")).toBe(1); expect(await f.a.count("engineering_native_results")).toBe(1);
    expect((await f.central.pool.query("SELECT state FROM external_alpha_cohort_dispatch")).rows[0].state).toBe("SETTLED");
    expect(Number((await f.central.pool.query("SELECT sum(ceiling_microusd)::bigint n FROM external_alpha_cohort_admission")).rows[0].n)).toBe(1300000); expect(f.transport.modelCalls).toBe(2);
  }, 180000);
  it("missing private verifier custody retains a productive candidate as PARTIAL without acceptance", async () => {
    const f = await fixture("NO_CUSTODY"); await f.start(); await f.deliver();
    const out = await f.controller().reconcile(f.work.id, { work: f.work });
    const observed = await f.runtime().store.read(f.a.policy.clientId, (await f.a.svc.forWork(f.work.id))!.requestId);
    expect(observed.verification.outcome).toBe("UNKNOWN");
    expect(observed.verification.cleanup_confirmed).toBe(true);
    expect((out.result as any).retained.verdict).toBe("PARTIAL");
    const projection = (await new EngineeringWorkerProjectionStore(f.a.store).get(f.work.id)).projection;
    expect(projection.externalAlpha?.result?.producerChecks).toBe("PASS");
    expect(projection.externalAlpha?.result?.verdict).toBe("PARTIAL");
    expect(projection.nativeResult?.proof.outcome).toBe("PARTIAL");
    expect(projection.readiness.ready).toBe(false);
    expect(f.transport.modelCalls).toBe(2); expect(f.transport.allocations).toBe(1); expect(f.transport.deleted).toBe(1);
    expect((await f.central.pool.query("SELECT state FROM external_alpha_cohort_dispatch")).rows[0].state).toBe("SETTLED");
    const reads = f.reads(); await f.controller().reconcile(f.work.id, { work: f.work }); expect(f.reads()).toBe(reads);
  }, 60000);
  it("known cancellation before delivery allocates nothing and settles authenticated cleanup truth", async () => {
    const f = await fixture(); await f.start(); await externalAlphaFactoryAction(f.a.store, f.work.id, { ...f.input, operation: "stop" }, { sessionId: "owner", callId: "stop" }, f.actions);
    await f.deliver(); await f.controller().reconcile(f.work.id, { work: await f.a.store.get(f.work.id) });
    expect(f.transport.allocations).toBe(0); expect(f.transport.modelCalls).toBe(0); expect(await f.a.count("engineering_native_results")).toBe(0); expect(await f.a.count("external_alpha_work_terminal_settlement")).toBe(1);
    expect((await f.central.pool.query("SELECT state FROM external_alpha_cohort_dispatch")).rows[0].state).toBe("SETTLED");
  }, 60000);
  it("lost queue acknowledgment fences both stores and cannot allocate or dispatch after restart", async () => {
    const f = await fixture("QUEUE_UNKNOWN"); await f.start(); expect((await f.a.svc.forWork(f.work.id))?.state).toBe("UNKNOWN"); f.restart(); await expect(f.deliver()).rejects.toThrow(/AUTHORITY_UNKNOWN_FENCE|DELIVERY_UNKNOWN|DELIVERY_BINDING_MISMATCH/);
    expect((await f.factoryDb.pool.query("SELECT state FROM factory.delivery_intents")).rows[0].state).toBe("UNKNOWN");
    const observed = await f.controller().reconcile(f.work.id, { work: f.work }); expect(observed.state, JSON.stringify(observed)).toBe("UNKNOWN"); await f.start(); expect(f.queued.filter(q => q.topic === f.m.delivery.externalAlphaWorkTopic)).toHaveLength(1);
    expect(f.transport.allocations).toBe(0); expect(f.posts()).toBe(1); expect((await f.a.svc.forWork(f.work.id))?.state).toBe("UNKNOWN"); expect((await f.central.pool.query("SELECT state FROM external_alpha_cohort_dispatch")).rows[0].state).toBe("UNKNOWN");
  }, 60000);
  it("ambiguous model transport records UNKNOWN once, cleans producer and never retries/refunds", async () => {
    const f = await fixture("UNKNOWN"); await f.start(); await f.deliver(); await f.controller().reconcile(f.work.id, { work: f.work }); f.restart(); await f.deliver();
    expect(f.transport.modelCalls).toBe(1); expect(f.transport.deleted).toBe(1); expect((await f.a.svc.forWork(f.work.id))?.state).toBe("UNKNOWN"); expect(await f.a.count("engineering_native_results")).toBe(0); expect((await f.central.pool.query("SELECT state FROM external_alpha_cohort_dispatch")).rows[0].state).toBe("UNKNOWN");
  }, 60000);
  it("digest-corrupt private source fails before allocation and remains fenced without durable cleanup proof", async () => {
    const f = await fixture(); f.corruptSource(); await f.start(); await expect(f.deliver()).rejects.toThrow(/WORK_UNRESOLVED/);
    f.restart(); await expect(f.deliver()).rejects.toThrow(/RECONCILIATION_TOO_EARLY|LEASE_STILL_ACTIVE/);
    const out = await f.controller().reconcile(f.work.id, {work: f.work});
    expect(out.state).toBe("UNKNOWN"); expect(f.transport.allocations).toBe(0); expect(f.transport.modelCalls).toBe(0);
    expect(await f.a.count("engineering_native_results")).toBe(0); expect(await f.a.count("external_alpha_work_terminal_settlement")).toBe(0);
    expect((await f.central.pool.query("SELECT state FROM external_alpha_cohort_dispatch")).rows[0].state).toBe("UNKNOWN");
  }, 60000);
  it.skipIf(!privateCustodyAvailable)("a terminal candidate cannot close a changed Work revision or become its current Proof", async () => {
    const f = await fixture(); await f.start(); await f.deliver();
    const authority = (await f.a.svc.forWork(f.work.id))!, row = await f.runtime().store.read(f.a.policy.clientId, authority.requestId);
    const diagnostic = journeyDiagnostic(row, f.transport);
    expect(!!row.custody, diagnostic).toBe(true);
    expect(row.verification?.outcome, diagnostic).toBe("PASS");
    expect(row.verification?.cleanup_confirmed, diagnostic).toBe(true);
    expect(row.events.some((event: any) => event.type === "factory.terminal"), diagnostic).toBe(true);
    const changed = await f.a.store.change(f.work.id, {operation: "pause", expectedVersion: f.work.version});
    const out = await f.controller().reconcile(f.work.id, {work: f.work});
    expect(out.result, journeyDiagnostic(row, f.transport, out)).toBeDefined();
    expect((out.result as any).rejected).toMatch(/WORK_CHANGED/);
    expect(await f.a.count("engineering_native_results")).toBe(0); expect((await f.a.svc.forWork(f.work.id))?.state).toBe("CONSUMED");
    expect((await new EngineeringWorkerProjectionStore(f.a.store).get(changed.id)).projection.latestResult).toBeNull();
    expect(f.transport.modelCalls).toBe(2);
  }, 180000);

});
