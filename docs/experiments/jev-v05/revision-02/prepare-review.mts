import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  challengeAuthorSchema,
  leakageIssues,
  normalizedInput,
  reviewerInput,
  type ChallengeAuthor,
} from "../../../../apps/eve/lib/decision-intelligence/challenge-cohorts.ts";
import {
  hashValue,
  RUBRIC_ID,
  RUBRIC_HASH,
} from "../../../../apps/eve/lib/decision-intelligence/challenge-review.ts";
const dir = import.meta.dirname;
function preserve(file: string, data: unknown) {
  const target = resolve(dir, file),
    text = JSON.stringify(data, null, 2) + "\n";
  if (existsSync(target)) {
    if (readFileSync(target, "utf8") !== text)
      throw new Error(`Immutable construction artifact differs: ${file}`);
    return;
  }
  writeFileSync(target, text, { flag: "wx" });
}
const seed = 2026092102;
let state = seed >>> 0;
const random = () => {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return (state >>> 0) / 4294967296;
};
function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}
const source = ["evidence", "intent", "state"].flatMap((name) => {
  const input = JSON.parse(
    readFileSync(resolve(dir, `authoring/${name}.json`), "utf8"),
  );
  return input.map((row: unknown) => ({
    source: name,
    row: challengeAuthorSchema.parse(row),
  }));
});
const randomRows = shuffle<{ source: string; row: ChallengeAuthor }>(source);
const identity = randomRows.map((item, i) => ({
  id: `challenge_${String(i + 1).padStart(4, "0")}`,
  source: item.source,
  authorId: item.row.id,
}));
const rows = randomRows.map((item, i) => ({
  ...item.row,
  id: identity[i]!.id,
}));
const seen = new Map<string, string>();
const rejected: { id: string; state: string; reasons: string[] }[] = [];
const eligible = rows.filter((row) => {
  const issues = leakageIssues(row);
  if (issues.length) {
    rejected.push({ id: row.id, state: "REJECTED_LEAKAGE", reasons: issues });
    return false;
  }
  const key = normalizedInput(row);
  if (seen.has(key)) {
    rejected.push({
      id: row.id,
      state: "REJECTED_DUPLICATE",
      reasons: [`Duplicate input of ${seen.get(key)}`],
    });
    return false;
  }
  seen.set(key, row.id);
  return true;
});
const families = new Map<string, ChallengeAuthor[]>();
for (const row of eligible)
  families.set(row.familyId, [...(families.get(row.familyId) ?? []), row]);
const batchCount = Math.max(3, ...[...families.values()].map((f) => f.length));
const batches: ChallengeAuthor[][] = Array.from(
  { length: batchCount },
  () => [],
);
for (const members of shuffle([...families.values()])) {
  const available = shuffle(batches.map((_, i) => i)).sort(
    (a, b) => batches[a]!.length - batches[b]!.length,
  );
  shuffle(members).forEach((row, i) => batches[available[i]!]!.push(row));
}
const manifestBatches = batches.map((batch, i) => {
  const ordered = shuffle(batch),
    input = reviewerInput(ordered);
  if (new Set(ordered.map((r) => r.familyId)).size !== ordered.length)
    throw new Error("Contrastive family revealed within a review context");
  const file = `review/blind-${i + 1}.json`;
  preserve(file, input);
  return {
    batch: i + 1,
    file,
    count: input.length,
    blindedInputHash: hashValue(input),
    ids: input.map((r) => r.id),
  };
});
preserve("authored.json", rows);
preserve("identity-map.json", identity);
preserve("pre-review-rejections.json", rejected);
const createdAt = existsSync(resolve(dir, "review-manifest.json"))
  ? JSON.parse(readFileSync(resolve(dir, "review-manifest.json"), "utf8"))
      .createdAt
  : new Date().toISOString();
preserve("review-manifest.json", {
  createdAt,
  rubricId: RUBRIC_ID,
  rubricHash: RUBRIC_HASH,
  reviewModel: "Inherited Codex model; exact identifier unavailable",
  orderingSeed: seed,
  orderingAlgorithm: "xorshift32 and Fisher-Yates",
  batchingPolicy:
    "At most one member of each contrastive family per fresh isolated review context; no author/boundary/difficulty grouping exposed",
  reviewDatasetHash: hashValue(rows),
  reviewInputHash: hashValue(
    manifestBatches.map((b) =>
      JSON.parse(readFileSync(resolve(dir, b.file), "utf8")),
    ),
  ),
  difficultyRubricHash: createHash("sha256")
    .update(readFileSync(resolve(dir, "difficulty-rubric.json")))
    .digest("hex"),
  authored: rows.length,
  reviewRequired: eligible.length,
  rejected: rejected.length,
  batches: manifestBatches,
});
console.log(
  JSON.stringify(
    {
      authored: rows.length,
      reviewRequired: eligible.length,
      rejected,
      batches: manifestBatches.map(({ batch, count }) => ({ batch, count })),
    },
    null,
    2,
  ),
);
