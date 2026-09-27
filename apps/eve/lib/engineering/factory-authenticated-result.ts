import { createHash } from "node:crypto";
import { z } from "zod";
import { getHostedRequest, type Graphql, type HostedConfig } from "../myfactory-protocol.mjs";
import { retrieveFactoryArtifacts, type FactoryArtifact } from "./factory-artifact-transport.ts";
import { bindFactorySubmission } from "./factory-return.ts";
import { factoryBindingSchema, factoryGitIdSchema, factorySubmissionSchema,
  trustedFactorySourcePinSchema } from "./factory-return-contract.ts";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const hex = z.string().regex(/^[a-f0-9]{64}$/);
const stamp = z.iso.datetime();
const artifact = z.object({ id: z.string(), kind: z.enum(["patch", "log"]),
  byteLength: z.number().int().min(0).max(128000), sha256: hex,
  bytes: z.string().max(22000).optional(), reference: z.object({ version: z.literal(1),
    transport: z.literal("linear-comments-v1"), expiresAt: stamp }).strict().optional() }).strict();
const check = z.object({ id: z.uuid(), command: z.string().min(1).max(4000),
  candidateCommit: factoryGitIdSchema, status: z.literal("passed"), exitCode: z.literal(0),
  startedAt: stamp, finishedAt: stamp, logSha256: hex }).strict();
const manifest = z.object({ requestBindingDigest: hex, workOrderId: z.uuid(), runId: z.uuid(),
  attemptNumber: z.number().int().positive(), inputCommit: factoryGitIdSchema,
  candidateCommit: factoryGitIdSchema, candidateTree: factoryGitIdSchema,
  changedPaths: z.array(z.string().min(1).max(1024)).min(1).max(30),
  commitObject: z.string().max(10000), checks: z.array(check).min(1).max(20),
  artifacts: z.array(artifact).min(2).max(21) }).strict();
const signedResult = z.object({ version: z.literal(1), keyVersion: z.literal("ed25519-v1"),
  issueId: z.uuid(), operationId: hex, factoryId: z.string().min(1).max(160),
  factoryVersion: z.object({ sourceCommit: factoryGitIdSchema, sourceTree: factoryGitIdSchema,
    configurationDigest: hex }).strict(), manifestDigest: hex, manifest, issuedAt: stamp }).strict();

/** Prepares the V1 hosted request extension from an independently pinned
 * Factory identity/version. This does not dispatch or grant a writer. */
export function prepareAuthenticatedFactoryInput(rawSubmission: unknown, title: string, trustedPin: unknown) {
  const submission = factorySubmissionSchema.parse(rawSubmission);
  const pin = trustedFactorySourcePinSchema.parse(trustedPin);
  if (JSON.stringify(submission.sourcePin) !== JSON.stringify(pin)) throw new Error("UNTRUSTED_FACTORY_PIN");
  const binding = bindFactorySubmission(submission);
  if (!title.trim() || title.length > 200) throw new Error("INVALID_FACTORY_TITLE");
  return { binding, hostedInput: {
    idempotencyKey: submission.idempotencyKey, title: title.trim(), description: submission.objective,
    kind: submission.kind, acceptanceCriteria: submission.criteria, allowedPaths: submission.allowedPaths,
    factoryBinding: { ownerId: submission.ownerId, agentId: submission.agentId, workId: submission.workId,
      workVersion: submission.workVersion, workGeneration: submission.workGeneration,
      criteriaVersion: submission.criteriaVersion, submissionDigest: binding.submissionDigest,
      expectedFactoryId: pin.factoryId,
      expectedFactoryVersion: { sourceCommit: pin.factoryVersion.myFactoryCommit,
        sourceTree: pin.factoryVersion.sourceTree, configurationDigest: pin.factoryVersion.configurationDigest } },
  } };
}

/** Hosted readback verifies the HMAC request and Ed25519 result before this
 * projection. No returned text, artifact path or status can confer authority. */
export async function observeAuthenticatedFactoryResult(input: {
  binding: unknown; hostedInput: unknown; currentWork: {
    ownerId: string; agentId: string; workId: string; workVersion: number; workGeneration: number;
    criteriaVersion: number; lifecycle: string; control: string;
  }; expectedWorkOrderId: string; expectedRunId: string; expectedAttempt: number;
  requiredChecks: string[]; trustedPin: unknown; previous?: { operationId: string; manifestDigest: string };
  config: HostedConfig; graphql: Graphql;
}) {
  const bound = factoryBindingSchema.parse(input.binding);
  const prepared = prepareAuthenticatedFactoryInput(bound.submission,
    (input.hostedInput as { title?: string })?.title ?? "", input.trustedPin);
  if (JSON.stringify(prepared.binding) !== JSON.stringify(bound) ||
      JSON.stringify(prepared.hostedInput) !== JSON.stringify(input.hostedInput))
    throw new Error("FACTORY_REQUEST_BINDING_CHANGED");
  const sub = bound.submission;
  const current = input.currentWork;
  const stale = current.ownerId !== sub.ownerId || current.agentId !== sub.agentId ||
    current.workId !== sub.workId || current.workVersion !== sub.workVersion ||
    current.workGeneration !== sub.workGeneration || current.criteriaVersion !== sub.criteriaVersion ||
    current.lifecycle !== "active" || current.control !== "agent";
  let observed;
  try { observed = await getHostedRequest(input.config, bound.requestId, input.graphql); }
  catch { return { status: "UNKNOWN" as const, reconcileRequestId: bound.requestId,
    authorityGranted: false, readiness: "NOT_READY" as const }; }
  if (!observed.result) return { status: "AWAITING" as const, reconcileRequestId: bound.requestId,
    authorityGranted: false, readiness: "NOT_READY" as const };
  const result = signedResult.parse(observed.result);
  if (!observed.resultTrust || !["active", "rotated"].includes(observed.resultTrust.trustStatus))
    throw new Error("FACTORY_RESULT_SIGNING_KEY_NOT_TRUSTED");
  if (!observed.resultEnvelope || !observed.resultEnvelopeDigest)
    throw new Error("FACTORY_RESULT_SIGNED_ENVELOPE_MISSING");
  const m = result.manifest;
  const expected = prepared.hostedInput.factoryBinding;
  if (observed.requestId !== bound.requestId || result.issueId !== bound.requestId ||
      result.factoryId !== expected.expectedFactoryId ||
      JSON.stringify(result.factoryVersion) !== JSON.stringify(expected.expectedFactoryVersion) ||
      m.requestBindingDigest !== sha(JSON.stringify(expected)) ||
      m.workOrderId !== input.expectedWorkOrderId || m.runId !== input.expectedRunId ||
      m.attemptNumber !== input.expectedAttempt || m.inputCommit !== sub.baseCommit ||
      m.candidateCommit === m.inputCommit ||
      m.checks.length !== input.requiredChecks.length ||
      m.checks.some((entry, index) => entry.command !== input.requiredChecks[index]) ||
      !observed.receipt || observed.receipt.workOrderId !== m.workOrderId ||
      observed.receipt.state !== "ready_for_review") throw new Error("FACTORY_RESULT_WRONG_REQUEST_OR_ATTEMPT");
  const artifactBytes = await retrieveFactoryArtifacts({ issueId: result.issueId,
    operationId: result.operationId, workOrderId: m.workOrderId, runId: m.runId,
    attemptNumber: m.attemptNumber, manifest: { ...m, artifacts: m.artifacts as FactoryArtifact[] },
    graphql: input.graphql });
  if (input.previous && (input.previous.operationId !== result.operationId ||
      input.previous.manifestDigest !== result.manifestDigest)) throw new Error("FACTORY_RESULT_CONFLICT");
  return { status: stale ? "HISTORICAL" as const : input.previous ? "DEDUPED" as const : "INTEGRITY_VERIFIED" as const,
    operationId: result.operationId, manifestDigest: result.manifestDigest,
    candidateCommit: m.candidateCommit, candidateTree: m.candidateTree,
    artifacts: m.artifacts, artifactBytes, checks: m.checks, factoryVersion: result.factoryVersion,
    signedResult: result, signedEnvelope: observed.resultEnvelope,
    signedEnvelopeDigest: observed.resultEnvelopeDigest, resultTrust: observed.resultTrust,
    authorityGranted: false, independentVerification: "NOT_RUN" as const,
    readiness: "NOT_READY" as const };
}
