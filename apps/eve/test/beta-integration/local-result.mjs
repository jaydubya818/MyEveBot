import { randomUUID } from "node:crypto";
import {
  digitalWorkContractSchema,
  proofOfWorkSchema,
} from "../../lib/digital-worker/contracts.ts";
import { contractDigest } from "../../lib/goal-work/canonical-adapter.ts";
export async function produceLocalResult(beta, owner, workId) {
  const w = await beta.store(owner).get(workId),
    candidate = randomUUID().replaceAll("-", "").padEnd(40, "a");
  const contract = digitalWorkContractSchema.parse({
    contractVersion: 2,
    workId,
    workVersion: w.version,
    criteriaVersion: w.criteriaVersion,
    scope: { kind: "personal", id: owner },
    humanOwnerId: owner,
    coordinatingAgentId: "sofie",
    objective: w.objective,
    criteria: w.criteria.map((c) => ({
      id: c.id,
      statement: c.statement,
      evidence: "deterministic",
    })),
    resourceRefs: ["repository:" + w.repository],
    allowedOperations: ["fixture.read"],
    budgetUsd: 0,
    deadline: new Date(Date.now() + 60000).toISOString(),
    policyVersion: 1,
    composition: {
      role: { id: "engineering", version: 1 },
      capabilityPacks: [],
      mode: { id: "fixture", version: 1 },
    },
    definitionOfDone: ["Local fixture assertions pass"],
    allowedRoutes: ["DIRECT"],
    routingProfile: {
      profileVersion: 1,
      workShape: "bounded",
      decomposition: "single",
      interaction: "local",
      parallelism: "none",
      verification: "fixture",
      duration: "short",
      ambiguity: "low",
      externalExpertise: "none",
      humanJudgment: "owner decision",
      risk: "local fixture",
    },
    routePolicy: { id: "local-fixture", version: 1 },
  });
  const proof = proofOfWorkSchema.parse({
    contractVersion: 2,
    workId,
    workVersion: w.version,
    criteriaVersion: w.criteriaVersion,
    outcome: "COMPLETED",
    resultRevision: candidate,
    createdAt: new Date().toISOString(),
    evidence: w.criteria.map((c) => ({
      criterionId: c.id,
      resultRevision: candidate,
      state: "PASS",
      producer: "trusted-verifier",
      sourceRef: "fixture:local-assertion:" + c.id,
      contentHash: "sha256:" + "b".repeat(64),
      observedAt: new Date().toISOString(),
    })),
    artifactRefs: ["fixture:launch-brief"],
    limitations: ["LOCAL_FIXTURE: no model or external provider executed."],
  });
  const resultId = randomUUID();
  await beta.transaction(async (c) => {
    await c.query(
      "INSERT INTO engineering_native_results(id,scope_id,scope_kind,work_id,candidate_sha,work_version,work_generation,proof,content_hash) VALUES($1,$2,'personal',$3,$4,$5,$6,$7::jsonb,$8)",
      [
        resultId,
        owner,
        workId,
        candidate,
        w.version,
        w.generation,
        JSON.stringify(proof),
        contractDigest(proof),
      ],
    );
    await c.query(
      "INSERT INTO beta_result_provenance(owner_id,result_id,contract,source) VALUES($1,$2,$3::jsonb,'LOCAL_FIXTURE')",
      [owner, resultId, JSON.stringify(contract)],
    );
  });
  return { id: resultId, hash: contractDigest(proof) };
}
