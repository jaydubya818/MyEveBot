import { z } from "zod";
import { KNOWLEDGE_KINDS } from "../knowledge-types.ts";
import { privacyEligible } from "./shadow.ts";
import {
  BOUNDARIES,
  DIFFICULTIES,
  RUBRIC_HASH,
  RUBRIC_ID,
  hashValue,
} from "./challenge-review.ts";

export const COHORTS = ["STANDARD", "CHALLENGE", "TAXONOMY_STRESS"] as const;
export const DATASET_STATES = [
  ...COHORTS,
  "UNREVIEWED",
  "REJECTED_LEAKAGE",
  "REJECTED_DUPLICATE",
  "REJECTED_INVALID",
] as const;
export const CHALLENGE_BOUNDARIES = [
  ...BOUNDARIES,
  "INSIGHT_DECISION",
  "INSIGHT_PREFERENCE",
  "COUNTERFACTUAL",
  "CONDITIONAL_COMMITMENT",
  "DECISION_FACT",
  "COMMITMENT_FUTURE_FACT",
] as const;
export const DIFFICULTY_RUBRIC_ID = "knowledge-challenge-difficulty:v1";
export const DIFFICULTY_RUBRIC_HASH =
  "3a75a1ff1b7e29c2508169708cf0c7d6c094df5c9475742968456eeb60fddd29";
const confidence = z.enum(["HIGH", "MEDIUM", "LOW"]);
const label = z.enum(KNOWLEDGE_KINDS).nullable();
export const challengeAuthorSchema = z
  .object({
    id: z.string().regex(/^(?:challenge|standard)_\d{4}$/),
    familyId: z.string().regex(/^family_\d{3,4}$/),
    candidate: z.string().trim().min(1).max(2000),
    context: z.string().trim().max(1500),
    label,
    confidence,
    ambiguous: z.boolean(),
    defensible: z.boolean(),
    difficulty: z.enum(DIFFICULTIES),
    boundaries: z.array(z.enum(CHALLENGE_BOUNDARIES)).min(1).max(15),
    rationale: z.string().min(1).max(1200),
    difficultyRationale: z.string().min(1).max(1200),
    surfaceLure: label,
    domain: z.string().min(1).max(80),
    speaker: z.enum([
      "owner",
      "agent",
      "coworker",
      "customer",
      "document",
      "meeting-notes",
      "unspecified",
    ]),
    construction: z.enum(COHORTS),
  })
  .strict()
  .superRefine((row, ctx) => {
    if (row.ambiguous && row.defensible)
      ctx.addIssue({
        code: "custom",
        message: "Ambiguous primary truth is not defensible",
      });
    if (row.defensible && row.label === null)
      ctx.addIssue({
        code: "custom",
        message: "Defensible truth requires a label",
      });
    if (
      row.difficulty === "ADVERSARIAL" &&
      row.construction === "CHALLENGE" &&
      (row.surfaceLure === null || row.surfaceLure === row.label)
    )
      ctx.addIssue({
        code: "custom",
        message: "Adversarial construction requires a distinct plausible lure",
      });
    if (new Set(row.boundaries).size !== row.boundaries.length)
      ctx.addIssue({ code: "custom", message: "Duplicate boundary" });
  });
export type ChallengeAuthor = z.infer<typeof challengeAuthorSchema>;
export const independentAssessmentSchema = z
  .object({
    id: z.string().regex(/^(?:challenge|standard)_\d{4}$/),
    label,
    confidence,
    ambiguous: z.boolean(),
    defensible: z.boolean(),
    rubricSensitive: z.boolean(),
    rationale: z.string().min(1).max(1200),
  })
  .strict()
  .superRefine((row, ctx) => {
    if (row.ambiguous && (row.defensible || row.label !== null))
      ctx.addIssue({
        code: "custom",
        message: "Ambiguous review requires null label and no defensibility",
      });
    if (row.defensible && row.label === null)
      ctx.addIssue({
        code: "custom",
        message: "Defensible review requires a label",
      });
  });
export type IndependentAssessment = z.infer<typeof independentAssessmentSchema>;
export const independentBatchSchema = z
  .object({
    reviewerId: z.string().min(1),
    reviewModel: z.string().min(1),
    reviewedAt: z.iso.datetime({ offset: true }),
    rubricId: z.literal(RUBRIC_ID),
    rubricHash: z.literal(RUBRIC_HASH),
    blindedInputHash: z.string().regex(/^[a-f0-9]{64}$/),
    reviewedWithoutProviderOutputs: z.literal(true),
    cases: z.array(independentAssessmentSchema).min(1).max(250),
  })
  .strict();
export type DatasetState = (typeof DATASET_STATES)[number];
export type CohortRecord = ChallengeAuthor & {
  state: DatasetState;
  expected: z.infer<typeof label>;
  review: IndependentAssessment | null;
  reviewStatus: "VALID" | "UNREVIEWED" | "REVIEW_INVALID";
  reasons: string[];
  originalId?: string;
};
export function providerState(
  row: Pick<ChallengeAuthor, "candidate" | "context">,
) {
  return JSON.stringify({ context: row.context, candidate: row.candidate });
}
export function reviewerInput(rows: readonly ChallengeAuthor[]) {
  return rows.map(({ id, candidate, context }) => ({ id, candidate, context }));
}
const normalize = (value: string) =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
export function normalizedInput(
  row: Pick<ChallengeAuthor, "candidate" | "context">,
) {
  return normalize(row.context) + "\n" + normalize(row.candidate);
}
/** Guidance detection, not a blanket ban on naturally spoken category words. */
export function leakageIssues(
  row: Pick<ChallengeAuthor, "candidate" | "context">,
): string[] {
  const reasons: string[] = [];
  const state = providerState(row);
  if (
    /\b(?:expected[_ -]?(?:label|class|outcome)|author[_ -]?(?:label|rationale|confidence)|review(?:er)?[_ -]?(?:label|rationale)|boundary[_ -]?tag|difficulty[_ -]?(?:tag|label|level)|surfaceLure|groundTruthStatus)\b/i.test(
      state,
    )
  )
    reasons.push("METADATA_IN_VISIBLE_TEXT");
  if (
    /\b(?:this|it|candidate|statement)\s+(?:should|must|is to)\s+be\s+(?:classified|treated|labeled|labelled)\s+as\b|\b(?:correct|expected)\s+(?:category|answer|label)\s*(?:is|:)|\brubric\s+(?:says|requires|implies)|\b(?:FACT_OBSERVATION|OBSERVATION_INSIGHT|INSIGHT_HYPOTHESIS|DECISION_COMMITMENT|TAXONOMY_STRESS|ADVERSARIAL)\b/i.test(
      row.context,
    )
  )
    reasons.push("CONTEXT_LABEL_HINT");
  if (
    /\b(?:owner|speaker|candidate|statement)\s+(?:explicitly\s+)?(?:states?|describes?|expresses?|confirms?|records?)\s+(?:an?\s+|their\s+|the\s+|a standing\s+|a recurring\s+|a personal\s+)*(?:preference|hypothesis|commitment|decision|factual assertion)\b/i.test(
      row.context,
    )
  )
    reasons.push("CONTEXT_RUBRIC_EXPLANATION");
  if (
    /\b(?:expected|fact|observation|hypothesis|insight|decision|preference|commitment)_\d{3,4}\b/i.test(
      state,
    )
  )
    reasons.push("CLASS_ENCODED_ID_IN_TEXT");
  if (
    !privacyEligible({
      id: "synthetic",
      kind: "fact",
      statement: state,
      source: "synthetic",
    })
  )
    reasons.push("PRIVACY_MARKER");
  return reasons;
}
export function validateChallengeRows(input: unknown): ChallengeAuthor[] {
  const rows = z.array(challengeAuthorSchema).min(1).max(2000).parse(input);
  const ids = new Set<string>(),
    texts = new Set<string>();
  for (const row of rows) {
    if (ids.has(row.id) || texts.has(normalizedInput(row)))
      throw new Error("Duplicate challenge input");
    const issues = leakageIssues(row);
    if (issues.length)
      throw new Error(`Challenge leakage: ${row.id}: ${issues.join(",")}`);
    ids.add(row.id);
    texts.add(normalizedInput(row));
  }
  return rows;
}
/** Confidence is self-reported, not calibrated; admission depends on explicit defensibility. */
export function admit(
  row: ChallengeAuthor,
  input: unknown,
  auditReasons: string[] = [],
): CohortRecord {
  const leakage = [...leakageIssues(row), ...auditReasons];
  const base = {
    ...row,
    expected: null,
    review: null,
    reviewStatus: "UNREVIEWED" as const,
  };
  if (leakage.length)
    return { ...base, state: "REJECTED_LEAKAGE", reasons: leakage };
  if (input == null)
    return { ...base, state: "UNREVIEWED", reasons: ["NO_INDEPENDENT_REVIEW"] };
  const parsed = independentAssessmentSchema.safeParse(input);
  if (!parsed.success || parsed.data.id !== row.id)
    return {
      ...base,
      state: "REJECTED_INVALID",
      reviewStatus: "REVIEW_INVALID",
      reasons: ["REVIEW_INVALID"],
    };
  const review = parsed.data;
  const reasons: string[] = [];
  if (row.ambiguous || review.ambiguous) reasons.push("AMBIGUOUS");
  if (row.label !== review.label) reasons.push("REVIEW_DISAGREEMENT");
  if (!row.defensible || !review.defensible)
    reasons.push("GROUND_TRUTH_NOT_DEFENSIBLE");
  if (review.rubricSensitive) reasons.push("RUBRIC_SENSITIVE");
  if (row.construction === "TAXONOMY_STRESS")
    reasons.push("AUTHORED_TAXONOMY_STRESS");
  if (reasons.length)
    return {
      ...base,
      review,
      reviewStatus: "VALID",
      state: "TAXONOMY_STRESS",
      reasons,
    };
  if (
    row.construction === "STANDARD" &&
    !["EASY", "MODERATE"].includes(row.difficulty)
  )
    return {
      ...base,
      review,
      reviewStatus: "VALID",
      state: "REJECTED_INVALID",
      reasons: ["STANDARD_DIFFICULTY_NOT_QUALIFIED"],
    };
  if (row.construction === "CHALLENGE" && row.difficulty === "EASY")
    return {
      ...base,
      review,
      reviewStatus: "VALID",
      state: "REJECTED_INVALID",
      reasons: ["CHALLENGE_CANNOT_BE_EASY"],
    };
  return {
    ...base,
    review,
    reviewStatus: "VALID",
    state: row.construction,
    expected: row.label,
    reasons: [],
  };
}
export function reconcileBatch(
  rows: readonly ChallengeAuthor[],
  input: unknown,
  authorIds: readonly string[],
) {
  const batch = independentBatchSchema.parse(input);
  if (authorIds.includes(batch.reviewerId))
    throw new Error("Independent reviewer required");
  if (batch.blindedInputHash !== hashValue(reviewerInput(rows)))
    throw new Error("Review input hash mismatch");
  const reviews = new Map(batch.cases.map((row) => [row.id, row]));
  if (
    reviews.size !== rows.length ||
    reviews.size !== batch.cases.length ||
    rows.some((r) => !reviews.has(r.id))
  )
    throw new Error("Review coverage mismatch");
  return rows.map((row) => admit(row, reviews.get(row.id)));
}
export function datasetQuality(rows: readonly CohortRecord[]) {
  const summarize = (items: readonly CohortRecord[]) => {
    const reviewed = items.filter((r) => r.reviewStatus === "VALID");
    const agreed = reviewed.filter(
      (r) =>
        r.label !== null &&
        r.label === r.review?.label &&
        r.defensible &&
        r.review?.defensible &&
        !r.review.rubricSensitive &&
        !r.ambiguous &&
        !r.review.ambiguous,
    ).length;
    return {
      authored: items.length,
      agreed,
      standard: items.filter((r) => r.state === "STANDARD").length,
      challenge: items.filter((r) => r.state === "CHALLENGE").length,
      stress: items.filter((r) => r.state === "TAXONOMY_STRESS").length,
      rejected: items.filter((r) => r.state.startsWith("REJECTED_")).length,
      unreviewed: items.filter((r) => r.state === "UNREVIEWED").length,
      labelSurvival: items.length ? agreed / items.length : null,
      survival: items.length ? items.filter(r => r.state === "STANDARD" || r.state === "CHALLENGE").length / items.length : null,
      reviewed: reviewed.length,
      rawAgreement: reviewed.length
        ? reviewed.filter((r) => r.label === r.review?.label).length /
          reviewed.length
        : null,
      ambiguous: reviewed.filter((r) => r.ambiguous || r.review?.ambiguous)
        .length,
      disagreement: reviewed.filter((r) => r.label !== r.review?.label).length,
    };
  };
  const counts = Object.fromEntries(
    DATASET_STATES.map((state) => [
      state,
      rows.filter((r) => r.state === state).length,
    ]),
  );
  return {
    ...summarize(rows),
    counts,
    accounted: Object.values(counts).reduce((a, b) => a + b, 0) === rows.length,
    byDifficulty: Object.fromEntries(
      DIFFICULTIES.map((d) => [
        d,
        summarize(rows.filter((r) => r.difficulty === d)),
      ]),
    ),
    byBoundary: Object.fromEntries(
      CHALLENGE_BOUNDARIES.map((b) => [
        b,
        summarize(rows.filter((r) => r.boundaries.includes(b))),
      ]),
    ),
    byClass: Object.fromEntries(
      KNOWLEDGE_KINDS.map((label) => [
        label,
        summarize(rows.filter((r) => r.label === label)),
      ]),
    ),
    adversarialChallenge: rows.filter(
      (r) => r.state === "CHALLENGE" && r.difficulty === "ADVERSARIAL",
    ).length,
  };
}
