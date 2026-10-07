import { randomUUID } from "node:crypto";
import { digest } from "../engineering/contract.ts";
import {
  attestFactoryManifest,
  authenticateFactoryResult,
  prepareAuthenticatedFactoryInput,
} from "../engineering/factory-authenticated-result.ts";
import {
  canonical,
  sha256,
  verifyResult,
  type ResultKey,
  type ResultManifest,
  type SignedResult,
} from "../engineering/factory-producer-protocol.ts";
import { digitalWorkContractSchema, proofOfWorkSchema } from "../digital-worker/contracts.ts";
import type { Work } from "../engineering/types.ts";
import type { ExecutionDatabase } from "../execution-types.ts";
import type { ExternalAlphaPolicy } from "./policy.ts";
import type { ExternalAlphaWorkConfig } from "./work-config.ts";
import type { FactoryOperationReport, WorkAuthorityRecord } from "./work-authority.ts";
import { dispatchBinding } from "./dispatch-readback.ts";
import { alphaTasksCriteria, deterministicUuid } from "./work-tuple.ts";

/** Ingestion of the Factory's terminal signed Result for ONE consumed external
 * alpha authority into the owner's durable Result/Proof (the existing owner
 * readback tables). It reuses the canary's signed-result primitives unchanged
 * and never edits the canary path. A verifier verdict is never promoted. */
export type ExternalAlphaVerdict = "PASS" | "FAIL" | "PARTIAL";
const rank: Record<ExternalAlphaVerdict, number> = { FAIL: 0, PARTIAL: 1, PASS: 2 };
/** Lowest trust wins. An unrecognised value is PARTIAL, never PASS. */
export function worstVerdict(...values: unknown[]): ExternalAlphaVerdict {
  let out: ExternalAlphaVerdict = "PASS";
  for (const v of values) {
    if (v === undefined || v === null) continue;
    const verdict: ExternalAlphaVerdict = v === "PASS" || v === "FAIL" || v === "PARTIAL" ? v : "PARTIAL";
    if (rank[verdict] < rank[out]) out = verdict;
  }
  return out;
}

export class ExternalAlphaResultRejected extends Error {
  constructor(readonly code: string, detail?: string) {
    super(code + (detail ? ":" + detail : ""));
  }
}
const reject = (code: string, detail?: string): never => {
  throw new ExternalAlphaResultRejected(code, detail);
};

export interface RetainedExternalAlphaResult {
  authorityId: string;
  resultId: string;
  candidateSha: string;
  verdict: ExternalAlphaVerdict;
  cleanupConfirmed: boolean;
  settlementState: "PENDING" | "SETTLED";
  replay: boolean;
}

export interface IngestionContext {
  database: ExecutionDatabase;
  policy: ExternalAlphaPolicy;
  config: ExternalAlphaWorkConfig;
  authority: WorkAuthorityRecord;
  work: Work;
  /** The signed MYFACTORY_RESULT_V1 envelope exactly as the Factory returned it. */
  envelope: unknown;
  /** Unsigned verdict hint from the Factory readback; it can only lower trust. */
  verdictHint?: unknown;
  /** Durable digest of the first admitted prepare, never an envelope selector. */
  expectedRequestDigest: string;
  expectedRunId: string;
  now?: number;
}

const patchPathPattern = /^diff --git a\/(.+) b\/(.+)$/gm;
/** Changed paths of the signed patch artifact; anything outside the exact
 * allowed file set, or a rename/copy/symlink, is a scope violation. */
export function patchScope(patch: string, allowed: readonly string[]) {
  const permitted = new Set(allowed);
  const changed: string[] = [];
  const violations: string[] = [];
  for (const m of patch.matchAll(patchPathPattern)) {
    if (m[1] !== m[2] || !permitted.has(m[1])) violations.push("path");
    else changed.push(m[1]);
  }
  if (/^(rename|copy) (from|to) /m.test(patch)) violations.push("rename");
  if (/^(new|old|deleted) (file )?mode 120000/m.test(patch) || /^new file mode 120000/m.test(patch)) violations.push("symlink");
  if (changed.length === 0 && violations.length === 0) violations.push("empty");
  return { changed: [...new Set(changed)].sort(), violations: [...new Set(violations)] };
}

export const externalAlphaResultId = (authorityId: string) =>
  deterministicUuid("EXTERNAL_ALPHA_RESULT_V1:" + authorityId);

function assertOwnerBinding(ctx: IngestionContext) {
  const { policy, authority, work } = ctx;
  const doc = authority.envelope.document;
  if (
    work.scopeId !== policy.ownerId ||
    doc.ownerId !== policy.ownerId ||
    doc.policySha256 !== digest(policy) ||
    authority.workId !== work.id ||
    doc.work.id !== work.id ||
    authority.workVersion !== doc.work.version ||
    authority.workGeneration !== doc.work.generation ||
    authority.documentSha256 !== authority.envelope.authoritySha256 ||
    authority.requestId !== doc.candidateWriter.requestId
  )
    reject("EXTERNAL_ALPHA_RESULT_OWNER");
  if (!["CONSUMED", "COMPLETED"].includes(authority.state)) reject("EXTERNAL_ALPHA_RESULT_AUTHORITY_STATE", authority.state);
}

/** Pure verification and construction; performs no write. */
export function verifyExternalAlphaResult(ctx: IngestionContext) {
  assertOwnerBinding(ctx);
  const { policy, config, authority, work } = ctx;
  const doc = authority.envelope.document;
  const rv = config.factory.resultVerification;
  const receipt = authority.receipt as { workOrderId?: unknown; authorityId?: unknown } | null;
  if (!receipt || typeof receipt.workOrderId !== "string" || receipt.authorityId !== authority.id)
    reject("EXTERNAL_ALPHA_RESULT_RECEIPT");
  if (doc.factoryVersion !== policy.factoryVersion || doc.source.sourceDigest !== rv.sourceDigest)
    reject("EXTERNAL_ALPHA_RESULT_PINS");
  const now = ctx.now ?? Date.now();

  let manifest: ResultManifest;
  let artifacts: SignedResult["artifacts"];
  try {
    // Every correlation field comes from durable admission, signed readback,
    // the consumed authority or reviewed pins. The envelope selects no identity.
    const binding = prepareAuthenticatedFactoryInput({
      workId: work.id,
      workVersion: authority.workVersion,
      workGeneration: authority.workGeneration,
      criteriaVersion: work.criteriaVersion,
      agentId: "external-alpha",
      factoryId: rv.factoryId,
      factoryVersion: policy.factoryVersion,
      requestId: authority.requestId,
      requestDigest: ctx.expectedRequestDigest,
      sourceDigest: rv.sourceDigest,
      configurationDigest: rv.configurationDigest,
      workOrderId: receipt!.workOrderId,
      runId: ctx.expectedRunId,
      attemptNumber: 1,
      inputCommit: doc.source.baseSha,
    });
    const keys = rv.resultKeys as ResultKey[];
    const authenticated = authenticateFactoryResult(ctx.envelope, binding, keys);
    attestFactoryManifest(authenticated.manifest, binding);
    manifest = verifyResult(ctx.envelope, {
      keys,
      factoryId: binding.factoryId,
      requestId: binding.requestId,
      workOrderId: binding.workOrderId,
      runId: binding.runId,
      factoryVersion: binding.factoryVersion,
      now,
    }).manifest;
    artifacts = (ctx.envelope as SignedResult).artifacts;
  } catch (error) {
    if (error instanceof ExternalAlphaResultRejected) throw error;
    return reject("EXTERNAL_ALPHA_RESULT_UNVERIFIED", error instanceof Error ? error.message.slice(0, 120) : "invalid");
  }
  const e = manifest.execution;
  if (
    e.sourceDigest !== rv.sourceDigest ||
    e.configurationDigest !== rv.configurationDigest ||
    e.version !== 2 ||
    e.inputTree !== doc.source.treeSha ||
    e.configuration.cloud?.verificationPolicySha256 !== rv.verifierPolicySha256 ||
    canonical(e.configuration.commands) !== canonical(config.checkCommands) ||
    canonical([...e.configuration.allowedPaths].sort()) !== canonical([...doc.source.allowedFiles].sort())
  )
    reject("EXTERNAL_ALPHA_RESULT_BINDING");
  if (!manifest.candidate) reject("EXTERNAL_ALPHA_RESULT_NOT_COMPLETED", manifest.status);
  const candidate = manifest.candidate!;
  if (candidate.base !== doc.source.baseSha) reject("EXTERNAL_ALPHA_RESULT_BINDING");

  const reasons: string[] = [];
  const v = manifest.verification;
  let signedVerdict: ExternalAlphaVerdict;
  if (!v) {
    signedVerdict = "PARTIAL";
    reasons.push("The Result carries no independent verifier attestation.");
  } else {
    if (
      v.workId !== work.id ||
      v.workGeneration !== authority.workGeneration ||
      v.candidateCommit !== candidate.commit ||
      v.candidateTree !== candidate.tree ||
      v.policySha256 !== rv.verifierPolicySha256
    )
      reject("EXTERNAL_ALPHA_RESULT_VERIFIER");
    signedVerdict = v.outcome === "PASS" ? "PASS" : v.outcome === "FAIL" ? "FAIL" : "PARTIAL";
    if (v.outcome === "UNKNOWN") reasons.push("The independent verifier could not reach a conclusion.");
    if (v.outcome === "FAIL") reasons.push("The independent verifier reported a failing check.");
  }
  const cleanupConfirmed = v?.cleanupConfirmed === true;
  if (!cleanupConfirmed) reasons.push("Verifier cleanup was not confirmed.");

  const patchBytes = artifacts.find((a) => a.id === candidate.patchArtifactId);
  const scope = patchScope(patchBytes ? Buffer.from(patchBytes.base64, "base64").toString("utf8") : "", doc.source.allowedFiles);
  if (scope.violations.length) reasons.push("The candidate changes files outside the authorized set.");
  const verdict = worstVerdict(signedVerdict, ctx.verdictHint, manifest.status === "FAILED" ? "FAIL" : manifest.status === "CANCELLED" ? "PARTIAL" : undefined, scope.violations.length ? "FAIL" : undefined, cleanupConfirmed ? undefined : "PARTIAL");
  if (ctx.verdictHint !== undefined && worstVerdict(ctx.verdictHint) !== "PASS" && verdict !== signedVerdict)
    reasons.push("The Factory readback reported " + worstVerdict(ctx.verdictHint) + ".");

  const criteria = work.criteria;
  if (criteria.length !== alphaTasksCriteria.length) reject("EXTERNAL_ALPHA_RESULT_OWNER");
  const observedAt = v?.finishedAt ?? manifest.issuedAt;
  const state = verdict === "PASS" ? "PASS" : verdict === "FAIL" ? "FAIL" : "UNKNOWN";
  const checkDigest = `sha256:${digest(v?.checks ?? [])}`;
  const proof = proofOfWorkSchema.parse({
    contractVersion: 2,
    workId: work.id,
    workVersion: authority.workVersion,
    criteriaVersion: work.criteriaVersion,
    // Never COMPLETED: publication, review and owner acceptance are not established here.
    outcome: verdict === "FAIL" ? "FAILED" : "PARTIAL",
    resultRevision: candidate.commit,
    createdAt: manifest.issuedAt,
    evidence: criteria.map((c) => ({
      criterionId: c.id,
      resultRevision: candidate.commit,
      state,
      producer: "trusted-verifier",
      sourceRef: `external-alpha-verification:${authority.id}:${candidate.commit}:${c.id}`,
      contentHash: checkDigest,
      observedAt,
    })),
    artifactRefs: [
      `factory-candidate:${authority.requestId}:commit:${candidate.commit}`,
      `factory-manifest:sha256:${digest(manifest)}`,
      `factory-receipt:${authority.id}`,
      `factory-version:${policy.factoryVersion}`,
      `external-alpha-authority:${authority.documentSha256}`,
      `external-alpha-patch:sha256:${candidate.patchDigest}`,
      `external-alpha-verdict:${verdict}`,
      ...scope.changed.map((p) => `changed-source:${p}`),
    ],
    limitations: [
      `Independent verifier verdict: ${verdict}.${reasons.length ? " " + reasons.join(" ") : ""}`.slice(0, 1000),
      "Factory-produced candidate and independent cloud verification only. GitHub publication, CI, review and owner acceptance have not been established; this Result is never final completion.",
    ],
  });
  const contract = digitalWorkContractSchema.parse({
    contractVersion: 2,
    workId: work.id,
    workVersion: authority.workVersion,
    criteriaVersion: work.criteriaVersion,
    scope: { kind: "personal", id: policy.ownerId },
    humanOwnerId: policy.ownerId,
    coordinatingAgentId: "external-alpha-sofie",
    objective: work.objective,
    criteria: criteria.map((c) => ({ id: c.id, statement: c.statement, evidence: "deterministic" })),
    resourceRefs: [`repository:${policy.repository}`],
    allowedOperations: [...doc.allowedEffects],
    budgetUsd: work.maxCostUsd,
    deadline: doc.expiresAt,
    policyVersion: 1,
    composition: { role: { id: "sofie", version: 1 }, capabilityPacks: [], mode: { id: "cloud-work", version: 1 } },
    definitionOfDone: [...alphaTasksCriteria],
    allowedRoutes: ["MYFACTORY"],
    routingProfile: {
      profileVersion: 1,
      workShape: "bounded",
      decomposition: "single candidate",
      interaction: "none",
      parallelism: "none",
      verification: "independent",
      duration: "short",
      ambiguity: "low",
      externalExpertise: "none",
      humanJudgment: "owner review",
      risk: "bounded",
    },
    routePolicy: { id: "external-alpha-work-authority", version: 1 },
  });
  const envelopeText = canonical(ctx.envelope);
  const ingestSha256 = digest({ authority: authority.documentSha256, envelope: sha256(envelopeText) });
  return {
    verdict,
    reasons,
    manifest,
    candidate,
    cleanupConfirmed,
    proof,
    proofHash: digest(proof),
    contract,
    envelopeText,
    ingestSha256,
  };
}

const rowResult = (row: Record<string, any>): RetainedExternalAlphaResult => ({
  authorityId: row.authority_id,
  resultId: row.result_id,
  candidateSha: row.candidate_sha,
  verdict: row.verdict,
  cleanupConfirmed: row.cleanup_confirmed === true,
  settlementState: row.settlement_state,
  replay: row.replay === true,
});

/** Idempotent. The same bytes return the original; different bytes conflict. */
export async function ingestExternalAlphaResult(ctx: IngestionContext): Promise<RetainedExternalAlphaResult> {
  assertOwnerBinding(ctx);
  const dispatch = await dispatchBinding(ctx.database, ctx.authority);
  if (dispatch.requestDigest !== ctx.expectedRequestDigest) reject("EXTERNAL_ALPHA_RESULT_BINDING");
  const envelopeSha = sha256(canonical(ctx.envelope ?? null));
  const ingestSha = digest({ authority: ctx.authority.documentSha256, envelope: envelopeSha });
  const [prior] = await ctx.database.query(
    "SELECT * FROM external_alpha_work_result WHERE authority_id=$1 AND owner_id=$2",
    [ctx.authority.id, ctx.policy.ownerId],
  );
  if (prior) {
    // A replay of the already verified bytes needs no second verification and
    // can never change the stored verdict; different bytes are a conflict.
    if (prior.ingest_sha256 !== ingestSha) reject("EXTERNAL_ALPHA_RESULT_CONFLICT");
    return { ...rowResult(prior), replay: true };
  }
  const v = verifyExternalAlphaResult(ctx);
  try {
    const [row] = await ctx.database.query(`SELECT external_alpha_result_retain($1::jsonb) AS r`, [
      JSON.stringify({
        ownerId: ctx.policy.ownerId,
        policySha256: digest(ctx.policy),
        authorityId: ctx.authority.id,
        documentSha256: ctx.authority.documentSha256,
        requestId: ctx.authority.requestId,
        requestDigest: dispatch.requestDigest,
        workId: ctx.work.id,
        workVersion: ctx.authority.workVersion,
        workGeneration: ctx.authority.workGeneration,
        resultId: externalAlphaResultId(ctx.authority.id),
        candidateSha: v.candidate.commit,
        proof: v.proof,
        proofHash: v.proofHash,
        contract: v.contract,
        verdict: v.verdict,
        manifestDigest: digest(v.manifest),
        envelope: v.envelopeText,
        ingestSha256: v.ingestSha256,
        cleanupConfirmed: v.cleanupConfirmed,
      }),
    ]);
    const r = row.r as Record<string, any>;
    return rowResult({ ...r, replay: r.replay });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = /EXTERNAL_ALPHA_RESULT_[A-Z_]+/.exec(message)?.[0];
    if (code) reject(code);
    throw error;
  }
}

/** Settlement operations in the shape external_alpha_result_settle expects. */
export function settlementOperations(authority: WorkAuthorityRecord, ops: readonly FactoryOperationReport[]) {
  return ops.map((op) => ({
    id: randomUUID(),
    source: op.phase === "completion" ? "FACTORY_COMPLETION" : "FACTORY_PRODUCTIVE",
    stepKey: `factory:${op.operationId}:0`,
    requestSha256: digest({
      authorityId: authority.id,
      operationId: op.operationId,
      phase: op.phase,
      model: op.model,
      pricingRevision: op.pricingRevision,
    }),
    state: op.state === "settled" ? "SETTLED" : "UNKNOWN",
    microusd: op.state === "settled" ? op.actualMicrousd : op.reservedMicrousd,
    result: { phase: op.phase, model: op.model, pricingRevision: op.pricingRevision },
  }));
}

export interface SettlementOutcome {
  settled: boolean;
  replay: boolean;
  pending: boolean;
  authorityState: string;
  exposureUnknown: boolean | null;
}
/** Exactly-once accounting and cleanup settlement. `settled` is true for exactly
 * one caller; concurrent and later callers observe replay=true. */
export async function settleExternalAlphaResult(
  database: ExecutionDatabase,
  policy: ExternalAlphaPolicy,
  authority: WorkAuthorityRecord,
  input: { quiescent: boolean; operations: readonly FactoryOperationReport[] },
): Promise<SettlementOutcome> {
  try {
    const [row] = await database.query(`SELECT external_alpha_result_settle($1::jsonb) AS r`, [
      JSON.stringify({
        ownerId: policy.ownerId,
        policySha256: digest(policy),
        authorityId: authority.id,
        quiescent: input.quiescent,
        operations: settlementOperations(authority, input.operations),
      }),
    ]);
    return row.r as SettlementOutcome;
  } catch (error) {
    const code = /EXTERNAL_ALPHA_RESULT_[A-Z_]+/.exec(error instanceof Error ? error.message : "")?.[0];
    if (code) reject(code);
    throw error;
  }
}
