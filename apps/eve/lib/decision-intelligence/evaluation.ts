import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  evidenceSchema,
  knowledgeContract,
  type DecisionProvider,
} from "./contract.ts";
import {
  DATASET_VERSION,
  dataset,
  datasetHash,
  validateDataset,
} from "./dataset.ts";
import { ShadowEvaluator } from "./shadow.ts";

export const contractHash = createHash("sha256")
  .update(JSON.stringify(knowledgeContract))
  .digest("hex");
export const runSchema = z
  .object({
    id: z.string().uuid(),
    createdAt: z.iso.datetime(),
    source: z.literal("synthetic-benchmark"),
    environment: z.enum(["local-fixture", "live-experiment"]),
    decisionId: z.literal("knowledge.classification"),
    decisionVersion: z.literal(1),
    contractHash: z.literal(contractHash),
    datasetVersion: z.literal(DATASET_VERSION),
    datasetHash: z.literal(datasetHash(dataset)),
    mode: z.literal("SHADOW"),
    influence: z.literal("NONE"),
    canonicalSource: z.enum(["not-measured", "local-fixture"]),
    concurrency: z.number().int().min(1).max(4),
    rows: z.array(evidenceSchema).min(1).max(500),
  })
  .strict()
  .superRefine((run, ctx) => {
    const seen = new Set<string>();
    const fixtures = new Map(dataset.map((row) => [row.id, row]));
    for (const row of run.rows) {
      if (seen.has(row.id) || fixtures.get(row.id)?.expected !== row.expected)
        ctx.addIssue({
          code: "custom",
          message: "Evidence does not match the versioned dataset",
        });
      if (run.canonicalSource === "not-measured" && row.canonical !== null)
        ctx.addIssue({
          code: "custom",
          message: "Unmeasured canonical classification must be null",
        });
      if (
        run.environment !== "local-fixture" &&
        run.canonicalSource === "local-fixture"
      )
        ctx.addIssue({
          code: "custom",
          message: "Fixture canonical labels cannot be used in a live run",
        });
      seen.add(row.id);
    }
  });
export type EvaluationRun = z.infer<typeof runSchema>;

export async function evaluateDataset(
  provider: DecisionProvider,
  options: {
    environment: EvaluationRun["environment"];
    maxExamples?: number;
    concurrency?: number;
    timeoutMs?: number;
    stopFailureRate?: number;
  },
) {
  const all = validateDataset(dataset);
  const limit = options.maxExamples ?? all.length;
  if (!Number.isInteger(limit) || limit < 1 || limit > all.length)
    throw new Error("Invalid example limit");
  // Interleave categories so qualification/canary runs cover all six outcomes.
  const rows = [...all]
    .sort(
      (a, b) =>
        a.id.slice(-3).localeCompare(b.id.slice(-3)) ||
        a.expected.localeCompare(b.expected),
    )
    .slice(0, limit);
  const concurrency = options.concurrency ?? 1;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4)
    throw new Error("Invalid concurrency");
  const evaluator = new ShadowEvaluator(provider, {
    enabled: true,
    samplePercent: 100,
    maxDecisions: limit,
    timeoutMs: options.timeoutMs ?? 3000,
    concurrency,
  });
  const evidence: EvaluationRun["rows"] = [];
  for (let offset = 0; offset < rows.length; offset += concurrency) {
    const batch = rows.slice(offset, offset + concurrency);
    evidence.push(
      ...(await Promise.all(
        batch.map((row) =>
          evaluator.evaluate(
            {
              id: row.id,
              kind: row.expected,
              statement: row.text,
              source: "synthetic",
            },
            row.expected,
          ),
        ),
      )),
    );
    if (
      evidence.length >= 12 &&
      evidence.filter((row) => row.failure !== null).length / evidence.length >
        (options.stopFailureRate ?? 0.1)
    )
      break;
  }
  return runSchema.parse({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    source: "synthetic-benchmark",
    environment: options.environment,
    decisionId: knowledgeContract.id,
    decisionVersion: 1,
    contractHash,
    datasetVersion: DATASET_VERSION,
    datasetHash: datasetHash(dataset),
    mode: "SHADOW",
    influence: "NONE",
    canonicalSource: "not-measured",
    concurrency,
    rows: evidence,
  });
}
