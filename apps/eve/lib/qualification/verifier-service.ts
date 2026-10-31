import { createHash, sign as cryptoSign, createPrivateKey, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { QDEV_LIMITS } from "../external-alpha/qualification-accounting.ts";
import { digest } from "../engineering/contract.ts";
import { canonical } from "../engineering/factory-producer-protocol.ts";
import { verdictSchema, type SignedVerdict, type Verdict } from "./verdict.ts";
import { ARTIFACT_COMMIT_BODY_LIMIT, ARTIFACT_PATHS, ArtifactStagingRefused, artifactRoutes, type ArtifactStagingStore, type StagedArtifact } from "./artifact-staging.ts";

/**
 * Server side of the `/qdev/v1` verifier contract that `HttpVerifierPort` consumes: the framework-neutral request handler of the
 * independently administered verifier. It authenticates the caller, binds the handoff to the pinned installation, and EXECUTES the
 * evaluation inside the charged `evaluate` call, so the qdev gate settles the verifier operation only after the evaluation has finished:
 *
 *   POST /qdev/v1/handoff   VerifierHandoff                  -> { accepted: true, handoffSha256 }          (registers the candidate; evaluates nothing)
 *   POST /qdev/v1/evaluate  { candidate, reserveMicrousd }    -> { state: "FINAL", handoffSha256, usage }   (runs the single evaluation, then returns)
 *   POST /qdev/v1/verdict   { candidate }                     -> { verdict, signatureBase64 }               (PURE READ of a final verdict; never evaluates)
 *
 * The evaluation runs at most once per candidate (durably marked before it starts), with the charged reserve as its hard cap and a hard
 * deadline. `usage.quiescent` is true only when the evaluator itself reported that all of its work has CEASED: an AbortSignal and a response
 * deadline alone never establish that. An evaluator that has not ceased within the grace period, reports unusable usage, or exceeds the cap
 * leaves `quiescent: false` and a signed NOT_RUN, which the client treats as unsettled exposure (the gate fences; nothing is resent). Paid
 * evaluation is declared in configuration: an unpaid evaluator must report exactly zero usage.
 *
 * Nothing protected lives here: the criteria are the evaluator's, the private key is the signer's, credentials are SHA-256 digests only.
 */
export type VerifierCandidate = { commit: string; tree: string; buildArtifactSha256: string };
export type VerifierHandoffBody = {
  schema: "myeve.qualification-verifier-handoff/v1"; projectSha256: string; sourceSha256: string; protectedSpecificationSha256: string;
  candidateCommit: string; candidateTree: string; buildArtifactSha256: string; handoffSha256: string;
};
export type EvaluatorResult = { outcome: "PASS" | "FAIL" | "NOT_RUN"; usedMicrousd: number };
/**
 * Protected evaluator. `run` MUST settle only after every process, container and request it started has ceased (resolve or reject), and must
 * honour `signal` and `budgetMicrousd` (its hard cap). Reject with EvaluatorNotQuiescent when cessation could not be proven.
 */
export interface QuiescentEvaluator {
  run(input: { handoff: VerifierHandoffBody; candidate: VerifierCandidate; artifact?: StagedArtifact }, context: { signal: AbortSignal; budgetMicrousd: number }): Promise<EvaluatorResult>;
}
export class EvaluatorNotQuiescent extends Error { constructor(message = "evaluator cessation not proven") { super(message); } }

export type VerifierUsage = { settledMicrousd: number | null; quiescent: boolean };
export type VerifierRecord = {
  handoffSha256: string; phase: "HANDED_OFF" | "RUNNING" | "FINAL";
  reserveMicrousd: number | null; beganAtMs: number | null; usage: VerifierUsage | null; signed: SignedVerdict | null;
};
export interface VerifierStore {
  /** Atomically records the handoff unless one exists; returns the stored handoff digest. */
  putHandoff(candidateKey: string, handoffSha256: string): Promise<{ handoffSha256: string }>;
  get(candidateKey: string): Promise<VerifierRecord | null>;
  /** Atomically HANDED_OFF -> RUNNING with the charged reserve; true only for the first caller, ever (durable across restarts). */
  begin(candidateKey: string, reserveMicrousd: number, nowMs: number): Promise<boolean>;
  /** Atomically RUNNING -> FINAL with usage and the signed verdict; returns the stored (first) final record. */
  finish(candidateKey: string, usage: VerifierUsage, signed: SignedVerdict): Promise<VerifierRecord>;
}
export type VerifierServiceConfig = {
  /** SHA-256 (hex) of each accepted bearer credential. The credentials themselves are never configured here. */
  credentialSha256: string[];
  /** The one installation binding this verifier serves; handoffs for anything else are refused. */
  expected: { projectSha256: string; sourceSha256: string; protectedSpecificationSha256: string };
  evaluator: QuiescentEvaluator;
  /** Explicit: a paid evaluator reports usage within the charged cap; an unpaid evaluator must report exactly zero. */
  paid: boolean;
  /** Protected signer: Ed25519 over the canonical verdict bytes. */
  signer: { keyId: string; sign(message: Uint8Array): Promise<Uint8Array> | Uint8Array };
  store: VerifierStore;
  /** Durable exact-byte staging area. When configured, a handoff for an unstaged candidate is refused and every staged byte is re-verified before the evaluation begins;
   * the evaluator receives the staged directory and file digests. Without it the service is digest-only (tests / non-artifact evaluators). */
  artifacts?: ArtifactStagingStore;
  evaluationDeadlineMs: number;
  /** How long an aborted evaluator may take to prove cessation before the run is reported non-quiescent. */
  quiescenceGraceMs?: number;
  /** Process shutdown. Once aborted, no new evaluation begins and every running one is aborted exactly like an expired deadline: the evaluator must prove
   * cessation within the grace period or the run is reported non-quiescent (never as success). */
  shutdown?: AbortSignal;
  now?: () => number;
};

const hex = (n: number) => z.string().regex(new RegExp("^[a-f0-9]{" + n + "}$"));
const handoffSchema = z.object({
  schema: z.literal("myeve.qualification-verifier-handoff/v1"), projectSha256: hex(64), sourceSha256: hex(64), protectedSpecificationSha256: hex(64),
  candidateCommit: hex(40), candidateTree: hex(40), buildArtifactSha256: hex(64), handoffSha256: hex(64),
}).strict();
const candidateShape = z.object({ commit: hex(40), tree: hex(40), buildArtifactSha256: hex(64) }).strict();
const verdictRequest = z.object({ candidate: candidateShape }).strict();
const evaluateRequest = z.object({ candidate: candidateShape, reserveMicrousd: z.number().int().min(1).max(QDEV_LIMITS.perWorkMicrousd) }).strict();
const MAX_BODY = 8_192;
const keyOf = (c: VerifierCandidate) => c.commit + ":" + c.tree + ":" + c.buildArtifactSha256;
const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const reject = (status: number, code: string) => json(status, { error: code });

/** Ed25519 signer from a PEM key supplied by the verifier's own custody at process start. */
export function ed25519Signer(keyId: string, privatePem: string): VerifierServiceConfig["signer"] {
  const key = createPrivateKey(privatePem);
  if (key.asymmetricKeyType !== "ed25519") throw new Error("QDEV_VERIFIER_SIGNER_KEY");
  return { keyId, sign: message => cryptoSign(null, Buffer.from(message), key) };
}

/** Non-durable store for tests and single-process disposable use. Production binds a durable store with the same atomic semantics. */
export function memoryVerifierStore(): VerifierStore {
  const rows = new Map<string, VerifierRecord>();
  return {
    async putHandoff(k, h) { if (!rows.has(k)) rows.set(k, { handoffSha256: h, phase: "HANDED_OFF", reserveMicrousd: null, beganAtMs: null, usage: null, signed: null }); return { handoffSha256: rows.get(k)!.handoffSha256 }; },
    async get(k) { const r = rows.get(k); return r ? structuredClone(r) : null; },
    async begin(k, reserve, nowMs) { const r = rows.get(k); if (!r || r.phase !== "HANDED_OFF") return false; Object.assign(r, { phase: "RUNNING", reserveMicrousd: reserve, beganAtMs: nowMs }); return true; },
    async finish(k, usage, signed) { const r = rows.get(k); if (!r) throw new Error("QDEV_VERIFIER_NO_RECORD"); if (r.phase === "RUNNING") Object.assign(r, { phase: "FINAL", usage: structuredClone(usage), signed: structuredClone(signed) }); return structuredClone(r); },
  };
}

export function createVerifierHandler(config: VerifierServiceConfig): (request: Request) => Promise<Response> {
  if (!config.credentialSha256.length || config.credentialSha256.some(h => !/^[a-f0-9]{64}$/.test(h))) throw new Error("QDEV_VERIFIER_CREDENTIALS");
  if (!Number.isInteger(config.evaluationDeadlineMs) || config.evaluationDeadlineMs < 1 || config.evaluationDeadlineMs > 600_000) throw new Error("QDEV_VERIFIER_DEADLINE");
  const grace = config.quiescenceGraceMs ?? 5_000;
  if (!Number.isInteger(grace) || grace < 1 || grace > 60_000) throw new Error("QDEV_VERIFIER_GRACE");
  if (typeof config.paid !== "boolean" || typeof config.evaluator?.run !== "function") throw new Error("QDEV_VERIFIER_EVALUATOR");
  if (!config.signer.keyId || config.signer.keyId.length > 120) throw new Error("QDEV_VERIFIER_SIGNER");
  const accepted = config.credentialSha256.map(h => Buffer.from(h, "hex"));
  const now = config.now ?? Date.now;
  const inflight = new Map<string, Promise<VerifierRecord | null>>();
  const orphanAfterMs = config.evaluationDeadlineMs + grace + 5_000;
  const artifactApi = config.artifacts ? artifactRoutes(config.artifacts, config.expected) : null;

  const authorized = (request: Request) => {
    const value = request.headers.get("authorization") ?? "";
    const match = /^Bearer (\S{16,512})$/.exec(value);
    if (!match) return false;
    const presented = createHash("sha256").update(match[1]).digest();
    let ok = false;
    for (const known of accepted) ok = timingSafeEqual(presented, known) || ok;
    return ok;
  };
  const readBody = async (request: Request, max = MAX_BODY): Promise<unknown> => {
    if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new Error("content-type");
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > max) throw new Error("size");
    const text = await request.text();
    if (Buffer.byteLength(text) > max) throw new Error("size");
    return JSON.parse(text);
  };
  const sign = async (candidate: VerifierCandidate, handoff: VerifierHandoffBody, outcome: Verdict["outcome"]): Promise<SignedVerdict> => {
    const verdict = verdictSchema.parse({
      schema: "myeve.qualification-verdict/v1", verifierKeyId: config.signer.keyId,
      projectSha256: handoff.projectSha256, sourceSha256: handoff.sourceSha256, protectedSpecificationSha256: handoff.protectedSpecificationSha256,
      candidateCommit: candidate.commit, candidateTree: candidate.tree, buildArtifactSha256: candidate.buildArtifactSha256,
      outcome, issuedAt: new Date(now()).toISOString(),
    });
    const signature = await config.signer.sign(Buffer.from(canonical(verdict)));
    return { verdict, signatureBase64: Buffer.from(signature).toString("base64") };
  };
  const handoffFor = (candidate: VerifierCandidate, handoffSha256: string): VerifierHandoffBody => {
    const e = config.expected;
    return { schema: "myeve.qualification-verifier-handoff/v1", projectSha256: e.projectSha256, sourceSha256: e.sourceSha256, protectedSpecificationSha256: e.protectedSpecificationSha256,
      candidateCommit: candidate.commit, candidateTree: candidate.tree, buildArtifactSha256: candidate.buildArtifactSha256, handoffSha256 };
  };

  /** Runs the single evaluation. Resolves only after the evaluator settled or the grace period after the deadline expired. */
  async function evaluateOnce(key: string, candidate: VerifierCandidate, handoff: VerifierHandoffBody, reserve: number, artifact?: StagedArtifact): Promise<VerifierRecord> {
    const controller = new AbortController();
    let settled = false, deadlineHit = false;
    const run: Promise<{ ok: true; result: unknown } | { ok: false; notQuiescent: boolean }> = (async () => config.evaluator.run(
      { handoff: structuredClone(handoff), candidate: { ...candidate }, ...(artifact ? { artifact: structuredClone(artifact) } : {}) }, { signal: controller.signal, budgetMicrousd: reserve }))()
      .then(result => ({ ok: true as const, result }), error => ({ ok: false as const, notQuiescent: error instanceof EvaluatorNotQuiescent }))
      .finally(() => { settled = true; });
    let timer: ReturnType<typeof setTimeout> | undefined, graceTimer: ReturnType<typeof setTimeout> | undefined;
    let onShutdown: (() => void) | undefined;
    const deadline = new Promise<"deadline">(resolve => {
      const expire = () => { deadlineHit = true; controller.abort(); resolve("deadline"); };
      timer = setTimeout(expire, config.evaluationDeadlineMs);
      onShutdown = expire;
      if (config.shutdown?.aborted) expire(); else config.shutdown?.addEventListener("abort", expire, { once: true });
    });
    const first = await Promise.race([run, deadline]);
    clearTimeout(timer);
    if (onShutdown) config.shutdown?.removeEventListener("abort", onShutdown);
    let observed = first === "deadline" ? undefined : first;
    if (first === "deadline") {
      // Abort is a request, not proof. Cessation is whatever the evaluator reports by settling within the grace period.
      const waited = await Promise.race([run, new Promise<"grace">(resolve => { graceTimer = setTimeout(() => resolve("grace"), grace); })]);
      clearTimeout(graceTimer);
      if (waited !== "grace") observed = waited;
    }
    controller.abort();
    const quiescent = settled && !(observed && !observed.ok && observed.notQuiescent);
    let outcome: Verdict["outcome"] = "NOT_RUN";
    let used: number | null = null;
    if (observed?.ok) {
      const r = observed.result as Partial<EvaluatorResult> | null;
      const valid = !!r && typeof r === "object" && Number.isInteger(r.usedMicrousd) && r.usedMicrousd! >= 0 && r.usedMicrousd! <= reserve
        && (config.paid || r.usedMicrousd === 0) && (r.outcome === "PASS" || r.outcome === "FAIL" || r.outcome === "NOT_RUN");
      if (valid) { used = r!.usedMicrousd!; if (!deadlineHit) outcome = r!.outcome!; }
    }
    // An unpaid evaluator that produced no report cannot have spent; one that REPORTED unusable or non-zero usage broke its declaration, and a paid
    // one with no valid final usage report has unknown spend: both stay unsettled.
    if (!config.paid && quiescent && !observed?.ok) used = 0;
    const usage: VerifierUsage = { settledMicrousd: quiescent ? used : null, quiescent: quiescent && used !== null };
    const signed = await sign(candidate, handoff, usage.quiescent ? outcome : "NOT_RUN");
    return config.store.finish(key, usage, signed);
  }

  const status = (handoffSha256: string, record: VerifierRecord) =>
    json(200, { state: "FINAL", handoffSha256, usage: { settledMicrousd: record.usage!.settledMicrousd, quiescent: record.usage!.quiescent } });

  return async request => {
    const path = new URL(request.url).pathname;
    const isArtifact = path === ARTIFACT_PATHS.file || path === ARTIFACT_PATHS.commit;
    if (path !== "/qdev/v1/handoff" && path !== "/qdev/v1/evaluate" && path !== "/qdev/v1/verdict" && !(isArtifact && artifactApi)) return reject(404, "QDEV_VERIFIER_NOT_FOUND");
    if (request.method !== "POST") return reject(405, "QDEV_VERIFIER_METHOD");
    if (!authorized(request)) return reject(401, "QDEV_VERIFIER_UNAUTHORIZED");
    if (config.shutdown?.aborted) return reject(503, "QDEV_VERIFIER_SHUTTING_DOWN");
    if (path === ARTIFACT_PATHS.file) return artifactApi!.file(request);
    let body: unknown;
    try { body = await readBody(request, path === ARTIFACT_PATHS.commit ? ARTIFACT_COMMIT_BODY_LIMIT : MAX_BODY); } catch { return reject(400, "QDEV_VERIFIER_REQUEST"); }
    if (path === ARTIFACT_PATHS.commit) return artifactApi!.commit(body);

    if (path === "/qdev/v1/handoff") {
      const parsed = handoffSchema.safeParse(body);
      if (!parsed.success) return reject(400, "QDEV_VERIFIER_HANDOFF");
      const handoff = parsed.data;
      const { handoffSha256, ...rest } = handoff;
      if (digest(rest) !== handoffSha256) return reject(400, "QDEV_VERIFIER_HANDOFF_DIGEST");
      const e = config.expected;
      if (handoff.projectSha256 !== e.projectSha256 || handoff.sourceSha256 !== e.sourceSha256 || handoff.protectedSpecificationSha256 !== e.protectedSpecificationSha256)
        return reject(403, "QDEV_VERIFIER_FOREIGN_BINDING");
      const key = keyOf({ commit: handoff.candidateCommit, tree: handoff.candidateTree, buildArtifactSha256: handoff.buildArtifactSha256 });
      // The exact bytes must already be staged: nothing is registered, and so nothing can be evaluated, for bytes this host does not hold.
      if (config.artifacts && !(await config.artifacts.has({ commit: handoff.candidateCommit, tree: handoff.candidateTree, buildArtifactSha256: handoff.buildArtifactSha256 }))) return reject(409, "QDEV_ARTIFACT_NOT_STAGED");
      const stored = await config.store.putHandoff(key, handoffSha256);
      if (stored.handoffSha256 !== handoffSha256) return reject(409, "QDEV_VERIFIER_HANDOFF_CONFLICT");
      return json(200, { accepted: true, handoffSha256 });
    }

    if (path === "/qdev/v1/verdict") {
      // Pure read: a verdict is returned only once the single charged evaluation is FINAL. This route can never start an evaluation.
      const parsed = verdictRequest.safeParse(body);
      if (!parsed.success) return reject(400, "QDEV_VERIFIER_CANDIDATE");
      const record = await config.store.get(keyOf(parsed.data.candidate));
      if (!record) return reject(409, "QDEV_VERIFIER_NO_HANDOFF");
      if (record.phase !== "FINAL" || !record.signed) return reject(409, "QDEV_VERIFIER_NOT_FINAL");
      return json(200, { verdict: record.signed.verdict, signatureBase64: record.signed.signatureBase64 });
    }

    const parsed = evaluateRequest.safeParse(body);
    if (!parsed.success) return reject(400, "QDEV_VERIFIER_EVALUATE");
    const { candidate, reserveMicrousd } = parsed.data, key = keyOf(candidate);
    try {
      const record = await config.store.get(key);
      if (!record) return reject(409, "QDEV_VERIFIER_NO_HANDOFF");
      if (record.phase === "FINAL") return record.reserveMicrousd === reserveMicrousd ? status(record.handoffSha256, record) : reject(409, "QDEV_VERIFIER_RESERVE_CONFLICT");
      let run = inflight.get(key);
      if (!run) {
        // Registered synchronously, before any await, so concurrent requests in this process share the one begin/evaluation.
        run = (async () => {
          if (record.phase !== "HANDED_OFF") return null;
          // Re-verify every staged byte BEFORE the durable begin: a tampered or missing artifact never starts (or charges) an evaluation.
          const artifact = config.artifacts ? await config.artifacts.open(candidate) : undefined;
          if (!(await config.store.begin(key, reserveMicrousd, now()))) return null;
          return evaluateOnce(key, candidate, handoffFor(candidate, record.handoffSha256), reserveMicrousd, artifact);
        })().finally(() => inflight.delete(key));
        inflight.set(key, run);
      }
      const final = await run;
      if (final) return final.reserveMicrousd === reserveMicrousd ? status(final.handoffSha256, final) : reject(409, "QDEV_VERIFIER_RESERVE_CONFLICT");
      // The evaluation began elsewhere or before a restart. Never evaluate again; finalize only once it must have ended.
      const current = await config.store.get(key);
      if (!current) return reject(409, "QDEV_VERIFIER_NO_HANDOFF");
      if (current.reserveMicrousd !== reserveMicrousd) return reject(409, "QDEV_VERIFIER_RESERVE_CONFLICT");
      if (current.phase === "FINAL") return status(current.handoffSha256, current);
      if (inflight.has(key) || current.beganAtMs === null || now() - current.beganAtMs < orphanAfterMs) return reject(409, "QDEV_VERIFIER_IN_PROGRESS");
      const signed = await sign(candidate, handoffFor(candidate, current.handoffSha256), "NOT_RUN");
      const finalized = await config.store.finish(key, { settledMicrousd: null, quiescent: false }, signed);
      return status(finalized.handoffSha256, finalized);
    } catch (error) { return error instanceof ArtifactStagingRefused ? reject(409, error.code) : reject(503, "QDEV_VERIFIER_UNAVAILABLE"); }
  };
}
