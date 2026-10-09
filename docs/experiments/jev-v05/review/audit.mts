import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { dataset } from "../../../../apps/eve/lib/decision-intelligence/dataset.ts";
import {
  challengeState,
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
const dir = resolve(import.meta.dirname, "..");
const authored = validateAuthoredCases(
  JSON.parse(readFileSync(resolve(dir, "authored.json"), "utf8")),
);
const normalize = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
const tokens = (s: string) => new Set(s.toLowerCase().match(/[a-z]+/g) ?? []);
const jaccard = (a: string, b: string) => {
  const x = tokens(a),
    y = tokens(b);
  return [...x].filter((t) => y.has(t)).length / new Set([...x, ...y]).size;
};
const closest = authored
  .map((row) => {
    const near = dataset
      .map((old) => ({ id: old.id, score: jaccard(row.candidate, old.text) }))
      .sort((a, b) => b.score - a.score)[0]!;
    return { id: row.id, v0Id: near.id, score: near.score };
  })
  .sort((a, b) => b.score - a.score);
const stateKeys = authored.every(
  (r) =>
    JSON.stringify(Object.keys(JSON.parse(challengeState(r)))) ===
    JSON.stringify(["context", "candidate"]),
);
const contexts = authored
  .filter((r) =>
    /\b(preference|hypothesis|commitment|decision|observation|factual|standing|undertaking|explicit|not a prediction|not a general|not a current|no primary|single label)\b/i.test(
      r.context,
    ),
  )
  .map((r) => ({ id: r.id, context: r.context }));
const report = {
  status: "REJECTED_DRAFT_NOT_FOR_EVALUATION",
  exactV0Duplicates: authored.flatMap((r) =>
    dataset
      .filter((v) => r.candidate === v.text)
      .map((v) => ({ id: r.id, v0Id: v.id })),
  ),
  normalizedV0Duplicates: authored.flatMap((r) =>
    dataset
      .filter((v) => normalize(r.candidate) === normalize(v.text))
      .map((v) => ({ id: r.id, v0Id: v.id })),
  ),
  nearestV0: closest,
  nearDuplicateThreshold: 0.6,
  nearDuplicateCandidates: closest.filter((r) => r.score >= 0.6),
  structuralSerializationPass: stateKeys,
  semanticContextCueCandidates: contexts,
  limitations:
    "Token Jaccard is a lexical screen, not proof of semantic independence. Context cue matches require human/author interpretation; legitimate conversational context can contain these words. The initial authoring inspection found actual explanatory label cues as well as legitimate matches. No semantic novelty PASS is claimed.",
};
preserveArtifact(
  resolve(dir, "quality-audit.json"),
  JSON.stringify(report, null, 2) + "\n",
);
const files = [
  "rubric.json",
  "authored.json",
  "reviewed.json",
  "primary.json",
  "ambiguity.json",
  "disagreement.json",
  "human-review.json",
  "agreement.json",
  "quality-audit.json",
  ...["1", "2", "3"].flatMap((n) => [
    `review/blind-${n}.json`,
    `review/results-${n}.json`,
  ]),
];
const manifest = {
  datasetCandidate: "knowledge-classification-challenge-v1-draft-01",
  status: report.status,
  eligibleForLiveEvaluation: false,
  authorId: "codex-authoring-main",
  reviewType: "AI INDEPENDENT REVIEW",
  reviewModel:
    "Inherited Codex model; exact identifier unavailable in agent context",
  groundTruthReview: {
    agentInvocations: 3,
    separatelyInvokedExternalModelApis: 0,
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
    usageNote:
      "Codex agent review usage was not exposed; unavailable is not zero. Separate from Jev benchmark usage.",
  },
  jev: { calls: 0, ownerData: "NONE", behavioralInfluence: "NONE" },
  fileSha256: Object.fromEntries(
    files.map((file) => [
      file,
      createHash("sha256")
        .update(readFileSync(resolve(dir, file)))
        .digest("hex"),
    ]),
  ),
};
preserveArtifact(
  resolve(dir, "draft-manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      exact: report.exactV0Duplicates.length,
      normalized: report.normalizedV0Duplicates.length,
      near: report.nearDuplicateCandidates.length,
      maximumJaccard: closest[0],
      contextCueCandidates: contexts.length,
      structuralSerializationPass: stateKeys,
    },
    null,
    2,
  ),
);
