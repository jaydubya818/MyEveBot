import { describe, expect, it } from "vitest";
import {
  admit,
  challengeAuthorSchema,
  datasetQuality,
  independentBatchSchema,
  leakageIssues,
  providerState,
  reconcileBatch,
  reviewerInput,
  validateChallengeRows,
  type ChallengeAuthor,
} from "./challenge-cohorts.ts";
import { RUBRIC_ID, RUBRIC_HASH, hashValue } from "./challenge-review.ts";
const row: ChallengeAuthor = {
  id: "challenge_0001",
  familyId: "family_001",
  candidate: "Friday is still on the board.",
  context: "The published calendar has not been amended since Tuesday.",
  label: "fact",
  confidence: "MEDIUM",
  ambiguous: false,
  defensible: true,
  difficulty: "ADVERSARIAL",
  boundaries: ["COMMITMENT_FUTURE_FACT"],
  rationale: "Reports the calendar state rather than accepting an obligation.",
  difficultyRationale:
    "Deadline language resembles an undertaking; the candidate reports a schedule.",
  surfaceLure: "commitment",
  domain: "projects",
  speaker: "owner",
  construction: "CHALLENGE",
};
const review = {
  id: row.id,
  label: "fact",
  confidence: "MEDIUM",
  ambiguous: false,
  defensible: true,
  rubricSensitive: false,
  rationale: "Existing schedule state.",
};
describe("three-cohort dataset admission", () => {
  it("admits defensible medium-confidence adversarial truth without downgrading difficulty", () => {
    expect(admit(row, review)).toMatchObject({
      state: "CHALLENGE",
      expected: "fact",
      difficulty: "ADVERSARIAL",
    });
    expect(admit(row, { ...review, confidence: "LOW" })).toMatchObject({
      state: "CHALLENGE",
    });
  });
  it("separates disagreement, ambiguity and rubric sensitivity from model accuracy", () => {
    for (const altered of [
      { ...review, label: "commitment" },
      { ...review, label: null, ambiguous: true, defensible: false },
      { ...review, rubricSensitive: true },
      { ...review, defensible: false },
    ]) {
      expect(admit(row, altered)).toMatchObject({
        state: "TAXONOMY_STRESS",
        expected: null,
      });
    }
    expect(
      admit({ ...row, construction: "TAXONOMY_STRESS" }, review),
    ).toMatchObject({ state: "TAXONOMY_STRESS", expected: null });
  });
  it("does not replace missing or invalid reviews with author truth", () => {
    expect(admit(row, null)).toMatchObject({
      state: "UNREVIEWED",
      expected: null,
    });
    expect(admit(row, { ...review, label: "intent" })).toMatchObject({
      state: "REJECTED_INVALID",
      reviewStatus: "REVIEW_INVALID",
      expected: null,
    });
    expect(admit(row, { ...review, id: "challenge_0002" })).toMatchObject({
      state: "REJECTED_INVALID",
    });
  });
  it("rejects unknown cohort/label and source IDs encoding an answer", () => {
    for (const mutation of [
      { id: "expected_insight_001" },
      { construction: "GUESS" },
      { label: "intention" },
    ])
      expect(() => validateChallengeRows([{ ...row, ...mutation }])).toThrow();
    expect(() =>
      challengeAuthorSchema.parse({ ...row, surfaceLure: "fact" }),
    ).toThrow();
  });
  it("rejects inserted labeling instructions but permits legitimate candidate words", () => {
    for (const context of [
      "This should be classified as a Hypothesis.",
      "The expected label is insight.",
      "author_rationale: a prediction",
      "The owner states a preference.",
      "boundary tag: INSIGHT_HYPOTHESIS",
      "Difficulty: ADVERSARIAL",
    ]) {
      expect(() => validateChallengeRows([{ ...row, context }])).toThrow();
      expect(admit({ ...row, context }, review)).toMatchObject({
        state: "REJECTED_LEAKAGE",
        expected: null,
      });
    }
    expect(
      leakageIssues({
        ...row,
        candidate: "The word 'promise' is printed on the poster.",
      }),
    ).toEqual([]);
  });
  it("serializes only natural input and neutral reviewer identity", () => {
    expect(JSON.parse(providerState({ ...row }))).toEqual({
      context: row.context,
      candidate: row.candidate,
    });
    expect(Object.keys(reviewerInput([row])[0]!)).toEqual([
      "id",
      "candidate",
      "context",
    ]);
    expect(providerState(row)).not.toMatch(
      /family_001|challenge_0001|ADVERSARIAL|COMMITMENT_FUTURE_FACT|surfaceLure/,
    );
  });
  it("rejects normalized duplicate input and credentials in either field", () => {
    expect(() =>
      validateChallengeRows([
        row,
        {
          ...row,
          id: "challenge_0002",
          candidate: row.candidate.toUpperCase() + "!",
        },
      ]),
    ).toThrow();
    expect(() =>
      validateChallengeRows([
        { ...row, context: "Authorization: Bearer synthetic-secret" },
      ]),
    ).toThrow();
  });
  it("binds review to exact ordered inputs and one independent record per case", () => {
    const batch = {
      reviewerId: "fresh-review",
      reviewModel: "configured Codex model",
      reviewedAt: "2026-09-21T00:00:00Z",
      rubricId: RUBRIC_ID,
      rubricHash: RUBRIC_HASH,
      blindedInputHash: hashValue(reviewerInput([row])),
      reviewedWithoutProviderOutputs: true,
      cases: [review],
    };
    expect(reconcileBatch([row], batch, ["author"])[0]?.state).toBe(
      "CHALLENGE",
    );
    expect(() => reconcileBatch([row], batch, ["fresh-review"])).toThrow();
    expect(() =>
      reconcileBatch([row], { ...batch, cases: [review, review] }, []),
    ).toThrow();
    expect(() =>
      reconcileBatch([{ ...row, candidate: "Changed text" }], batch, []),
    ).toThrow();
    expect(() =>
      independentBatchSchema.parse({ ...batch, rubricHash: "0".repeat(64) }),
    ).toThrow();
  });
  it("accounts for every case and exposes difficulty collapse rather than hiding it", () => {
    const records = [
      admit(row, review),
      admit({ ...row, id: "challenge_0002" }, null),
      admit(
        { ...row, id: "challenge_0003" },
        {
          ...review,
          id: "challenge_0003",
          label: null,
          defensible: false,
          ambiguous: true,
        },
      ),
    ];
    const quality = datasetQuality(records);
    expect(quality).toMatchObject({
      authored: 3,
      challenge: 1,
      stress: 1,
      unreviewed: 1,
      accounted: true,
      adversarialChallenge: 1,
    });
    expect(quality.byDifficulty.ADVERSARIAL?.survival).toBeCloseTo(1 / 3);
  });
});
