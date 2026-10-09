import { describe, expect, it } from "vitest";
import {
  RUBRIC_ID,
  RUBRIC_HASH,
  reviewMetrics,
  blindedReviewPacket,
  challengeState,
  hashValue,
  reconcileReview,
  validateAuthoredCases,
} from "./challenge-review.ts";
const authored = [
  {
    id: "c001",
    candidate: "The archive index lists the lantern manual as edition four.",
    context: "A fictional workshop is checking a published catalog entry.",
    difficulty: "HARD",
    boundaries: ["FACT_OBSERVATION"],
    label: "fact",
    confidence: "HIGH",
    rationale:
      "An assertion about a catalog entry; no fresh measurement is described.",
  },
] as const;
function packet(overrides: Record<string, unknown> = {}) {
  return {
    reviewerId: "reviewer-b",
    reviewerKind: "independent-ai",
    reviewModel: "isolated-test-model",
    reviewedAt: "2026-09-20T00:00:00.000Z",
    rubricId: RUBRIC_ID,
    rubricHash: RUBRIC_HASH,
    blindedInputHash: hashValue(
      blindedReviewPacket(validateAuthoredCases(authored)),
    ),
    reviewedWithoutProviderOutputs: true,
    cases: [
      {
        id: "c001",
        ambiguous: false,
        label: "fact",
        confidence: "MEDIUM",
        rationale: "Factual report of a catalog entry.",
      },
    ],
    ...overrides,
  };
}
describe("challenge ground truth and privacy", () => {
  it("admits only independently agreed high/medium labels to primary scoring", () => {
    expect(reconcileReview(authored, packet(), "author-a")[0]).toMatchObject({
      expected: "fact",
      groundTruthStatus: "AGREED",
    });
    for (const review of [
      { label: "observation", confidence: "HIGH" },
      { label: "fact", confidence: "LOW" },
      { label: null, confidence: "LOW" },
    ]) {
      expect(
        reconcileReview(
          authored,
          packet({
            cases: [
              {
                id: "c001",
                rationale: "Boundary remains uncertain",
                ambiguous: review.label === null,
                ...review,
              },
            ],
          }),
          "author-a",
        )[0],
      ).toMatchObject({ expected: null });
    }
  });
  it("rejects self-review, changed inputs, missing reviews and duplicate reviews", () => {
    expect(() =>
      reconcileReview(authored, packet({ reviewerId: "author-a" }), "author-a"),
    ).toThrow();
    expect(() =>
      reconcileReview(
        authored,
        packet({ blindedInputHash: "0".repeat(64) }),
        "author-a",
      ),
    ).toThrow();
    expect(() =>
      reconcileReview(authored, packet({ cases: [] }), "author-a"),
    ).toThrow();
    const row = packet().cases[0];
    expect(() =>
      reconcileReview(authored, packet({ cases: [row, row] }), "author-a"),
    ).toThrow();
  });
  it("strips labels, identifiers, tags and review results from provider serialization", () => {
    const example = reconcileReview(authored, packet(), "author-a")[0]!;
    expect(JSON.parse(challengeState(example))).toEqual({
      candidate: example.candidate,
      context: example.context,
    });
    expect(Object.keys(blindedReviewPacket([example])[0]!)).toEqual([
      "id",
      "candidate",
      "context",
    ]);
    expect(challengeState(example)).not.toMatch(
      /c001|HARD|FACT_OBSERVATION|reviewer|rationale|expected/,
    );
  });
  it("rejects credentials in bounded context and duplicate normalized inputs", () => {
    expect(() =>
      validateAuthoredCases([
        { ...authored[0], context: "Authorization: Bearer synthetic-test" },
      ]),
    ).toThrow();
    expect(() =>
      validateAuthoredCases([
        authored[0],
        {
          ...authored[0],
          id: "c002",
          candidate: authored[0].candidate.toUpperCase() + "!",
        },
      ]),
    ).toThrow();
    expect(() =>
      validateAuthoredCases([{ ...authored[0], id: "fact_001" }]),
    ).toThrow();
  });
  it("retains unresolved low-context cases without arbitrary ground truth", () => {
    const rows = validateAuthoredCases([
      {
        ...authored[0],
        candidate: "Friday.",
        context: "",
        label: null,
        confidence: "LOW",
        boundaries: ["LOW_CONTEXT"],
      },
    ]);
    const review = packet({
      blindedInputHash: hashValue(blindedReviewPacket(rows)),
      cases: [
        {
          id: "c001",
          ambiguous: true,
          label: null,
          confidence: "LOW",
          rationale: "No predicate or speaker context.",
        },
      ],
    });
    expect(reconcileReview(rows, review, "author-a")[0]).toMatchObject({
      expected: null,
      groundTruthStatus: "AMBIGUOUS",
    });
  });
});

it("keeps disagreement separate from low confidence and validates rubric identity", () => {
  const reviewed = reconcileReview(
    authored,
    packet({ cases: [{ ...packet().cases[0], label: "observation" }] }),
    "author-a",
  );
  expect(reviewed[0]).toMatchObject({
    groundTruthStatus: "REVIEW_DISAGREEMENT",
    exclusionReasons: ["REVIEW_DISAGREEMENT"],
  });
  expect(reviewMetrics(reviewed)).toMatchObject({
    agreed: 0,
    disagreement: 1,
    ambiguous: 0,
    rawAgreement: 0,
  });
  expect(() =>
    reconcileReview(
      authored,
      packet({ rubricHash: "0".repeat(64) }),
      "author-a",
    ),
  ).toThrow();
});
