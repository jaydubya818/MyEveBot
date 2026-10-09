import { canonical, type ResultManifest } from "./factory-producer-protocol.ts";
import { createHash } from "node:crypto";
import { z } from "zod";
import { boundedJson } from "../relay/client.ts";
import { factoryRequestHeaders } from "./factory-request-headers.ts";
import { factoryTransport } from "./factory-transport.ts";
import type { FactoryConnection } from "./factory-live-adapter.ts";
import { WorkError } from "./types.ts";

export const evidenceKinds = ["TestEvidence", "DiffEvidence"] as const;
export const evidenceLimits = { TestEvidence: 512 * 1024, DiffEvidence: 4 * 1024 * 1024 };
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const evidenceMetadata = z.object({
  id: z.string().min(1).max(128), kind: z.enum(evidenceKinds), mediaType: z.string().min(1).max(128),
  workOrderId: z.string().uuid(), runId: z.string().uuid(), candidateCommit: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/),
  factoryVersion: hash, sha256: hash, size: z.number().int().positive(), collectedAt: z.string().datetime(), source: z.string().min(1).max(128),
}).strict();
export type EvidenceMetadata = z.infer<typeof evidenceMetadata>;
export interface EvidenceScope { ownerScope: string; repository: string; workId: string; workGeneration: number; requestId: string }
export interface EvidenceBinding extends EvidenceScope { workOrderId: string; runId: string; candidateCommit: string; factoryVersion: string }
export interface EvidenceRequest extends EvidenceBinding { evidenceReference: string; expectedDigest: string; evidenceKind: typeof evidenceKinds[number] }
export const evidenceSha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
// This insertion order is the accepted Factory EvidenceProvider wire contract.
export function evidenceReference(ref: Pick<EvidenceMetadata, "workOrderId" | "runId" | "candidateCommit" | "factoryVersion" | "kind" | "sha256">) {
  return `factory-evidence:sha256:${evidenceSha(Buffer.from(JSON.stringify({ workOrderId: ref.workOrderId, runId: ref.runId,
    candidateCommit: ref.candidateCommit, factoryVersion: ref.factoryVersion, kind: ref.kind, sha256: ref.sha256 })))}`;
}
export class EvidenceWaiting extends WorkError { constructor() { super("factory_evidence_waiting", "Candidate retained. Waiting for Factory evidence; no new execution is needed.", 503); } }
const invalid = () => new WorkError("factory_evidence_integrity", "Factory evidence does not match the retained candidate. Investigation required.");
export function verifyEvidence(value: unknown, expected: EvidenceRequest) {
  const parsed = z.object({ scope: z.object({ ownerScope: z.string(), repository: z.string(), workId: z.string(), workGeneration: z.number().int().positive(), requestId: z.string() }).strict(),
    ref: evidenceMetadata, proofReference: z.string(), base64: z.string() }).strict().safeParse(value);
  if (!parsed.success) throw invalid();
  const { scope, ref, proofReference, base64 } = parsed.data;
  if (Object.entries(scope).some(([key, v]) => v !== expected[key as keyof EvidenceScope]) ||
      ["workOrderId", "runId", "candidateCommit", "factoryVersion"].some(key => ref[key as keyof EvidenceMetadata] !== expected[key as keyof EvidenceBinding]) ||
      ref.kind !== expected.evidenceKind || ref.sha256 !== expected.expectedDigest || proofReference !== expected.evidenceReference || evidenceReference(ref) !== proofReference ||
      ref.size > evidenceLimits[ref.kind] || base64.length > Math.ceil(evidenceLimits[ref.kind] / 3) * 4) throw invalid();
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length !== ref.size || bytes.toString("base64") !== base64 || evidenceSha(bytes) !== ref.sha256) throw invalid();
  return { scope, ref, proofReference, bytes };
}
/** Backend-only read credential. Execution credentials cannot substitute for it. */
export class FactoryEvidenceClient {
  constructor(readonly config: FactoryConnection, readonly fetcher: typeof fetch = fetch) {}
  private async request(path: string, body?: unknown) {
    const evidence = this.config.evidence;
    if (!evidence || evidence.token === this.config.token || evidence.ownerScope !== this.config.qualification.scopeId || Date.parse(evidence.expiresAt) <= Date.now())
      throw new WorkError("factory_evidence_credentials", "A current separately scoped Proof connection is required.");
    const config = { ...this.config, token: evidence.token }, transport = factoryTransport({...config,releaseValidation:undefined});
    let response: Response;
    try { response = await this.fetcher(new URL(transport.prefix + path, transport.origin), {
      method: body === undefined ? "GET" : "POST", headers: { ...await factoryRequestHeaders(config), "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: "error", signal: AbortSignal.timeout(15000),
    }); } catch { throw new EvidenceWaiting(); }
    if (!response.ok) {
      if (response.status === 409) {
        const error = await boundedJson(response, 4096) as { code?: string };
        if (error.code !== "waiting_for_evidence") throw invalid();
      } else if (response.status < 500) throw invalid();
      throw new EvidenceWaiting();
    }
    return boundedJson(response, Math.ceil(evidenceLimits.DiffEvidence / 3) * 4 + 32000);
  }
  async collect(binding: EvidenceBinding) {
    if (binding.ownerScope !== this.config.evidence?.ownerScope || binding.factoryVersion !== this.config.factoryVersion) throw invalid();
    const detail = await this.request("/work-orders/" + encodeURIComponent(binding.workOrderId)) as { events?: { runId?: string; type?: string; payload?: { refs?: unknown[] } }[] };
    const events = detail.events?.filter(e => e.runId === binding.runId && e.type === "run.evidence_collected");
    if (events?.length !== 1 || !Array.isArray(events[0].payload?.refs)) throw new EvidenceWaiting();
    const refs = events[0].payload.refs as (EvidenceMetadata & { proofReference: string })[];
    const result = [];
    for (const kind of evidenceKinds) {
      const matches = refs.filter(ref => ref.kind === kind);
      if (matches.length !== 1) throw invalid();
      const ref = matches[0];
      if (ref.workOrderId !== binding.workOrderId || ref.runId !== binding.runId || ref.candidateCommit !== binding.candidateCommit || ref.factoryVersion !== binding.factoryVersion || !hash.safeParse(ref.sha256).success || ref.proofReference !== evidenceReference(ref)) throw invalid();
      const request: EvidenceRequest = { ...binding, evidenceKind: kind, expectedDigest: ref.sha256, evidenceReference: ref.proofReference };
      result.push(verifyEvidence(await this.request("/evidence/read", request), request));
    }
    return result;
  }
}

/** Evidence labels and self-reported hashes are insufficient: bind actual content
 * to the independently authenticated signed Result already admitted by Gate C. */
export function verifySignedEvidence(evidence: ReturnType<typeof verifyEvidence>, manifest: ResultManifest) {
  const { ref, bytes } = evidence, candidate = manifest.candidate, execution = manifest.execution;
  if (!candidate || ref.candidateCommit !== candidate.commit || ref.workOrderId !== execution.workOrderId ||
      ref.runId !== execution.runId || ref.factoryVersion !== execution.factoryVersion) throw invalid();
  if (ref.kind === "DiffEvidence") {
    const patch = manifest.artifacts.find(a => a.id === candidate.patchArtifactId);
    if (!patch || patch.kind !== "patch" || ref.sha256 !== candidate.patchDigest || ref.sha256 !== patch.sha256 || bytes.length !== patch.size) throw invalid();
  } else {
    const expected = manifest.evidence.map(check => ({ command: check.command, status: check.status, exitCode: check.exitCode, candidateCommit: check.candidateCommit }));
    try { if (canonical(JSON.parse(bytes.toString("utf8"))) !== canonical(expected)) throw invalid(); } catch { throw invalid(); }
  }
}
