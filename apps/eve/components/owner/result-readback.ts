import type { ProofOfWork } from "@/lib/digital-worker/contracts";
import type { PublicationReadback } from "@/lib/engineering/publication-contract";
import type { Work } from "@/lib/engineering/types";

export interface RetainedResultBinding {
  id: string;
  work_id: string;
  work_version?: number;
  work_generation?: number;
  current_work_version?: number;
  current_work_generation?: number;
  candidate_sha: string;
  content_hash: string;
  proof: ProofOfWork;
  publicationReadback?: PublicationReadback | null;
}

function currentWork(result: RetainedResultBinding, work: Work | undefined): work is Work {
  return Boolean(work && result.work_id === work.id && result.proof.workId === work.id &&
    result.work_version === work.version && result.proof.workVersion === work.version &&
    result.current_work_version === work.version && result.work_generation === work.generation &&
    result.current_work_generation === work.generation && result.proof.criteriaVersion === work.criteriaVersion);
}

/** Display eligibility only. The owner-decision endpoint independently checks authority. */
export function canReviewRetainedResult(result: RetainedResultBinding, work: Work | undefined): boolean {
  if (!currentWork(result, work) || work.lifecycle !== "active" || work.control === "stopping" ||
      !result.candidate_sha || result.proof.resultRevision !== result.candidate_sha ||
      !work.criteria.length || result.proof.evidence.length !== work.criteria.length) return false;
  return work.criteria.every(criterion => {
    const evidence = result.proof.evidence.filter(item => item.criterionId === criterion.id);
    return evidence.length === 1 && evidence[0].state === "PASS" &&
      evidence[0].resultRevision === result.candidate_sha &&
      evidence[0].producer === (criterion.method === "human" ? "human" : "trusted-verifier");
  });
}

/** Preserve the API's validated observation only while its exact current binding agrees. */
export function resultPublicationReadback(result: RetainedResultBinding, work: Work | undefined): PublicationReadback | null {
  const readback = result.publicationReadback;
  if (!currentWork(result, work) || !readback) return null;
  const binding = readback.binding;
  return binding.owner === work.scopeId && binding.workId === work.id && binding.resultId === result.id &&
    binding.resultHash === result.content_hash && binding.version === work.version &&
    binding.generation === work.generation && binding.candidate === result.candidate_sha ? readback : null;
}
