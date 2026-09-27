import { randomUUID } from "node:crypto";
import { digitalWorkContractSchema, proofOfWorkSchema, type ProofOfWork } from "../digital-worker/contracts.ts";
import { digest } from "./contract.ts";
import { DirectDevelopmentStore } from "./direct-development.ts";
import { WorkError } from "./types.ts";

export class NativeResultStore {
  constructor(readonly direct: DirectDevelopmentStore) {}
  async retain(id: string) {
    const { workspace } = await this.direct.inspect(id);
    const candidate = workspace?.candidates.at(-1);
    if (!workspace || !candidate || !["VERIFICATION_PASSED", "VERIFICATION_FAILED"].includes(workspace.phase))
      throw new WorkError("native_result_missing", "An independently checked frozen candidate is required.");
    const store = this.direct.workStore;
    const scope = [store.principal.scopeId, store.principal.scopeKind, id];
    const [source] = await store.database.query(
      `SELECT d.admission_authority_snapshot,
        CASE WHEN b.work_id IS NULL THEN n.spent_microusd ELSE costs.spent END AS spent_microusd,
        CASE WHEN b.work_id IS NULL THEN n.reserved_microusd ELSE costs.reserved END AS reserved_microusd,
        CASE WHEN b.work_id IS NULL THEN n.usage_unknown ELSE costs.unknown OR b.status<>'ACTIVE' END AS usage_unknown
       FROM engineering_routing_decisions d
       JOIN engineering_direct_verification_jobs j ON j.scope_id=d.scope_id AND j.scope_kind=d.scope_kind AND j.work_id=d.work_id
       LEFT JOIN engineering_native_runtime n ON n.scope_id=d.scope_id AND n.scope_kind=d.scope_kind AND n.work_id=d.work_id
       LEFT JOIN engineering_work_model_budget b ON b.scope_id=d.scope_id AND b.scope_kind=d.scope_kind AND b.work_id=d.work_id
       LEFT JOIN LATERAL (SELECT COALESCE(sum(c.spent_microusd) FILTER(WHERE c.status='RECONCILED'),0) AS spent,
         COALESCE(sum(c.reserved_microusd) FILTER(WHERE c.status IN ('RESERVED','DISPATCHED','RESULT_RETAINED','USAGE_UNKNOWN')),0) AS reserved,
         COALESCE(bool_or(c.status IN ('RESERVED','DISPATCHED','RESULT_RETAINED','USAGE_UNKNOWN')),false) AS unknown
         FROM engineering_work_model_calls c WHERE c.scope_id=d.scope_id AND c.scope_kind=d.scope_kind AND c.work_id=d.work_id AND c.purpose='NATIVE_EXECUTION') costs ON true
       WHERE d.scope_id=$1 AND d.scope_kind=$2 AND d.work_id=$3 AND d.id=$4 AND j.candidate_sha=$5 AND j.status='COMPLETED'`,
      [...scope, workspace.decisionId, candidate.sha]);
    if (!source) throw new WorkError("native_result_unverified", "Protected verification must be durably completed before retaining Proof of Work.");
    const contract = digitalWorkContractSchema.parse(source.admission_authority_snapshot.contract);
    const profile = this.direct.config.profile;
    if (workspace.profileHash !== digest(profile)) throw new WorkError("native_result_profile", "The verification profile changed.");
    const checks = workspace.evidence.filter(item => item.candidate === candidate.sha && item.attemptId === candidate.attemptId);
    if (checks.length !== profile.checks.length || new Set(checks.map(item => item.check)).size !== checks.length ||
        checks.some(item => item.producer !== "protected-supervisor" || item.workId !== id ||
          item.criteriaVersion !== workspace.criteriaVersion || item.base !== workspace.baseSha ||
          item.profileHash !== workspace.profileHash || item.environment !== profile.image ||
          item.artifactHash !== digest(item.artifact) || !profile.checks.some(check => check.id === item.check)))
      throw new WorkError("native_result_evidence", "Independent evidence does not match the frozen candidate.");
    const evidence: ProofOfWork["evidence"] = contract.criteria.map(criterion => {
      const expected = profile.checks.filter(check => check.criterionIds.includes(criterion.id));
      const linked = checks.filter(check => expected.some(item => item.id === check.check));
      const state = criterion.evidence !== "deterministic" || !expected.length || linked.length !== expected.length ? "NOT_RUN" :
        linked.some(check => check.result === "FAIL") ? "FAIL" : linked.every(check => check.result === "PASS") ? "PASS" : "UNKNOWN";
      return { criterionId: criterion.id, resultRevision: candidate.sha, state, producer: "trusted-verifier",
        sourceRef: `native-verification:${id}:${candidate.sha}:${criterion.id}`,
        contentHash: `sha256:${digest(linked)}`, observedAt: workspace.updatedAt };
    });
    const hasUsage = source.spent_microusd != null && !source.usage_unknown && Number(source.reserved_microusd) === 0;
    const proof = proofOfWorkSchema.parse({ contractVersion: 2, workId: id, workVersion: workspace.workVersion,
      criteriaVersion: workspace.criteriaVersion, outcome: evidence.every(item => item.state === "PASS") ? "PARTIAL" : "FAILED",
      resultRevision: candidate.sha, createdAt: workspace.updatedAt, evidence,
      artifactRefs: [`native-candidate:${candidate.id}:sha256:${candidate.artifactHash}`,
        ...checks.map(check => `protected-evidence:sha256:${check.artifactHash}`),
        ...candidate.changedPaths.map(path=>`changed-source:${path}`)],
      limitations: ["This record covers native source development and protected local verification. GitHub publication, CI, review and owner acceptance have not been established.",
        hasUsage ? `Recorded native model spend: $${(Number(source.spent_microusd) / 1_000_000).toFixed(6)}. Infrastructure costs are not covered.` :
          "Native model cost coverage is UNKNOWN. No zero-cost or complete-cost claim is made."],
    });
    await store.database.query(
      `INSERT INTO engineering_native_results(id,scope_id,scope_kind,work_id,candidate_sha,work_version,work_generation,proof,content_hash)
       SELECT $4,$1,$2,$3,$5,$6,$7,$8::jsonb,$9
       WHERE EXISTS(SELECT 1 FROM engineering_direct_workspaces n JOIN engineering_direct_verification_jobs j
         ON j.scope_id=n.scope_id AND j.scope_kind=n.scope_kind AND j.work_id=n.work_id
         WHERE n.scope_id=$1 AND n.scope_kind=$2 AND n.work_id=$3 AND n.revision=$10
           AND n.candidates->-1->>'sha'=$5 AND j.candidate_sha=$5 AND j.status='COMPLETED')
       ON CONFLICT(scope_id,scope_kind,work_id,candidate_sha) DO NOTHING`,
      [...scope, randomUUID(), candidate.sha, workspace.workVersion, workspace.workGeneration, JSON.stringify(proof), digest(proof), workspace.revision]);
    const [retained] = await store.database.query(
      `SELECT id,proof,content_hash FROM engineering_native_results WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 AND candidate_sha=$4`, [...scope, candidate.sha]);
    if (!retained || digest(retained.proof) !== retained.content_hash) throw new WorkError("native_result_changed", "The durable native result could not be verified.");
    return { id: String(retained.id), proof: proofOfWorkSchema.parse(retained.proof), contentHash: String(retained.content_hash) };
  }
}
