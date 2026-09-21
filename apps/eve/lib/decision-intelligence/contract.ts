import { z } from "zod";
import type { KnowledgeKind } from "../knowledge-types.ts";

// This is an experimental subset, never a replacement for canonical Knowledge.
export const OUTCOMES = [
  "decision",
  "fact",
  "observation",
  "hypothesis",
  "commitment",
  "preference",
] as const satisfies readonly KnowledgeKind[];
export type Outcome = (typeof OUTCOMES)[number];
export const outcomeSchema = z.enum(OUTCOMES);
export const knowledgeContract = {
  id: "knowledge.classification",
  version: 1,
  mode: "SHADOW",
  influence: "NONE",
  description: "Knowledge Classification V0",
  outcomes: OUTCOMES,
  excluded: ["insight"],
  question:
    "Which Knowledge type best represents this candidate? Select exactly one type.",
  definitions: {
    decision: "A choice that was made.",
    fact: "Information treated as externally true.",
    observation: "Something noticed or measured without asserting a cause.",
    hypothesis: "An uncertain explanation or prediction.",
    commitment: "A promise or obligation to act.",
    preference: "A stated way the owner prefers something done.",
  },
} as const;

export interface DecisionRequest<T extends string> {
  decisionId: string;
  decisionVersion: number;
  state: string;
  question: string;
  outcomes: readonly T[];
  definitions: Record<T, string>;
}

/** Advisory data only. This result cannot grant authority or mutate Knowledge. */
export interface DecisionResult<T extends string> {
  outcome: T;
  probabilities: Partial<Record<T, number>> | null;
  confidence: number | null;
  provider: string;
  model: string;
  latencyMs: number;
  inputTokens: number | null;
  costUsd: number | null;
  evaluatedAt: string;
}

export interface DecisionProvider {
  evaluate<T extends string>(
    request: DecisionRequest<T>,
    signal: AbortSignal,
  ): Promise<DecisionResult<T>>;
}

export const failureSchema = z.enum([
  "PROVIDER_UNAVAILABLE",
  "TIMEOUT",
  "RATE_LIMITED",
  "INVALID_RESPONSE",
  "GATEWAY_FAILURE",
  "BUDGET_EXHAUSTED",
  "PRIVACY_EXCLUDED",
  "DISABLED",
  "SAMPLED_OUT",
  "SKIPPED_OUT_OF_SCOPE",
  "BUSY",
]);
export type Failure = z.infer<typeof failureSchema>;
export class DecisionFailure extends Error {
  readonly code: Failure;
  constructor(code: Failure) {
    super(code);
    this.code = code;
  }
}

const probability = z.number().finite().min(0).max(1);
export const resultSchema = z
  .object({
    outcome: outcomeSchema,
    probabilities: z.partialRecord(outcomeSchema, probability).nullable(),
    confidence: probability.nullable(),
    provider: z.string().min(1).max(80),
    model: z.string().min(1).max(120),
    latencyMs: z.number().finite().nonnegative(),
    inputTokens: z.number().int().nonnegative().nullable(),
    costUsd: z.number().finite().nonnegative().nullable(),
    evaluatedAt: z.iso.datetime(),
  })
  .strict();

export function knowledgeRequest(statement: string): DecisionRequest<Outcome> {
  return {
    decisionId: knowledgeContract.id,
    decisionVersion: knowledgeContract.version,
    state: statement,
    question: knowledgeContract.question,
    outcomes: OUTCOMES,
    definitions: knowledgeContract.definitions,
  };
}

export const evidenceSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
    expected: outcomeSchema.nullable(),
    canonical: outcomeSchema.nullable(),
    result: resultSchema.nullable(),
    failure: failureSchema.nullable(),
  })
  .strict()
  .refine(
    (row) => (row.result === null) !== (row.failure === null),
    "Exactly one result or failure is required",
  );
export type Evidence = z.infer<typeof evidenceSchema>;

export function safeFailure(error: unknown): Failure {
  return error instanceof DecisionFailure ? error.code : "GATEWAY_FAILURE";
}
