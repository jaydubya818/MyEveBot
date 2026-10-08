import { createPublicKey, verify as verifySignature, type KeyObject } from "node:crypto";
import { retainedExternalAlphaResult } from "./work-readback.ts";
import { z } from "zod";
import { digest } from "../engineering/contract.ts";
import { assertExternalAlphaFactoryOrigin, externalAlphaWorkConfig, externalAlphaWorkConfigSchema, type ExternalAlphaWorkConfig } from "./work-config.ts";
export { externalAlphaWorkConfig, externalAlphaWorkConfigSchema, type ExternalAlphaWorkConfig };
import { validateSpendBinding, workSpendV2Schema } from "../engineering/factory-spend.ts";
import type { Work } from "../engineering/types.ts";
import {
  ExternalAlphaWorkAuthority,
  canonicalJson,
  publicKeyId,
  type AuthorityState,
  type FactoryOperationReport,
  type WorkAuthorityEnvelope,
  type WorkAuthorityRecord,
} from "./work-authority.ts";
import { bindDispatch, dispatchBinding, readbackChallenge, verifyReadbackAttestation, type DispatchBinding } from "./dispatch-readback.ts";
import { alphaTasksCriteria } from "./work-tuple.ts";
import {
  ExternalAlphaResultRejected,
  ingestExternalAlphaResult,
  settleExternalAlphaResult,
  settlementOperations,
  worstVerdict,
  type RetainedExternalAlphaResult,
} from "./result-ingestion.ts";

export const RECEIPT_DOMAIN = "MYFACTORY_EXTERNAL_ALPHA_RECEIPT_V1";
const hex64 = z.string().regex(/^[a-f0-9]{64}$/);
const receiptSchema = z
  .object({
    authorityId: z.string().uuid(),
    authoritySha256: hex64,
    requestId: z.string().uuid(),
    workOrderId: z.string().uuid(),
    consumedAt: z.string().datetime(),
  })
  .strict();
export type AuthorityReceipt = z.infer<typeof receiptSchema>;
const readbackSchema = z
  .object({
    requestId: z.string().uuid(),
    workOrderId: z.string().uuid(),
    state: z.enum([
      "PREPARING",
      "PREPARED",
      "DISPATCHING",
      "RUNNING",
      "UNKNOWN",
      "STOPPING",
      "COMPLETED",
      "FAILED",
      "CANCELLED",
      "NOT_DISPATCHED",
    ]),
    quiescent: z.boolean(),
    evidenceRef: z.string().nullable(),
    blocker: z.string().nullable(),
    spend: z.unknown(),
    authorityReceipt: receiptSchema,
    authorityReceiptSignature: z.string().regex(/^[A-Za-z0-9_-]{86}$/),
  })
  .passthrough();
export type FactoryReadback = z.infer<typeof readbackSchema>;

export class FactoryDenied extends Error {
  constructor(readonly code: string) {
    super("FACTORY_DENIED:" + code);
  }
}
export interface ExternalAlphaFactoryClient {
  /** Presents the authority and the prepare request. Must be idempotent on requestId. */
  consume(envelope: WorkAuthorityEnvelope, prepare: Record<string, unknown>, challenge: string): Promise<unknown>;
  read(requestId: string, challenge: string): Promise<unknown | null>;
  stop(requestId: string, challenge: string): Promise<unknown>;
  /** The Factory's signed MYFACTORY_RESULT_V1 for an exact consumed request, or
   * null when it is not published yet. Optional so that a client without a
   * Result channel can still reconcile accounting; completed authority remains
   * open until its candidate Result is retained or unresolved expiry fences it. */
  result?(requestId: string, challenge: string): Promise<unknown | null>;
}

/** Deliberately separate from the canary transport: its own OIDC identity (this
 * deployment's project) and its own route prefix. */
export class HttpExternalAlphaFactoryClient implements ExternalAlphaFactoryClient {
  constructor(
    private readonly config: ExternalAlphaWorkConfig,
    private readonly identity: { projectId: string },
    private readonly deps: {
      fetcher?: typeof fetch;
      token?: () => string | undefined;
      oidc?: () => Promise<string>;
      env?: NodeJS.ProcessEnv;
    } = {},
  ) {}
  private async headers() {
    const env = this.deps.env ?? process.env;
    assertExternalAlphaFactoryOrigin(this.config, env);
    const token = (this.deps.token ?? (() => env.MYEVE_EXTERNAL_ALPHA_FACTORY_TOKEN))();
    if (!token?.trim()) throw Error("EXTERNAL_ALPHA_FACTORY_TOKEN_REQUIRED");
    if (
      typeof window !== "undefined" ||
      env.VERCEL !== "1" ||
      env.VERCEL_ENV !== "production" ||
      env.VERCEL_PROJECT_ID !== this.identity.projectId
    )
      throw Error("EXTERNAL_ALPHA_FACTORY_IDENTITY_REQUIRED");
    const oidc = await (this.deps.oidc ?? (async () => (await import("@vercel/oidc")).getVercelOidcToken()))();
    const claims = JSON.parse(Buffer.from(String(oidc).split(".")[1] ?? "", "base64url").toString("utf8"));
    if (
      claims.project_id !== this.identity.projectId ||
      claims.owner_id !== this.config.factory.trustedTeamId ||
      claims.environment !== "production" ||
      !Number.isSafeInteger(claims.exp) ||
      claims.exp <= Math.floor(Date.now() / 1000)
    )
      throw Error("EXTERNAL_ALPHA_FACTORY_IDENTITY_REQUIRED");
    return {
      authorization: "Bearer " + token,
      "x-vercel-trusted-oidc-idp-token": oidc,
      "content-type": "application/json",
    };
  }
  private async call(method: "GET" | "POST", path: string, body?: unknown, allow404 = false, limit = 256000, challenge?: string) {
    const f = this.deps.fetcher ?? fetch;
    const response = await f(new URL("/api/connect/v2/external-alpha" + path, this.config.factory.origin), {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: { ...(await this.headers()), ...(challenge ? { "x-external-alpha-challenge": challenge } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (allow404 && response.status === 404) return null;
    const text = await response.text();
    if (text.length > limit) throw Error("EXTERNAL_ALPHA_FACTORY_RESPONSE_BOUND");
    if (!response.ok) {
      let code = "";
      try {
        const parsed = JSON.parse(text);
        if (response.status === 403 && parsed?.admission === "DISABLED" && /^[A-Z_]+$/.test(parsed.code ?? ""))
          code = parsed.code;
        if (response.status === 409 && parsed?.code === "AUTHORITY_CONSUMED") code = "AUTHORITY_CONSUMED";
      } catch {
        /* ambiguous */
      }
      if (code) throw new FactoryDenied(code);
      throw Error("EXTERNAL_ALPHA_FACTORY_UNAVAILABLE:" + response.status);
    }
    return JSON.parse(text);
  }
  consume(envelope: WorkAuthorityEnvelope, prepare: Record<string, unknown>, challenge: string) {
    return this.call("POST", "/dispatches", { authority: envelope, prepare }, false, 256000, challenge);
  }
  read(requestId: string, challenge: string) {
    return this.call("GET", "/dispatches/" + encodeURIComponent(requestId), undefined, true, 256000, challenge);
  }
  stop(requestId: string, challenge: string) {
    return this.call("POST", `/dispatches/${encodeURIComponent(requestId)}/stop`, {}, false, 256000, challenge);
  }
  result(requestId: string, challenge: string) {
    return this.call("GET", `/dispatches/${encodeURIComponent(requestId)}/result`, undefined, true, 13_000_000, challenge);
  }
}

export function receiptKeys(config: ExternalAlphaWorkConfig) {
  const map = new Map<string, KeyObject>();
  for (const k of config.factory.receiptKeys) {
    const key = createPublicKey(k.publicKey);
    if (key.asymmetricKeyType !== "ed25519" || publicKeyId(key) !== k.keyId)
      throw Error("EXTERNAL_ALPHA_RECEIPT_KEY");
    map.set(k.keyId, key);
  }
  return map;
}
/** Factory readback must bind exactly this authority, request and digest. */
export function verifyReadback(
  value: unknown,
  authority: WorkAuthorityRecord,
  keys: ReadonlyMap<string, KeyObject>,
  binding: DispatchBinding, challenge: string, now = Date.now(),
): FactoryReadback {
  const parsed = readbackSchema.safeParse(value);
  if (!parsed.success) throw Error("EXTERNAL_ALPHA_RECEIPT_INVALID");
  const r = parsed.data;
  const signed = Buffer.concat([
    Buffer.from(RECEIPT_DOMAIN, "utf8"),
    Buffer.from([0]),
    Buffer.from(digest(r.authorityReceipt), "ascii"),
  ]);
  const signature = Buffer.from(r.authorityReceiptSignature, "base64url");
  if (
    r.authorityReceipt.authorityId !== authority.id ||
    r.authorityReceipt.authoritySha256 !== authority.documentSha256 ||
    r.authorityReceipt.requestId !== authority.requestId ||
    r.requestId !== authority.requestId ||
    r.workOrderId !== r.authorityReceipt.workOrderId ||
    (authority.receipt !== null && digest(authority.receipt) !== digest(r.authorityReceipt)) ||
    ![...keys.values()].some((key) => verifySignature(null, signed, key, signature))
  )
    throw Error("EXTERNAL_ALPHA_RECEIPT_INVALID");
  const attestation = verifyReadbackAttestation(value, authority, r.authorityReceipt, keys, binding, challenge, now);
  if (attestation.workOrderId !== r.authorityReceipt.workOrderId) throw Error("EXTERNAL_ALPHA_READBACK_UNVERIFIED");
  const spend = workSpendV2Schema.parse(attestation.spend);
  validateSpendBinding(spend, { workId: authority.workId, workGeneration: authority.workGeneration,
    requestId: authority.requestId, workOrderId: attestation.workOrderId, deadline: binding.admittedDeadline,
    remoteRunId: attestation.runId, factoryVersion: authority.envelope.document.factoryVersion,
  }, authority.envelope.document.limits.factory.microusd / 1000000);
  if (spend.operations.some(op => op.workGeneration !== authority.workGeneration || op.model !== authority.envelope.document.model.id))
    throw Error("EXTERNAL_ALPHA_READBACK_SPEND_BINDING");
  return { ...attestation, authorityReceipt: r.authorityReceipt, authorityReceiptSignature: r.authorityReceiptSignature };
}

export type TerminalFactoryState = "FAILED" | "CANCELLED" | "NOT_DISPATCHED";
export interface TerminalSettlementTruth {
  replay: boolean;
  authorityState: AuthorityState;
  factoryState: TerminalFactoryState;
}

async function retainedTerminalTruth(authority: ExternalAlphaWorkAuthority, record: WorkAuthorityRecord): Promise<TerminalSettlementTruth | null> {
  const [row] = await authority.database.query(`SELECT t.readback,t.readback_sha256 FROM external_alpha_work_terminal_settlement t
    JOIN external_alpha_work_dispatch d ON d.authority_id=t.authority_id
    WHERE t.authority_id=$1 AND t.owner_id=$2 AND t.policy_sha256=$3 AND t.request_id=$4 AND t.authority_sha256=$5
      AND t.work_id=$6 AND t.work_version=$7 AND t.work_generation=$8
      AND t.request_digest=d.request_digest AND t.cleanup_confirmed=true AND t.result_verdict='NONE'
      AND t.settlement_state='SETTLED' AND t.exposure_unknown=false`,
    [record.id, authority.policy.ownerId, digest(authority.policy), record.requestId, record.documentSha256, record.workId, record.workVersion, record.workGeneration]);
  if (!row) return null;
  // Historical accepted custody does not renew execution authority or claim
  // fresh liveness. Return only its limited terminal truth, never raw custody.
  if (digest(row.readback) !== row.readback_sha256) throw Error("EXTERNAL_ALPHA_TERMINAL_CUSTODY");
  const factoryState = z.enum(["FAILED", "CANCELLED", "NOT_DISPATCHED"]).parse((row.readback as { readbackAttestation: { state: unknown } }).readbackAttestation.state);
  return { replay: true, authorityState: record.state, factoryState };
}

/** Retains an authenticated no-candidate cleanup/accounting fact. Replays keep
 * the original immutable custody record; it is neither candidate Proof nor a
 * terminal-label shortcut. Current owner Work is locked inside SQL settlement. */
export async function settleTerminalReadback(authority: ExternalAlphaWorkAuthority, record: WorkAuthorityRecord,
  raw: unknown, keys: ReadonlyMap<string, KeyObject>, binding: DispatchBinding, challenge: string, now = Date.now()) {
  const readback = verifyReadback(raw, record, keys, binding, challenge, now);
  const spend = workSpendV2Schema.parse(readback.spend);
  if (!readback.quiescent || !["FAILED", "CANCELLED", "NOT_DISPATCHED"].includes(readback.state) || readback.verdict !== "NONE"
    || spend.status !== "KNOWN" || !spend.accountingComplete || spend.retainedMicrousd !== 0 || spend.unknownExposureMicrousd !== 0)
    throw Error("EXTERNAL_ALPHA_TERMINAL_UNPROVED");
  const signed = raw as { readbackAttestation: unknown; readbackSignature: unknown };
  const envelope = { readbackAttestation: signed.readbackAttestation, readbackSignature: signed.readbackSignature,
    authorityReceipt: readback.authorityReceipt, authorityReceiptSignature: readback.authorityReceiptSignature };
  const [row] = await authority.database.query("SELECT external_alpha_terminal_settle($1::jsonb) AS r", [JSON.stringify({
    ownerId: authority.policy.ownerId, policySha256: digest(authority.policy), authorityId: record.id,
    readback: envelope, canonical: canonicalJson(envelope), readbackSha256: digest(envelope),
    receiptCanonical: canonicalJson(readback.authorityReceipt), spendCanonical: canonicalJson(spend),
    operations: settlementOperations(record, operationReports(spend, true)),
  })]);
  const fact = row.r as { replay: boolean; authorityState: AuthorityState };
  const factoryState = z.enum(["FAILED", "CANCELLED", "NOT_DISPATCHED"]).parse(readback.state);
  // Shared accounting consumes the retained exact fact through its reconcile
  // hook on sweep. A lost remote acknowledgment is repaired by later sweeps.
  await authority.sweep();
  return { replay: fact.replay, authorityState: fact.authorityState, factoryState } satisfies TerminalSettlementTruth;
}

export function prepareRequest(
  authority: WorkAuthorityRecord,
  work: Work,
  config: ExternalAlphaWorkConfig,
  now = Date.now(),
) {
  const d = authority.envelope.document;
  const deadline = new Date(
    Math.min(now + d.limits.productiveSeconds * 1000, Date.parse(d.expiresAt)),
  ).toISOString();
  return {
    protocol: "MYFACTORY_EXECUTION_V2",
    requestId: d.candidateWriter.requestId,
    workId: work.id,
    workGeneration: work.generation,
    repository: d.source.repository,
    deadline,
    maxSpendUsd: d.limits.factory.microusd / 1_000_000,
    source: { repository: d.source.repository, commit: d.source.baseSha, tree: d.source.treeSha },
    input: {
      title: work.title,
      description: work.objective,
      kind: "feature",
      acceptanceCriteria: [...alphaTasksCriteria],
      checkCommands: config.checkCommands,
      allowedPaths: d.source.allowedFiles,
    },
  };
}

export function operationReports(spend: unknown, terminal = false): FactoryOperationReport[] {
  const parsed = workSpendV2Schema.safeParse(spend);
  if (!parsed.success) throw Error("EXTERNAL_ALPHA_SPEND_UNPARSEABLE");
  return parsed.data.operations
    .filter((o) => o.state === "settled" || o.state === "unknown" || (terminal && ["reserved", "dispatched"].includes(o.state)))
    .map((o) => ({
      operationId: o.operationId,
      phase: o.phase,
      state: o.state === "settled" ? "settled" : "unknown",
      actualMicrousd: o.actualMicrousd,
      reservedMicrousd: o.reservedMicrousd,
      model: o.model,
      pricingRevision: o.pricingRevision,
    }));
}

export type StartOutcome =
  | { sent: true; authority: WorkAuthorityRecord; readback: FactoryReadback }
  | { sent: false; authority: WorkAuthorityRecord; reason: string };

/** Sofie request, canonical Work, durable allowance and exact authority, one send,
 * independent Factory validation and consumption, accounting. Nothing here
 * re-sends, retries with a new identity, or falls back to another path. */
export class ExternalAlphaWorkController {
  constructor(
    readonly authority: ExternalAlphaWorkAuthority,
    readonly factory: ExternalAlphaFactoryClient,
    readonly config: ExternalAlphaWorkConfig,
    readonly keys: ReadonlyMap<string, KeyObject>,
    readonly clock: () => number = Date.now,
  ) {}
  async start(work: Work, effect?: { sessionId: string; callId: string }): Promise<StartOutcome> {
    const record = await this.authority.issue(work, this.config.allowedFiles, {
      now: new Date(this.clock()),
      effect,
    });
    if (record.state !== "ISSUED")
      return { sent: false, authority: record, reason: "ALREADY_" + record.state };
    const claim = await this.authority.claim(record);
    if (!claim.claimed) return { sent: false, authority: claim.authority, reason: "NOT_CLAIMED" };
    let response: unknown;
    const prepare = prepareRequest(record, work, this.config, this.clock());
    let binding: DispatchBinding;
    try { binding = await bindDispatch(this.authority.database, record, prepare); }
    catch {
      // The transport was never called: cancellation is definitive, and the
      // charged allowance is not recycled. If the database is unavailable the
      // durable sweep still fences the unresolved claim after expiry.
      await this.authority.finish(record.id, "CANCELLED", { reason: "LOCAL_PREPARE_DENIED" }).catch(() => {});
      throw Error("EXTERNAL_ALPHA_DISPATCH_BINDING_REQUIRED");
    }
    const challenge = readbackChallenge();
    try {
      response = await this.factory.consume(
        record.envelope,
        prepare, challenge,
      );
    } catch (error) {
      if (error instanceof FactoryDenied && error.code !== "AUTHORITY_CONSUMED") {
        await this.authority.finish(record.id, "CANCELLED", { reason: "FACTORY_DENIED:" + error.code });
        throw error;
      }
      // Ambiguous: the Factory may have consumed. Fence; never re-send.
      await this.authority.finish(record.id, "UNKNOWN", { reason: "DISPATCH_AMBIGUOUS" }).catch(() => {});
      throw Error("EXTERNAL_ALPHA_DISPATCH_UNKNOWN");
    }
    let readback: FactoryReadback;
    try {
      readback = verifyReadback(response, record, this.keys, binding, challenge, this.clock());
    } catch {
      await this.authority.finish(record.id, "UNKNOWN", { reason: "RECEIPT_UNVERIFIED" }).catch(() => {});
      throw Error("EXTERNAL_ALPHA_DISPATCH_UNKNOWN");
    }
    const consumed = await this.authority.finish(record.id, "CONSUMED", { receipt: readback.authorityReceipt });
    // A verified receipt establishes consumption; an authenticated UNKNOWN
    // establishes an unresolved remote effect immediately, before refresh.
    const observed = readback.state === "UNKNOWN"
      ? await this.authority.finish(record.id, "UNKNOWN", { reason: "AUTHENTICATED_FACTORY_UNKNOWN" })
      : consumed;
    return { sent: true, authority: observed, readback };
  }

  /** Read-only against the Factory; records usage exact-once and closes the
   * authority only at confirmed quiescence. */
  async reconcile(workId: string, ctx?: { work: Work }) {
    const record = await this.authority.forWork(workId);
    if (!record) return { state: "NONE" as const };
    if (!["DISPATCHING", "CONSUMED"].includes(record.state)) {
      const terminalSettlement = ["COMPLETED", "CANCELLED"].includes(record.state) ? await retainedTerminalTruth(this.authority, record) : null;
      const retained = ctx?.work ? await retainedExternalAlphaResult(this.authority.database, this.authority.policy, record, ctx.work) : null;
      return retained ? { state: record.state, result: { retained } } : terminalSettlement ? { state: record.state, terminalSettlement } : { state: record.state };
    }
    const binding = await dispatchBinding(this.authority.database, record);
    const challenge = readbackChallenge();
    const raw = await this.factory.read(record.requestId, challenge);
    if (raw === null) return { state: record.state }; // sweep fences an unresolved dispatch after expiry
    let readback: FactoryReadback;
    try { readback = verifyReadback(raw, record, this.keys, binding, challenge, this.clock()); }
    catch {
      await this.authority.finish(record.id, "UNKNOWN", { reason: "READBACK_UNVERIFIED" });
      return { state: "UNKNOWN" as const };
    }
    let current = record;
    if (record.state === "DISPATCHING")
      current = await this.authority.finish(record.id, "CONSUMED", { receipt: readback.authorityReceipt });
    const terminal =
      readback.quiescent && ["COMPLETED", "FAILED", "CANCELLED", "NOT_DISPATCHED"].includes(readback.state);
    let reports: FactoryOperationReport[];
    try {
      reports = operationReports(readback.spend, terminal);
    } catch {
      await this.authority.finish(record.id, "UNKNOWN", { reason: "SPEND_UNPARSEABLE" });
      return { state: "UNKNOWN" as const };
    }
    let unknown = readback.state === "UNKNOWN";
    for (const op of reports) {
      const row = await this.authority.recordFactoryOperation(current, op);
      if (row.state === "UNKNOWN") unknown = true;
    }
    const ingesting = terminal && (readback.state === "COMPLETED" || readback.verdict !== "NONE") && !!ctx?.work && !!this.factory.result;
    // The owner must be able to read the durable Result/Proof before the
    // authority closes, even when Factory exposure is UNKNOWN (settlement then
    // fences it). Only an unpublished Result with UNKNOWN exposure fences at once.
    const resultChallenge = readbackChallenge();
    const resultResponse = ingesting ? await this.factory.result!(record.requestId, resultChallenge) : null;
    let fetched: unknown | null = resultResponse;
    let resultVerdict: unknown = readback.verdict;
    if (resultResponse !== null) {
      try {
        const resultReadback = verifyReadback(resultResponse, current, this.keys, binding, resultChallenge, this.clock());
        if (digest(resultReadback.spend) !== digest(readback.spend) || !resultReadback.quiescent || resultReadback.state !== readback.state)
          throw Error("EXTERNAL_ALPHA_RESULT_READBACK_CHANGED");
        resultVerdict = resultReadback.verdict;
        if ((resultResponse as { pending?: unknown }).pending === true) fetched = null;
      } catch {
        await this.authority.finish(record.id, "UNKNOWN", { reason: "RESULT_READBACK_UNVERIFIED" });
        return { state: "UNKNOWN" as const };
      }
    }
    if (unknown && fetched === null) {
      await this.authority.finish(record.id, "UNKNOWN", { reason: "UNKNOWN_FACTORY_EXPOSURE" });
      return { state: "UNKNOWN" as const, readback };
    }
    if (ingesting && ctx?.work) {
      if (fetched === null) return { state: current.state, readback, result: { pending: true as const } };
      const wrapped =
        typeof fetched === "object" && "result" in (fetched as object)
          ? (fetched as { result: unknown; verdict?: unknown })
          : { result: fetched };
      let retained: RetainedExternalAlphaResult;
      try {
        retained = await ingestExternalAlphaResult({
          database: this.authority.database,
          policy: this.authority.policy,
          config: this.config,
          authority: current,
          work: ctx.work,
          envelope: wrapped.result,
          verdictHint: worstVerdict(resultVerdict, readback.verdict),
          expectedRequestDigest: binding.requestDigest,
          expectedRunId: String(readback.runId),
          now: this.clock(),
        });
      } catch (error) {
        if (error instanceof ExternalAlphaResultRejected) {
          // A signed terminal envelope without a candidate has no candidate
          // Proof to retain. NONE must come from authenticated readback, and
          // completed work still requires a retained candidate Result.
          if (!unknown && error.code === "EXTERNAL_ALPHA_RESULT_NOT_COMPLETED" && resultVerdict === "NONE" && readback.state !== "COMPLETED") {
            const fact = await settleTerminalReadback(this.authority, current, raw, this.keys, binding, challenge, this.clock());
            return { state: fact.authorityState, readback, terminalSettlement: fact, result: { rejected: error.code } };
          }
          if (unknown) await this.authority.finish(record.id, "UNKNOWN", { reason: "UNKNOWN_FACTORY_EXPOSURE" });
          return { state: unknown ? ("UNKNOWN" as const) : current.state, readback, result: { rejected: error.code } };
        }
        throw error;
      }
      const settlement = await settleExternalAlphaResult(this.authority.database, this.authority.policy, current, {
        quiescent: true,
        operations: reports,
      });
      return {
        state: settlement.authorityState as AuthorityState,
        readback,
        result: { retained, settlement },
      };
    }
    if (terminal && readback.state === "COMPLETED")
      return { state: current.state, readback, result: { pending: true as const } };
    if (terminal) {
      if (readback.verdict !== "NONE") return { state: current.state, readback, result: { pending: true as const } };
      const fact = await settleTerminalReadback(this.authority, current, raw, this.keys, binding, challenge, this.clock());
      return { state: fact.authorityState, readback, terminalSettlement: fact };
    }
    return { state: current.state, readback };
  }

  /** Before dispatch this cancels the authority; after consumption it stops the
   * exact Factory request and closes the authority only after quiescence. */
  async stop(workId: string, ctx?: { work: Work }) {
    const record = await this.authority.forWork(workId);
    if (!record) return { state: "NONE" as const };
    if (record.state === "ISSUED")
      return { state: (await this.authority.finish(record.id, "CANCELLED", { reason: "OWNER_STOP" })).state };
    if (!["CONSUMED", "DISPATCHING"].includes(record.state)) return { state: record.state };
    const challenge = readbackChallenge();
    const binding = await dispatchBinding(this.authority.database, record);
    const raw = await this.factory.stop(record.requestId, challenge);
    try { verifyReadback(raw, record, this.keys, binding, challenge, this.clock()); }
    catch {
      await this.authority.finish(record.id, "UNKNOWN", { reason: "STOP_READBACK_UNVERIFIED" });
      return { state: "UNKNOWN" as const };
    }
    return this.reconcile(workId, ctx);
  }
}
