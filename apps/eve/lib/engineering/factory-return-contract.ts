import { z } from "zod";
import { pathSchema } from "./contract.ts";

const ref = z.string().min(1).max(1024).refine(value => !/[\x00-\x1f]/.test(value));
const text = z.string().trim().min(1).max(4000);
const time = z.iso.datetime();
const version = z.number().int().positive();
export const factoryDigestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const factoryGitIdSchema = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);

/** MyEve-local provenance, NOT an existing MyFactory API field. MyFactory at
 * 543906d exposes no Factory/FactoryVersion attestation. A live adapter needs
 * an independently established source/config pin before replacing this fixture. */
const syntheticFactorySourcePinSchema = z.object({
  kind: z.literal("SYNTHETIC_LOCAL_SOURCE_PIN"), factoryId: ref,
  factoryVersion: z.object({ myFactoryCommit: factoryGitIdSchema, configurationDigest: factoryDigestSchema }).strict(),
}).strict();
export const trustedFactorySourcePinSchema = z.object({
  kind: z.literal("TRUSTED_FACTORY_EXPECTATION"), factoryId: ref,
  factoryVersion: z.object({ myFactoryCommit: factoryGitIdSchema,
    sourceTree: factoryGitIdSchema, configurationDigest: factoryDigestSchema }).strict(),
}).strict();
export const factorySourcePinSchema = z.discriminatedUnion("kind", [
  syntheticFactorySourcePinSchema, trustedFactorySourcePinSchema,
]);

export const factorySubmissionSchema = z.object({
  ownerId: ref, agentId: ref, workId: z.uuid(), workVersion: version, workGeneration: version,
  criteriaVersion: version, objective: text, criteria: z.array(text).min(1).max(20),
  kind: z.enum(["feature", "defect", "investigation"]),
  repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/), baseCommit: factoryGitIdSchema,
  allowedPaths: z.array(pathSchema).min(1).max(30),
  sourcePin: factorySourcePinSchema, clientId: z.string().regex(/^[a-z0-9_-]{1,64}$/),
  idempotencyKey: z.string().trim().min(1).max(160),
  policyReference: ref.nullable(), budgetReference: ref.nullable(),
  submittedAt: time,
}).strict();
export type FactorySubmission = z.infer<typeof factorySubmissionSchema>;
export const factoryBindingSchema = z.object({
  submission: factorySubmissionSchema, requestId: z.uuid(), submissionDigest: factoryDigestSchema,
}).strict();
export type FactoryBinding = z.infer<typeof factoryBindingSchema>;

// Exact values/field names from MyFactory packages/contracts/src/index.ts.
export const factoryWorkOrderStateSchema = z.enum([
  "needs_investigation", "awaiting_clarification", "queued", "planning", "implementing", "verifying",
  "ready_for_review", "awaiting_approval", "awaiting_human_login", "awaiting_environment",
  "failed", "interrupted", "cancelled",
]);
export const factoryRunSchema = z.object({
  id: z.uuid(), workOrderId: z.uuid(), attemptNumber: version,
  state: z.enum(["planning", "implementing", "verifying", "ready_for_review", "failed", "interrupted", "cancelled"]),
  workerProfile: z.enum(["mac", "container", "browser"]), inputCommit: factoryGitIdSchema,
  candidateCommit: factoryGitIdSchema.nullable(), workspacePath: ref,
  startedAt: time, finishedAt: time.nullable(), failure: text.nullable(),
}).strict();

const eventBase = { id: z.number().int().nonnegative(), workOrderId: z.uuid(), runId: z.uuid(), createdAt: time };
export const factoryCandidateEventSchema = z.object({
  ...eventBase, type: z.literal("run.candidate_committed"), payload: z.object({
    candidateCommit: factoryGitIdSchema, candidateTree: factoryGitIdSchema,
    changedPaths: z.array(pathSchema).min(1).max(30), diffPath: ref, diffSha256: factoryDigestSchema,
  }).strict(),
}).strict();
export const factoryCheckSchema = z.object({
  id: z.uuid(), runId: z.uuid(), candidateCommit: factoryGitIdSchema, command: text,
  status: z.enum(["passed", "failed", "skipped", "unavailable"]),
  exitCode: z.number().int().nullable(), startedAt: time, finishedAt: time,
  logPath: ref, logSha256: factoryDigestSchema.nullable(),
}).strict();

/** Bounded projection of existing detail/receipt/event data. The caller selects
 * these fields; this is not a new Factory wire API or a full WorkOrderDetail. */
export const factoryReportedOutputSchema = z.object({
  receipt: z.object({ version: z.literal(1), issueId: z.uuid(), workOrderId: z.uuid(),
    state: factoryWorkOrderStateSchema, updatedAt: time, workOrderUrl: z.url().max(2048) }).strict(),
  workOrder: z.object({
    id: z.uuid(), state: factoryWorkOrderStateSchema, repositoryPath: ref, baseRef: ref,
    description: text, acceptanceCriteria: z.array(text).max(20), allowedPaths: z.array(pathSchema).max(30),
    kind: z.enum(["feature", "defect", "investigation"]), reproductionCommand: text.nullable(),
    checkCommands: z.array(text).max(20), workerProfile: z.enum(["mac", "container", "browser"]), updatedAt: time,
  }).strict(),
  run: factoryRunSchema.nullable(),
  candidateEvent: factoryCandidateEventSchema.nullable(),
  checks: z.array(factoryCheckSchema).max(20),
  startedEvent: z.object({ ...eventBase, type: z.literal("run.started"), payload: z.object({
    inputCommit: factoryGitIdSchema, workerProfile: z.enum(["mac", "container", "browser"]),
    model: ref, skillReferenceCommit: factoryGitIdSchema,
  }).strict() }).strict().nullable(),
  implementingEvent: z.object({ ...eventBase, type: z.literal("run.implementing"),
    payload: z.object({ agentVersion: ref.nullable() }).strict() }).strict().nullable(),
  actionError: z.object({ error: text, code: z.enum([
    "awaiting_environment", "concurrency_limit", "dispatch_paused", "attempt_limit", "recovery_hold",
    "linear_unavailable", "evidence_incomplete", "evidence_stale", "not_ready", "not_running",
  ]) }).strict().nullable(),
}).strict();

/** Local bounded custody copy. reference is opaque: never fetch/read/execute it.
 * Diff/log digests exist in Factory; this manifest and copied bytes do not yet
 * have a hosted transfer API. Optional reports are reported context only. */
export const factoryArtifactSchema = z.object({
  reference: ref, kind: z.enum(["patch", "log", "report", "events"]),
  sha256: factoryDigestSchema, content: z.string().max(200_000),
}).strict();
export const factoryReturnEnvelopeSchema = z.object({
  format: z.literal("MYEVE_FACTORY_RETURN_FIXTURE_V1"),
  binding: factoryBindingSchema, sourcePin: factorySourcePinSchema,
  reported: factoryReportedOutputSchema, artifacts: z.array(factoryArtifactSchema).max(24),
}).strict();
export type FactoryReturnEnvelope = z.infer<typeof factoryReturnEnvelopeSchema>;

/** Trusted local admission/readback pins. candidatePin is captured separately
 * from a return, from the source Run/event. Never derive it from that return at
 * validation time. These pins confer no execution or publication authority. */
export const factoryExpectationSchema = z.object({
  workOrderId: z.uuid(), repositoryPath: ref, baseRef: ref, requiredChecks: z.array(text).min(1).max(20),
  supplementalArtifacts: z.array(z.object({ reference: ref, kind: z.enum(["report", "events"]),
    sha256: factoryDigestSchema }).strict()).max(4).default([]),
  activeRunId: z.uuid().nullable(),
  attempts: z.array(z.object({
    runId: z.uuid(), attemptNumber: version,
    candidatePin: z.object({ candidateCommit: factoryGitIdSchema, candidateTree: factoryGitIdSchema,
      diffSha256: factoryDigestSchema, changedPaths: z.array(pathSchema).min(1).max(30) }).strict().nullable(),
  }).strict()).max(10),
}).strict();
export type FactoryExpectation = z.infer<typeof factoryExpectationSchema>;

export const factoryCustodyRecordSchema = z.object({
  binding: factoryBindingSchema, workOrderId: z.uuid(), runId: z.uuid(), attemptNumber: version,
  candidate: factoryCandidateEventSchema.shape.payload, checks: z.array(factoryCheckSchema).min(1).max(20),
  artifacts: z.array(factoryArtifactSchema).min(1).max(24),
  provenance: z.object({ sourcePin: factorySourcePinSchema, model: ref, agentVersion: ref.nullable(),
    skillReferenceCommit: factoryGitIdSchema, workerProfile: z.enum(["mac", "container", "browser"]) }).strict(),
  trust: z.literal("FACTORY_REPORTED"), integrity: z.literal("MATCHED_LOCAL_PINS"),
  independentVerification: z.literal("NOT_RUN"), readiness: z.literal("NOT_READY"),
  digest: factoryDigestSchema,
}).strict();
export type FactoryCustodyRecord = z.infer<typeof factoryCustodyRecordSchema>;

export const factoryCancellationIntentSchema = z.object({
  requestIdentity: factoryDigestSchema, bindingDigest: factoryDigestSchema, workOrderId: z.uuid(), runId: z.uuid(),
  action: z.literal("run.cancel"), input: z.object({ workOrderId: z.uuid() }).strict(),
  dispatch: z.literal("NOT_AVAILABLE_TO_AGENT"),
}).strict();
export type FactoryCancellationIntent = z.infer<typeof factoryCancellationIntentSchema>;
