import { createHash, sign as cryptoSign, createPrivateKey, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { digest } from "../engineering/contract.ts";
import { canonical } from "../engineering/factory-producer-protocol.ts";
import { verdictSchema, type SignedVerdict, type Verdict } from "./verdict.ts";

/**
 * Server side of the `/qdev/v1` verifier contract that `HttpVerifierPort` consumes. It is the framework-neutral request handler of the
 * independently administered verifier: it authenticates the caller, binds the handoff to the pinned installation, accepts each candidate's
 * handoff exactly once (idempotent on the same digest, conflict on a different one), evaluates each accepted candidate AT MOST ONCE through
 * the injected protected evaluator under a hard deadline, and signs the resulting verdict with the injected protected signer.
 *
 * Nothing protected lives here: the acceptance criteria are the evaluator's, the private key is the signer's, and credentials are
 * configured as SHA-256 digests only. The single evaluation is marked durably BEFORE it runs and the verdict is persisted before it is
 * returned, so a retried request returns the same signed bytes and can never re-roll an outcome; an evaluator failure, a deadline overrun
 * or a restart that lost the verdict is a signed NOT_RUN, which the journey treats as a halt.
 */
export type VerifierCandidate = { commit: string; tree: string; buildArtifactSha256: string };
export type VerifierHandoffBody = {
  schema: "myeve.qualification-verifier-handoff/v1"; projectSha256: string; sourceSha256: string; protectedSpecificationSha256: string;
  candidateCommit: string; candidateTree: string; buildArtifactSha256: string; handoffSha256: string;
};
export interface VerifierStore {
  /** Atomically records the handoff for the candidate unless one exists; returns the stored handoff digest. */
  putHandoff(candidateKey: string, handoffSha256: string): Promise<{ handoffSha256: string }>;
  getHandoff(candidateKey: string): Promise<{ handoffSha256: string } | null>;
  getVerdict(candidateKey: string): Promise<SignedVerdict | null>;
  /** Atomically marks the candidate's single evaluation as begun; true only for the first caller, ever (durable across restarts). */
  beginEvaluation(candidateKey: string): Promise<boolean>;
  /** Atomically records the verdict unless one exists; returns the stored (first) verdict. */
  putVerdict(candidateKey: string, signed: SignedVerdict): Promise<SignedVerdict>;
}
export type VerifierServiceConfig = {
  /** SHA-256 (hex) of each accepted bearer credential. The credentials themselves are never configured here. */
  credentialSha256: string[];
  /** The one installation binding this verifier serves; handoffs for anything else are refused. */
  expected: { projectSha256: string; sourceSha256: string; protectedSpecificationSha256: string };
  /** Protected criteria. Receives only digests and candidate identity. Any rejection or non-verdict becomes NOT_RUN. */
  evaluate(input: { handoff: VerifierHandoffBody; candidate: VerifierCandidate }, signal: AbortSignal): Promise<"PASS" | "FAIL">;
  /** Protected signer: Ed25519 over the canonical verdict bytes. */
  signer: { keyId: string; sign(message: Uint8Array): Promise<Uint8Array> | Uint8Array };
  store: VerifierStore;
  evaluationDeadlineMs: number;
  now?: () => number;
};

const hex = (n: number) => z.string().regex(new RegExp("^[a-f0-9]{" + n + "}$"));
const handoffSchema = z.object({
  schema: z.literal("myeve.qualification-verifier-handoff/v1"), projectSha256: hex(64), sourceSha256: hex(64), protectedSpecificationSha256: hex(64),
  candidateCommit: hex(40), candidateTree: hex(40), buildArtifactSha256: hex(64), handoffSha256: hex(64),
}).strict();
const candidateSchema = z.object({ candidate: z.object({ commit: hex(40), tree: hex(40), buildArtifactSha256: hex(64) }).strict() }).strict();
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

/** Non-durable store for tests and single-process disposable use. Production binds a durable store with the same atomic put semantics. */
export function memoryVerifierStore(): VerifierStore {
  const handoffs = new Map<string, { handoffSha256: string }>(), verdicts = new Map<string, SignedVerdict>(), begun = new Set<string>();
  return {
    async beginEvaluation(k) { if (begun.has(k)) return false; begun.add(k); return true; },
    async putHandoff(k, h) { if (!handoffs.has(k)) handoffs.set(k, { handoffSha256: h }); return handoffs.get(k)!; },
    async getHandoff(k) { return handoffs.get(k) ?? null; },
    async getVerdict(k) { return verdicts.get(k) ?? null; },
    async putVerdict(k, s) { if (!verdicts.has(k)) verdicts.set(k, structuredClone(s)); return structuredClone(verdicts.get(k)!); },
  };
}

export function createVerifierHandler(config: VerifierServiceConfig): (request: Request) => Promise<Response> {
  if (!config.credentialSha256.length || config.credentialSha256.some(h => !/^[a-f0-9]{64}$/.test(h))) throw new Error("QDEV_VERIFIER_CREDENTIALS");
  if (!Number.isInteger(config.evaluationDeadlineMs) || config.evaluationDeadlineMs < 1 || config.evaluationDeadlineMs > 600_000) throw new Error("QDEV_VERIFIER_DEADLINE");
  if (!config.signer.keyId || config.signer.keyId.length > 120) throw new Error("QDEV_VERIFIER_SIGNER");
  const accepted = config.credentialSha256.map(h => Buffer.from(h, "hex"));
  const now = config.now ?? Date.now;
  const inflight = new Map<string, Promise<SignedVerdict>>();

  const authorized = (request: Request) => {
    const match = /^Bearer (\S{16,512})$/.exec(request.headers.get("authorization") ?? "");
    if (!match) return false;
    const presented = createHash("sha256").update(match[1]).digest();
    let ok = false;
    for (const known of accepted) ok = timingSafeEqual(presented, known) || ok;
    return ok;
  };
  const readBody = async (request: Request): Promise<unknown> => {
    if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new Error("content-type");
    if (Number(request.headers.get("content-length") ?? "0") > MAX_BODY) throw new Error("size");
    const text = await request.text();
    if (Buffer.byteLength(text) > MAX_BODY) throw new Error("size");
    return JSON.parse(text);
  };

  async function evaluateOnce(candidate: VerifierCandidate, handoff: VerifierHandoffBody, mayEvaluate: boolean): Promise<SignedVerdict> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.evaluationDeadlineMs);
    let outcome: Verdict["outcome"] = "NOT_RUN";
    try {
      // A candidate whose single evaluation already began (crash, lost write) is never evaluated again: it is a signed NOT_RUN.
      if (!mayEvaluate) throw new Error("already-begun");
      const result = await Promise.race([
        config.evaluate({ handoff: structuredClone(handoff), candidate: { ...candidate } }, controller.signal),
        new Promise<never>((_, rej) => controller.signal.addEventListener("abort", () => rej(new Error("deadline")), { once: true })),
      ]);
      outcome = result === "PASS" ? "PASS" : result === "FAIL" ? "FAIL" : "NOT_RUN";
    } catch { outcome = "NOT_RUN"; }
    finally { clearTimeout(timer); controller.abort(); }
    const verdict = verdictSchema.parse({
      schema: "myeve.qualification-verdict/v1", verifierKeyId: config.signer.keyId,
      projectSha256: handoff.projectSha256, sourceSha256: handoff.sourceSha256, protectedSpecificationSha256: handoff.protectedSpecificationSha256,
      candidateCommit: candidate.commit, candidateTree: candidate.tree, buildArtifactSha256: candidate.buildArtifactSha256,
      outcome, issuedAt: new Date(now()).toISOString(),
    });
    const signature = await config.signer.sign(Buffer.from(canonical(verdict)));
    return { verdict, signatureBase64: Buffer.from(signature).toString("base64") };
  }

  return async request => {
    const path = new URL(request.url).pathname;
    if (path !== "/qdev/v1/handoff" && path !== "/qdev/v1/verdict") return reject(404, "QDEV_VERIFIER_NOT_FOUND");
    if (request.method !== "POST") return reject(405, "QDEV_VERIFIER_METHOD");
    if (!authorized(request)) return reject(401, "QDEV_VERIFIER_UNAUTHORIZED");
    let body: unknown;
    try { body = await readBody(request); } catch { return reject(400, "QDEV_VERIFIER_REQUEST"); }

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
      const stored = await config.store.putHandoff(key, handoffSha256);
      if (stored.handoffSha256 !== handoffSha256) return reject(409, "QDEV_VERIFIER_HANDOFF_CONFLICT");
      return json(200, { accepted: true, handoffSha256 });
    }

    const parsed = candidateSchema.safeParse(body);
    if (!parsed.success) return reject(400, "QDEV_VERIFIER_CANDIDATE");
    const candidate = parsed.data.candidate, key = keyOf(candidate);
    const existing = await config.store.getVerdict(key);
    if (existing) return json(200, { verdict: existing.verdict, signatureBase64: existing.signatureBase64 });
    const handoffRecord = await config.store.getHandoff(key);
    if (!handoffRecord) return reject(409, "QDEV_VERIFIER_NO_HANDOFF");
    if (!inflight.has(key)) {
      const e = config.expected;
      const handoff: VerifierHandoffBody = {
        schema: "myeve.qualification-verifier-handoff/v1", projectSha256: e.projectSha256, sourceSha256: e.sourceSha256, protectedSpecificationSha256: e.protectedSpecificationSha256,
        candidateCommit: candidate.commit, candidateTree: candidate.tree, buildArtifactSha256: candidate.buildArtifactSha256, handoffSha256: handoffRecord.handoffSha256,
      };
      // Registered synchronously so concurrent requests for one candidate share a single evaluation.
      const run = (async () => {
        const first = await config.store.beginEvaluation(key);
        return config.store.putVerdict(key, await evaluateOnce(candidate, handoff, first));
      })().finally(() => inflight.delete(key));
      inflight.set(key, run);
    }
    try {
      const signed = await inflight.get(key)!;
      return json(200, { verdict: signed.verdict, signatureBase64: signed.signatureBase64 });
    } catch { return reject(503, "QDEV_VERIFIER_UNAVAILABLE"); }
  };
}
