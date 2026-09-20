import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  dataset,
  datasetHash,
  DATASET_VERSION,
  validateDataset,
} from "../lib/decision-intelligence/dataset.ts";
import { evaluateDataset } from "../lib/decision-intelligence/evaluation.ts";
import { FakeDecisionProvider } from "../lib/decision-intelligence/fixtures.ts";
import {
  calculateMetrics,
  simulateThreshold,
} from "../lib/decision-intelligence/metrics.ts";

const args = process.argv.slice(2);
const supported = ["--dry-run", "--fixture", "--output"];
if (
  args.some(
    (arg, index) =>
      arg.startsWith("--") &&
      !supported.includes(arg) &&
      args[index - 1] !== "--output",
  )
)
  throw new Error(
    "Unsupported argument. Use --dry-run or --fixture --output <directory>. Live evaluation is not enabled.",
  );
const rows = validateDataset(dataset);
const estimate = Math.ceil(
  rows.reduce((sum, row) => sum + row.text.length + 600, 0) / 3,
);
console.log(
  JSON.stringify(
    {
      dataset: DATASET_VERSION,
      hash: datasetHash(rows),
      examples: rows.length,
      source: "Synthetic only",
      estimatedInputTokens: estimate,
      estimateBasis:
        "Conservative character estimate, including contract overhead; not measured usage",
      maximumCost: "Not authorized; live invocation disabled",
      canonicalCategories: 7,
      evaluatedCategories: 6,
      excluded: "Insight",
    },
    null,
    2,
  ),
);
if (args.includes("--fixture")) {
  const output = args[args.indexOf("--output") + 1];
  if (!args.includes("--output") || !output || output.startsWith("--"))
    throw new Error("An explicit output directory is required");
  const run = await evaluateDataset(new FakeDecisionProvider(), {
    environment: "local-fixture",
  });
  const directory = resolve(output);
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, `${run.id}.json`),
    `${JSON.stringify(run, null, 2)}\n`,
    { flag: "wx", mode: 0o600 },
  );
  const metrics = calculateMetrics(run.rows);
  const report = [
    "# LOCAL FIXTURE — NOT JEV PERFORMANCE",
    "",
    "This is deterministic fake-provider evidence, not a Jev benchmark. No live Jev calls were made.",
    "",
    `Dataset: ${run.datasetVersion} (${run.datasetHash}). ${rows.length} examples; 35 per class. Canonical categories: 7. Experimental categories: 6. Insight: excluded.`,
    "",
    "Canonical classification is explicit owner/Agent input, not independently measured. Canonical accuracy, latency and cost: N/A.",
    "",
    `Attempted: ${metrics.attempted}; valid: ${metrics.succeeded}; failed: ${metrics.failed}. Fixture accuracy: ${metrics.accuracy}. This does not measure provider quality.`,
    "",
    "| Threshold | Coverage | Accuracy | Errors | Fallback |",
    "| --- | --- | --- | --- | --- |",
    ...[0.7, 0.8, 0.9, 0.95, 0.97, 0.99].map((threshold) => {
      const s = simulateThreshold(run.rows, threshold);
      return `| ${threshold} | ${s.coverage} | ${s.accuracy ?? "N/A"} | ${s.errors} | ${s.fallback} |`;
    }),
    "",
    "Conclusion: INCONCLUSIVE. No live provider evidence. No threshold recommended. Behavioral influence: NONE.",
    "",
  ];
  await writeFile(resolve(directory, `${run.id}.md`), report.join("\n"), {
    flag: "wx",
    mode: 0o600,
  });
  console.log(`Wrote local fixture run ${run.id}. No external calls.`);
}
