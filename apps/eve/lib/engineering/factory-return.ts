import { createHash } from "node:crypto";
import { z } from "zod";
import { requestId } from "../myfactory-protocol.mjs";
import { digest } from "./contract.ts";
import {
  factoryBindingSchema, factoryCancellationIntentSchema, factoryCustodyRecordSchema,
  factoryExpectationSchema, factoryReturnEnvelopeSchema, factoryRunSchema, factorySubmissionSchema,
  type FactoryBinding, type FactoryCancellationIntent, type FactoryCustodyRecord,
  type FactoryReturnEnvelope,
} from "./factory-return-contract.ts";

export class FactoryReturnError extends Error {
  constructor(readonly code: string) { super(code); }
}
function requireMatch(condition: unknown, code: string): asserts condition {
  if (!condition) throw new FactoryReturnError(code);
}
export const factoryArtifactDigest = (content: string) => createHash("sha256").update(content, "utf8").digest("hex");
const same = (a: unknown, b: unknown) => digest(a) === digest(b);
const unique = (values: unknown[]) => new Set(values).size === values.length;
const safety = { authorityGranted: false, independentVerification: "NOT_RUN", readiness: "NOT_READY",
  automaticResubmission: false } as const;

/** Pure preparation only: stable identity matches the existing hosted protocol.
 * Local Work/source/budget references are never sent as invented HostedInput fields. */
export function bindFactorySubmission(input: unknown, previous?: FactoryBinding): FactoryBinding {
  const submission = factorySubmissionSchema.parse(input);
  requireMatch(unique(submission.allowedPaths), "DUPLICATE_SCOPE");
  const binding = { submission, requestId: requestId(submission.clientId, submission.idempotencyKey),
    submissionDigest: digest(submission) };
  if (previous) requireMatch(same(readBinding(previous), binding), "IDEMPOTENCY_CONFLICT");
  return binding;
}
function readBinding(raw: unknown): FactoryBinding {
  const binding = factoryBindingSchema.parse(raw);
  requireMatch(binding.submissionDigest === digest(binding.submission) &&
    binding.requestId === requestId(binding.submission.clientId, binding.submission.idempotencyKey), "BINDING_CORRUPT");
  return binding;
}

type Reported = FactoryReturnEnvelope["reported"];
export type FactoryStatus = "accepted" | "working" | "blocked" | "completed" | "failed" | "cancelled" | "unknown";
export type FactoryBlocker = { code: string; category: "MISSING_REQUIREMENT" | "ENVIRONMENT" | "CAPACITY" |
  "VERIFICATION" | "HUMAN_DECISION" | "EXTERNAL_DEPENDENCY" | "RECOVERY";
  humanInput: "REQUIRED" | "UNKNOWN"; retryPermitted: false; source: "FACTORY_STATE" | "FACTORY_ACTION_ERROR" };

function projectStatus(reported: Reported): { status: FactoryStatus; blocker: FactoryBlocker | null } {
  const code = reported.actionError?.code ?? reported.workOrder.state;
  const categories: Record<string, FactoryBlocker["category"]> = {
    needs_investigation: "MISSING_REQUIREMENT", awaiting_clarification: "MISSING_REQUIREMENT",
    awaiting_environment: "ENVIRONMENT", concurrency_limit: "CAPACITY", dispatch_paused: "CAPACITY",
    attempt_limit: "CAPACITY", evidence_incomplete: "VERIFICATION", evidence_stale: "VERIFICATION",
    awaiting_approval: "HUMAN_DECISION", awaiting_human_login: "HUMAN_DECISION",
    linear_unavailable: "EXTERNAL_DEPENDENCY", recovery_hold: "RECOVERY",
  };
  if (categories[code]) return { status: "blocked", blocker: {
    code, category: categories[code], humanInput: ["awaiting_clarification", "awaiting_approval", "awaiting_human_login"].includes(code)
      ? "REQUIRED" : "UNKNOWN", retryPermitted: false,
    source: reported.actionError ? "FACTORY_ACTION_ERROR" : "FACTORY_STATE",
  } };
  if (reported.actionError) return { status: "unknown", blocker: null };
  const state = reported.workOrder.state;
  if (state === "queued") return { status: "accepted", blocker: null };
  if (["planning", "implementing", "verifying"].includes(state)) return { status: "working", blocker: null };
  if (state === "ready_for_review") return { status: "completed", blocker: null };
  if (state === "failed" || state === "cancelled") return { status: state, blocker: null };
  return { status: "unknown", blocker: null }; // interrupted is not a safe retry signal.
}

export function unknownFactoryOutcome(rawBinding: unknown,
  reason: "SUBMISSION_RESPONSE_LOST" | "RESULT_UNAVAILABLE" | "TIMEOUT_AFTER_POSSIBLE_COMPLETION") {
  const binding = readBinding(rawBinding);
  return { ...safety, status: "unknown" as const, requestId: binding.requestId,
    reconcileRequestId: binding.requestId, reason, disposition: "UNKNOWN" as const };
}

const currentWorkSchema = factorySubmissionSchema.pick({ ownerId: true, agentId: true, workId: true,
  workVersion: true, workGeneration: true, criteriaVersion: true }).extend({
  lifecycle: z.enum(["active", "accepted", "cancelled", "failed", "superseded"]),
  control: z.enum(["agent", "human", "paused", "stopping"]),
}).strict();

/** Validates a bounded synthetic custody package. No I/O, command execution,
 * authority mutation, protected verification, or durable writer access occurs.
 * Persisting the returned receipt atomically remains a separate integration. */
export function receiveFactoryReturn(input: {
  binding: unknown; currentWork: unknown; expectation: unknown; envelope: unknown;
  previous?: FactoryCustodyRecord; cancellation?: FactoryCancellationIntent;
}, now = Date.now()) {
  requireMatch(Number.isFinite(now), "INVALID_TIME");
  requireMatch(Buffer.byteLength(JSON.stringify(input.envelope), "utf8") <= 600_000, "RETURN_TOO_LARGE");
  const binding = readBinding(input.binding), current = currentWorkSchema.parse(input.currentWork);
  const expected = factoryExpectationSchema.parse(input.expectation);
  const envelope = factoryReturnEnvelopeSchema.parse(input.envelope);
  const reported = envelope.reported, order = reported.workOrder, run = reported.run, sub = binding.submission;
  requireMatch(same(readBinding(envelope.binding), binding), "WRONG_WORK_BINDING");
  requireMatch(same(envelope.sourcePin, sub.sourcePin), "WRONG_FACTORY_VERSION");
  for (const key of ["ownerId", "agentId", "workId", "workVersion", "workGeneration", "criteriaVersion"] as const)
    requireMatch(current[key] === sub[key], "STALE_WORK");
  requireMatch(unique(expected.attempts.map(a => a.runId)) && unique(expected.attempts.map(a => a.attemptNumber)) &&
    (expected.activeRunId === null || expected.attempts.some(a => a.runId === expected.activeRunId)), "INVALID_ATTEMPT_BINDING");
  requireMatch(unique(expected.requiredChecks), "DUPLICATE_CHECK_REQUIREMENT");
  requireMatch(order.id === expected.workOrderId && reported.receipt.workOrderId === order.id &&
    reported.receipt.issueId === binding.requestId, "UNKNOWN_WORK_ORDER");
  requireMatch(order.repositoryPath === expected.repositoryPath && order.baseRef === expected.baseRef,
    "WRONG_REPOSITORY_BASE");
  const requiredCommands = order.kind === "defect" && order.reproductionCommand
    ? [...new Set([order.reproductionCommand, ...order.checkCommands])] : order.checkCommands;
  requireMatch(order.kind === sub.kind && order.description === sub.objective && same(order.acceptanceCriteria, sub.criteria) &&
    same(order.allowedPaths, sub.allowedPaths) && same(requiredCommands, expected.requiredChecks), "WRONG_REQUEST_SCOPE");
  requireMatch(reported.receipt.state === order.state && reported.receipt.updatedAt === order.updatedAt, "INCONSISTENT_RECEIPT");
  const start = Date.parse(sub.submittedAt);
  const validTime = (value: string) => Date.parse(value) >= start && Date.parse(value) <= now;
  requireMatch(validTime(order.updatedAt), "INVALID_RECEIPT_TIME");
  if (now - Date.parse(order.updatedAt) > 86_400_000)
    return unknownFactoryOutcome(binding, "RESULT_UNAVAILABLE");

  requireMatch(unique(envelope.artifacts.map(a => a.reference)), "DUPLICATE_ARTIFACT");
  const artifacts = new Map(envelope.artifacts.map(a => [a.reference, a]));
  for (const artifact of envelope.artifacts) requireMatch(
    Buffer.byteLength(artifact.content, "utf8") <= 200_000 && factoryArtifactDigest(artifact.content) === artifact.sha256,
    "ARTIFACT_DIGEST_MISMATCH");
  const observed = projectStatus(reported);
  const result = { ...safety, ...observed, requestId: binding.requestId,
    failure: run?.failure ?? reported.actionError?.error ?? null };
  if (!run) {
    requireMatch(!reported.candidateEvent && !reported.startedEvent && !reported.implementingEvent &&
      !reported.checks.length && !envelope.artifacts.length, "ORPHAN_EVIDENCE");
    requireMatch(!["completed", "working", "cancelled"].includes(observed.status), "MISSING_RUN");
    return { ...result, disposition: "STATUS_ONLY" as const };
  }
  const attempt = expected.attempts.find(a => a.runId === run.id);
  requireMatch(attempt && attempt.attemptNumber === run.attemptNumber && run.workOrderId === order.id, "UNKNOWN_ATTEMPT");
  requireMatch(run.inputCommit === sub.baseCommit, "WRONG_BASE");
  requireMatch(run.workerProfile === order.workerProfile && validTime(run.startedAt) &&
    (!run.finishedAt || (validTime(run.finishedAt) && Date.parse(run.finishedAt) >= Date.parse(run.startedAt) &&
      Date.parse(run.finishedAt) <= Date.parse(order.updatedAt))), "INVALID_RUN_PROVENANCE");
  requireMatch(!["completed", "cancelled"].includes(observed.status) ||
    (run.state === order.state && run.finishedAt !== null), "INCONSISTENT_TERMINAL_STATE");
  const historical = run.id !== expected.activeRunId || run.state === "cancelled" ||
    current.lifecycle !== "active" || current.control !== "agent";
  if (input.cancellation) validateCancellation(input.cancellation, binding, order.id, run.id);

  for (const event of [reported.startedEvent, reported.implementingEvent, reported.candidateEvent]) if (event)
    requireMatch(event.workOrderId === order.id && event.runId === run.id && validTime(event.createdAt) &&
      Date.parse(event.createdAt) >= Date.parse(run.startedAt), "INVALID_EVENT_PROVENANCE");
  requireMatch(unique([reported.startedEvent, reported.implementingEvent, reported.candidateEvent].filter(e => e !== null).map(e => e.id)),
    "DUPLICATE_EVENT");
  const orderedEvents = [reported.startedEvent, reported.implementingEvent, reported.candidateEvent].filter(e => e !== null);
  requireMatch(orderedEvents.every((e, index) => index === 0 ||
    Date.parse(e.createdAt) >= Date.parse(orderedEvents[index - 1].createdAt)), "INVALID_EVENT_ORDER");
  const candidate = reported.candidateEvent?.payload;
  if (!candidate) {
    requireMatch(!run.candidateCommit && !reported.checks.length && !envelope.artifacts.length && observed.status !== "completed",
      "CANDIDATE_EVIDENCE_MISSING");
    return { ...result, disposition: historical || input.cancellation ? "HISTORICAL" as const : "STATUS_ONLY" as const };
  }
  requireMatch(candidate.candidateCommit === run.candidateCommit && attempt.candidatePin &&
    same(attempt.candidatePin, { candidateCommit: candidate.candidateCommit, candidateTree: candidate.candidateTree,
      diffSha256: candidate.diffSha256, changedPaths: candidate.changedPaths }), "CANDIDATE_SUBSTITUTION");
  requireMatch(unique(candidate.changedPaths) && candidate.changedPaths.every(path => sub.allowedPaths.includes(path)), "CANDIDATE_SCOPE");
  const patch = artifacts.get(candidate.diffPath);
  requireMatch(patch?.kind === "patch" && patch.sha256 === candidate.diffSha256, "CANDIDATE_DIGEST_MISMATCH");
  const started = reported.startedEvent?.payload;
  requireMatch(started && reported.implementingEvent && started.inputCommit === run.inputCommit &&
    started.workerProfile === run.workerProfile, "MISSING_EXECUTOR_PROVENANCE");
  requireMatch(unique(reported.checks.map(c => c.id)) && unique(reported.checks.map(c => c.command)) &&
    unique(reported.checks.map(c => c.logPath)), "DUPLICATE_CHECK");
  requireMatch(reported.checks.length === expected.requiredChecks.length &&
    expected.requiredChecks.every((command, index) => reported.checks[index]?.command === command), "EVIDENCE_INCOMPLETE");
  for (const check of reported.checks) {
    requireMatch(check.runId === run.id && check.candidateCommit === candidate.candidateCommit &&
      validTime(check.startedAt) && validTime(check.finishedAt) && Date.parse(check.finishedAt) >= Date.parse(check.startedAt) &&
      Date.parse(check.startedAt) >= Date.parse(reported.candidateEvent!.createdAt) &&
      (!run.finishedAt || Date.parse(check.finishedAt) <= Date.parse(run.finishedAt)), "INVALID_CHECK_PROVENANCE");
    const log = artifacts.get(check.logPath);
    requireMatch(log?.kind === "log" && check.logSha256 && log.sha256 === check.logSha256, "EVIDENCE_INCOMPLETE");
    requireMatch(check.status !== "passed" || check.exitCode === 0, "CONTRADICTORY_CHECK");
  }
  const referenced = new Set([candidate.diffPath, ...reported.checks.map(c => c.logPath)]);
  requireMatch(unique(expected.supplementalArtifacts.map(a => a.reference)), "DUPLICATE_ARTIFACT_PIN");
  for (const pin of expected.supplementalArtifacts) {
    const artifact = artifacts.get(pin.reference);
    requireMatch(!referenced.has(pin.reference) && artifact?.kind === pin.kind && artifact.sha256 === pin.sha256,
      "SUPPLEMENTAL_ARTIFACT_MISMATCH");
    referenced.add(pin.reference);
  }
  requireMatch(envelope.artifacts.every(a => referenced.has(a.reference)), "UNBOUND_ARTIFACT");
  requireMatch(observed.status !== "completed" || reported.checks.every(c => c.status === "passed"), "FALSE_COMPLETION_CLAIM");
  const material = { binding, workOrderId: order.id, runId: run.id, attemptNumber: run.attemptNumber,
    candidate, checks: reported.checks, artifacts: envelope.artifacts,
    provenance: { sourcePin: envelope.sourcePin, model: started.model,
      agentVersion: reported.implementingEvent.payload.agentVersion, skillReferenceCommit: started.skillReferenceCommit,
      workerProfile: run.workerProfile }, trust: "FACTORY_REPORTED" as const, integrity: "MATCHED_LOCAL_PINS" as const,
    independentVerification: "NOT_RUN" as const, readiness: "NOT_READY" as const };
  const receipt: FactoryCustodyRecord = { ...material, digest: digest(material) };
  if (input.previous) {
    const { digest: previousDigest, ...previous } = factoryCustodyRecordSchema.parse(input.previous);
    requireMatch(digest(previous) === previousDigest && same(previous.binding, binding) &&
      previous.workOrderId === order.id && previous.runId === run.id, "INVALID_PRIOR_RECEIPT");
    requireMatch(previousDigest === receipt.digest, "CONFLICTING_DUPLICATE");
  }
  if (historical || input.cancellation) return { ...result, disposition: "HISTORICAL" as const, receipt };
  return { ...result, disposition: input.previous ? "DEDUPED" as const : "RECEIVED" as const, receipt };
}

function cancellationId(bindingDigest: string, workOrderId: string, runId: string) {
  return digest({ bindingDigest, workOrderId, runId, action: "run.cancel" });
}
/** Local intent only. Actual Factory run.cancel is human-only, accepts only
 * workOrderId, and has no remote cancellation request ID or attempt CAS. */
export function prepareFactoryCancellation(rawBinding: unknown, rawExpectation: unknown): FactoryCancellationIntent {
  const binding = readBinding(rawBinding), expected = factoryExpectationSchema.parse(rawExpectation);
  requireMatch(expected.activeRunId && expected.attempts.some(a => a.runId === expected.activeRunId), "NO_CURRENT_ATTEMPT");
  return { requestIdentity: cancellationId(binding.submissionDigest, expected.workOrderId, expected.activeRunId),
    bindingDigest: binding.submissionDigest, workOrderId: expected.workOrderId, runId: expected.activeRunId,
    action: "run.cancel", input: { workOrderId: expected.workOrderId }, dispatch: "NOT_AVAILABLE_TO_AGENT" };
}
function validateCancellation(raw: unknown, binding: FactoryBinding, workOrderId: string, runId: string) {
  const intent = factoryCancellationIntentSchema.parse(raw);
  requireMatch(intent.bindingDigest === binding.submissionDigest && intent.workOrderId === workOrderId &&
    intent.input.workOrderId === workOrderId && intent.runId === runId &&
    intent.requestIdentity === cancellationId(binding.submissionDigest, workOrderId, runId), "WRONG_CANCELLATION");
  return intent;
}
export function observeFactoryCancellation(rawBinding: unknown, rawIntent: unknown, response: unknown, now = Date.now()) {
  const binding = readBinding(rawBinding), parsed = factoryCancellationIntentSchema.parse(rawIntent);
  const intent = validateCancellation(parsed, binding, parsed.workOrderId, parsed.runId);
  const result = { ...safety, requestIdentity: intent.requestIdentity, remoteCancellationQualified: false } as const;
  if (response === null) return { ...result, state: "UNKNOWN" as const };
  const value = z.object({ result: factoryRunSchema.nullable() }).strict().parse(response);
  if (!value.result) return { ...result, state: "UNKNOWN" as const };
  requireMatch(value.result.id === intent.runId && value.result.workOrderId === intent.workOrderId &&
    value.result.inputCommit === binding.submission.baseCommit, "WRONG_CANCELLATION_RESPONSE");
  requireMatch(Number.isFinite(now) && Date.parse(value.result.startedAt) >= Date.parse(binding.submission.submittedAt) &&
    Date.parse(value.result.startedAt) <= now && (!value.result.finishedAt ||
      (Date.parse(value.result.finishedAt) >= Date.parse(value.result.startedAt) && Date.parse(value.result.finishedAt) <= now)),
    "INVALID_CANCELLATION_TIME");
  if (value.result.state === "cancelled" && value.result.finishedAt)
    return { ...result, state: "TERMINAL_REPORTED" as const };
  if (["planning", "implementing", "verifying"].includes(value.result.state))
    return { ...result, state: "STOPPING_REPORTED" as const };
  return { ...result, state: "UNKNOWN" as const }; // Completion may have won the race.
}
