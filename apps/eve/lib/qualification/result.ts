import { verifyLocalResultV4, type LocalResultV4Expected, type LocalResultManifestV4, type ResultKey } from "../engineering/factory-producer-protocol.ts";
import { QDEV_BASELINE, type QualificationProjectInput } from "../external-alpha/qualification-accounting.ts";

export class ResultRejected extends Error {
  constructor(readonly code: string) { super(code); }
}

export type AcceptedStageResult = {
  manifest: LocalResultManifestV4;
  candidateCommit: string;
  candidateTree: string;
  manifestDigest: string;
};

/**
 * Consumes a signed Factory Result for one journey stage. Expectations come
 * from trusted admission state, never from fields inferred from the Result:
 * stage 1 must start from the approved dashboard baseline, and every later
 * stage must start from the PRECEDING ACCEPTED candidate, so a reordered,
 * replayed or foreign Result cannot be spliced into the chain. Only current
 * (unrevoked, unretired, unexpired) keys are accepted; historical keys are not.
 */
export function consumeStageResult(input: {
  signed: unknown; keys: ResultKey[]; project: QualificationProjectInput;
  stage: 1 | 2 | 3; precedingCandidate: { commit: string; tree: string } | null;
  expected: Omit<LocalResultV4Expected, "inputCommit" | "inputTree" | "factoryVersion" | "sourceDigest">;
  sourceDigest: string; now?: number;
  /** Production always uses the approved dashboard baseline. Only synthetic tests substitute one. */
  baseline?: { commit: string; tree: string };
}): AcceptedStageResult {
  const start = input.stage === 1
    ? (input.baseline ?? { commit: QDEV_BASELINE.inputCommit as string, tree: QDEV_BASELINE.inputTree as string })
    : input.precedingCandidate;
  if (!start) throw new ResultRejected("QDEV_RESULT_PRECEDING_CANDIDATE_REQUIRED");
  let verified;
  try {
    verified = verifyLocalResultV4(input.signed, {
      keys: input.keys, now: input.now, historical: false,
      expected: { ...input.expected, inputCommit: start.commit, inputTree: start.tree,
        // The Factory identity must be exactly the one frozen into the project source tuple.
        factoryVersion: input.project.factoryVersionSha256, sourceDigest: input.sourceDigest },
    });
  } catch (error) {
    throw new ResultRejected("QDEV_RESULT_VERIFICATION_FAILED:" + (error instanceof Error ? error.message : "unknown").slice(0, 120));
  }
  const { manifest } = verified;
  if (manifest.status !== "COMPLETED" || !manifest.candidate) throw new ResultRejected("QDEV_RESULT_NOT_COMPLETED");
  if (manifest.candidate.base !== start.commit) throw new ResultRejected("QDEV_RESULT_BASE_MISMATCH");
  if (manifest.candidate.commit === start.commit) throw new ResultRejected("QDEV_RESULT_NO_CHANGE");
  // A Result is not acceptance: any non-passed required evidence blocks the chain.
  if (manifest.evidence.length === 0 || manifest.evidence.some(item => item.status !== "passed"))
    throw new ResultRejected("QDEV_RESULT_EVIDENCE_NOT_PASSED");
  return { manifest, candidateCommit: manifest.candidate.commit, candidateTree: manifest.candidate.tree, manifestDigest: (input.signed as { manifestDigest: string }).manifestDigest };
}
