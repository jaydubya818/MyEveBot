import { createPublicKey, verify as verifySignature, type KeyObject } from "node:crypto";
import { z } from "zod";
import { digest } from "../engineering/contract.ts";
import { externalAlphaWorkConfig, externalAlphaWorkConfigSchema, type ExternalAlphaWorkConfig } from "./work-config.ts";
export { externalAlphaWorkConfig, externalAlphaWorkConfigSchema, type ExternalAlphaWorkConfig };
import { workSpendV2Schema } from "../engineering/factory-spend.ts";
import type { Work } from "../engineering/types.ts";
import {
  ExternalAlphaWorkAuthority,
  publicKeyId,
  type AuthorityState,
  type FactoryOperationReport,
  type WorkAuthorityEnvelope,
  type WorkAuthorityRecord,
} from "./work-authority.ts";
import { alphaTasksCriteria } from "./work-tuple.ts";
import {
  ExternalAlphaResultRejected,
  ingestExternalAlphaResult,
  settleExternalAlphaResult,
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
  consume(envelope: WorkAuthorityEnvelope, prepare: Record<string, unknown>): Promise<unknown>;
  read(requestId: string): Promise<unknown | null>;
  stop(requestId: string): Promise<unknown>;
  /** The Factory's signed MYFACTORY_RESULT_V1 for an exact consumed request, or
   * null when it is not published yet. Optional so that a client without a
   * Result channel keeps the accounting-only reconcile. */
  result?(requestId: string): Promise<unknown | null>;
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
  private async call(method: "GET" | "POST", path: string, body?: unknown, allow404 = false, limit = 256000) {
    const f = this.deps.fetcher ?? fetch;
    const response = await f(new URL("/api/connect/v2/external-alpha" + path, this.config.factory.origin), {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: await this.headers(),
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
  consume(envelope: WorkAuthorityEnvelope, prepare: Record<string, unknown>) {
    return this.call("POST", "/dispatches", { authority: envelope, prepare });
  }
  read(requestId: string) {
    return this.call("GET", "/dispatches/" + encodeURIComponent(requestId), undefined, true);
  }
  stop(requestId: string) {
    return this.call("POST", `/dispatches/${encodeURIComponent(requestId)}/stop`, {});
  }
  result(requestId: string) {
    return this.call("GET", `/dispatches/${encodeURIComponent(requestId)}/result`, undefined, true, 13_000_000);
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
    ![...keys.values()].some((key) => verifySignature(null, signed, key, signature))
  )
    throw Error("EXTERNAL_ALPHA_RECEIPT_INVALID");
  return r;
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

export function operationReports(spend: unknown): FactoryOperationReport[] {
  const parsed = workSpendV2Schema.safeParse(spend);
  if (!parsed.success) throw Error("EXTERNAL_ALPHA_SPEND_UNPARSEABLE");
  return parsed.data.operations
    .filter((o) => o.state === "settled" || o.state === "unknown")
    .map((o) => ({
      operationId: o.operationId,
      phase: o.phase,
      state: o.state as "settled" | "unknown",
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
    try {
      response = await this.factory.consume(
        record.envelope,
        prepareRequest(record, work, this.config, this.clock()),
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
      readback = verifyReadback(response, record, this.keys);
    } catch {
      await this.authority.finish(record.id, "UNKNOWN", { reason: "RECEIPT_UNVERIFIED" }).catch(() => {});
      throw Error("EXTERNAL_ALPHA_DISPATCH_UNKNOWN");
    }
    const consumed = await this.authority.finish(record.id, "CONSUMED", { receipt: readback.authorityReceipt });
    return { sent: true, authority: consumed, readback };
  }

  /** Read-only against the Factory; records usage exact-once and closes the
   * authority only at confirmed quiescence. */
  async reconcile(workId: string, ctx?: { work: Work }) {
    const record = await this.authority.forWork(workId);
    if (!record) return { state: "NONE" as const };
    if (!["DISPATCHING", "CONSUMED"].includes(record.state)) return { state: record.state };
    const raw = await this.factory.read(record.requestId);
    if (raw === null) return { state: record.state }; // sweep fences an unresolved dispatch after expiry
    const readback = verifyReadback(raw, record, this.keys);
    let current = record;
    if (record.state === "DISPATCHING")
      current = await this.authority.finish(record.id, "CONSUMED", { receipt: readback.authorityReceipt });
    let reports: FactoryOperationReport[];
    try {
      reports = operationReports(readback.spend);
    } catch {
      await this.authority.finish(record.id, "UNKNOWN", { reason: "SPEND_UNPARSEABLE" });
      return { state: "UNKNOWN" as const };
    }
    let unknown = false;
    for (const op of reports) {
      const row = await this.authority.recordFactoryOperation(current, op);
      if (row.state === "UNKNOWN") unknown = true;
    }
    const terminal =
      readback.quiescent && ["COMPLETED", "FAILED", "CANCELLED", "NOT_DISPATCHED"].includes(readback.state);
    const ingesting = terminal && readback.state === "COMPLETED" && !!ctx?.work && !!this.factory.result;
    // The owner must be able to read the durable Result/Proof before the
    // authority closes, even when Factory exposure is UNKNOWN (settlement then
    // fences it). Only an unpublished Result with UNKNOWN exposure fences at once.
    const fetched = ingesting ? await this.factory.result!(record.requestId) : null;
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
          verdictHint: worstVerdict(wrapped.verdict, (readback as Record<string, unknown>).verifierVerdict),
          now: this.clock(),
        });
      } catch (error) {
        if (error instanceof ExternalAlphaResultRejected) {
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
    if (terminal) {
      const closed = await this.authority.finish(
        record.id,
        readback.state === "CANCELLED" || readback.state === "NOT_DISPATCHED" ? "CANCELLED" : "COMPLETED",
        { reason: "FACTORY_" + readback.state },
      );
      return { state: closed.state, readback };
    }
    return { state: current.state, readback };
  }

  /** Before dispatch this cancels the authority; after consumption it stops the
   * exact Factory request and closes the authority only after quiescence. */
  async stop(workId: string) {
    const record = await this.authority.forWork(workId);
    if (!record) return { state: "NONE" as const };
    if (record.state === "ISSUED")
      return { state: (await this.authority.finish(record.id, "CANCELLED", { reason: "OWNER_STOP" })).state };
    if (!["CONSUMED", "DISPATCHING"].includes(record.state)) return { state: record.state };
    const raw = await this.factory.stop(record.requestId);
    verifyReadback(raw, record, this.keys);
    return this.reconcile(workId);
  }
}
