// Test-only reference Factory. Synthetic signed readback; no producer or verifier is executed.
import {generateKeyPairSync,randomUUID,sign,type KeyObject} from 'node:crypto';
import {digest} from '../engineering/contract.ts';
import {verifyWorkAuthority,requestIdFor,writerIdFor,type WorkAuthorityEnvelope} from './work-authority.ts';
import {FactoryDenied,RECEIPT_DOMAIN,type ExternalAlphaFactoryClient} from './work-controller.ts';
import {fixtureFactoryVersion} from './result-test-fixture.ts';
import {alphaTasksCriteriaSha256,sha256Hex} from './work-tuple.ts';
import {READBACK_DOMAIN} from './dispatch-readback.ts';
type Op = { id: string; phase: "productive" | "completion"; state: "settled" | "unknown" | "reserved"; actual?: number };
/** Valid WORK_LEDGER_V2 readback (the shape MyEve already consumes). */
function ledger(requestId: string, workOrderId: string, workId: string, ops: Op[], workGeneration = 1) {
  const per = 200000,
    completionReserve = 300000;
  const operations = ops.map((o) => ({
    operationId: o.id,
    workId,
    workGeneration,
    dispatchIdentity: "d-" + o.id,
    requestId,
    workOrderId,
    factoryVersion: fixtureFactoryVersion,
    runId: "00000000-0000-4000-8000-0000000000a1",
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
    workGeneration,
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
export class FakeFactory implements ExternalAlphaFactoryClient {
  receiptKey = generateKeyPairSync("ed25519");
  consumed = new Map<string, { sha: string; requestId: string; workOrderId: string; workId: string; prepare: Record<string, any>; consumedAt: string }>();
  byWork = new Set<string>();
  posts = 0;
  reads = 0;
  stops: string[] = [];
  ops: Op[] = [];
  state = "RUNNING";
  verdict: string | null = null;
  quiescent = false;
  failWith: Error | null = null;
  corruptReceipt = false;
  resultPayload: unknown | null = null;
  readbackMutate: ((value: any) => void) | null = null;
  replayReadback: unknown | null = null;
  async result(requestId: string, challenge: string) {
    const readback = await this.read(requestId, challenge);
    if (this.resultPayload === null) return { ...(readback as object), pending: true };
    const payload = this.resultPayload as any;
    return { ...(readback as object), result: payload?.result ?? payload };
  }
  requestDigest(requestId: string) { return digest([...this.consumed.values()].find(c => c.requestId === requestId)!.prepare); }

  constructor(
    private pins: { myeveKeys: ReadonlyMap<string, KeyObject>; policy: any; allowedFiles: string[]; now: () => number },
  ) {}
  private receipt(authorityId: string, sha: string, requestId: string, workOrderId: string, consumedAt: string) {
    const authorityReceipt = { authorityId, authoritySha256: sha, requestId, workOrderId, consumedAt };
    const sig = sign(
      null,
      Buffer.concat([Buffer.from(RECEIPT_DOMAIN), Buffer.from([0]), Buffer.from(digest(authorityReceipt), "ascii")]),
      (this.corruptReceipt ? generateKeyPairSync("ed25519") : this.receiptKey).privateKey,
    ).toString("base64url");
    return { authorityReceipt, authorityReceiptSignature: sig };
  }
  private readback(c: { sha: string; requestId: string; workOrderId: string; workId: string; prepare: Record<string, any>; consumedAt: string }, authorityId: string, challenge: string) {
    const receipt = this.receipt(authorityId, c.sha, c.requestId, c.workOrderId, c.consumedAt);
    const spend = { ...ledger(c.requestId, c.workOrderId, c.workId, this.ops, c.prepare.workGeneration), deadline: c.prepare.deadline };
    const at = Date.now();
    const readbackAttestation = {
      schema: READBACK_DOMAIN, requestId: c.requestId, workOrderId: c.workOrderId, runId: "00000000-0000-4000-8000-0000000000a1", attemptNumber: 1,
      requestDigest: digest(c.prepare), admittedDeadline: c.prepare.deadline, authorityId, authoritySha256: c.sha,
      receiptDigest: digest(receipt.authorityReceipt), state: this.state, quiescent: this.quiescent, evidenceRef: null, blocker: null,
      spend, spendDigest: digest(spend), verdict: this.verdict ?? (this.state === "COMPLETED" ? "PASS" : this.state === "CANCELLED" ? "NONE" : this.state === "FAILED" ? "FAIL" : "PENDING"), challenge,
      issuedAt: new Date(at).toISOString(), expiresAt: new Date(at + 120000).toISOString(),
    };
    const readbackSignature = sign(null, Buffer.concat([Buffer.from(READBACK_DOMAIN), Buffer.from([0]), Buffer.from(digest(readbackAttestation), "ascii")]), this.receiptKey.privateKey).toString("base64url");
    const value = {
      requestId: c.requestId,
      workOrderId: c.workOrderId,
      state: this.state,
      quiescent: this.quiescent,
      evidenceRef: null,
      blocker: null,
      spend, ...receipt, readbackAttestation, readbackSignature,
    };
    this.readbackMutate?.(value);
    return value;
  }
  async consume(envelope: WorkAuthorityEnvelope, prepare: Record<string, any>, challenge = "a".repeat(32)) {
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
      return this.readback(prior, d.authorityId, challenge); // idempotent replay: no second writer
    }
    if (this.byWork.has(d.work.id + ":" + d.work.generation)) deny("AUTHORITY_CONSUMED");
    const c = { sha: envelope.authoritySha256, requestId: prepare.requestId, workOrderId: randomUUID(), workId: d.work.id, prepare, consumedAt: new Date().toISOString() };
    this.consumed.set(d.authorityId, c);
    this.byWork.add(d.work.id + ":" + d.work.generation);
    return this.readback(c, d.authorityId, challenge);
  }
  async read(requestId: string, challenge = "a".repeat(32)) {
    this.reads++;
    if (this.replayReadback) return this.replayReadback;
    const entry = [...this.consumed.entries()].find(([, c]) => c.requestId === requestId);
    return entry ? this.readback(entry[1], entry[0], challenge) : null;
  }
  async stop(requestId: string, challenge: string) {
    this.stops.push(requestId);
    this.state = "CANCELLED";
    this.quiescent = true;
    return (await this.read(requestId, challenge))!;
  }
}
