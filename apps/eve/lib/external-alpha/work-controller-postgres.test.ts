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
  externalAlphaWorkConfigSchema,
  type ExternalAlphaFactoryClient,
  type ExternalAlphaWorkConfig,
} from "./work-controller.ts";
import { alphaTasksCriteria, alphaTasksCriteriaSha256, sha256Hex } from "./work-tuple.ts";
import { connection, Env, files } from "./work-test-fixture.ts";
import { publicKeyId } from "./work-authority.ts";
import { externalAlphaFactoryAction } from "./work-action.ts";
import { externalAlphaWorkEnabled } from "./work-config.ts";
import { engineeringWorkEnabled } from "../engineering/deployment-mode.ts";

type Op = { id: string; phase: "productive" | "completion"; state: "settled" | "unknown" | "reserved"; actual?: number };
/** Valid WORK_LEDGER_V2 readback (the shape MyEve already consumes). */
function ledger(requestId: string, workOrderId: string, workId: string, ops: Op[]) {
  const per = 200000,
    completionReserve = 300000;
  const operations = ops.map((o) => ({
    operationId: o.id,
    workId,
    workGeneration: 1,
    dispatchIdentity: "d-" + o.id,
    requestId,
    workOrderId,
    factoryVersion: "4".repeat(64),
    runId: "run-1",
    model: "openai/gpt-5.4-mini",
    pricingRevision: "rev-1",
    reservedMicrousd: per,
    actualMicrousd: o.state === "settled" ? (o.actual ?? 100000) : null,
    providerRequestId: o.state === "settled" ? "prov-" + o.id : null,
    usage: o.state === "settled" ? { input_tokens: 10, output_tokens: 5 } : null,
    state: o.state,
    phase: o.phase,
  }));
  const settled = operations.reduce((n, o) => n + (o.state === "settled" ? (o.actualMicrousd ?? 0) : 0), 0);
  const retained = operations.reduce((n, o) => n + (o.state === "settled" ? 0 : o.reservedMicrousd), 0);
  const available = 1_000_000 - settled - retained;
  const completion = operations.filter((o) => o.phase === "completion");
  const cExposure = completion.reduce((n, o) => n + (o.state === "settled" ? (o.actualMicrousd ?? 0) : o.reservedMicrousd), 0);
  const remaining = completionReserve - cExposure;
  return {
    status: operations.some((o) => o.state === "unknown") ? "UNKNOWN" : "KNOWN",
    currency: "USD",
    unit: "microUSD",
    workId,
    workGeneration: 1,
    requestId,
    workOrderId,
    deadline: new Date(Date.now() + 180000).toISOString(),
    ceilingMicrousd: 1_000_000,
    settledMicrousd: settled,
    retainedMicrousd: retained,
    availableMicrousd: available,
    cancelled: false,
    operations,
    contractVersion: "WORK_LEDGER_V2",
    pricingRevision: "rev-1",
    plannedProductiveOperations: 2,
    plannedCompletionOperations: 1,
    perOperationReserveMicrousd: per,
    completionReserveMicrousd: completionReserve,
    completionReserveRemainingMicrousd: remaining,
    productiveAllowanceRemainingMicrousd: available - remaining,
    unknownExposureMicrousd: operations.filter((o) => o.state === "unknown").reduce((n, o) => n + o.reservedMicrousd, 0),
    paidOperationsUsed: operations.length,
    maxPaidOperations: 3,
    completionOperationsUsed: completion.length,
    completionOperationSlotsRemaining: 1 - completion.length,
    accountingComplete: operations.every((o) => o.state === "settled"),
    pricingQualified: true,
    authorityState: "active",
    phase: completion.length ? "completion" : "productive",
  };
}

/** Reference Factory: validates independently against ITS OWN pins and consumes at most once. */
class FakeFactory implements ExternalAlphaFactoryClient {
  receiptKey = generateKeyPairSync("ed25519");
  consumed = new Map<string, { sha: string; requestId: string; workOrderId: string; workId: string }>();
  byWork = new Set<string>();
  posts = 0;
  stops: string[] = [];
  ops: Op[] = [];
  state = "RUNNING";
  quiescent = false;
  failWith: Error | null = null;
  corruptReceipt = false;
  constructor(
    private pins: { myeveKeys: ReadonlyMap<string, KeyObject>; policy: any; allowedFiles: string[]; now: () => number },
  ) {}
  private receipt(authorityId: string, sha: string, requestId: string, workOrderId: string) {
    const authorityReceipt = { authorityId, authoritySha256: sha, requestId, workOrderId, consumedAt: new Date().toISOString() };
    const sig = sign(
      null,
      Buffer.concat([Buffer.from(RECEIPT_DOMAIN), Buffer.from([0]), Buffer.from(digest(authorityReceipt), "ascii")]),
      (this.corruptReceipt ? generateKeyPairSync("ed25519") : this.receiptKey).privateKey,
    ).toString("base64url");
    return { authorityReceipt, authorityReceiptSignature: sig };
  }
  private readback(c: { sha: string; requestId: string; workOrderId: string; workId: string }, authorityId: string) {
    return {
      requestId: c.requestId,
      workOrderId: c.workOrderId,
      state: this.state,
      quiescent: this.quiescent,
      evidenceRef: null,
      blocker: null,
      spend: ledger(c.requestId, c.workOrderId, c.workId, this.ops),
      ...this.receipt(authorityId, c.sha, c.requestId, c.workOrderId),
    };
  }
  async consume(envelope: WorkAuthorityEnvelope, prepare: Record<string, any>) {
    this.posts++;
    if (this.failWith) throw this.failWith;
    // Section 5 of the contract, in order.
    let d;
    try {
      d = verifyWorkAuthority(envelope, this.pins.myeveKeys, this.pins.now());
    } catch (e: any) {
      throw new FactoryDenied(e.message);
    }
    const deny = (code: string): never => {
      throw new FactoryDenied(code);
    };
    const p = this.pins.policy;
    if (d.ownerId !== p.ownerId || d.application.clientId !== p.clientId || d.application.projectId !== p.projectId || d.cohortId !== p.cohortId || d.slot !== p.slot)
      deny("AUTHORITY_OWNER");
    if (d.factoryVersion !== p.factoryVersion) deny("AUTHORITY_FACTORY_VERSION");
    if (d.model.id !== p.model) deny("AUTHORITY_MODEL");
    if (prepare.requestId !== requestIdFor(d.authorityId) || d.candidateWriter.writerId !== writerIdFor(d.authorityId)) deny("AUTHORITY_IDENTIFIER");
    if (prepare.source.commit !== d.source.baseSha || prepare.source.tree !== d.source.treeSha || prepare.repository !== d.source.repository) deny("AUTHORITY_SOURCE");
    if (JSON.stringify([...prepare.input.allowedPaths].sort()) !== JSON.stringify(d.source.allowedFiles) || JSON.stringify(d.source.allowedFiles) !== JSON.stringify(this.pins.allowedFiles)) deny("AUTHORITY_FILES");
    if (prepare.workId !== d.work.id || prepare.workGeneration !== d.work.generation || sha256Hex(prepare.input.description) !== d.work.objectiveSha256) deny("AUTHORITY_WORK");
    if (digest({ version: 1, criteria: prepare.input.acceptanceCriteria }) !== alphaTasksCriteriaSha256 || prepare.input.acceptanceCriteria.length !== 10) deny("AUTHORITY_TUPLE");
    if (prepare.maxSpendUsd * 1e6 > d.limits.factory.microusd) deny("AUTHORITY_LIMITS");
    if (Date.parse(prepare.deadline) > Date.parse(d.expiresAt)) deny("AUTHORITY_EXPIRED");
    const prior = this.consumed.get(d.authorityId);
    if (prior) {
      if (prior.sha !== envelope.authoritySha256 || prior.requestId !== prepare.requestId) deny("AUTHORITY_CONSUMED");
      return this.readback(prior, d.authorityId); // idempotent replay: no second writer
    }
    if (this.byWork.has(d.work.id + ":" + d.work.generation)) deny("AUTHORITY_CONSUMED");
    const c = { sha: envelope.authoritySha256, requestId: prepare.requestId, workOrderId: randomUUID(), workId: d.work.id };
    this.consumed.set(d.authorityId, c);
    this.byWork.add(d.work.id + ":" + d.work.generation);
    return this.readback(c, d.authorityId);
  }
  async read(requestId: string) {
    const entry = [...this.consumed.entries()].find(([, c]) => c.requestId === requestId);
    return entry ? this.readback(entry[1], entry[0]) : null;
  }
  async stop(requestId: string) {
    this.stops.push(requestId);
    this.state = "CANCELLED";
    this.quiescent = true;
    return (await this.read(requestId))!;
  }
}

async function setup(activate = true) {
  const e = await Env.create(activate);
  const keys = new Map([[e.signer.keyId, e.signer.publicKey]]);
  const factory = new FakeFactory({ myeveKeys: keys, policy: e.policy, allowedFiles: files, now: () => Date.now() });
  const config: ExternalAlphaWorkConfig = externalAlphaWorkConfigSchema.parse({
    allowedFiles: files,
    checkCommands: ["npm test"],
    factory: {
      origin: "https://myfactory-cloud-production.vercel.app",
      trustedTeamId: "team_fixture",
      receiptKeys: [{ keyId: publicKeyId(factory.receiptKey.publicKey), publicKey: factory.receiptKey.publicKey.export({ type: "spki", format: "pem" }) as string }],
    },
  });
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
    await expect(new ExternalAlphaAllowance(e.db, e.policy).admit({ kind: "CHAT", bindingId: "x:1", requestSha256: "c".repeat(64) })).rejects.toThrow(/fences/);
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
    await expect(controller.start(await e.seedWork())).rejects.toThrow(/exhausted/);
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
    const [r1, r2] = await Promise.all([controller.reconcile(work.id), controller.reconcile(work.id)]);
    await controller.reconcile(work.id);
    expect([r1.state, r2.state].every((s) => ["COMPLETED", "CONSUMED"].includes(s as string))).toBe(true);
    const rows = (await e.pool.query("SELECT source,spent_microusd,state FROM external_alpha_operation ORDER BY step_key")).rows;
    expect(rows).toHaveLength(3);
    expect(rows.map((r: any) => r.source).sort()).toEqual(["FACTORY_COMPLETION", "FACTORY_PRODUCTIVE", "FACTORY_PRODUCTIVE"]);
    expect(rows.reduce((n: number, r: any) => n + Number(r.spent_microusd), 0)).toBe(250000);
    expect((await e.svc.forWork(work.id))?.state).toBe("COMPLETED");
    expect((await e.pool.query("SELECT state FROM external_alpha_allowance WHERE kind='WORK'")).rows[0].state).toBe("COMPLETED");
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
    expect(rows.find((r: any) => r.state === "UNKNOWN")).toMatchObject({ reserved_microusd: "200000", spent_microusd: null });
    // Later "settled" or "released" reports can not release or reuse it.
    factory.ops = [
      { id: "op-1", phase: "productive", state: "settled", actual: 100000 },
      { id: "op-2", phase: "productive", state: "settled", actual: 0 },
    ];
    await controller.reconcile(work.id).catch(() => {});
    const after = (await e.pool.query("SELECT state,reserved_microusd,spent_microusd FROM external_alpha_operation WHERE step_key=$1", ["factory:op-2:0"])).rows[0];
    expect(after).toMatchObject({ state: "UNKNOWN", reserved_microusd: "200000", spent_microusd: null });
    expect(await e.count("external_alpha_allowance", "state='UNKNOWN'")).toBe(1);
    await expect(new ExternalAlphaAllowance(e.db, e.policy).admit({ kind: "CHAT", bindingId: "x:2", requestSha256: "c".repeat(64) })).rejects.toThrow(/fences/);
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
      MYEVE_EXTERNAL_ALPHA_WORK_CONFIG: JSON.stringify(config),
    } as unknown as NodeJS.ProcessEnv;
    const input = { operation: "start", expectedWorkVersion: work.version, expectedWorkGeneration: work.generation };
    const effect = { sessionId: "sess", callId: "call-1" };
    // No signing key: nothing is issued.
    expect(externalAlphaWorkEnabled(env)).toBe(false);
    await expect(externalAlphaFactoryAction(e.store, work.id, input, effect, { database: e.db, factory, env })).rejects.toThrow(/SIGNING_KEY_REQUIRED/);
    expect(await e.count("external_alpha_work_authority")).toBe(0);
    const withKey = { ...env, MYEVE_EXTERNAL_ALPHA_AUTHORITY_SIGNING_KEY: "present" } as NodeJS.ProcessEnv;
    expect(externalAlphaWorkEnabled(withKey)).toBe(true);
    expect(engineeringWorkEnabled(withKey)).toBe(true);
    const deps = { database: e.db, factory, env, signer: e.signer };
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
});
