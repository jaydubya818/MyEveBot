import { createHash } from "node:crypto";
import type { WorkPort, WorkRequest, WorkResult } from "./contracts.ts";

export function contractDigest(value: unknown): string {
  const ordered = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(ordered)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([k, x]) => [k, ordered(x)]),
          )
        : v;
  return createHash("sha256")
    .update(JSON.stringify(ordered(value)))
    .digest("hex");
}
/** Deterministic UUIDv8; identifiers carry no authority. */
export function contractUuid(value: unknown): string {
  const h = contractDigest(value);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export type RouteHint =
  | "DIRECT"
  | "DEEP_AGENT"
  | "EXECUTOR"
  | "MYFACTORY"
  | "RELAY"
  | "HUMAN";
export interface CanonicalCreate {
  title: string;
  objective: string;
  repository: string;
  criteria: Array<{ id: string; statement: string; method: "test" | "human" }>;
  maxCostUsd: number;
  maxDurationSeconds: number;
  idempotencyKey: string;
}
export interface CanonicalContract {
  workId: string;
  workVersion: number;
  criteriaVersion: number;
  scope: { kind: "personal" | "organization"; id: string };
  criteria: Array<{
    id: string;
    statement: string;
    evidence: "deterministic" | "human";
  }>;
}
export interface CanonicalProof {
  contractVersion: 2;
  workId: string;
  workVersion: number;
  criteriaVersion: number;
  outcome:
    | "COMPLETED"
    | "PARTIAL"
    | "BLOCKED"
    | "FAILED"
    | "CANCELLED"
    | "SUPERSEDED";
  resultRevision: string | null;
  createdAt: string;
  evidence: Array<{
    criterionId: string;
    resultRevision: string;
    state: "PASS" | "FAIL" | "UNKNOWN" | "STALE" | "NOT_RUN";
    producer: "executor" | "trusted-verifier" | "human" | "external";
    sourceRef: string;
    contentHash: string;
    observedAt: string;
  }>;
  artifactRefs: string[];
  limitations: string[];
}
/** Inject the canonical schemas/functions, do not fork protected verification. */
export interface CanonicalValidators {
  create: { parse(value: unknown): CanonicalCreate };
  contract: { parse(value: unknown): CanonicalContract };
  proof: { parse(value: unknown): CanonicalProof };
  proofLinkProblems(work: CanonicalContract, proof: CanonicalProof): string[];
}
export interface CanonicalBinding {
  ownerId: string;
  correlationKey: string;
  intent: WorkRequest;
  input: CanonicalCreate;
  workId: string;
  workGeneration: number;
  state: string;
}
export interface CanonicalResultReceipt {
  id: string;
  binding: CanonicalBinding;
  contract: unknown;
  proof: unknown;
  /** Verified by the canonical retained-result reader, not a client request. */
  integrityVerified: boolean;
  contentHash: string;
  workGeneration: number;
  currentResultRevision: string | null;
}
export interface CanonicalGateway {
  /** Existing server authority/configuration resolves these values. Goal fields
   * cannot set or increase budgets, resource access, criteria methods or routes. */
  policy(
    request: WorkRequest,
  ): Promise<
    | {
        repository: string;
        maxCostUsd: number;
        maxDurationSeconds: number;
        methods: Array<"test" | "human">;
      }
    | { denied: string }
  >;
  /** Atomically/persistently dedupe canonical UUID key AND immutable intent hash.
   * Creation only. Canonical router/admission owns any later execution. */
  ensure(
    ownerId: string,
    input: CanonicalCreate,
    intent: WorkRequest,
    hints: readonly RouteHint[],
  ): Promise<CanonicalBinding>;
  find(
    ownerId: string,
    correlationKey: string,
  ): Promise<CanonicalBinding | null>;
  result(
    ownerId: string,
    workId: string,
    resultId: string,
  ): Promise<CanonicalResultReceipt>;
}
export class CanonicalGoalWorkAdapter implements WorkPort {
  constructor(
    readonly gateway: CanonicalGateway,
    readonly validators: CanonicalValidators,
  ) {}
  async ensure(request: WorkRequest) {
    // Replays first reconcile the frozen canonical input. Changed current policy
    // must not turn an existing Work into a new Work or changed create payload.
    const prior = await this.gateway.find(
      request.ownerId,
      request.correlationKey,
    );
    if (prior) return this.reference(prior, request);
    const policy = await this.gateway.policy(request);
    if ("denied" in policy) return policy;
    if (policy.methods.length !== request.criteria.length)
      throw new Error("Canonical criterion policy required");
    const input = this.validators.create.parse({
      title: request.objective.slice(0, 160),
      objective: request.objective,
      repository: policy.repository,
      criteria: request.criteria.map((statement, i) => ({
        id: contractUuid([request.correlationKey, i, statement]),
        statement,
        method: policy.methods[i],
      })),
      maxCostUsd: policy.maxCostUsd,
      maxDurationSeconds: policy.maxDurationSeconds,
      idempotencyKey: contractUuid([
        "goal-work",
        request.ownerId,
        request.correlationKey,
      ]),
    });
    const hints = request.routeHints ?? [];
    if (
      hints.some(
        (h) =>
          ![
            "DIRECT",
            "DEEP_AGENT",
            "EXECUTOR",
            "MYFACTORY",
            "RELAY",
            "HUMAN",
          ].includes(h),
      )
    )
      throw new Error("Unknown descriptive route hint");
    return this.reference(
      await this.gateway.ensure(request.ownerId, input, request, hints),
      request,
    );
  }
  private reference(binding: CanonicalBinding, request: WorkRequest) {
    if (
      binding.ownerId !== request.ownerId ||
      binding.correlationKey !== request.correlationKey ||
      contractDigest(binding.intent) !== contractDigest(request)
    )
      throw new Error("Canonical Work binding conflict");
    return {
      id: binding.workId,
      ownerId: binding.ownerId,
      correlationKey: binding.correlationKey,
      state: binding.state,
    };
  }
  async find(ownerId: string, key: string) {
    const binding = await this.gateway.find(ownerId, key);
    if (!binding) return null;
    if (binding.ownerId !== ownerId || binding.correlationKey !== key)
      throw new Error("Canonical Work scope mismatch");
    return this.reference(binding, binding.intent);
  }
  async result(
    ownerId: string,
    workId: string,
    resultId: string,
  ): Promise<WorkResult> {
    const receipt = await this.gateway.result(ownerId, workId, resultId);
    const { binding } = receipt;
    const contract = this.validators.contract.parse(receipt.contract),
      proof = this.validators.proof.parse(receipt.proof);
    if (
      receipt.id !== resultId ||
      binding.ownerId !== ownerId ||
      binding.workId !== workId ||
      contract.workId !== workId ||
      contract.scope.kind !== "personal" ||
      contract.scope.id !== ownerId ||
      proof.workId !== workId
    )
      throw new Error("Canonical Result scope mismatch");
    // A caller-written summary, PASS label, or unchecked proof never becomes completion.
    const intact =
      receipt.integrityVerified &&
      receipt.contentHash === contractDigest(proof);
    const current =
      intact &&
      proof.workVersion === contract.workVersion &&
      proof.criteriaVersion === contract.criteriaVersion &&
      receipt.workGeneration === binding.workGeneration &&
      proof.resultRevision === receipt.currentResultRevision &&
      proof.outcome !== "SUPERSEDED";
    const problems = this.validators.proofLinkProblems(contract, proof);
    const criteriaMatch =
      binding.input.criteria.length === contract.criteria.length &&
      binding.input.criteria.every((c) =>
        contract.criteria.some(
          (k) =>
            k.id === c.id &&
            k.statement === c.statement &&
            k.evidence === (c.method === "test" ? "deterministic" : "human"),
        ),
      );
    const verified =
      current &&
      criteriaMatch &&
      proof.outcome === "COMPLETED" &&
      problems.length === 0;
    const satisfied = verified
      ? binding.input.criteria.map((c) => c.statement)
      : [];
    return {
      id: receipt.id,
      ownerId,
      workId,
      correlationKey: binding.correlationKey,
      outcome: proof.outcome === "COMPLETED" ? "SUCCEEDED" : proof.outcome,
      current,
      verified,
      satisfiedCriteria: satisfied,
      satisfiedGoalCriteria: satisfied.filter((c) =>
        binding.intent.goalCriteria.includes(c),
      ),
      evidence: verified
        ? proof.evidence.map((e) => e.sourceRef).slice(0, 40)
        : [],
      reason: !intact
        ? "Canonical Result integrity is unconfirmed"
        : !current
          ? "Canonical Result is stale"
          : !criteriaMatch
            ? "Criteria binding changed"
            : verified
              ? "Current canonical criteria independently satisfied"
              : `Canonical outcome ${proof.outcome}; ${problems.join("; ")}`,
    };
  }
}
