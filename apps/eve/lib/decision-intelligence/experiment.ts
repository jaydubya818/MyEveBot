import { createHash } from "node:crypto";
import { z } from "zod";
import challengeData from "./challenge-data.json";
import { KNOWLEDGE_KINDS, type KnowledgeKind } from "../knowledge-types.ts";
import {
  knowledgeContract,
  knowledgeRequest,
  resultSchema,
  failureSchema,
  DecisionFailure,
  safeFailure,
  type DecisionProvider,
  type DecisionRequest,
} from "./contract.ts";
import { dataset, DATASET_VERSION, datasetHash } from "./dataset.ts";
import { RUBRIC_ID, RUBRIC_HASH, hashValue } from "./challenge-review.ts";
import { providerState } from "./challenge-cohorts.ts";
export const EXPERIMENTS = [
  "V0_REPRODUCTION",
  "STANDARD_SIX",
  "CHALLENGE_SIX",
  "STANDARD_SEVEN",
  "CHALLENGE_SEVEN",
  "TAXONOMY_STRESS",
] as const;
export type Experiment = (typeof EXPERIMENTS)[number];
export const experimentSchema = z.enum(EXPERIMENTS);
export const CHALLENGE_OUTCOMES = [
  ...knowledgeContract.outcomes,
  "insight",
] as const;
export const challengeContract = {
  id: "knowledge.classification",
  version: 2,
  contract: "knowledge.classification:v2-challenge",
  mode: "SHADOW",
  influence: "NONE",
  outcomes: CHALLENGE_OUTCOMES,
  question: knowledgeContract.question,
  definitions: challengeData.rubric.labels,
  rubricId: RUBRIC_ID,
  rubricHash: RUBRIC_HASH,
  notice: challengeData.rubric.notice,
} as const;
export const challengeContractHash = hashValue(challengeContract);
export const v1ContractHash = hashValue(knowledgeContract);
const kind = z.enum(KNOWLEDGE_KINDS);
const probability = z.number().finite().min(0).max(1);
export const challengeResultSchema = resultSchema.extend({
  outcome: kind,
  probabilities: z.partialRecord(kind, probability).nullable(),
});
export const experimentEvidenceSchema = z
  .object({
    id: z.string().min(1).max(100),
    expected: kind.nullable(),
    canonical: z.null(),
    cohort: z.enum([
      "V0_REPRODUCTION",
      "STANDARD",
      "CHALLENGE",
      "TAXONOMY_STRESS",
    ]),
    result: challengeResultSchema.nullable(),
    failure: failureSchema.nullable(),
  })
  .strict()
  .refine(
    (r) => (r.result === null) !== (r.failure === null),
    "Exactly one result or failure required",
  );
export type ExperimentEvidence = z.infer<typeof experimentEvidenceSchema>;
export const frozenChallengeRows = challengeData.rows;
export const challengeQuality = challengeData.quality;
export function experimentDefinition(input: Experiment) {
  const experiment = experimentSchema.parse(input);
  const six = experiment === "V0_REPRODUCTION" || experiment.endsWith("_SIX");
  const cohort =
    experiment === "V0_REPRODUCTION"
      ? "V0_REPRODUCTION"
      : experiment === "TAXONOMY_STRESS"
        ? "TAXONOMY_STRESS"
        : experiment.startsWith("STANDARD")
          ? "STANDARD"
          : "CHALLENGE";
  const rows =
    experiment === "V0_REPRODUCTION"
      ? dataset.map((r) => ({
          id: r.id,
          state: r.text,
          expected: r.expected as KnowledgeKind | null,
        }))
      : frozenChallengeRows
          .filter(
            (r) => r.state === cohort && (!six || r.expected !== "insight"),
          )
          .map((r) => ({
            id: r.id,
            state: providerState(r),
            expected: r.expected as KnowledgeKind | null,
          }));
  return {
    experiment,
    cohort,
    six,
    rows,
    outcomes: six ? knowledgeContract.outcomes : CHALLENGE_OUTCOMES,
    decisionVersion: six ? 1 : 2,
    contractHash: six ? v1ContractHash : challengeContractHash,
    datasetVersion:
      experiment === "V0_REPRODUCTION"
        ? DATASET_VERSION
        : challengeData.version,
    datasetHash:
      experiment === "V0_REPRODUCTION" ? datasetHash(dataset) : hashValue(rows),
    rubricId: experiment === "V0_REPRODUCTION" ? null : RUBRIC_ID,
    rubricHash: experiment === "V0_REPRODUCTION" ? null : RUBRIC_HASH,
  } as const;
}
export function experimentRequest(
  experiment: Experiment,
  id: string,
): DecisionRequest<string> {
  const def = experimentDefinition(experiment),
    row = def.rows.find((r) => r.id === id);
  if (!row) throw new Error("Unknown frozen synthetic example");
  if (def.six && row.expected === "insight")
    throw new Error("Insight cannot be sent through v1");
  return def.six
    ? knowledgeRequest(row.state)
    : {
        decisionId: challengeContract.id,
        decisionVersion: 2,
        state: row.state,
        question: challengeContract.question,
        outcomes: CHALLENGE_OUTCOMES,
        definitions: challengeContract.definitions,
      };
}
export const experimentRunSchema = z
  .object({
    id: z.string().uuid(),
    createdAt: z.iso.datetime(),
    source: z.literal("synthetic-benchmark"),
    environment: z.enum(["local-fixture", "live-experiment"]),
    execution: z
      .object({
        provider: z.string(),
        model: z.string(),
        sourceCommit: z
          .string()
          .regex(/^[a-f0-9]{40}$/)
          .nullable(),
      })
      .strict()
      .optional(),
    experiment: experimentSchema,
    cohort: z.enum([
      "V0_REPRODUCTION",
      "STANDARD",
      "CHALLENGE",
      "TAXONOMY_STRESS",
    ]),
    decisionId: z.literal("knowledge.classification"),
    decisionVersion: z.union([z.literal(1), z.literal(2)]),
    contractHash: z.string(),
    datasetVersion: z.string(),
    datasetHash: z.string(),
    rubricId: z.string().nullable(),
    rubricHash: z.string().nullable(),
    mode: z.literal("SHADOW"),
    influence: z.literal("NONE"),
    canonicalSource: z.literal("not-measured"),
    concurrency: z.number().int().min(1).max(4),
    rows: z.array(experimentEvidenceSchema).min(1).max(1000),
  })
  .strict()
  .superRefine((run, ctx) => {
    const def = experimentDefinition(run.experiment);
    if (
      run.environment === "live-experiment" &&
      (!run.execution?.sourceCommit ||
        run.execution.provider !== "Jev" ||
        run.execution.model !== "typesafe-ai/jev")
    )
      ctx.addIssue({
        code: "custom",
        message: "Live manifest must bind qualified source and Jev model",
      });
    for (const key of [
      "cohort",
      "decisionVersion",
      "contractHash",
      "datasetVersion",
      "datasetHash",
      "rubricId",
      "rubricHash",
    ] as const)
      if (run[key] !== def[key])
        ctx.addIssue({ code: "custom", message: `Experiment ${key} mismatch` });
    const selected = new Map(def.rows.map((r) => [r.id, r])),
      seen = new Set<string>();
    for (const row of run.rows) {
      if (
        seen.has(row.id) ||
        !selected.has(row.id) ||
        row.expected !== selected.get(row.id)?.expected ||
        row.cohort !== def.cohort
      )
        ctx.addIssue({
          code: "custom",
          message: "Evidence does not match frozen cohort",
        });
      if (
        def.six &&
        (row.result?.outcome === "insight" ||
          row.result?.probabilities?.insight !== undefined)
      )
        ctx.addIssue({ code: "custom", message: "Insight is outside v1" });
      seen.add(row.id);
    }
  });
export type ExperimentRun = z.infer<typeof experimentRunSchema>;
/** Only IDs in the frozen synthetic corpus can reach this provider invocation. */
export async function evaluateExperimentCase(
  provider: DecisionProvider,
  experiment: Experiment,
  id: string,
  timeoutMs: number,
): Promise<ExperimentEvidence> {
  const def = experimentDefinition(experiment),
    row = def.rows.find((r) => r.id === id);
  if (!row) throw new Error("Unknown frozen synthetic input");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const base = {
    id,
    expected: row.expected,
    canonical: null,
    cohort: def.cohort,
  };
  try {
    const raw = await Promise.race([
      provider.evaluate(experimentRequest(experiment, id), controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new DecisionFailure("TIMEOUT"));
        }, timeoutMs);
      }),
    ]);
    const parsed = challengeResultSchema.safeParse(raw);
    if (
      !parsed.success ||
      (def.six &&
        (parsed.data.outcome === "insight" ||
          parsed.data.probabilities?.insight !== undefined)) ||
      (parsed.success &&
        parsed.data.provider === "Jev" &&
        parsed.data.model !== "typesafe-ai/jev")
    )
      throw new DecisionFailure("INVALID_RESPONSE");
    const probabilities = parsed.data.probabilities;
    if (probabilities !== null) {
      const values = Object.values(probabilities);
      if (
        Object.keys(probabilities).length !== def.outcomes.length ||
        def.outcomes.some((label) => probabilities[label] === undefined) ||
        Math.abs(values.reduce((sum, value) => sum + value!, 0) - 1) > 0.02 ||
        parsed.data.confidence !== probabilities[parsed.data.outcome] ||
        values.some((value) => value! > probabilities[parsed.data.outcome]!)
      )
        throw new DecisionFailure("INVALID_RESPONSE");
    } else if (parsed.data.confidence !== null)
      throw new DecisionFailure("INVALID_RESPONSE");
    return { ...base, result: parsed.data, failure: null };
  } catch (error) {
    return { ...base, result: null, failure: safeFailure(error) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export const runtimeDatasetHash = createHash("sha256")
  .update(JSON.stringify(challengeData))
  .digest("hex");
