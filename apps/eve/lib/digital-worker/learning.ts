import { createHash } from "node:crypto";
import { z } from "zod";
import { scopeSchema } from "./contracts.ts";

/**
 * M6's advisory-only domain contract. A caller must obtain feedback, qualification
 * and owner review from authenticated stores. None of these records are grants,
 * approval decisions, policy changes, or model instructions.
 */
const reference = z.string().trim().min(1).max(400);
const timestamp = z.string().datetime({ offset: true });
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const workShape = z.string().trim().min(1).max(80);

const supervisionCostSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("KNOWN"), humanMinutes: z.number().finite().nonnegative() }).strict(),
  z.object({ status: z.literal("UNKNOWN"), reason: reference }).strict(),
]);

export const workFeedbackSchema = z.object({
  feedbackId: z.string().uuid(),
  workId: z.string().uuid(),
  workVersion: z.number().int().positive(),
  scope: scopeSchema,
  ownerId: reference,
  agentId: reference,
  repository: reference,
  workShape,
  source: z.object({
    kind: z.enum(["OWNER_CORRECTION", "OWNER_REVIEW", "TRUSTED_VERIFIER"]),
    sourceRef: reference,
    actorId: reference,
    observedAt: timestamp,
  }).strict(),
  summary: z.string().trim().min(1).max(2_000),
  evidence: z.array(z.object({
    sourceRef: reference,
    contentHash: digest,
    observedAt: timestamp,
  }).strict()).min(1).max(20),
  supervision: z.object({
    interventions: z.number().int().nonnegative(),
    cost: supervisionCostSchema,
  }).strict(),
  recordedAt: timestamp,
}).strict();
export type WorkFeedback = z.infer<typeof workFeedbackSchema>;

/** Candidate text is deliberately only a suggestion, never an authority source. */
export const learningProposalSchema = z.object({
  candidateId: z.string().uuid(),
  subject: z.enum(["QUALITY_CHECK", "RECOVERY_HINT"]),
  recommendation: z.string().trim().min(1).max(1_000),
  rationale: z.string().trim().min(1).max(1_000),
  createdAt: timestamp,
}).strict();

const candidateBodySchema = z.object({
  ...learningProposalSchema.shape,
  sourceFeedbackId: z.string().uuid(),
  sourceWorkId: z.string().uuid(),
  sourceWorkVersion: z.number().int().positive(),
  scope: scopeSchema,
  ownerId: reference,
  agentId: reference,
  applicability: z.object({ repository: reference, workShape }).strict(),
  status: z.literal("DRAFT"),
  trust: z.literal("ADVISORY_ONLY"),
}).strict();
export const learningCandidateSchema = z.object({ ...candidateBodySchema.shape, contentHash: digest }).strict();
export type LearningCandidate = z.infer<typeof learningCandidateSchema>;

// A conservative draft filter, not a semantic classifier or an action boundary.
const forbiddenLearningTerms = /\b(?:credentials?|secrets?|passwords?|tokens?|api[ -]?keys?|approv(?:e|ed|al|als)|authori[sz](?:e|ed|ation|ations)|authority|permissions?|grants?|relay|polic(?:y|ies)|access[ -]?control|budget)\b/i;

function hash(value: unknown): string {
  // Every schema is strict and constructed in a fixed order before hashing.
  return `sha256:${createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")}`;
}

function sameScope(left: z.infer<typeof scopeSchema>, right: z.infer<typeof scopeSchema>) {
  return left.kind === right.kind && left.id === right.id;
}

function validateFeedback(feedback: WorkFeedback): void {
  // Organization membership needs the separate tenancy gate planned after this MVP.
  if (feedback.scope.kind !== "personal" || feedback.scope.id !== feedback.ownerId)
    throw new Error("Only owner-scoped personal feedback is eligible for this learning slice.");
  if (feedback.source.kind.startsWith("OWNER_") && feedback.source.actorId !== feedback.ownerId)
    throw new Error("Owner feedback must be attributed to the Work owner.");
  if (Date.parse(feedback.source.observedAt) > Date.parse(feedback.recordedAt) + 5_000 ||
      feedback.evidence.some(item => Date.parse(item.observedAt) > Date.parse(feedback.recordedAt) + 5_000))
    throw new Error("Feedback source or evidence is newer than the feedback record.");
  if (new Set(feedback.evidence.map(item => item.sourceRef)).size !== feedback.evidence.length)
    throw new Error("Feedback evidence sources must be distinct.");
}

/** Drafting never writes memory or changes Work. Authority topics are ineligible. */
export function draftLearningCandidate(feedbackInput: unknown, proposalInput: unknown, now = Date.now()): LearningCandidate {
  const feedback = workFeedbackSchema.parse(feedbackInput);
  validateFeedback(feedback);
  const proposal = learningProposalSchema.parse(proposalInput);
  if (forbiddenLearningTerms.test(`${proposal.recommendation}\n${proposal.rationale}`))
    throw new Error("Credential, authority, approval and Relay topics are ineligible for learning.");
  if (Date.parse(proposal.createdAt) < Date.parse(feedback.recordedAt) ||
      Date.parse(proposal.createdAt) > now + 5_000)
    throw new Error("Learning candidate time must follow its feedback and not be in the future.");
  const body = candidateBodySchema.parse({
    ...proposal,
    sourceFeedbackId: feedback.feedbackId,
    sourceWorkId: feedback.workId,
    sourceWorkVersion: feedback.workVersion,
    scope: feedback.scope,
    ownerId: feedback.ownerId,
    agentId: feedback.agentId,
    applicability: { repository: feedback.repository, workShape: feedback.workShape },
    status: "DRAFT",
    trust: "ADVISORY_ONLY",
  });
  return learningCandidateSchema.parse({ ...body, contentHash: hash(body) });
}

/** These are trusted facts supplied by the future authenticated qualification service. */
export const learningQualificationSchema = z.object({
  qualificationRef: reference,
  candidateId: z.string().uuid(),
  candidateHash: digest,
  scope: scopeSchema,
  status: z.literal("PASS"),
  conflictState: z.literal("NONE"),
  scopeLeakState: z.literal("NONE"),
  independentEvidenceRefs: z.array(reference).min(1).max(20)
    .refine(items => new Set(items).size === items.length),
  qualifiedAt: timestamp,
}).strict();

/** An owner decision must be fetched separately, never copied from candidate text. */
export const learningPromotionReviewSchema = z.object({
  reviewRef: reference,
  reviewerOwnerId: reference,
  candidateId: z.string().uuid(),
  candidateHash: digest,
  qualificationRef: reference,
  decision: z.literal("APPROVED"),
  reviewedAt: timestamp,
}).strict();

export const qualifiedLearningSchema = z.object({
  learningId: z.string().uuid(),
  status: z.literal("QUALIFIED"),
  trust: z.literal("ADVISORY_ONLY"),
  scope: scopeSchema,
  ownerId: reference,
  agentId: reference,
  applicability: z.object({ repository: reference, workShape }).strict(),
  recommendation: z.string().trim().min(1).max(1_000),
  rationale: z.string().trim().min(1).max(1_000),
  sourceFeedbackId: z.string().uuid(),
  sourceWorkId: z.string().uuid(),
  sourceWorkVersion: z.number().int().positive(),
  sourceRef: reference,
  evidenceRefs: z.array(reference).min(1).max(20),
  supervision: z.object({ interventions: z.number().int().nonnegative(), cost: supervisionCostSchema }).strict(),
  candidateHash: digest,
  qualificationRef: reference,
  reviewRef: reference,
  promotedAt: timestamp,
}).strict();
export type QualifiedLearning = z.infer<typeof qualifiedLearningSchema>;

/** Pure preparation only; the future store must re-fetch all inputs in one owner-scoped transaction. */
export function prepareLearningPromotion(
  feedbackInput: unknown,
  candidateInput: unknown,
  qualificationInput: unknown,
  reviewInput: unknown,
  now = Date.now(),
): QualifiedLearning {
  const feedback = workFeedbackSchema.parse(feedbackInput);
  validateFeedback(feedback);
  const candidate = learningCandidateSchema.parse(candidateInput);
  const qualification = learningQualificationSchema.parse(qualificationInput);
  const review = learningPromotionReviewSchema.parse(reviewInput);
  const { contentHash, ...body } = candidate;
  if (contentHash !== hash(body) || forbiddenLearningTerms.test(`${candidate.recommendation}\n${candidate.rationale}`))
    throw new Error("Learning candidate was changed or contains an ineligible topic.");
  if (candidate.sourceFeedbackId !== feedback.feedbackId || candidate.sourceWorkId !== feedback.workId ||
      candidate.sourceWorkVersion !== feedback.workVersion || candidate.ownerId !== feedback.ownerId ||
      candidate.agentId !== feedback.agentId || !sameScope(candidate.scope, feedback.scope) ||
      candidate.applicability.repository !== feedback.repository || candidate.applicability.workShape !== feedback.workShape)
    throw new Error("Learning candidate does not match its original Work feedback and scope.");
  if (qualification.candidateId !== candidate.candidateId || qualification.candidateHash !== contentHash ||
      !sameScope(qualification.scope, candidate.scope) || review.candidateId !== candidate.candidateId ||
      review.candidateHash !== contentHash || review.qualificationRef !== qualification.qualificationRef ||
      review.reviewerOwnerId !== feedback.ownerId)
    throw new Error("Qualification or owner review does not cover this exact candidate and scope.");
  if (Date.parse(candidate.createdAt) < Date.parse(feedback.recordedAt) ||
      Date.parse(qualification.qualifiedAt) < Date.parse(candidate.createdAt) ||
      Date.parse(review.reviewedAt) < Date.parse(qualification.qualifiedAt) ||
      Date.parse(review.reviewedAt) > now + 5_000)
    throw new Error("Learning qualification and owner review chronology is invalid.");
  return qualifiedLearningSchema.parse({
    learningId: candidate.candidateId,
    status: "QUALIFIED",
    trust: "ADVISORY_ONLY",
    scope: candidate.scope,
    ownerId: candidate.ownerId,
    agentId: candidate.agentId,
    applicability: candidate.applicability,
    recommendation: candidate.recommendation,
    rationale: candidate.rationale,
    sourceFeedbackId: feedback.feedbackId,
    sourceWorkId: feedback.workId,
    sourceWorkVersion: feedback.workVersion,
    sourceRef: feedback.source.sourceRef,
    evidenceRefs: feedback.evidence.map(item => item.sourceRef),
    supervision: feedback.supervision,
    candidateHash: contentHash,
    qualificationRef: qualification.qualificationRef,
    reviewRef: review.reviewRef,
    promotedAt: review.reviewedAt,
  });
}

/** Retrieval is exact and descriptive; it never changes route or action eligibility. */
export function learningAppliesToWork(
  learningInput: unknown,
  workInput: unknown,
): boolean {
  const learning = qualifiedLearningSchema.safeParse(learningInput);
  const work = z.object({ scope: scopeSchema, repository: reference, workShape }).strict().safeParse(workInput);
  return learning.success && work.success && sameScope(learning.data.scope, work.data.scope) &&
    learning.data.applicability.repository === work.data.repository &&
    learning.data.applicability.workShape === work.data.workShape;
}
