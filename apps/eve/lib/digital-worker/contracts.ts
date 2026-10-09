import { journeyAccountingSchema } from "./model-accounting.ts";
import { z } from "zod";

export const DIGITAL_WORKER_CONTRACT_VERSION = 2 as const;
export const legacyExecutionRouteV1Schema = z.enum(["DIRECT", "EXECUTOR", "FACTORY", "PEER", "HUMAN"]);
export const executionRouteSchema = z.enum(["DIRECT", "DEEP_AGENT", "EXECUTOR", "MYFACTORY", "RELAY", "HUMAN"]);
export type ExecutionRoute = z.infer<typeof executionRouteSchema>;

/** An explicit label conversion only. A v1 policy never authorizes a v2 route. */
export function mapLegacyExecutionRouteV1(route: unknown, sourceVersion: unknown): ExecutionRoute | null {
  if (sourceVersion !== 1) return null;
  const parsed = legacyExecutionRouteV1Schema.safeParse(route);
  if (!parsed.success) return null;
  if (parsed.data === "FACTORY") return "MYFACTORY";
  if (parsed.data === "PEER") return "RELAY";
  return parsed.data;
}

export const scopeSchema = z.object({
  kind: z.enum(["personal", "organization"]),
  id: z.string().min(1).max(200),
}).strict();
export type WorkScope = z.infer<typeof scopeSchema>;

export const versionedReferenceSchema = z.object({
  id: z.string().min(1).max(120),
  version: z.number().int().positive(),
}).strict();

export const compositionSchema = z.object({
  role: versionedReferenceSchema,
  capabilityPacks: z.array(versionedReferenceSchema).max(12),
  mode: versionedReferenceSchema,
}).strict();
export type WorkerComposition = z.infer<typeof compositionSchema>;

const qualitativeFactSchema = z.string().trim().min(1).max(80);
/** Descriptive Work facts for explanation. They never grant execution authority. */
export const routingProfileSchema = z.object({
  profileVersion: z.literal(1),
  workShape: qualitativeFactSchema,
  decomposition: qualitativeFactSchema,
  interaction: qualitativeFactSchema,
  parallelism: qualitativeFactSchema,
  verification: qualitativeFactSchema,
  duration: qualitativeFactSchema,
  ambiguity: qualitativeFactSchema,
  externalExpertise: qualitativeFactSchema,
  humanJudgment: qualitativeFactSchema,
  risk: qualitativeFactSchema,
}).strict();
export type RoutingProfile = z.infer<typeof routingProfileSchema>;

const criterionSchema = z.object({
  id: z.string().uuid(),
  statement: z.string().trim().min(1).max(1000),
  evidence: z.enum(["deterministic", "human"]),
}).strict();

const referenceSchema = z.string().trim().min(1).max(400);
const distinct = (values: readonly string[]) => new Set(values).size === values.length;

/** A role-neutral snapshot of delegated responsibility, not an authorization token. */
const commonWorkFields = {
  workId: z.string().uuid(),
  workVersion: z.number().int().positive(),
  criteriaVersion: z.number().int().positive(),
  scope: scopeSchema,
  humanOwnerId: referenceSchema,
  coordinatingAgentId: referenceSchema,
  objective: z.string().trim().min(1).max(4000),
  criteria: z.array(criterionSchema).min(1).max(20).refine(items => distinct(items.map(item => item.id))),
  resourceRefs: z.array(referenceSchema).min(1).max(30).refine(distinct),
  allowedOperations: z.array(referenceSchema).min(1).max(30).refine(distinct),
  budgetUsd: z.number().finite().nonnegative(),
  deadline: z.string().datetime({ offset: true }),
  policyVersion: z.number().int().positive(),
  composition: compositionSchema,
  definitionOfDone: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
};

/** Parse archived v1 records without silently admitting their legacy route names. */
export const legacyDigitalWorkContractV1Schema = z.object({
  ...commonWorkFields,
  contractVersion: z.literal(1),
  allowedRoutes: z.array(legacyExecutionRouteV1Schema).min(1).max(5).refine(distinct),
}).strict();

export const digitalWorkContractSchema = z.object({
  ...commonWorkFields,
  contractVersion: z.literal(DIGITAL_WORKER_CONTRACT_VERSION),
  allowedRoutes: z.array(executionRouteSchema).min(1).max(6).refine(distinct),
  routingProfile: routingProfileSchema,
  routePolicy: versionedReferenceSchema,
}).strict();
export type DigitalWorkContract = z.infer<typeof digitalWorkContractSchema>;

export const contextPackageSchema = z.object({
  contractVersion: z.literal(DIGITAL_WORKER_CONTRACT_VERSION),
  workId: z.string().uuid(),
  workVersion: z.number().int().positive(),
  scope: scopeSchema,
  agentId: referenceSchema,
  assembledAt: z.string().datetime({ offset: true }),
  maxTokens: z.number().int().positive(),
  estimatedTokens: z.number().int().nonnegative(),
  items: z.array(z.object({
    id: referenceSchema,
    kind: z.enum(["memory", "knowledge", "work", "result", "file", "external"]),
    scope: scopeSchema,
    sourceRef: referenceSchema,
    sourceRevision: referenceSchema,
    contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    observedAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }).nullable(),
    status: z.enum(["CURRENT", "STALE", "CONFLICTED"]),
    trust: z.enum(["owner", "system", "external", "peer"]),
  }).strict()).max(50),
}).strict();
export type ContextPackage = z.infer<typeof contextPackageSchema>;

export function contextProblems(work: DigitalWorkContract, context: ContextPackage, now = Date.now()): string[] {
  const problems: string[] = [];
  if (context.workId !== work.workId || context.workVersion !== work.workVersion) problems.push("Context is for a different Work revision.");
  if (context.scope.kind !== work.scope.kind || context.scope.id !== work.scope.id || context.agentId !== work.coordinatingAgentId)
    problems.push("Context is outside the current owner and Agent scope.");
  if (context.estimatedTokens > context.maxTokens) problems.push("Context exceeds its declared budget.");
  const assembledAge = now - Date.parse(context.assembledAt);
  if (assembledAge < -5000 || assembledAge > 60000) problems.push("Context is stale or future-dated; reassemble it before routing.");
  for (const item of context.items) {
    if (item.scope.kind !== work.scope.kind || item.scope.id !== work.scope.id) problems.push(`Context ${item.id} is outside Work scope.`);
    if (item.status !== "CURRENT" || (item.expiresAt && Date.parse(item.expiresAt) <= now)) problems.push(`Context ${item.id} is stale or conflicted.`);
    if (Date.parse(item.observedAt) > now + 5000) problems.push(`Context ${item.id} has an invalid observation time.`);
  }
  return problems;
}

/** A portable outcome record. Source-linked observations still need independent verification. */
export const proofOfWorkSchema = z.object({
  contractVersion: z.literal(DIGITAL_WORKER_CONTRACT_VERSION),
  workId: z.string().uuid(),
  workVersion: z.number().int().positive(),
  criteriaVersion: z.number().int().positive(),
  outcome: z.enum(["COMPLETED", "PARTIAL", "BLOCKED", "FAILED", "CANCELLED", "SUPERSEDED"]),
  resultRevision: referenceSchema.nullable(),
  createdAt: z.string().datetime({ offset: true }),
  evidence: z.array(z.object({
    criterionId: z.string().uuid(),
    resultRevision: referenceSchema,
    state: z.enum(["PASS", "FAIL", "UNKNOWN", "STALE", "NOT_RUN"]),
    producer: z.enum(["executor", "trusted-verifier", "human", "external"]),
    sourceRef: referenceSchema,
    contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    observedAt: z.string().datetime({ offset: true }),
  }).strict()).max(100),
  modelAccounting: journeyAccountingSchema.optional(),
  artifactRefs: z.array(referenceSchema).max(100),
  limitations: z.array(z.string().trim().min(1).max(1000)).max(30),
}).strict();
export type ProofOfWork = z.infer<typeof proofOfWorkSchema>;

/** Link checks only; a passing link check never replaces current authority or provider reconciliation. */
export function proofLinkProblems(work: DigitalWorkContract, proof: ProofOfWork): string[] {
  const problems: string[] = [];
  if (proof.workId !== work.workId || proof.workVersion !== work.workVersion || proof.criteriaVersion !== work.criteriaVersion)
    problems.push("Proof is for a different Work or criteria revision.");
  if (proof.outcome !== "COMPLETED") return problems;
  if (!proof.resultRevision) problems.push("Completed Work needs an exact result revision.");
  for (const criterion of work.criteria) {
    const current = proof.evidence.filter(item => item.criterionId === criterion.id && item.resultRevision === proof.resultRevision);
    const requiredProducer = criterion.evidence === "human" ? "human" : "trusted-verifier";
    if (current.length !== 1 || current[0]?.state !== "PASS" || current[0].producer !== requiredProducer)
      problems.push(`Current independent evidence is missing for criterion ${criterion.id}.`);
  }
  return problems;
}
