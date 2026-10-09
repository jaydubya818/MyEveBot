import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  blindedReviewPacket,
  hashValue,
  reconcileReview,
  reviewMetrics,
  validateAuthoredCases,
} from "./challenge-review.ts";

const directory = new URL(
  "../../../../docs/experiments/jev-v05/",
  import.meta.url,
);
const read = (file: string) =>
  JSON.parse(readFileSync(new URL(file, directory), "utf8"));

describe("rejected challenge construction evidence", () => {
  it("binds every preserved artifact to the rejected draft manifest", () => {
    const manifest = read("draft-manifest.json");
    expect(manifest.eligibleForLiveEvaluation).toBe(false);
    expect(manifest.status).toBe("REJECTED_DRAFT_NOT_FOR_EVALUATION");
    for (const [file, expected] of Object.entries(manifest.fileSha256)) {
      expect(
        createHash("sha256")
          .update(readFileSync(new URL(file, directory)))
          .digest("hex"),
      ).toBe(expected);
    }
  });
  it("reproduces all review partitions and exclusion statistics without predictions", () => {
    const authored = validateAuthoredCases(read("authored.json"));
    const assessed = [1, 2, 3].flatMap((part) => {
      const input = read(`review/blind-${part}.json`);
      const ids = new Set(input.map((row: { id: string }) => row.id));
      const rows = authored.filter((row) => ids.has(row.id));
      expect(blindedReviewPacket(rows)).toEqual(input);
      for (const row of input)
        expect(Object.keys(row).sort()).toEqual(["candidate", "context", "id"]);
      return reconcileReview(
        rows,
        {
          ...read(`review/results-${part}.json`),
          blindedInputHash: hashValue(input),
        },
        "codex-authoring-main",
      );
    });
    expect(new Set(assessed.map((row) => row.id)).size).toBe(authored.length);
    expect(assessed.length).toBe(authored.length);
    expect(reviewMetrics(assessed)).toEqual(read("agreement.json"));
    expect(assessed.filter((row) => row.expected !== null)).toHaveLength(
      read("primary.json").length,
    );
    expect(
      assessed
        .filter((row) => row.expected !== null)
        .every((row) => row.exclusionReasons.length === 0),
    ).toBe(true);
  });
});
