import { createHash } from "node:crypto";
import { z } from "zod";
import { digest } from "../engineering/contract.ts";
import { qualificationPolicySchema, type QualificationPolicy } from "../external-alpha/qualification-accounting.ts";
import { isPrivateBetaProject, journeyBinding, PRIVATE_BETA_PROFILE, privateBetaInstallationSchema, privateBetaProjectSchema,
  type JourneyProjectInput, type PrivateBetaInstallation, type PrivateBetaProject } from "./journey-profile.ts";
import { journeyPlanSchema, PlanRefused, validateJourneyPlan, type JourneyPlan } from "./plan.ts";

/**
 * Owner-confirmed request -> derived journey (private beta, owner-local installation only).
 *
 * The owner's request text is the only free input. Everything else is installation configuration (repository, baseline, output branch, release
 * environment, frozen sources, the four-stage reservation template). The derivation is pure and deterministic:
 *
 *   request text --normalize--> requestSha256
 *   specification = digest(request, repository, baseline, branch, environment)         -> project.protectedSpecificationSha256
 *   plan          = template stages (Sofie+coding, coding, Factory build, verification) + binds{request, repository, ...}
 *   planSha256    = digest(plan)                                                       -> stage request material, stage binding ids
 *   cohortId      = uuid(digest(owner, planSha256))                                     -> accounting policy (a fresh cohort per request)
 *   journeyId     = qdevJourneyId(owner, project, policy, plan)                         -> journal + retained admissions (DJR-01 binding)
 *
 * Nothing here reserves, dispatches or calls a provider. The accounting ledger still refuses a derived cohort that the operator has not issued.
 */
export const OWNER_REQUEST_MAX = 2000;
const STAGE_COUNT = 4;

export const ownerRequestTemplateSchema = z.object({
  installation: privateBetaInstallationSchema,
  /** The fixed four-stage reservation shape. It must not carry `binds`: those are derived from the request. */
  plan: journeyPlanSchema.refine(plan => plan.binds === undefined && plan.stages.length === STAGE_COUNT, "a four-stage template without binds"),
}).strict();
export type OwnerRequestTemplate = z.infer<typeof ownerRequestTemplateSchema>;

/** Canonical request text, or null when it is empty, too long, or carries control characters. */
export function normalizeOwnerRequest(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const value = text.replace(/\r\n?/g, "\n").trim();
  if (value.length < 8 || value.length > OWNER_REQUEST_MAX) return null;
  if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value)) return null;
  return value;
}
export const ownerRequestSha256 = (request: string) => createHash("sha256").update(request, "utf8").digest("hex");

/** The request specification digest bound into the project (and therefore into the verdict and the delivery). */
export function requestSpecificationSha256(binds: NonNullable<JourneyPlan["binds"]>): string {
  return digest({ kind: "myeve.private-beta.request/v1", requestSha256: binds.requestSha256, repository: binds.repository,
    inputCommit: binds.inputCommit, outputBranch: binds.outputBranch, environment: binds.environment });
}

/** RFC 4122 shaped (version 5, variant 10) UUID from a digest, so the derived cohort id passes the existing policy schema. */
function uuidFromDigest(hex: string): string {
  const b = hex.slice(0, 32).split("");
  b[12] = "5";
  b[16] = ((parseInt(b[16], 16) & 0x3) | 0x8).toString(16);
  const s = b.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

export type DerivedOwnerJourney = {
  request: string; requestSha256: string; project: PrivateBetaProject; plan: JourneyPlan; planSha256: string; policy: QualificationPolicy;
  binding: { projectSha256: string; sourceSha256: string };
};

export class OwnerRequestRefused extends Error { constructor(readonly code: string) { super(code); } }

export function deriveOwnerJourney(input: { ownerId: string; template: OwnerRequestTemplate; request: unknown }): DerivedOwnerJourney {
  const request = normalizeOwnerRequest(input.request);
  if (!request) throw new OwnerRequestRefused("QDEV_OWNER_REQUEST_INVALID");
  const template = ownerRequestTemplateSchema.parse(input.template);
  const i: PrivateBetaInstallation = template.installation;
  const requestSha256 = ownerRequestSha256(request);
  const binds = { profile: PRIVATE_BETA_PROFILE, requestSha256, repository: i.repository, inputCommit: i.inputCommit, outputBranch: i.outputBranch, environment: i.environment };
  const plan = validateJourneyPlan({ ...structuredClone(template.plan), binds });
  const project = privateBetaProjectSchema.parse({ ...i, protectedSpecificationSha256: requestSpecificationSha256(binds) });
  const planSha256 = digest(plan);
  const policy = qualificationPolicySchema.parse({ cohortId: uuidFromDigest(digest(["myeve.private-beta.cohort/v1", input.ownerId, planSha256])), ownerId: input.ownerId, slot: "Q1" });
  assertPlanBindsProject(plan, project);
  return { request, requestSha256, project, plan, planSha256, policy, binding: journeyBinding(project) };
}

/**
 * The plan <-> project link checked by the journey BEFORE any reservation: a qdev project accepts only an unbound plan; a private-beta project accepts
 * only the plan derived for exactly its request specification, repository, baseline, branch and environment.
 */
export function assertPlanBindsProject(plan: JourneyPlan, project: JourneyProjectInput): void {
  if (!isPrivateBetaProject(project)) { if (plan.binds !== undefined) throw new PlanRefused("QDEV_PLAN_PROFILE_MISMATCH"); return; }
  const b = plan.binds;
  if (!b || plan.stages.length !== STAGE_COUNT) throw new PlanRefused("QDEV_PLAN_PROFILE_MISMATCH");
  if (b.repository !== project.repository || b.inputCommit !== project.inputCommit || b.outputBranch !== project.outputBranch || b.environment !== project.environment
    || requestSpecificationSha256(b) !== project.protectedSpecificationSha256) throw new PlanRefused("QDEV_PLAN_REQUEST_BINDING");
}
