import { mkdir, writeFile, readFile, realpath } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { execFileSync } from "node:child_process";
import { z } from "zod";
import {
  dataset,
  datasetHash,
  DATASET_VERSION,
  validateDataset,
} from "../lib/decision-intelligence/dataset.ts";
import { evaluateDataset } from "../lib/decision-intelligence/evaluation.ts";
import {
  FakeDecisionProvider,
  ChallengeFixtureProvider,
} from "../lib/decision-intelligence/fixtures.ts";
import {
  calculateMetrics,
  simulateThreshold,
} from "../lib/decision-intelligence/metrics.ts";
import {
  experimentSchema,
  experimentDefinition,
  experimentRequest,
} from "../lib/decision-intelligence/experiment.ts";
import {
  experimentAnalysis,
  THRESHOLDS,
} from "../lib/decision-intelligence/experiment-metrics.ts";
import {
  JevDecisionProvider,
  jevConfigured,
  jevMetadata,
} from "../lib/decision-intelligence/jev-provider.ts";
import { knowledgeRequest } from "../lib/decision-intelligence/contract.ts";
const args = process.argv.slice(2);
const flags = new Set(["--dry-run", "--fixture", "--live"]),
  values = new Set([
    "--output",
    "--experiment",
    "--max-examples",
    "--authorization-file",
  ]),
  parsed = new Map<string, string>();
for (let i = 0; i < args.length; i++) {
  const key = args[i]!;
  if (parsed.has(key)) throw new Error("Duplicate argument");
  if (flags.has(key)) parsed.set(key, "true");
  else if (values.has(key) && args[i + 1] && !args[i + 1]!.startsWith("--"))
    parsed.set(key, args[++i]!);
  else throw new Error("Unsupported or incomplete argument");
}
const modes = [...flags].filter((f) => parsed.has(f));
if (modes.length !== 1)
  throw new Error("Select exactly one of --dry-run, --fixture, --live");
const experiment = parsed.has("--experiment")
  ? experimentSchema.parse(parsed.get("--experiment"))
  : undefined;
const def = experiment ? experimentDefinition(experiment) : null;
const count = parsed.has("--max-examples")
  ? Number(parsed.get("--max-examples"))
  : (def?.rows.length ?? dataset.length);
if (
  !Number.isInteger(count) ||
  count < 1 ||
  count > (def?.rows.length ?? dataset.length)
)
  throw new Error("Invalid bounded example count");
const inputs = def
  ? def.rows.map((r) => JSON.stringify(experimentRequest(def.experiment, r.id)))
  : validateDataset(dataset).map((r) =>
      JSON.stringify(knowledgeRequest(r.text)),
    );
const estimatedInputTokens = Math.ceil(
  inputs
    .map((s) => s.length)
    .sort((a, b) => b - a)
    .slice(0, count)
    .reduce((a, b) => a + b, 0) / 2,
);
const estimatedOutputTokens = count * 256;
console.log(
  JSON.stringify(
    {
      experiment: experiment ?? "V0_ORIGINAL_FIXTURE",
      dataset: def?.datasetVersion ?? DATASET_VERSION,
      datasetHash: def?.datasetHash ?? datasetHash(dataset),
      count,
      estimatedInputTokens,
      estimatedOutputTokens,
      estimateBasis:
        "Conservative two characters per input token plus 256 output tokens per decision; estimates, not measured usage",
      ownerData: "NONE",
      behavioralInfluence: "NONE",
      liveAuthorized: false,
    },
    null,
    2,
  ),
);
if (parsed.has("--dry-run")) process.exit(0);
const output = parsed.get("--output");
if (!output) throw new Error("Explicit evidence output directory required");
const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const directory = resolve(output);
await mkdir(directory, { recursive: true });
const canonical = await realpath(directory),
  inside = relative(root, canonical);
if (
  canonical === "/" ||
  canonical === process.env.HOME ||
  inside === "" ||
  (!inside.startsWith("..") && !isAbsolute(inside)) ||
  canonical.split("/").some((p) => p === ".git" || p === "node_modules")
)
  throw new Error(
    "Evidence output must be outside the source checkout and protected paths",
  );
let sourceCommit: string | undefined;
let provider: FakeDecisionProvider | JevDecisionProvider = experiment
  ? new ChallengeFixtureProvider()
  : new FakeDecisionProvider();
if (parsed.has("--live")) {
  if (!experiment)
    throw new Error("Live runs require an explicit versioned experiment");
  const file = parsed.get("--authorization-file");
  if (!file)
    throw new Error(
      "A separately approved bounded live authorization file is required",
    );
  const auth = z
    .object({
      sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
      experiment: experimentSchema,
      maximumRequests: z.number().int().positive(),
      maximumEstimatedUsd: z.number().finite().nonnegative(),
      inputUsdPerMillion: z.number().finite().nonnegative(),
      outputUsdPerMillion: z.number().finite().nonnegative(),
      pricingCheckedAt: z.iso.datetime(),
      reference: z.string().min(1),
    })
    .strict()
    .parse(JSON.parse(await readFile(file, "utf8")));
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const age = Date.now() - Date.parse(auth.pricingCheckedAt);
  const estimate =
    (estimatedInputTokens / 1e6) * auth.inputUsdPerMillion +
    (estimatedOutputTokens / 1e6) * auth.outputUsdPerMillion;
  if (
    auth.sourceCommit !== head ||
    auth.experiment !== experiment ||
    count > auth.maximumRequests ||
    estimate > auth.maximumEstimatedUsd ||
    age < 0 ||
    age > 86400000
  )
    throw new Error(
      "Live authorization scope, price recency or estimated budget mismatch",
    );
  if (!jevConfigured()) throw new Error("Jev is not configured");
  if (
    execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()
  )
    throw new Error("Live evaluation requires a clean qualified checkout");
  sourceCommit = head;
  provider = new JevDecisionProvider();
}
const environment = parsed.has("--live") ? "live-experiment" : "local-fixture";
const run = experiment
  ? await evaluateDataset(provider, {
      environment,
      experiment,
      sourceCommit,
      maxExamples: count,
    })
  : await evaluateDataset(provider, { environment, maxExamples: count });
const report =
  "experiment" in run
    ? experimentAnalysis(run)
    : {
        kind: "primary",
        metrics: calculateMetrics(run.rows),
        thresholds: THRESHOLDS.map((t) => simulateThreshold(run.rows, t)),
      };
await writeFile(
  resolve(canonical, `${run.id}.json`),
  JSON.stringify(run, null, 2) + "\n",
  { flag: "wx", mode: 0o600 },
);
await writeFile(
  resolve(canonical, `${run.id}.md`),
  `# ${environment === "local-fixture" ? "LOCAL FIXTURE — NOT JEV PERFORMANCE" : "LIVE SYNTHETIC EXPERIMENT"}\n\n${run.datasetVersion}; SHADOW; influence NONE. Canonical behavior unmeasured.\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`,
  { flag: "wx", mode: 0o600 },
);
console.log(
  JSON.stringify({
    runId: run.id,
    environment,
    attempted: run.rows.length,
    provider:
      environment === "local-fixture"
        ? "deterministic fixture"
        : jevMetadata.model,
    ownerData: "NONE",
    influence: "NONE",
  }),
);
