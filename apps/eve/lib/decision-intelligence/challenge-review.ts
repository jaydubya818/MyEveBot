import { createHash } from "node:crypto";
import { z } from "zod";
import { KNOWLEDGE_KINDS } from "../knowledge-types.ts";
import { privacyEligible } from "./shadow.ts";

export const DIFFICULTIES = [
  "EASY",
  "MODERATE",
  "HARD",
  "ADVERSARIAL",
] as const;
export const BOUNDARIES = [
  "FACT_OBSERVATION",
  "OBSERVATION_HYPOTHESIS",
  "OBSERVATION_INSIGHT",
  "FACT_INSIGHT",
  "INSIGHT_HYPOTHESIS",
  "DECISION_COMMITMENT",
  "PREFERENCE_DECISION",
  "PREFERENCE_FACT",
  "INTENT_COMMITMENT",
  "MULTI_CONCEPT",
  "NEGATION",
  "CORRECTION",
  "QUOTED_SPEECH",
  "ATTRIBUTED_STATEMENT",
  "TEMPORAL_CHANGE",
  "LOW_CONTEXT",
  "CONTEXT_DEPENDENT",
] as const;
export const RUBRIC_ID = "knowledge-taxonomy-challenge-rubric:v1";
export const RUBRIC_HASH =
  "4d6e330835ead247e07425be6e2a8d37b3206254487d22334b03efa569cff78c";
const label = z.enum(KNOWLEDGE_KINDS).nullable();
const confidence = z.enum(["HIGH", "MEDIUM", "LOW"]);
export const authoredCaseSchema = z
  .object({
    id: z.string().regex(/^c\d{3}$/),
    candidate: z.string().trim().min(1).max(2000),
    context: z.string().trim().max(1500),
    difficulty: z.enum(DIFFICULTIES),
    boundaries: z.array(z.enum(BOUNDARIES)).min(1).max(10),
    label,
    confidence,
    rationale: z.string().min(1).max(1000),
  })
  .strict();
export type AuthoredCase = z.infer<typeof authoredCaseSchema>;
export const reviewCaseSchema = z
  .object({
    id: z.string().regex(/^c\d{3}$/),
    label,
    confidence,
    ambiguous: z.boolean(),
    rationale: z.string().min(1).max(1000),
  })
  .strict()
  .refine(
    (row) => row.ambiguous === (row.label === null),
    "AMBIGUOUS must use a null label",
  );
export const reviewPacketSchema = z
  .object({
    reviewerId: z.string().min(1),
    reviewerKind: z.literal("independent-ai"),
    reviewModel: z.string().min(1),
    reviewedAt: z.iso.datetime({ offset: true }),
    rubricId: z.literal(RUBRIC_ID),
    rubricHash: z.literal(RUBRIC_HASH),
    blindedInputHash: z.string().regex(/^[a-f0-9]{64}$/),
    reviewedWithoutProviderOutputs: z.literal(true),
    cases: z.array(reviewCaseSchema).min(1).max(600),
  })
  .strict();
export type ReviewedCase = AuthoredCase & {
  review: z.infer<typeof reviewCaseSchema>;
  expected: z.infer<typeof label>;
  groundTruthStatus:
    | "AGREED"
    | "AMBIGUOUS"
    | "REVIEW_DISAGREEMENT"
    | "LOW_CONFIDENCE";
  exclusionReasons: ("AMBIGUOUS" | "REVIEW_DISAGREEMENT" | "LOW_CONFIDENCE")[];
};
export const hashValue = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Provider state and blinded review input contain no author labels or experimental tags. */
export function challengeState(
  example: Pick<AuthoredCase, "candidate" | "context">,
): string {
  return JSON.stringify({
    context: example.context,
    candidate: example.candidate,
  });
}
export function blindedReviewPacket(examples: readonly AuthoredCase[]) {
  return examples.map(({ id, candidate, context }) => ({
    id,
    candidate,
    context,
  }));
}
export function validateAuthoredCases(input: unknown): AuthoredCase[] {
  const rows = z.array(authoredCaseSchema).min(1).max(600).parse(input);
  const ids = new Set<string>();
  const normalized = new Set<string>();
  for (const row of rows) {
    const key = `${row.context}\n${row.candidate}`
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, "");
    if (ids.has(row.id) || normalized.has(key))
      throw new Error("Duplicate challenge candidate or identifier");
    if (new Set(row.boundaries).size !== row.boundaries.length)
      throw new Error("Duplicate boundary tag");
    if (
      !privacyEligible({
        id: row.id,
        kind: row.label ?? "fact",
        statement: challengeState(row),
        source: "synthetic",
      })
    )
      throw new Error("Challenge privacy check failed");
    ids.add(row.id);
    normalized.add(key);
  }
  return rows;
}
export function reconcileReview(
  authored: unknown,
  reviewInput: unknown,
  authorId: string,
): ReviewedCase[] {
  const rows = validateAuthoredCases(authored);
  const review = reviewPacketSchema.parse(reviewInput);
  if (review.reviewerId === authorId)
    throw new Error("Independent reviewer must differ from author");
  if (review.blindedInputHash !== hashValue(blindedReviewPacket(rows)))
    throw new Error("Review does not cover these candidates");
  const byId = new Map(review.cases.map((row) => [row.id, row]));
  if (byId.size !== rows.length || byId.size !== review.cases.length)
    throw new Error("Review must cover every candidate exactly once");
  return rows.map((row) => {
    const assessed = byId.get(row.id);
    if (!assessed) throw new Error("Missing independent review");
    const exclusionReasons: ReviewedCase["exclusionReasons"] = [];
    if (row.label === null || assessed.ambiguous)
      exclusionReasons.push("AMBIGUOUS");
    if (row.label !== assessed.label)
      exclusionReasons.push("REVIEW_DISAGREEMENT");
    if (row.confidence === "LOW" || assessed.confidence === "LOW")
      exclusionReasons.push("LOW_CONFIDENCE");
    const agreed = exclusionReasons.length === 0;
    return {
      ...row,
      review: assessed,
      expected: agreed ? row.label : null,
      groundTruthStatus: exclusionReasons[0] ?? "AGREED",
      exclusionReasons,
    };
  });
}

/** Raw agreement includes agreement on AMBIGUOUS; primary agreement excludes it. */
export function reviewMetrics(rows: readonly ReviewedCase[]) {
  const count = (items: readonly ReviewedCase[]) => ({
    authored: items.length,
    agreed: items.filter((r) => r.groundTruthStatus === "AGREED").length,
    rawAgreement: items.length
      ? items.filter((r) => r.label === r.review.label).length / items.length
      : null,
    primaryAgreement: items.length
      ? items.filter((r) => r.groundTruthStatus === "AGREED").length /
        items.length
      : null,
    ambiguous: items.filter((r) => r.exclusionReasons.includes("AMBIGUOUS"))
      .length,
    disagreement: items.filter((r) =>
      r.exclusionReasons.includes("REVIEW_DISAGREEMENT"),
    ).length,
    lowConfidence: items.filter((r) =>
      r.exclusionReasons.includes("LOW_CONFIDENCE"),
    ).length,
  });
  const total = count(rows);
  return {
    ...total,
    ambiguityRate: rows.length ? total.ambiguous / rows.length : null,
    disagreementRate: rows.length ? total.disagreement / rows.length : null,
    byClass: Object.fromEntries(
      [...KNOWLEDGE_KINDS, "AMBIGUOUS"].map((kind) => [
        kind,
        count(rows.filter((r) => (r.label ?? "AMBIGUOUS") === kind)),
      ]),
    ),
    byDifficulty: Object.fromEntries(
      DIFFICULTIES.map((level) => [
        level,
        count(rows.filter((r) => r.difficulty === level)),
      ]),
    ),
    byBoundary: Object.fromEntries(
      BOUNDARIES.map((boundary) => [
        boundary,
        count(rows.filter((r) => r.boundaries.includes(boundary))),
      ]),
    ),
  };
}
