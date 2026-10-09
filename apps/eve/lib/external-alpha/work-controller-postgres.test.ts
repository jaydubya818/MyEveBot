import { readExternalAlphaProofEvidence, readExternalAlphaWork } from "./work-readback.ts";
import { BetaIntegration } from "../beta-integration/runtime.ts";
import { CanonicalBetaWork } from "../beta-integration/canonical-work.ts";
import { WorkStore } from "../engineering/store.ts";
import { EngineeringWorkerProjectionStore } from "../engineering/worker-projection.ts";
import { currentTruthLines } from "../engineering/current-truth-lines.ts";
import { readFile } from "node:fs/promises";
import { SharedAlphaAccounting } from "./shared-accounting.ts";
import { afterEach, describe, expect, it } from "vitest";
import { generateKeyPairSync, randomUUID, sign, type KeyObject } from "node:crypto";
import { digest } from "../engineering/contract.ts";
import { ExternalAlphaAllowance } from "./allowance.ts";
import {
  authorityDigest,
  requestIdFor,
  verifyWorkAuthority,
  writerIdFor,
  type WorkAuthorityEnvelope,
} from "./work-authority.ts";
import {
  ExternalAlphaWorkController,
  FactoryDenied,
  RECEIPT_DOMAIN,
  settleTerminalReadback,
  externalAlphaWorkConfigSchema,
  type ExternalAlphaFactoryClient,
  type ExternalAlphaWorkConfig,
} from "./work-controller.ts";
import { alphaTasksCriteria, alphaTasksCriteriaSha256, sha256Hex } from "./work-tuple.ts";
import { connection, Env, files } from "./work-test-fixture.ts";
import { buildSignedResult, fixtureFactoryVersion } from "./result-test-fixture.ts";
import { proofOfWorkSchema } from "../digital-worker/contracts.ts";
import { publicKeyId } from "./work-authority.ts";
import { externalAlphaCanonicalCreate, externalAlphaFactoryAction } from "./work-action.ts";
import { externalAlphaFactoryPinSha256, externalAlphaWorkEnabled } from "./work-config.ts";
import { bindDispatch, dispatchBinding, READBACK_DOMAIN } from "./dispatch-readback.ts";
import { reconcileExternalAlphaAuthorities } from "./reconciliation.ts";
import { engineeringWorkEnabled } from "../engineering/deployment-mode.ts";

import {FakeFactory} from './factory-test-fixture.ts';

async function setup(activate = true, existing?: Env) {
  const e = existing ?? await Env.create(activate);
  const keys = new Map([[e.signer.keyId, e.signer.publicKey]]);
  const factory = new FakeFactory({ myeveKeys: keys, policy: e.policy, allowedFiles: files, now: () => Date.now() });
  const config: ExternalAlphaWorkConfig = e.workConfig([
    { keyId: publicKeyId(factory.receiptKey.publicKey), publicKey: factory.receiptKey.publicKey.export({ type: "spki", format: "pem" }) as string },
  ]);
  const rk = new Map([[publicKeyId(factory.receiptKey.publicKey), factory.receiptKey.publicKey]]);
  const controller = new ExternalAlphaWorkController(e.svc, factory, config, rk);
  return { e, factory, controller, config, rk };
}

describe.skipIf(!connection)("external alpha Work controller, Factory consumption and shared accounting (real PostgreSQL)", () => {
  const envs: Env[] = [];
  const make = async (activate = true) => {
    const s = await setup(activate);
    envs.push(s.e);
    return s;
  };
  afterEach(async () => {
    await Promise.all(envs.splice(0).map((e) => e.close()));
  }, 60000);

  it("runs the exact path: canonical Work, durable allowance, signed authority, independent Factory validation, one consumption, receipt", async () => {
    const { e, factory, controller } = await make();
    const work = await e.seedWork();
    const out = await controller.start(work);
    expect(out.sent).toBe(true);
    if (!out.sent) return;
    expect(out.authority.state).toBe("CONSUMED");
    expect(factory.posts).toBe(1);
    expect(out.authority.requestId).toBe(requestIdFor(out.authority.id));
    expect(out.readback.authorityReceipt.authoritySha256).toBe(out.authority.documentSha256);
    expect(await e.count("external_alpha_allowance", "kind='WORK' AND state='OPEN'")).toBe(1);
  });

  it("sends exactly once under 24 concurrent duplicate deliveries, and never on later refreshes", async () => {
    const { e, factory, controller } = await make();
    const work = await e.seedWork();
    const results = await Promise.allSettled(Array.from({ length: 24 }, () => controller.start(work)));
    expect(factory.posts).toBe(1);
    expect(results.filter((r) => r.status === "fulfilled" && r.value.sent)).toHaveLength(1);
    await controller.start(work);
    await controller.start(await e.store.get(work.id));
    expect(factory.posts).toBe(1);
    expect(await e.count("external_alpha_work_authority")).toBe(1);
  });

  it("denies generic owner controls after external authority exists without invalidating its Work generation", async () => {
    const {e,controller}=await make();const work=await e.seedWork();await controller.start(work);
    const canonical=new CanonicalBetaWork(new BetaIntegration(e.pool,{repository:e.policy.repository,maxCostUsd:1.3,maxDurationSeconds:180}));
    for(const operation of ['pause','resume','continue'] as const)
      await expect(canonical.control(e.owner,work.id,work.version,work.generation,operation)).rejects.toMatchObject({code:'external_alpha_control_required',status:409});
    const saved=await e.store.get(work.id);expect([saved.version,saved.generation,saved.control]).toEqual([work.version,work.generation,'agent']);
    expect((await e.svc.forWork(work.id))?.state).toBe('CONSUMED');
  });

  it("the reference Factory consumes once even if MyEve replays the same authority (defence in depth)", async () => {
    const { e, factory, controller } = await make();
    const out = await controller.start(await e.seedWork());
    if (!out.sent) throw Error("expected sent");
    const prepare = (await import("./work-controller.ts")).prepareRequest(out.authority, await e.store.get(out.authority.workId), controller.config);
    const again = await factory.consume(out.authority.envelope, prepare); // same identity: idempotent
    expect((again as any).workOrderId).toBe(out.readback.workOrderId);
    await expect(factory.consume(out.authority.envelope, { ...prepare, requestId: randomUUID() })).rejects.toThrow(/AUTHORITY_IDENTIFIER/);
    expect(factory.consumed.size).toBe(1);
  });

  it("the Factory denies a tampered bound field presented with a valid signature elsewhere", async () => {
    const { e, factory, controller } = await make();
    const out = await controller.start(await e.seedWork()).catch(() => null);
    expect(out).not.toBeNull();
    const fresh = await make();
    const a = await fresh.e.svc.issue(await fresh.e.seedWork(), files);
    const prepare = (await import("./work-controller.ts")).prepareRequest(a, await fresh.e.store.get(a.workId), fresh.config);
    const bad: Array<[string, (p: any) => void, RegExp]> = [
      ["files", (p) => p.input.allowedPaths.push("src/extra.ts"), /AUTHORITY_FILES/],
      ["base", (p) => (p.source.commit = "9".repeat(40)), /AUTHORITY_SOURCE/],
      ["tree", (p) => (p.source.tree = "9".repeat(40)), /AUTHORITY_SOURCE/],
      ["repository", (p) => (p.repository = "x/y"), /AUTHORITY_SOURCE/],
      ["work", (p) => (p.workId = randomUUID()), /AUTHORITY_WORK/],
      ["generation", (p) => (p.workGeneration = 2), /AUTHORITY_WORK/],
      ["objective", (p) => (p.input.description = "other"), /AUTHORITY_WORK/],
      ["criteria", (p) => (p.input.acceptanceCriteria = alphaTasksCriteria.slice(1)), /AUTHORITY_TUPLE/],
      ["spend", (p) => (p.maxSpendUsd = 5), /AUTHORITY_LIMITS/],
      ["request", (p) => (p.requestId = randomUUID()), /AUTHORITY_IDENTIFIER/],
      ["deadline", (p) => (p.deadline = new Date(Date.now() + 3600_000).toISOString()), /AUTHORITY_EXPIRED/],
    ];
    for (const [name, f, re] of bad) {
      const p = structuredClone(prepare) as any;
      f(p);
      await expect(fresh.factory.consume(a.envelope, p), name).rejects.toThrow(re);
    }
    const forged: WorkAuthorityEnvelope = { ...a.envelope, document: { ...a.envelope.document, ownerId: randomUUID() } };
    await expect(fresh.factory.consume(forged, prepare)).rejects.toThrow(/AUTHORITY_SIGNATURE/);
    const expired = new FakeFactory({ myeveKeys: new Map([[fresh.e.signer.keyId, fresh.e.signer.publicKey]]), policy: fresh.e.policy, allowedFiles: files, now: () => Date.now() + 400_000 });
    await expect(expired.consume(a.envelope, prepare)).rejects.toThrow(/AUTHORITY_EXPIRED/);
    expect(fresh.factory.consumed.size).toBe(0);
    void e;
    void factory;
  });

  it("an ambiguous transport failure becomes UNKNOWN, is never re-sent, and fences all further paid dispatch", async () => {
    const { e, factory, controller } = await make();
    const work = await e.seedWork();
    factory.failWith = Error("ECONNRESET");
    await expect(controller.start(work)).rejects.toThrow(/DISPATCH_UNKNOWN/);
    factory.failWith = null;
    expect(await controller.start(work).then((o) => o.sent)).toBe(false);
    expect(factory.posts).toBe(1);
    const rec = await e.svc.forWork(work.id);
    expect(rec?.state).toBe("UNKNOWN");
    const unknownProjection = await new EngineeringWorkerProjectionStore(e.store).get(work.id);
    expect(currentTruthLines(unknownProjection.projection).join("\n")).toMatch(/UNKNOWN exposure unresolved request/);
    await expect(new ExternalAlphaAllowance(e.db, e.policy).admit({ kind: "CHAT", bindingId: "x:1", requestSha256: "c".repeat(64) })).rejects.toThrow(/fences|EXTERNAL_ALPHA_SHARED_FENCED/);
  });

  it("an unverifiable Factory receipt fences as UNKNOWN", async () => {
    const { e, factory, controller } = await make();
    factory.corruptReceipt = true;
    await expect(controller.start(await e.seedWork())).rejects.toThrow(/DISPATCH_UNKNOWN/);
    expect(await e.count("external_alpha_allowance", "state='UNKNOWN'")).toBe(1);
  });

  it("a definitive Factory denial cancels the authority without fencing, and the allowance is still charged", async () => {
    const { e, factory, controller } = await make();
    factory.failWith = new FactoryDenied("AUTHORITY_FILES");
    const work = await e.seedWork();
    await expect(controller.start(work)).rejects.toThrow(/AUTHORITY_FILES/);
    expect((await e.svc.forWork(work.id))?.state).toBe("CANCELLED");
    expect(await e.count("external_alpha_allowance", "state='UNKNOWN'")).toBe(0);
    factory.failWith = null;
    await expect(controller.start(await e.seedWork())).rejects.toThrow(/EXTERNAL_ALPHA_SHARED_EXHAUSTED/);
  });

  it("records Factory productive and completion operations in the same ledger exactly once and completes at quiescence", async () => {
    const { e, factory, controller } = await make();
    const work = await e.seedWork();
    await controller.start(work);
    factory.ops = [
      { id: "op-1", phase: "productive", state: "settled", actual: 120000 },
      { id: "op-2", phase: "productive", state: "settled", actual: 80000 },
      { id: "op-3", phase: "completion", state: "settled", actual: 50000 },
    ];
    factory.state = "COMPLETED";
    factory.quiescent = true;
    const saved = (await e.svc.forWork(work.id))!;
    factory.resultPayload = buildSignedResult({ authority: saved, work, workOrderId: (saved.receipt as any).workOrderId, keys: e.resultKeys, opts: { requestDigest: factory.requestDigest(saved.requestId) } }).signed;
    const [r1, r2] = await Promise.all([controller.reconcile(work.id, { work }), controller.reconcile(work.id, { work })]);
    await controller.reconcile(work.id);
    expect([r1.state, r2.state].every((s) => ["COMPLETED", "CONSUMED"].includes(s as string))).toBe(true);
    const rows = (await e.pool.query("SELECT source,spent_microusd,state FROM external_alpha_operation ORDER BY step_key")).rows;
    expect(rows).toHaveLength(3);
    expect(rows.map((r: any) => r.source).sort()).toEqual(["FACTORY_COMPLETION", "FACTORY_PRODUCTIVE", "FACTORY_PRODUCTIVE"]);
    expect(rows.reduce((n: number, r: any) => n + Number(r.spent_microusd), 0)).toBe(250000);
    expect((await e.svc.forWork(work.id))?.state).toBe("COMPLETED");
    expect((await e.pool.query("SELECT state FROM external_alpha_allowance WHERE kind='WORK'")).rows[0].state).toBe("COMPLETED");
  });

  it("ingests the signed Result before closing: pending until published, retained once, PARTIAL shown as PARTIAL, replay and tamper safe", async () => {
    const { e, factory, controller } = await make();
    const work = await e.seedWork();
    const started = await controller.start(work);
    if (!started.sent) throw Error("expected sent");
    factory.ops = [
      { id: "op-1", phase: "productive", state: "settled", actual: 120000 },
      { id: "op-3", phase: "completion", state: "settled", actual: 50000 },
    ];
    factory.state = "COMPLETED";
    factory.quiescent = true;
    // The Factory has not published the Result: nothing closes, the owner sees nothing yet.
    const pending: any = await controller.reconcile(work.id, { work });
    expect(pending.result).toEqual({ pending: true });
    expect((await e.svc.forWork(work.id))?.state).toBe("CONSUMED");
    expect(await e.count("engineering_native_results")).toBe(0);
    // A tampered Result is rejected, retained nowhere, and the authority stays open.
    const good = buildSignedResult({ authority: started.authority, work, workOrderId: started.readback.workOrderId, keys: e.resultKeys, opts: { verification: "UNKNOWN", requestDigest: factory.requestDigest(started.authority.requestId) } }).signed;
    const bad = structuredClone(good);
    bad.signature = "A".repeat(86);
    factory.resultPayload = bad;
    expect(((await controller.reconcile(work.id, { work })) as any).result.rejected).toBe("EXTERNAL_ALPHA_RESULT_UNVERIFIED");
    expect(await e.count("engineering_native_results")).toBe(0);
    expect((await e.svc.forWork(work.id))?.state).toBe("CONSUMED");
    // The genuine Result (verifier outcome UNKNOWN) is retained as PARTIAL and the authority settles once.
    factory.resultPayload = { result: good, verdict: "PASS" };
    const done: any = await controller.reconcile(work.id, { work });
    expect(done.state).toBe("COMPLETED");
    expect(done.result.retained.verdict).toBe("PARTIAL");
    expect(done.result.settlement).toMatchObject({ settled: true, authorityState: "COMPLETED" });
    const proof = proofOfWorkSchema.parse((await e.pool.query("SELECT proof FROM engineering_native_results")).rows[0].proof);
    expect(proof.outcome).toBe("PARTIAL");
    expect(proof.evidence.some((x) => x.state === "PASS")).toBe(false);
    // Replay (retry after a lost response) changes nothing and never settles twice.
    const again: any = await controller.reconcile(work.id, { work });
    expect(again.state).toBe("COMPLETED");
    expect(await e.count("engineering_native_results")).toBe(1);
    expect(await e.count("external_alpha_work_result")).toBe(1);
    expect(await e.count("external_alpha_operation", "source LIKE 'FACTORY%'")).toBe(2);
  });

  it("still retains a published Result when Factory exposure is UNKNOWN, and settles it as a fence; unpublished + UNKNOWN fences at once", async () => {
    const a = await make();
    const workA = await a.e.seedWork();
    const startedA = await a.controller.start(workA);
    if (!startedA.sent) throw Error("expected sent");
    a.factory.ops = [{ id: "op-1", phase: "productive", state: "unknown" }];
    a.factory.state = "COMPLETED";
    a.factory.quiescent = true;
    a.factory.resultPayload = buildSignedResult({ authority: startedA.authority, work: workA, workOrderId: startedA.readback.workOrderId, keys: a.e.resultKeys, opts: { requestDigest: a.factory.requestDigest(startedA.authority.requestId) } }).signed;
    const outA: any = await a.controller.reconcile(workA.id, { work: workA });
    expect(outA.state).toBe("UNKNOWN");
    expect(outA.result.retained.verdict).toBe("PASS");
    expect(outA.result.settlement).toMatchObject({ settled: true, exposureUnknown: true, authorityState: "UNKNOWN" });
    expect(await a.e.count("engineering_native_results")).toBe(1);
    const b = await make();
    const workB = await b.e.seedWork();
    await b.controller.start(workB);
    b.factory.ops = [{ id: "op-1", phase: "productive", state: "unknown" }];
    b.factory.state = "COMPLETED";
    b.factory.quiescent = true;
    const outB: any = await b.controller.reconcile(workB.id, { work: workB });
    expect(outB.state).toBe("UNKNOWN");
    expect(outB.result).toBeUndefined();
    expect(await b.e.count("engineering_native_results")).toBe(0);
  });

  it("keeps UNKNOWN Factory exposure charged at its full reservation and fences the owner/cohort", async () => {
    const { e, factory, controller } = await make();
    const work = await e.seedWork();
    await controller.start(work);
    factory.ops = [
      { id: "op-1", phase: "productive", state: "settled", actual: 100000 },
      { id: "op-2", phase: "productive", state: "unknown" },
    ];
    const out = await controller.reconcile(work.id);
    expect(out.state).toBe("UNKNOWN");
    const rows = (await e.pool.query("SELECT state,reserved_microusd,spent_microusd FROM external_alpha_operation ORDER BY step_key")).rows;
    expect(rows.find((r: any) => r.state === "UNKNOWN")).toMatchObject({ reserved_microusd: "900000", spent_microusd: null });
    // Later "settled" or "released" reports can not release or reuse it.
    factory.ops = [
      { id: "op-1", phase: "productive", state: "settled", actual: 100000 },
      { id: "op-2", phase: "productive", state: "settled", actual: 0 },
    ];
    await controller.reconcile(work.id).catch(() => {});
    const after = (await e.pool.query("SELECT state,reserved_microusd,spent_microusd FROM external_alpha_operation WHERE step_key=$1", ["factory:op-2:0"])).rows[0];
    expect(after).toMatchObject({ state: "UNKNOWN", reserved_microusd: "900000", spent_microusd: null });
    expect(await e.count("external_alpha_allowance", "state='UNKNOWN'")).toBe(1);
    await expect(new ExternalAlphaAllowance(e.db, e.policy).admit({ kind: "CHAT", bindingId: "x:2", requestSha256: "c".repeat(64) })).rejects.toThrow(/fences|EXTERNAL_ALPHA_SHARED_FENCED/);
  });

  it("fences when the Factory reports more operations than its authority permits", async () => {
    const { e, factory, controller } = await make();
    const work = await e.seedWork();
    const out = await controller.start(work);
    if (!out.sent) throw Error("sent");
    for (const [i, id] of ["a", "b", "c"].entries())
      await e.svc.recordFactoryOperation(out.authority, { operationId: id, phase: "productive", state: "settled", actualMicrousd: 10000 * (i + 1), reservedMicrousd: 200000, model: "m", pricingRevision: "r" });
    const fourth = await e.svc.recordFactoryOperation(out.authority, { operationId: "d", phase: "productive", state: "settled", actualMicrousd: 1, reservedMicrousd: 200000, model: "m", pricingRevision: "r" });
    expect(fourth.state).toBe("UNKNOWN");
    expect(fourth.result).toEqual({ overBound: true });
    expect(await e.count("external_alpha_allowance", "state='UNKNOWN'")).toBe(1);
    void factory;
  });

  it("charges the remaining Factory UNKNOWN envelope once across multiple ambiguous operation reports", async () => {
    const { e, factory, controller } = await make();
    const work = await e.seedWork();
    await controller.start(work);
    factory.ops = [
      { id: "known", phase: "productive", state: "settled", actual: 100000 },
      { id: "ambiguous-one", phase: "productive", state: "unknown" },
      { id: "ambiguous-two", phase: "completion", state: "unknown" },
    ];
    expect((await controller.reconcile(work.id)).state).toBe("UNKNOWN");
    const rows = (await e.pool.query("SELECT id,state,reserved_microusd,spent_microusd,covered_by_operation_id FROM external_alpha_operation ORDER BY reserved_microusd DESC")).rows;
    expect(rows.map((r: any) => r.reserved_microusd)).toEqual(["900000", "100000", "0"]);
    expect(rows[2]).toMatchObject({ state: "UNKNOWN", spent_microusd: null, covered_by_operation_id: rows[0].id });
    expect((await e.pool.query("SELECT sum(COALESCE(spent_microusd,reserved_microusd))::bigint amount FROM external_alpha_operation")).rows[0].amount).toBe("1000000");
    await expect(e.pool.query("UPDATE external_alpha_operation SET covered_by_operation_id=NULL WHERE id=$1", [rows[2].id])).rejects.toThrow(/coverage is immutable/);
  });

  it("caps combined Sofie and Factory model operations at five and $1.30 per Work, with exact-once settlement", async () => {
    const { e, controller } = await make();
    const work = await e.seedWork();
    const out = await controller.start(work);
    if (!out.sent) throw Error("sent");
    const budget = new ExternalAlphaAllowance(e.db, e.policy);
    const sofie = async (n: number, microusd = 100000) => {
      const op = await budget.reserve({ allowanceId: out.authority.allowanceId, stepKey: `sess:${n}`, requestSha256: sha256Hex("s" + n), microusd });
      return budget.settle(op, microusd, { ok: n });
    };
    await sofie(1);
    await sofie(2);
    // The Sofie share is two operations.
    await expect(sofie(3)).rejects.toThrow(/budget exhausted/);
    for (const id of ["f1", "f2", "f3"])
      await e.svc.recordFactoryOperation(out.authority, { operationId: id, phase: "productive", state: "settled", actualMicrousd: 100000, reservedMicrousd: 200000, model: "m", pricingRevision: "r" });
    const total = (await e.pool.query("SELECT count(*)::int n,sum(spent_microusd)::bigint s FROM external_alpha_operation")).rows[0];
    expect(total).toEqual({ n: 5, s: "500000" });
    // Settlement happens once.
    const op = (await e.pool.query("SELECT * FROM external_alpha_operation WHERE source='SOFIE' LIMIT 1")).rows[0];
    await expect(budget.settle({ ...op, id: op.id, allowance_id: op.allowance_id, request_sha256: op.request_sha256, reserved_microusd: op.reserved_microusd } as any, 1, {})).rejects.toThrow(/incremental settlement/);
    expect((await e.pool.query("SELECT spent_microusd FROM external_alpha_operation WHERE id=$1", [op.id])).rows[0].spent_microusd).toBe("100000");
    // Replay of a Factory operation does not change exposure.
    await e.svc.recordFactoryOperation(out.authority, { operationId: "f1", phase: "productive", state: "settled", actualMicrousd: 1, reservedMicrousd: 200000, model: "m", pricingRevision: "r" });
    expect((await e.pool.query("SELECT sum(spent_microusd)::bigint s FROM external_alpha_operation")).rows[0].s).toBe("500000");
  });

  it("stops: before dispatch it cancels the authority; after consumption it stops the exact request and closes", async () => {
    const a = await make();
    const w1 = await a.e.seedWork();
    await a.e.svc.issue(w1, files);
    expect((await a.controller.stop(w1.id)).state).toBe("CANCELLED");
    expect(a.factory.posts).toBe(0);
    const b = await make();
    const w2 = await b.e.seedWork();
    const out = await b.controller.start(w2);
    if (!out.sent) throw Error("sent");
    const stopped = await b.controller.stop(w2.id);
    expect(b.factory.stops).toEqual([out.authority.requestId]);
    expect(stopped.state).toBe("CANCELLED");
  });

  it("a revoked policy blocks the send even after issuance", async () => {
    const { e, factory, controller } = await make();
    const work = await e.seedWork();
    await e.svc.issue(work, files);
    await e.pool.query("UPDATE external_alpha_policy SET revoked_at=clock_timestamp()");
    await expect(controller.start(work)).rejects.toThrow();
    expect(factory.posts).toBe(0);
    expect((await e.svc.sweep()).revoked).toBe(1);
  });

  it("Sofie tool action: idempotent start, owner and revision binding, missing signing key fails closed", async () => {
    const { e, factory, config } = await make();
    const work = await e.seedWork();
    const env = {
      VERCEL: "1", VERCEL_ENV: "production", VERCEL_PROJECT_ID: e.policy.projectId, MYEVE_OWNER_ID: e.owner,
      MYEVE_EXTERNAL_ALPHA_POLICY: JSON.stringify(e.policy), MYEVE_EXTERNAL_ALPHA_POLICY_SHA256: digest(e.policy),
      MYEVE_EXTERNAL_ALPHA_WORK_CONFIG: JSON.stringify(config), MYEVE_EXTERNAL_ALPHA_FACTORY_ORIGIN: config.factory.origin, EVE_PROJECT_NAME: "myeve-alpha-tester-1",
      MYEVE_EXTERNAL_ALPHA_FACTORY_PIN_SHA256: externalAlphaFactoryPinSha256(e.policy, config),
    } as unknown as NodeJS.ProcessEnv;
    const input = { operation: "start", expectedWorkVersion: work.version, expectedWorkGeneration: work.generation };
    const effect = { sessionId: "sess", callId: "call-1" };
    // No signing key: nothing is issued.
    expect(externalAlphaWorkEnabled(env)).toBe(false);
    await expect(externalAlphaFactoryAction(e.store, work.id, input, effect, { database: e.db, factory, env })).rejects.toThrow(/SIGNING_KEY_REQUIRED/);
    expect(await e.count("external_alpha_work_authority")).toBe(0);
    const withKey = { ...env, MYEVE_EXTERNAL_ALPHA_AUTHORITY_SIGNING_KEY: generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }) as string } as NodeJS.ProcessEnv;
    expect(externalAlphaWorkEnabled(withKey)).toBe(true);
    expect(engineeringWorkEnabled(withKey)).toBe(true);
    const deps = { database: e.db, factory, env: withKey, signer: e.signer };
    await expect(externalAlphaFactoryAction(e.store, work.id, { ...input, expectedWorkVersion: 9 }, effect, deps)).rejects.toThrow(/Reload the current Work/);
    const foreign = new (e.store.constructor as any)({ scopeId: randomUUID(), actorId: randomUUID(), scopeKind: "personal" }, e.db);
    await expect(externalAlphaFactoryAction(foreign, work.id, input, effect, deps)).rejects.toThrow(/Owner scope denied/);
    const first = await externalAlphaFactoryAction(e.store, work.id, input, effect, deps);
    const refresh = await externalAlphaFactoryAction(e.store, work.id, input, { sessionId: "sess2", callId: "call-9" }, deps);
    expect(first.state).toBe("STARTED");
    expect(refresh.state).toBe("ALREADY_CONSUMED");
    expect(refresh.requestId).toBe(first.requestId);
    expect(factory.posts).toBe(1);
    expect((await externalAlphaFactoryAction(e.store, work.id, { ...input, operation: "reconcile" }, effect, deps)).state).toBe("CONSUMED");
    expect((await externalAlphaFactoryAction(e.store, work.id, { ...input, operation: "stop" }, effect, deps)).state).toBe("CANCELLED");
  });
  it("retains the first dispatch bytes immutably and rejects a different deadline for the same request", async () => {
    const { e, controller } = await make();
    const work = await e.seedWork();
    const started = await controller.start(work);
    if (!started.sent) throw Error("sent");
    const row = (await e.pool.query("SELECT * FROM external_alpha_work_dispatch")).rows[0];
    expect(row.request_digest).toBe(digest(row.prepare));
    await expect(bindDispatch(e.db, started.authority, { ...row.prepare, deadline: new Date(Date.now() + 1000).toISOString() })).rejects.toThrow(/DISPATCH_CONFLICT/);
    await expect(e.pool.query("UPDATE external_alpha_work_dispatch SET request_digest=$1", ["f".repeat(64)])).rejects.toThrow(/immutable/);
    await expect(e.pool.query("DELETE FROM external_alpha_work_dispatch")).rejects.toThrow(/immutable/);
  });

  it("unsigned compatibility fields cannot close an authority or settle spend", async () => {
    const { e, factory, controller } = await make();
    const work = await e.seedWork();
    await controller.start(work);
    factory.readbackMutate = r => { r.state = "COMPLETED"; r.quiescent = true; r.spend = {}; };
    expect((await controller.reconcile(work.id, { work })).state).toBe("CONSUMED");
    expect(await e.count("external_alpha_operation")).toBe(0);
    expect(await e.count("engineering_native_results")).toBe(0);
  });

  it("a replayed readback challenge fences without recording its forged terminal accounting", async () => {
    const { e, factory, controller } = await make();
    const work = await e.seedWork();
    const started = await controller.start(work);
    if (!started.sent) throw Error("sent");
    factory.replayReadback = await factory.read(started.authority.requestId, "a".repeat(48));
    const out = await controller.reconcile(work.id, { work });
    expect(out.state).toBe("UNKNOWN");
    expect(await e.count("external_alpha_operation")).toBe(0);
    expect(await controller.start(work).then(r => r.sent)).toBe(false);
    expect(factory.posts).toBe(1);
  });

  it("receipt-only and tampered signed spend readbacks never qualify", async () => {
    for (const mutate of [
      (r: any) => { delete r.readbackAttestation; delete r.readbackSignature; },
      (r: any) => { r.readbackAttestation.spendDigest = "f".repeat(64); },
    ]) {
      const { e, factory, controller } = await make();
      factory.readbackMutate = mutate;
      await expect(controller.start(await e.seedWork())).rejects.toThrow(/DISPATCH_UNKNOWN/);
      expect(await e.count("external_alpha_allowance", "state='UNKNOWN'")).toBe(1);
    }
  });

  it("a restarted durable caller retains a later Result once under duplicate sweep delivery without redispatch", async () => {
    const { e, factory, controller, config, rk } = await make();
    const work = await e.seedWork();
    const started = await controller.start(work);
    if (!started.sent) throw Error("sent");
    factory.state = "COMPLETED"; factory.quiescent = true;
    const restarted = new ExternalAlphaWorkController(e.svc, factory, config, rk);
    await reconcileExternalAlphaAuthorities(restarted, e.store);
    expect((await e.svc.forWork(work.id))?.state).toBe("CONSUMED");
    factory.resultPayload = buildSignedResult({ authority: started.authority, work, workOrderId: started.readback.workOrderId, keys: e.resultKeys, opts: { requestDigest: factory.requestDigest(started.authority.requestId) } }).signed;
    await Promise.all(Array.from({ length: 8 }, () => reconcileExternalAlphaAuthorities(restarted, e.store)));
    expect(await e.count("engineering_native_results")).toBe(1);
    expect(await e.count("external_alpha_work_result", "settlement_state='SETTLED'")).toBe(1);
    expect(factory.posts).toBe(1);
    expect((await e.svc.forWork(work.id))?.state).toBe("COMPLETED");
  });

  it.each(["cancel", "takeover"] as const)("durable reconciliation stops the exact consumed request after owner %s and never projects stale evidence", async operation => {
    const { e, factory, controller } = await make();
    const work = await e.seedWork();
    const started = await controller.start(work);
    if (!started.sent) throw Error("sent");
    await e.store.change(work.id, { operation, expectedVersion: work.version });
    await reconcileExternalAlphaAuthorities(controller, e.store);
    expect(factory.stops).toEqual([started.authority.requestId]);
    expect((await e.svc.forWork(work.id))?.state).toBe("CANCELLED");
    expect(await e.count("engineering_native_results")).toBe(0);
    expect(factory.posts).toBe(1);
  });

  it.each(["ISSUED", "DISPATCHING", "CONSUMED"] as const)("durable expiry sweep fences or expires %s without restarting or reclaiming the writer", async state => {
    const { e, factory, controller } = await make();
    const work = await e.seedWork();
    const saved = state === "CONSUMED" ? (await controller.start(work)).authority : await e.svc.issue(work, files);
    if (state === "DISPATCHING") await e.svc.claim(saved);
    // Disposable PostgreSQL fixture time travel, with production guard restored.
    await e.pool.query("ALTER TABLE external_alpha_work_authority DISABLE TRIGGER external_alpha_work_authority_guard");
    await e.pool.query("UPDATE external_alpha_work_authority SET issued_at=issued_at-interval '400 seconds',expires_at=expires_at-interval '400 seconds' WHERE id=$1", [saved.id]);
    await e.pool.query("ALTER TABLE external_alpha_work_authority ENABLE TRIGGER external_alpha_work_authority_guard");
    const swept = await e.svc.sweep();
    expect(state === "ISSUED" ? swept.expired : swept.unknown).toBe(1);
    expect((await e.svc.forWork(work.id))?.state).toBe(state === "ISSUED" ? "EXPIRED" : "UNKNOWN");
    const before = factory.posts;
    await controller.start(work);
    await controller.reconcile(work.id, { work });
    expect(factory.posts).toBe(before);
    expect(await e.count("external_alpha_work_authority")).toBe(1);
  });

  it("terminal reserved exposure is retained at its full amount and fences rather than appearing settled", async () => {
    const { e, factory, controller } = await make();
    const work = await e.seedWork();
    await controller.start(work);
    factory.state = "FAILED"; factory.quiescent = true;
    factory.ops = [{ id: "reserved-at-death", phase: "productive", state: "reserved" }];
    expect((await controller.reconcile(work.id, { work })).state).toBe("UNKNOWN");
    const row = (await e.pool.query("SELECT * FROM external_alpha_operation")).rows[0];
    expect(row.state).toBe("UNKNOWN");
    expect(Number(row.reserved_microusd)).toBe(1000000);
    expect(row.spent_microusd).toBeNull();
  });

  it.each(["FAILED", "CANCELLED"] as const)("retains a signed useful candidate for terminal %s with an honest failed/partial Proof", async terminal => {
    const { e, factory, controller } = await make();
    const work = await e.seedWork();
    const started = await controller.start(work);
    if (!started.sent) throw Error("sent");
    factory.state = terminal; factory.quiescent = true;
    factory.verdict = terminal === "FAILED" ? "FAIL" : "PARTIAL";
    factory.resultPayload = buildSignedResult({ authority: started.authority, work, workOrderId: started.readback.workOrderId, keys: e.resultKeys,
      opts: { verification: terminal === "FAILED" ? "FAIL" : "UNKNOWN", requestDigest: factory.requestDigest(started.authority.requestId), mutate: m => { m.status = terminal; } } }).signed;
    const out: any = await controller.reconcile(work.id, { work });
    expect(out.result.retained.verdict).toBe(factory.verdict);
    expect(await e.count("engineering_native_results")).toBe(1);
    const proof = (await e.pool.query("SELECT proof FROM engineering_native_results")).rows[0].proof;
    expect(proof.outcome).toBe(terminal === "FAILED" ? "FAILED" : "PARTIAL");
    expect(proof.evidence.some((x: any) => x.state === "PASS")).toBe(false);
  });

  it.each(["FAILED", "CANCELLED", "NOT_DISPATCHED"] as const)("retains immutable authenticated no-candidate terminal %s cleanup/accounting facts", async terminal => {
    const { e, factory, controller, rk } = await make();
    const work = await e.seedWork();
    const started = await controller.start(work);
    if (!started.sent) throw Error("sent");
    factory.state = terminal; factory.quiescent = true; factory.verdict = "NONE";
    factory.ops = [{ id: "paid-before-terminal", phase: "productive", state: "settled", actual: 100000 }];
    const out: any = await controller.reconcile(work.id, { work });
    expect(out.state).toBe(terminal === "FAILED" ? "COMPLETED" : "CANCELLED");
    expect(await e.count("external_alpha_work_terminal_settlement")).toBe(1);
    expect(await e.count("engineering_native_results")).toBe(0);
    const row = (await e.pool.query("SELECT * FROM external_alpha_work_terminal_settlement")).rows[0];
    expect(row).toMatchObject({ authority_id: started.authority.id, owner_id: e.owner, request_id: started.authority.requestId,
      work_id: work.id, work_version: work.version, work_generation: work.generation, cleanup_confirmed: true,
      result_verdict: "NONE", settlement_state: "SETTLED", exposure_unknown: false });
    expect(row.request_digest).toBe(factory.requestDigest(started.authority.requestId));
    expect(row.readback_sha256).toBe(digest(row.readback));
    expect((await e.pool.query("SELECT sum(spent_microusd)::integer n FROM external_alpha_operation")).rows[0].n).toBe(100000);
    const challenge = "c".repeat(48);
    const raw = await factory.read(started.authority.requestId, challenge);
    const replay = await settleTerminalReadback(e.svc, started.authority, raw, rk, await dispatchBinding(e.db, started.authority), challenge);
    expect(replay.replay).toBe(true);
    expect(await e.count("external_alpha_work_terminal_settlement")).toBe(1);
    await expect(e.pool.query("UPDATE external_alpha_work_terminal_settlement SET cleanup_confirmed=false")).rejects.toThrow(/immutable/);
    await expect(e.pool.query("DELETE FROM external_alpha_work_terminal_settlement")).rejects.toThrow(/immutable/);
  });

  it("a lost post-commit reconciliation acknowledgement restarts from the immutable terminal fact without another dispatch", async () => {
    const { e, factory, controller, config, rk } = await make();
    const work = await e.seedWork();
    const started = await controller.start(work);
    if (!started.sent) throw Error("sent");
    factory.state = "CANCELLED"; factory.quiescent = true; factory.verdict = "NONE";
    const sweep = e.svc.sweep.bind(e.svc);
    e.svc.sweep = async () => { throw Error("lost shared reconciliation acknowledgment"); };
    await expect(controller.reconcile(work.id, { work })).rejects.toThrow(/acknowledgment/);
    expect(await e.count("external_alpha_work_terminal_settlement")).toBe(1);
    expect((await e.svc.forWork(work.id))?.state).toBe("CANCELLED");
    e.svc.sweep = sweep;
    const restarted = new ExternalAlphaWorkController(e.svc, factory, config, rk);
    await reconcileExternalAlphaAuthorities(restarted, e.store);
    expect(await e.count("external_alpha_work_terminal_settlement")).toBe(1);
    expect(factory.posts).toBe(1);
    expect(await e.count("engineering_native_results")).toBe(0);
  });

  it("rejects foreign owner, forged receipt/spend/run and terminal labels without authenticated cleanup facts", async () => {
    const { e, factory, controller, rk } = await make();
    const work = await e.seedWork();
    const started = await controller.start(work);
    if (!started.sent) throw Error("sent");
    factory.state = "CANCELLED"; factory.quiescent = true; factory.verdict = "NONE";
    const challenge = "d".repeat(48);
    const binding = await dispatchBinding(e.db, started.authority);
    const raw = await factory.read(started.authority.requestId, challenge);
    for (const mutate of [
      (r: any) => { r.readbackAttestation.authoritySha256 = "f".repeat(64); },
      (r: any) => { r.readbackAttestation.spendDigest = "f".repeat(64); },
      (r: any) => { r.readbackAttestation.runId = randomUUID(); },
      (r: any) => { r.authorityReceipt.ownerId = randomUUID(); },
      (r: any) => { r.readbackAttestation.quiescent = false; },
    ]) {
      const bad = structuredClone(raw); mutate(bad);
      await expect(settleTerminalReadback(e.svc, started.authority, bad, rk, binding, challenge)).rejects.toThrow(/UNVERIFIED|INVALID/);
    }
    expect(await e.count("external_alpha_work_terminal_settlement")).toBe(0);
    await expect(e.pool.query("SELECT external_alpha_terminal_settle($1::jsonb)", [JSON.stringify({ ownerId: randomUUID(), policySha256: digest(e.policy), authorityId: started.authority.id })])).rejects.toThrow(/TERMINAL_OWNER/);
    await e.svc.finish(started.authority.id, "CANCELLED", { reason: "OWNER_STOP_UNPROVED" });
    expect(await e.count("external_alpha_work_terminal_settlement")).toBe(0);
  });

  it("records original consumed and observed cancelled Work revisions separately and never projects a new candidate", async () => {
    const { e, factory, controller } = await make();
    const work = await e.seedWork();
    const started = await controller.start(work);
    if (!started.sent) throw Error("sent");
    const cancelled = await e.store.change(work.id, { operation: "cancel", expectedVersion: work.version });
    await reconcileExternalAlphaAuthorities(controller, e.store);
    const fact = (await e.pool.query("SELECT * FROM external_alpha_work_terminal_settlement")).rows[0];
    expect(fact.work_version).toBe(work.version);
    expect(fact.work_generation).toBe(work.generation);
    const current = await e.store.get(work.id);
    expect(fact.observed_work_version).toBe(current.version);
    expect(fact.observed_work_generation).toBe(current.generation);
    expect(current.lifecycle).toBe("cancelled");
    expect(await e.count("engineering_native_results")).toBe(0);
    expect(factory.posts).toBe(1);
    void cancelled;
  });

  it.each(["FAILED", "CANCELLED", "NOT_DISPATCHED"] as const)("closed readback repeats exact %s terminal truth without a Factory read or mutation", async terminal => {
    const { e, factory, controller } = await make();
    const work = await e.seedWork();
    await controller.start(work);
    factory.state = terminal; factory.quiescent = true; factory.verdict = "NONE";
    const first: any = await controller.reconcile(work.id, { work });
    expect(first.terminalSettlement.factoryState).toBe(terminal);
    const [before] = (await e.pool.query("SELECT to_jsonb(t) AS fact FROM external_alpha_work_terminal_settlement t")).rows;
    const reads = factory.reads;
    const posts = factory.posts;
    for (let i = 0; i < 3; i++) {
      const refresh: any = await controller.reconcile(work.id, { work });
      expect(refresh.terminalSettlement).toEqual({ replay: true, authorityState: first.state, factoryState: terminal });
      expect(refresh.readback).toBeUndefined();
    }
    expect(factory.reads).toBe(reads); expect(factory.posts).toBe(posts);
    const [after] = (await e.pool.query("SELECT to_jsonb(t) AS fact FROM external_alpha_work_terminal_settlement t")).rows;
    expect(after).toEqual(before);
  });

  async function sharedPair() {
    const central = await Env.create(false, {}, false); envs.push(central);
    await central.pool.query(await readFile(new URL("./shared-accounting.sql", import.meta.url), "utf8"));
    const cohortId = randomUUID();
    const a = await Env.create(true, { cohortId }); envs.push(a);
    const b = await Env.create(true, { cohortId, slot: "2", repository: a.policy.repository.slice(0, -1) + "2" }); envs.push(b);
    await central.pool.query("INSERT INTO external_alpha_cohort(id)VALUES($1)", [cohortId]);
    for (const [e, token] of [[a, "1".repeat(64)], [b, "2".repeat(64)]] as const) {
      await central.pool.query(`INSERT INTO external_alpha_cohort_member(cohort_id,slot,owner_id,policy_sha256,credential_sha256)
        VALUES($1,$2,$3,$4,encode(sha256(convert_to($5,'UTF8')),'hex'))`, [cohortId, e.policy.slot, e.owner, digest(e.policy), token]);
      e.db.externalAlphaAccounting = new SharedAlphaAccounting(central.db, token);
    }
    await central.pool.query("UPDATE external_alpha_cohort SET activated_at=clock_timestamp() WHERE id=$1", [cohortId]);
    const app = await setup(true, a);
    const chat = (id: string) => new ExternalAlphaAllowance(b.db, b.policy).admit({ kind: "CHAT", bindingId: id, requestSha256: digest(id) });
    return { central, a, b, app, chat };
  }

  it("the actual shared lease stays fenced for a bare consumed cancellation but clears from the exact authenticated terminal fact", async () => {
    const unproved = await sharedPair();
    const work = await unproved.a.seedWork();
    const started = await unproved.app.controller.start(work);
    if (!started.sent) throw Error("sent");
    await expect(unproved.chat("before-proof")).rejects.toThrow(/SHARED_FENCED/);
    await unproved.a.svc.finish(started.authority.id, "CANCELLED", { reason: "OWNER_STOP_UNPROVED" });
    await unproved.a.svc.sweep();
    await expect(unproved.chat("after-label")).rejects.toThrow(/SHARED_FENCED/);
    expect(await unproved.a.count("external_alpha_work_terminal_settlement")).toBe(0);
    const centralState = (await unproved.central.pool.query("SELECT state FROM external_alpha_cohort_dispatch")).rows[0].state;
    expect(centralState).toBe("DISPATCHED");
    // Isolated second scenario: one singleton central database per fixture.
    const proved = await sharedPair();
    const w = await proved.a.seedWork();
    await proved.app.controller.start(w);
    await expect(proved.chat("before-known-proof")).rejects.toThrow(/SHARED_FENCED/);
    proved.app.factory.state = "FAILED"; proved.app.factory.quiescent = true; proved.app.factory.verdict = "NONE";
    await proved.app.controller.reconcile(w.id, { work: w });
    expect(await proved.a.count("external_alpha_work_terminal_settlement")).toBe(1);
    expect((await proved.central.pool.query("SELECT state FROM external_alpha_cohort_dispatch")).rows[0].state).toBe("SETTLED");
    await expect(proved.chat("after-known-proof")).resolves.toMatchObject({ kind: "CHAT" });
    expect(Number((await proved.central.pool.query("SELECT sum(ceiling_microusd)::bigint n FROM external_alpha_cohort_admission")).rows[0].n)).toBe(1400000);
  }, 30000);

  it("central settlement outage is repaired after restart from the exact terminal fact without another paid dispatch", async () => {
    const { central, a, app, chat } = await sharedPair();
    const work = await a.seedWork();
    await app.controller.start(work);
    a.db.externalAlphaAccounting = new SharedAlphaAccounting({ query: async (q, p) => {
      if (JSON.parse(p![0] as string).mode === "settle") throw Error("simulated central outage before acknowledgment");
      return central.db.query(q, p);
    } }, "1".repeat(64));
    app.factory.state = "CANCELLED"; app.factory.quiescent = true; app.factory.verdict = "NONE";
    await expect(app.controller.reconcile(work.id, { work })).rejects.toThrow(/SHARED_UNAVAILABLE/);
    expect(await a.count("external_alpha_work_terminal_settlement")).toBe(1);
    expect((await a.svc.forWork(work.id))?.state).toBe("CANCELLED");
    await expect(chat("still-fenced")).rejects.toThrow(/SHARED_FENCED/);
    a.db.externalAlphaAccounting = new SharedAlphaAccounting(central.db, "1".repeat(64));
    const restarted = new ExternalAlphaWorkController(a.svc, app.factory, app.config, app.rk);
    await reconcileExternalAlphaAuthorities(restarted, a.store);
    expect((await central.pool.query("SELECT state FROM external_alpha_cohort_dispatch")).rows[0].state).toBe("SETTLED");
    await expect(chat("after-restart-proof")).resolves.toMatchObject({ kind: "CHAT" });
    expect(app.factory.posts).toBe(1);
    expect(await a.count("engineering_native_results")).toBe(0);
  }, 30000);

  it("a lost acknowledgment after central settlement commits replays the same immutable fact and retains the full admission charge", async () => {
    const { central, a, app, chat } = await sharedPair();
    const work = await a.seedWork();
    await app.controller.start(work);
    let loseAcknowledgment = true;
    a.db.externalAlphaAccounting = new SharedAlphaAccounting({ query: async (q, p) => {
      const rows = await central.db.query(q, p);
      if (loseAcknowledgment && JSON.parse(p![0] as string).mode === "settle") {
        loseAcknowledgment = false;
        throw Error("simulated acknowledgment loss after central commit");
      }
      return rows;
    } }, "1".repeat(64));
    app.factory.state = "CANCELLED"; app.factory.quiescent = true; app.factory.verdict = "NONE";
    await expect(app.controller.reconcile(work.id, { work })).rejects.toThrow(/SHARED_UNAVAILABLE/);
    expect(await a.count("external_alpha_work_terminal_settlement")).toBe(1);
    expect((await central.pool.query("SELECT state FROM external_alpha_cohort_dispatch")).rows[0].state).toBe("SETTLED");
    expect(Number((await central.pool.query("SELECT sum(ceiling_microusd)::bigint n FROM external_alpha_cohort_admission")).rows[0].n)).toBe(1300000);
    a.db.externalAlphaAccounting = new SharedAlphaAccounting(central.db, "1".repeat(64));
    const restarted = new ExternalAlphaWorkController(a.svc, app.factory, app.config, app.rk);
    await reconcileExternalAlphaAuthorities(restarted, a.store);
    await reconcileExternalAlphaAuthorities(restarted, a.store);
    expect(await a.count("external_alpha_work_authority")).toBe(1);
    expect(await a.count("external_alpha_work_terminal_settlement")).toBe(1);
    expect((await central.pool.query("SELECT count(*)::integer n FROM external_alpha_cohort_dispatch")).rows[0].n).toBe(1);
    await expect(chat("after-committed-settlement")).resolves.toMatchObject({ kind: "CHAT" });
    expect(Number((await central.pool.query("SELECT sum(ceiling_microusd)::bigint n FROM external_alpha_cohort_admission")).rows[0].n)).toBe(1400000);
    expect(app.factory.posts).toBe(1);
    expect(await a.count("engineering_native_results")).toBe(0);
  }, 30000);


  it("records authenticated Factory UNKNOWN immediately after retaining its consumption receipt", async () => {
    const e = await Env.create(); envs.push(e); const app = await setup(true, e), work = await e.seedWork();
    app.factory.state = "UNKNOWN";
    const outcome = await app.controller.start(work);
    expect(outcome.authority.state).toBe("UNKNOWN"); expect(outcome.authority.receipt).not.toBeNull();
    await app.controller.start(work); expect(app.factory.posts).toBe(1);
  });

  it.each(["PASS", "FAIL", "UNKNOWN"] as const)("canonical Sofie journey replays durable %s Result and exact evidence after reconnect/restart without another dispatch", async verification => {
    const { central, a, b, app } = await sharedPair();
    const env = { NODE_ENV: "test", MYEVE_EXTERNAL_ALPHA_AUTHORITY_SIGNING_KEY: generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }) as string, VERCEL: "1", VERCEL_ENV: "production", VERCEL_PROJECT_ID: a.policy.projectId, MYEVE_OWNER_ID: a.owner,
      MYEVE_EXTERNAL_ALPHA_POLICY: JSON.stringify(a.policy), MYEVE_EXTERNAL_ALPHA_POLICY_SHA256: digest(a.policy),
      MYEVE_EXTERNAL_ALPHA_WORK_CONFIG: JSON.stringify(app.config), MYEVE_EXTERNAL_ALPHA_FACTORY_ORIGIN: app.config.factory.origin, EVE_PROJECT_NAME: "myeve-alpha-tester-1",
      MYEVE_EXTERNAL_ALPHA_FACTORY_PIN_SHA256: externalAlphaFactoryPinSha256(a.policy, app.config) } as NodeJS.ProcessEnv;
    const canonical = externalAlphaCanonicalCreate({ title: "Alpha Tasks: add a Priority field",
      objective: "In the Alpha Tasks project, add a Priority field (exactly Low|Medium|High) shown on the task list.", repository: a.policy.repository,
      maxCostUsd: 1.3, maxDurationSeconds: 180, criteria: alphaTasksCriteria.map(statement => ({ statement, method: "test" })) }, a.owner, env);
    const created = await Promise.all(Array.from({ length: 6 }, () => a.store.create(canonical)));
    expect(new Set(created.map(c => c.work.id)).size).toBe(1);
    expect(created.filter(c => c.created)).toHaveLength(1);
    const paused = created[0].work;
    const oldProject = process.env.EVE_PROJECT_NAME;
    process.env.EVE_PROJECT_NAME = "myeve-alpha-tester-1";
    let work: Awaited<ReturnType<typeof a.store.get>>;
    try {
      const beta = new BetaIntegration(a.pool, { repository: a.policy.repository, maxCostUsd: 1.3, maxDurationSeconds: 180 });
      const ownerFlow = new CanonicalBetaWork(beta, () => { throw Error("LEGACY_NATIVE_ADMISSION_UNREACHABLE"); });
      const resumed = await ownerFlow.control(a.owner, paused.id, paused.version, paused.generation, "resume");
      expect(resumed.admission).toMatchObject({ status: "SOFIE_REQUIRED", receipt: null });
      work = resumed.work;
    } finally { if (oldProject === undefined) delete process.env.EVE_PROJECT_NAME; else process.env.EVE_PROJECT_NAME = oldProject; }
    const deps = { database: a.db, factory: app.factory, signer: a.signer, env };
    const input = { operation: "start", expectedWorkVersion: work.version, expectedWorkGeneration: work.generation };
    await Promise.all(Array.from({ length: 8 }, (_, i) => externalAlphaFactoryAction(a.store, work.id, input, { sessionId: "fixture-session", callId: "duplicate-" + i }, deps)));
    expect(app.factory.posts).toBe(1);
    const authority = (await a.svc.forWork(work.id))!;
    expect(await a.count("external_alpha_work_authority")).toBe(1);
    await expect(externalAlphaFactoryAction(a.store, work.id, { ...input, expectedWorkVersion: paused.version }, { sessionId: "reconnect", callId: "stale" }, deps)).rejects.toThrow(/Reload/);
    const running = await new EngineeringWorkerProjectionStore(a.store).get(work.id);
    expect(running.projection.externalAlpha?.state).toBe("CONSUMED");
    expect(running.projection.readiness.ready).toBe(false);
    expect(currentTruthLines(running.projection).join("\n")).toMatch(/not fresh Factory liveness/);
    app.factory.state = "COMPLETED"; app.factory.quiescent = true;
    app.factory.ops = [{ id: "productive-1", phase: "productive", state: "settled", actual: 120000 }];
    app.factory.resultPayload = buildSignedResult({ authority, work, workOrderId: (authority.receipt as any).workOrderId, keys: a.resultKeys,
      opts: { verification, requestDigest: app.factory.requestDigest(authority.requestId) } }).signed;
    await reconcileExternalAlphaAuthorities(new ExternalAlphaWorkController(a.svc, app.factory, app.config, app.rk), a.store);
    const reads = app.factory.reads;
    const action = await externalAlphaFactoryAction(a.store, work.id, { ...input, operation: "reconcile" }, { sessionId: "new-browser-session", callId: "refresh" }, deps);
    const expected = verification === "UNKNOWN" ? "PARTIAL" : verification;
    expect(action.result?.verdict).toBe(expected);
    expect(action.result?.replay).toBe(true);
    expect(app.factory.reads).toBe(reads);
    const projected = await new EngineeringWorkerProjectionStore(a.store).get(work.id);
    expect(projected.projection.externalAlpha?.result?.verdict).toBe(expected);
    expect(projected.projection.externalAlpha?.result?.producerChecks).toBe("PASS");
    expect(currentTruthLines(projected.projection).join("\n")).toContain("producer checks PASS; independent verifier " + expected);
    expect(projected.projection.nativeResult?.proof.outcome).toBe(verification === "FAIL" ? "FAILED" : "PARTIAL");
    expect(projected.projection.latestResult?.id).toBe(action.result?.resultId);
    expect(projected.projection.readiness.ready).toBe(false);
    const refs = projected.projection.nativeResult!.proof.artifactRefs.filter(r => r.startsWith("factory-evidence:"));
    expect(refs).toHaveLength(2);
    const evidence = await Promise.all(refs.map(ref => readExternalAlphaProofEvidence(a.store, work.id, action.result!.resultId, ref)));
    expect(evidence.map(e => e!.ref.kind).sort()).toEqual(["DiffEvidence", "TestEvidence"]);
    const corrupt = new WorkStore(a.store.principal, { query: async (sql, params) => {
      const rows = await a.db.query(sql, params);
      return sql.includes("SELECT r.*,n.proof") ? rows.map(row => ({ ...row, content_hash: "0".repeat(64) })) : rows;
    } });
    await expect(readExternalAlphaProofEvidence(corrupt, work.id, action.result!.resultId, refs[0])).rejects.toThrow(/integrity/);
    const wrongActor = new WorkStore({ ...a.store.principal, actorId: b.owner }, a.db);
    await expect(readExternalAlphaProofEvidence(wrongActor, work.id, action.result!.resultId, refs[0])).rejects.toThrow(/Owner scope/);
    for (const e of evidence) expect(e!.ref.sha256).toBe(sha256Hex(e!.bytes.toString("utf8")));
    await expect(readExternalAlphaProofEvidence(a.store, work.id, action.result!.resultId, "factory-evidence:sha256:" + "0".repeat(64))).rejects.toThrow(/not available/);
    await expect(readExternalAlphaProofEvidence(b.store, work.id, action.result!.resultId, refs[0])).rejects.toThrow();
    expect(await a.count("engineering_native_results")).toBe(1);
    expect((await central.pool.query("SELECT state FROM external_alpha_cohort_dispatch")).rows[0].state).toBe("SETTLED");
    expect(Number((await central.pool.query("SELECT sum(ceiling_microusd)::bigint n FROM external_alpha_cohort_admission")).rows[0].n)).toBe(1300000);
    const next = await a.store.change(work.id, { operation: "takeover", expectedVersion: work.version });
    const historical = await readExternalAlphaWork(a.store, next);
    expect(historical?.result?.current).toBe(false);
    expect(historical?.result?.verdict).toBe(expected);
    expect(app.factory.posts).toBe(1);
  });


  it.each(["known", "unknown", "bare-label"] as const)("Sofie takeover transfers control only after exact confirmed cleanup (%s)", async mode => {
    const { e, factory, config } = await make();
    const work = await e.seedWork();
    const env = { NODE_ENV: "test", MYEVE_EXTERNAL_ALPHA_AUTHORITY_SIGNING_KEY: generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }) as string,
      VERCEL: "1", VERCEL_ENV: "production", VERCEL_PROJECT_ID: e.policy.projectId, MYEVE_OWNER_ID: e.owner,
      MYEVE_EXTERNAL_ALPHA_POLICY: JSON.stringify(e.policy), MYEVE_EXTERNAL_ALPHA_POLICY_SHA256: digest(e.policy),
      MYEVE_EXTERNAL_ALPHA_WORK_CONFIG: JSON.stringify(config), MYEVE_EXTERNAL_ALPHA_FACTORY_ORIGIN: config.factory.origin, EVE_PROJECT_NAME: "myeve-alpha-tester-1",
      MYEVE_EXTERNAL_ALPHA_FACTORY_PIN_SHA256: externalAlphaFactoryPinSha256(e.policy, config) } as NodeJS.ProcessEnv;
    const deps = { database: e.db, factory, signer: e.signer, env };
    const input = { operation: "start", expectedWorkVersion: work.version, expectedWorkGeneration: work.generation };
    const effect = { sessionId: "fixture-takeover", callId: "start" };
    await externalAlphaFactoryAction(e.store, work.id, input, effect, deps);
    if (mode === "unknown") factory.ops = [{ id: "unknown-at-stop", phase: "productive", state: "unknown" }];
    if (mode === "bare-label") await e.svc.finish((await e.svc.forWork(work.id))!.id, "CANCELLED", { reason: "UNPROVED_STOP" });
    const out = await externalAlphaFactoryAction(e.store, work.id, { ...input, operation: "takeover" }, { ...effect, callId: "takeover" }, deps);
    const current = await e.store.get(work.id);
    expect(current.control).toBe(mode === "known" ? "human" : "agent");
    expect(current.version).toBe(mode === "known" ? work.version + 1 : work.version);
    expect(factory.posts).toBe(1);
    expect(out.currentTruth.join(" ")).toMatch(mode === "known" ? /in your hands/ : /waits for authenticated cleanup/);
  });

});
