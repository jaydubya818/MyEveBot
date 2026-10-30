import { digest } from "../engineering/contract.ts";
import type { QualificationBinding, QualificationProjectInput } from "../external-alpha/qualification-accounting.ts";

/**
 * MyFactory -> independent verifier handoff. Carries only digests and the exact
 * candidate identity; the protected specification content and the verifier's
 * signing key never pass through MyEve or the producer.
 */
export type VerifierHandoff = {
  schema: "myeve.qualification-verifier-handoff/v1";
  projectSha256: string; sourceSha256: string; protectedSpecificationSha256: string;
  candidateCommit: string; candidateTree: string; buildArtifactSha256: string; handoffSha256: string;
};
export function buildVerifierHandoff(input: { project: QualificationProjectInput; binding: QualificationBinding;
  candidate: { commit: string; tree: string; buildArtifactSha256: string } }): VerifierHandoff {
  const body = { schema: "myeve.qualification-verifier-handoff/v1" as const, projectSha256: input.binding.projectSha256,
    sourceSha256: input.binding.sourceSha256, protectedSpecificationSha256: input.project.protectedSpecificationSha256,
    candidateCommit: input.candidate.commit, candidateTree: input.candidate.tree, buildArtifactSha256: input.candidate.buildArtifactSha256 };
  return { ...body, handoffSha256: digest(body) };
}
