import { z } from "zod";
import { digest } from "../engineering/contract.ts";
import { QDEV_BASELINE, QDEV_PROPOSAL_ID, qualificationBinding, qualificationProjectInputSchema, type QualificationProjectInput } from "../external-alpha/qualification-accounting.ts";

/**
 * Journey profiles. The frozen qdev qualification profile (unchanged identities, independent verifier custody) and the owner-local PRIVATE BETA
 * profile (owner-confirmed request, parameterized repository and release environment, a LOCAL verifier that can never claim independent custody).
 *
 * A project's profile is carried by the project itself: a frozen qdev project has no `profile` field (its schema is strict and literal), a private
 * beta project names `myeve.private-beta.owner/v1`. Every binding, stage id, baseline, release environment and required verdict assurance is derived
 * here from the project, so no caller can mix the two (a private-beta project can never produce qdev identities, and vice versa).
 */
export const PRIVATE_BETA_PROFILE = "myeve.private-beta.owner/v1" as const;
export const VERDICT_ASSURANCE = ["INDEPENDENT", "PRIVATE_BETA_LOCAL"] as const;
export type VerdictAssurance = typeof VERDICT_ASSURANCE[number];
/** The frozen qualification release environment. Only the qdev profile resolves to it. */
const QDEV_ENVIRONMENT = "myeve-qdev-20261029";
export const releaseEnvironmentSchema = z.string().regex(/^myeve-[a-z0-9][a-z0-9-]{2,62}$/);

const sha256 = z.string().regex(/^[a-f0-9]{64}$/).refine(value => !/^(0+|f+)$/.test(value), "placeholder digest");
const commit = z.string().regex(/^[a-f0-9]{40}$/).refine(value => !/^(0+|f+)$/.test(value), "placeholder commit");
const repository = z.string().regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/);
const branch = z.string().min(1).max(255).regex(/^[A-Za-z0-9._/-]+$/).refine(value => value !== "main" && value !== "master" && !value.includes(".."), "protected or invalid branch");

/** Installation-level (non-request) part of a private-beta project: repository, baseline, output branch, release environment and frozen sources. */
export const privateBetaInstallationSchema = z.object({
  profile: z.literal(PRIVATE_BETA_PROFILE),
  environment: releaseEnvironmentSchema.refine(value => value !== QDEV_ENVIRONMENT, "the frozen qualification environment is not a private-beta environment"),
  repository, inputCommit: commit, inputTree: commit, outputBranch: branch,
  operatingProfileSha256: sha256, factoryVersionSha256: sha256,
  sources: z.object({ myeve: commit, factory: commit, relay: commit, missioncontrol: commit }).strict(),
}).strict();
export type PrivateBetaInstallation = z.infer<typeof privateBetaInstallationSchema>;
/** A private-beta project: the installation plus the digest of the owner-confirmed request specification. */
export const privateBetaProjectSchema = privateBetaInstallationSchema.extend({ protectedSpecificationSha256: sha256 }).strict();
export type PrivateBetaProject = z.infer<typeof privateBetaProjectSchema>;
export const journeyProjectSchema = z.union([qualificationProjectInputSchema, privateBetaProjectSchema]);
export type JourneyProjectInput = QualificationProjectInput | PrivateBetaProject;

export const isPrivateBetaProject = (project: JourneyProjectInput): project is PrivateBetaProject =>
  (project as { profile?: unknown })?.profile === PRIVATE_BETA_PROFILE;

export type JourneyBinding = { projectSha256: string; sourceSha256: string };
/** Deterministic parent/source identities for either profile. The qdev formula is exactly `qualificationBinding`. */
export function journeyBinding(project: JourneyProjectInput): JourneyBinding {
  if (!isPrivateBetaProject(project)) return qualificationBinding(project);
  const p = privateBetaProjectSchema.parse(project);
  return {
    projectSha256: digest({ kind: "myeve.private-beta.project/v1", profile: p.profile, environment: p.environment, repository: p.repository,
      inputCommit: p.inputCommit, inputTree: p.inputTree, outputBranch: p.outputBranch, operatingProfileSha256: p.operatingProfileSha256,
      protectedSpecificationSha256: p.protectedSpecificationSha256 }),
    sourceSha256: digest({ kind: "myeve.private-beta.source/v1", profile: p.profile, sources: p.sources, factoryVersionSha256: p.factoryVersionSha256 }),
  };
}

export type JourneyBaseline = { repository: string; inputCommit: string; inputTree: string; outputBranch: string };
export type JourneyProfile = {
  /** Journey/proposal id carried in evidence. */
  id: string;
  /** Release environment for publishing, delivery observation, rollback and activation scope (DJR-02 installation identity). */
  environment: string;
  /** The ONLY verdict assurance this profile accepts. */
  assurance: VerdictAssurance;
  baseline: JourneyBaseline;
};
export function journeyProfile(project: JourneyProjectInput): JourneyProfile {
  if (!isPrivateBetaProject(project)) {
    qualificationProjectInputSchema.parse(project);
    return { id: QDEV_PROPOSAL_ID, environment: QDEV_ENVIRONMENT, assurance: "INDEPENDENT", baseline: { ...QDEV_BASELINE } };
  }
  const p = privateBetaProjectSchema.parse(project);
  return { id: PRIVATE_BETA_PROFILE, environment: p.environment, assurance: "PRIVATE_BETA_LOCAL",
    baseline: { repository: p.repository, inputCommit: p.inputCommit, inputTree: p.inputTree, outputBranch: p.outputBranch } };
}

/**
 * Ledger binding id of one stage. The qdev formula is unchanged. A private-beta stage id carries the full approved-plan digest (which binds the request,
 * project and repository), so two different owner requests can never share a Work binding even inside one ledger.
 */
export function stageBindingId(project: JourneyProjectInput, approvedPlanSha256: string, stage: number): string {
  if (!isPrivateBetaProject(project)) return QDEV_PROPOSAL_ID + ":stage:" + stage;
  if (!/^[a-f0-9]{64}$/.test(approvedPlanSha256)) throw new Error("QDEV_PLAN_DIGEST");
  return `${PRIVATE_BETA_PROFILE}:${approvedPlanSha256}:stage:${stage}`;
}
