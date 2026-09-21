import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  blindedReviewPacket,
  hashValue,
  reconcileReview,
  reviewMetrics,
  validateAuthoredCases,
} from "../../../../apps/eve/lib/decision-intelligence/challenge-review.ts";
function preserveArtifact(path: string, contents: string) {
  if (existsSync(path)) {
    if (readFileSync(path, "utf8") !== contents)
      throw new Error(
        "Preserved evidence changed; create a separate dataset revision",
      );
    return;
  }
  writeFileSync(path, contents, { flag: "wx" });
}
const directory = resolve(import.meta.dirname, "..");
const read = (file: string) =>
  JSON.parse(readFileSync(resolve(directory, file), "utf8"));
const authored = validateAuthoredCases(read("authored.json"));
const reviewed = [1, 2, 3]
  .flatMap((part) => {
    const input = read(`review/blind-${part}.json`);
    const ids = new Set(input.map((r: { id: string }) => r.id));
    const rows = authored.filter((r) => ids.has(r.id));
    if (JSON.stringify(input) !== JSON.stringify(blindedReviewPacket(rows)))
      throw new Error("Blinded packet mismatch");
    return reconcileReview(
      rows,
      {
        ...read(`review/results-${part}.json`),
        blindedInputHash: hashValue(input),
      },
      "codex-authoring-main",
    );
  })
  .sort((a, b) => a.id.localeCompare(b.id));
if (
  reviewed.length !== authored.length ||
  new Set(reviewed.map((r) => r.id)).size !== authored.length
)
  throw new Error(
    "Partitioned review must cover the complete authored set exactly once",
  );
const metrics = reviewMetrics(reviewed);
for (const [file, data] of Object.entries({
  "reviewed.json": reviewed,
  "agreement.json": metrics,
  "primary.json": reviewed.filter((r) => r.groundTruthStatus === "AGREED"),
  "ambiguity.json": reviewed.filter((r) =>
    r.exclusionReasons.includes("AMBIGUOUS"),
  ),
  "disagreement.json": reviewed.filter((r) =>
    r.exclusionReasons.includes("REVIEW_DISAGREEMENT"),
  ),
  "human-review.json": reviewed.filter(
    (r) =>
      r.groundTruthStatus !== "AGREED" ||
      r.boundaries.includes("MULTI_CONCEPT"),
  ),
}))
  preserveArtifact(
    resolve(directory, file),
    JSON.stringify(data, null, 2) + "\n",
  );
console.log(
  JSON.stringify(
    {
      authored: metrics.authored,
      agreed: metrics.agreed,
      ambiguous: metrics.ambiguous,
      disagreement: metrics.disagreement,
      agreement: metrics.rawAgreement,
      classes: metrics.byClass,
      difficulty: metrics.byDifficulty,
    },
    null,
    2,
  ),
);
