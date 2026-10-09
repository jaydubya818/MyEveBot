import { z } from "zod";
import { digest } from "../engineering/contract.ts";
import { canonical, sha256, type ResultManifest, type SignedResult } from "../engineering/factory-producer-protocol.ts";
import { proofOfWorkSchema, type ProofOfWork } from "../digital-worker/contracts.ts";
import type { ExecutionDatabase } from "../execution-types.ts";
import type { WorkStore } from "../engineering/store.ts";
import { WorkError, type Work } from "../engineering/types.ts";
import type { RetainedExternalAlphaResult } from "./result-ingestion.ts";
import { workAuthoritySchema, type AuthorityState, type WorkAuthorityRecord } from "./work-authority.ts";
import type { ExternalAlphaPolicy } from "./policy.ts";

const terminalState = z.enum(["FAILED", "CANCELLED", "NOT_DISPATCHED"]);
const integrity = () => new WorkError("EXTERNAL_ALPHA_READBACK_INTEGRITY", "The retained external-alpha evidence failed its integrity check.", 503);

/** Derived evidence is deterministic from the already authenticated envelope.
 * It makes no new verifier claim and includes the producer and verifier separately. */
export function externalAlphaEvidence(manifest: ResultManifest, artifacts: SignedResult["artifacts"]) {
  const candidate = manifest.candidate;
  if (!candidate) throw integrity();
  const patch = artifacts.find(a => a.id === candidate.patchArtifactId);
  const metadata = manifest.artifacts.find(a => a.id === candidate.patchArtifactId);
  if (!patch || !metadata || metadata.kind !== "patch") throw integrity();
  const bytes = Buffer.from(patch.base64, "base64");
  if (sha256(bytes) !== metadata.sha256 || bytes.length !== metadata.size || metadata.sha256 !== candidate.patchDigest) throw integrity();
  const tests = Buffer.from(canonical({ version: 1, producer: manifest.evidence, independentVerifier: manifest.verification ?? null }));
  return [
    { bytes, ref: { kind: "DiffEvidence" as const, sha256: sha256(bytes) } },
    { bytes: tests, ref: { kind: "TestEvidence" as const, sha256: sha256(tests) } },
  ].map(e => ({ ...e, proofReference: `factory-evidence:sha256:${e.ref.sha256}` }));
}

interface Custody {
  retained: RetainedExternalAlphaResult;
  proof: ProofOfWork;
  contentHash: string;
  manifest: ResultManifest;
  artifacts: SignedResult["artifacts"];
  current: boolean;
  acceptance: { decisionId: string; acceptedAt: string; resultId: string; completedVersion: number; completedGeneration: number } | null;
}

async function resultCustody(database: ExecutionDatabase, ownerId: string, work: Work,
  selector: { authorityId?: string; policySha256?: string; resultId?: string } = {}): Promise<Custody | null> {
  const [row] = await database.query(`SELECT r.*,n.proof,n.content_hash,a.document,a.document_sha256,a.request_id,a.receipt,d.request_digest
    FROM external_alpha_work_result r JOIN external_alpha_work_authority a ON a.id=r.authority_id AND a.owner_id=r.owner_id
    JOIN external_alpha_work_dispatch d ON d.authority_id=a.id AND d.owner_id=a.owner_id AND d.policy_sha256=a.policy_sha256
    JOIN engineering_native_results n ON n.id=r.result_id AND n.scope_id=r.owner_id AND n.scope_kind='personal'
      AND n.work_id=r.work_id AND n.work_version=r.work_version AND n.work_generation=r.work_generation AND n.candidate_sha=r.candidate_sha
    WHERE r.owner_id=$1 AND r.work_id=$2 AND ($3::uuid IS NULL OR r.authority_id=$3)
      AND ($4::text IS NULL OR a.policy_sha256=$4) AND ($5::uuid IS NULL OR r.result_id=$5)
    ORDER BY r.created_at DESC,r.result_id LIMIT 1`,
    [ownerId, work.id, selector.authorityId ?? null, selector.policySha256 ?? null, selector.resultId ?? null]);
  if (!row) return null;
  try {
    if (digest(row.proof) !== row.content_hash || digest(row.document) !== row.document_sha256) throw integrity();
    const proof = proofOfWorkSchema.parse(row.proof);
    const document = workAuthoritySchema.parse(row.document);
    const receipt = z.object({ workOrderId: z.string() }).passthrough().parse(row.receipt);
    const envelope = JSON.parse(row.envelope as string) as SignedResult;
    const manifest = JSON.parse(Buffer.from(envelope.encoded, "base64url").toString("utf8")) as ResultManifest;
    if (digest({ authority: row.document_sha256, envelope: sha256(canonical(envelope)) }) !== row.ingest_sha256
      || digest(manifest) !== row.manifest_digest || envelope.manifestDigest !== row.manifest_digest
      || manifest.execution.requestId !== row.request_id || manifest.execution.requestDigest !== row.request_digest
      || manifest.execution.workOrderId !== receipt.workOrderId || manifest.execution.attemptNumber !== 1
      || manifest.candidate?.commit !== row.candidate_sha || proof.resultRevision !== row.candidate_sha
      || proof.workId !== work.id || proof.workVersion !== Number(row.work_version)
      || document.ownerId !== ownerId || document.work.id !== work.id
      || document.work.version !== Number(row.work_version) || document.work.generation !== Number(row.work_generation)
      || !["PARTIAL", "FAILED"].includes(proof.outcome)) throw integrity();
    externalAlphaEvidence(manifest, envelope.artifacts);
    const [decision] = await database.query(`SELECT * FROM engineering_owner_decisions WHERE owner_id=$1 AND work_id=$2 AND result_id=$3 AND action='accept_private'`,[ownerId,work.id,row.result_id]);
    const binding=z.record(z.string(),z.unknown()).nullable().parse(decision?.binding ?? null);
    const accepted=Boolean(decision && binding && work.lifecycle==='accepted' && digest(binding)===decision.binding_hash
      && binding.ownerId===ownerId && binding.workId===work.id && binding.resultId===row.result_id
      && binding.proofHash===row.content_hash && binding.candidateSha===row.candidate_sha
      && binding.manifestDigest===row.manifest_digest && binding.authorityId===row.authority_id
      && binding.workVersion===Number(row.work_version) && binding.workGeneration===Number(row.work_generation)
      && binding.completedVersion===work.version && binding.completedGeneration===work.generation && binding.criteriaVersion===work.criteriaVersion);
    return { retained: { authorityId: String(row.authority_id), resultId: String(row.result_id), candidateSha: String(row.candidate_sha),
      verdict: z.enum(["PASS", "FAIL", "PARTIAL"]).parse(row.verdict), cleanupConfirmed: row.cleanup_confirmed === true,
      settlementState: z.enum(["PENDING", "SETTLED"]).parse(row.settlement_state), replay: true },
      proof, contentHash: String(row.content_hash), manifest, artifacts: envelope.artifacts,
      acceptance: accepted ? {decisionId:String(decision.id),acceptedAt:new Date(String(decision.created_at)).toISOString(),resultId:String(row.result_id),completedVersion:work.version,completedGeneration:work.generation} : null,
      current: accepted || Number(row.work_version) === work.version && Number(row.work_generation) === work.generation && proof.criteriaVersion === work.criteriaVersion };
  } catch { throw integrity(); }
}

export async function retainedExternalAlphaResult(database: ExecutionDatabase, policy: ExternalAlphaPolicy,
  record: WorkAuthorityRecord, work: Work) {
  if (work.scopeId !== policy.ownerId || work.id !== record.workId) throw integrity();
  return (await resultCustody(database, policy.ownerId, work, { authorityId: record.id, policySha256: digest(policy) }))?.retained ?? null;
}

export interface ExternalAlphaWorkReadback {
  acceptance?: Custody["acceptance"];
  authorityId: string;
  requestId: string;
  state: AuthorityState;
  current: boolean;
  factoryOutcome: "FAILED" | "CANCELLED" | "NOT_DISPATCHED" | null;
  accounting: { ceilingMicrousd: number; settledMicrousd: number; reservedMicrousd: number; unknownMicrousd: number };
  result: (RetainedExternalAlphaResult & { proof: ProofOfWork; contentHash: string; current: boolean; producerOutcome: "COMPLETED" | "FAILED" | "CANCELLED"; producerChecks: "PASS" | "FAIL" | "NOT_RUN" }) | null;
}

/** Observation only. Authority state is retained history, never fresh Factory
 * liveness or a native admission. The exact owner's accepted Proof is replayed. */
export async function readExternalAlphaWork(store: WorkStore, work: Work): Promise<ExternalAlphaWorkReadback | null> {
  const p = store.principal;
  if (p.scopeKind !== "personal" || p.scopeId !== work.scopeId || p.actorId !== work.scopeId) return null;
  const [schema] = await store.database.query("SELECT to_regclass('external_alpha_work_authority') AS present");
  if (!schema?.present) return null;
  const [row] = await store.database.query(`SELECT a.id,a.request_id,a.state,a.work_version,a.work_generation,
      t.readback,t.readback_sha256
    FROM external_alpha_work_authority a LEFT JOIN external_alpha_work_dispatch d ON d.authority_id=a.id AND d.owner_id=a.owner_id AND d.policy_sha256=a.policy_sha256
    LEFT JOIN external_alpha_work_terminal_settlement t
      ON t.authority_id=a.id AND t.owner_id=a.owner_id AND t.policy_sha256=a.policy_sha256 AND t.request_id=a.request_id
      AND t.authority_sha256=a.document_sha256 AND t.work_id=a.work_id AND t.work_version=a.work_version AND t.work_generation=a.work_generation
      AND t.request_digest=d.request_digest AND t.cleanup_confirmed=true AND t.result_verdict='NONE' AND t.settlement_state='SETTLED' AND t.exposure_unknown=false
    WHERE a.owner_id=$1 AND a.work_id=$2`, [p.scopeId, work.id]);
  if (!row) return null;
  let factoryOutcome: ExternalAlphaWorkReadback["factoryOutcome"] = null;
  if (row.readback) {
    if (digest(row.readback) !== row.readback_sha256) throw integrity();
    factoryOutcome = terminalState.parse((row.readback as any).readbackAttestation.state);
  }
  const custody = await resultCustody(store.database, p.scopeId, work, { authorityId: row.id as string });
  const [ledger] = await store.database.query(`SELECT a.ceiling_microusd,
    COALESCE(sum(o.spent_microusd) FILTER(WHERE o.state='SETTLED'),0) AS settled,
    COALESCE(sum(o.reserved_microusd) FILTER(WHERE o.state='DISPATCHED'),0) AS reserved,
    COALESCE(sum(o.reserved_microusd) FILTER(WHERE o.state='UNKNOWN'),0) AS unknown
    FROM external_alpha_allowance a LEFT JOIN external_alpha_operation o ON o.allowance_id=a.id
    WHERE a.owner_id=$1 AND a.work_id=$2 GROUP BY a.id`, [p.scopeId, work.id]);
  const evidence = custody?.manifest.evidence ?? [];
  const producerChecks: "PASS" | "FAIL" | "NOT_RUN" = evidence.some(e => e.status === "failed" || (e.exitCode !== null && e.exitCode !== 0))
    ? "FAIL" : evidence.length > 0 && evidence.every(e => e.status === "passed" && e.exitCode === 0) ? "PASS" : "NOT_RUN";
  return { acceptance: custody?.acceptance ?? null, authorityId: String(row.id), requestId: String(row.request_id), state: row.state as AuthorityState,
    current: Number(row.work_version) === work.version && Number(row.work_generation) === work.generation,
    factoryOutcome, accounting: { ceilingMicrousd: Number(ledger?.ceiling_microusd ?? 0), settledMicrousd: Number(ledger?.settled ?? 0), reservedMicrousd: Number(ledger?.reserved ?? 0), unknownMicrousd: Number(ledger?.unknown ?? 0) }, result: custody ? { ...custody.retained, proof: custody.proof, contentHash: custody.contentHash, current: custody.current, producerOutcome: custody.manifest.status, producerChecks } : null };
}

export async function readExternalAlphaProofEvidence(store: WorkStore, workId: string, resultId: string, reference: string) {
  const work = await store.get(workId), p = store.principal;
  if (p.scopeKind !== "personal" || p.actorId !== p.scopeId) throw new WorkError("EXTERNAL_ALPHA_EVIDENCE_OWNER", "Owner scope required.", 403);
  const [schema] = await store.database.query("SELECT to_regclass('external_alpha_work_result') AS present");
  if (!schema?.present) return null;
  const custody = await resultCustody(store.database, p.scopeId, work, { resultId });
  if (!custody) return null;
  if (!custody.proof.artifactRefs.includes(reference)) throw new WorkError("factory_evidence_missing", "Evidence is not available in this Proof.", 404);
  const evidence = externalAlphaEvidence(custody.manifest, custody.artifacts).find(e => e.proofReference === reference);
  if (!evidence) throw new WorkError("factory_evidence_missing", "Evidence is not available in this Proof.", 404);
  return evidence;
}
