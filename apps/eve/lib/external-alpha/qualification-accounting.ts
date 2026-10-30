import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ExecutionDatabase } from "../execution-types.ts";
import { digest } from "../engineering/contract.ts";

/**
 * Isolated developer-qualification admission (proposal qdev-20261029-01).
 *
 * This is a CLIENT of qualification-accounting.sql. It creates no authority:
 * the charter, members, project parent and activation are operator-issued rows
 * in a dedicated accounting database. Every rule that matters (Q2 has no paid
 * Work, four sequential Works, concurrency one, aggregate cap, parent/source
 * binding, nonrefundable full-ceiling charge) is enforced by the database
 * function, not by this class. This class only builds exact requests, refuses
 * placeholder identities before they reach the database, and verifies receipts.
 */
export const QDEV_PROPOSAL_ID = "qdev-20261029-01";
export const QDEV_BASELINE = {
  repository: "jaydubya818/myeve-beta-dashboard",
  inputCommit: "d1619cc870ad63e4442e078e73dad377dfb3ccf6",
  inputTree: "396f4b7240ef2aaccc79e73f1d2757f9d322f69f",
  outputBranch: "codex/qdev-20261029-journey",
} as const;
export const QDEV_LIMITS = { journeyMicrousd: 5_200_000, perWorkMicrousd: 1_300_000, maxWorks: 4, concurrency: 1 } as const;

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const commit = z.string().regex(/^[a-f0-9]{40}$/);
// Refuse the obvious all-zero / all-f placeholders an operator might paste before approval exists.
const notPlaceholder = (value: string) => !/^(0+|f+)$/.test(value);

export const qualificationProjectInputSchema = z.object({
  repository: z.literal(QDEV_BASELINE.repository),
  inputCommit: z.literal(QDEV_BASELINE.inputCommit),
  inputTree: z.literal(QDEV_BASELINE.inputTree),
  outputBranch: z.literal(QDEV_BASELINE.outputBranch),
  operatingProfileSha256: sha256.refine(notPlaceholder, "placeholder profile digest"),
  factoryVersionSha256: sha256.refine(notPlaceholder, "placeholder FactoryVersion digest"),
  protectedSpecificationSha256: sha256.refine(notPlaceholder, "placeholder specification digest"),
  sources: z.object({
    myeve: commit.refine(notPlaceholder), factory: commit.refine(notPlaceholder),
    relay: commit.refine(notPlaceholder), missioncontrol: commit.refine(notPlaceholder),
  }).strict(),
}).strict();
export type QualificationProjectInput = z.infer<typeof qualificationProjectInputSchema>;

/** Deterministic parent/source identities. The operator computes these from the
 * frozen sources and records them at enrollment; callers recompute and present
 * them on every effect, and the database compares them byte for byte. */
export function qualificationBinding(input: QualificationProjectInput) {
  const parsed = qualificationProjectInputSchema.parse(input);
  return {
    projectSha256: digest({ kind: "qdev.project/v1", proposalId: QDEV_PROPOSAL_ID, repository: parsed.repository,
      inputCommit: parsed.inputCommit, inputTree: parsed.inputTree, outputBranch: parsed.outputBranch,
      operatingProfileSha256: parsed.operatingProfileSha256, protectedSpecificationSha256: parsed.protectedSpecificationSha256 }),
    sourceSha256: digest({ kind: "qdev.source/v1", proposalId: QDEV_PROPOSAL_ID, sources: parsed.sources,
      factoryVersionSha256: parsed.factoryVersionSha256 }),
  };
}

export const qualificationPolicySchema = z.object({
  cohortId: z.string().uuid(), ownerId: z.string().uuid(), slot: z.enum(["Q1", "Q2"]),
}).strict();
export type QualificationPolicy = z.infer<typeof qualificationPolicySchema>;
export type QualificationBinding = ReturnType<typeof qualificationBinding>;
export type QualificationPurpose = "SOFIE" | "CODING" | "FACTORY" | "VERIFIER";

type Work = {
  id: string; project_id: string; cohort_id: string; owner_id: string; ordinal: number;
  binding_sha256: string; request_sha256: string; ceiling_microusd: string;
  state: "RESERVED" | "BOUND" | "CLOSED" | "UNKNOWN"; local_allowance_id: string | null; deadline: string;
};

export const qualificationStatusSchema = z.object({
  version: z.literal(1), checkedAt: z.string(), slot: z.enum(["Q1", "Q2"]),
  state: z.enum(["inactive", "active", "paused", "expired", "revoked"]),
  ownWorks: z.coerce.number().int().min(0), ownReservedMicrousd: z.coerce.number().int().min(0),
  paidWorksAllowed: z.number().int().min(0).max(4), expiresAt: z.string(),
  limits: z.object({ journeyMicrousd: z.number().int(), perWorkMicrousd: z.number().int(), maxWorks: z.number().int(), concurrency: z.literal(1) }),
}).strict();

export class QualificationAccounting {
  constructor(
    readonly database: ExecutionDatabase,
    private readonly credential: string,
    private readonly policy: QualificationPolicy,
    private readonly binding: QualificationBinding,
  ) {
    qualificationPolicySchema.parse(policy);
    if (!sha256.safeParse(binding.projectSha256).success || !sha256.safeParse(binding.sourceSha256).success)
      throw Error("QDEV_BINDING_INVALID");
    if (!/^[a-f0-9]{64}$/.test(credential)) throw Error("QDEV_CONFIGURATION_REQUIRED");
  }
  get policySha256() { return digest(this.policy); }
  private async call<T = Work>(payload: Record<string, unknown>): Promise<T> {
    try {
      const [row] = await this.database.query("SELECT qdev_cohort_call($1::jsonb) AS receipt", [JSON.stringify({
        ...payload, cohortId: this.policy.cohortId, ownerId: this.policy.ownerId, slot: this.policy.slot,
        policySha256: this.policySha256, credential: this.credential,
        projectSha256: this.binding.projectSha256, sourceSha256: this.binding.sourceSha256,
      })]);
      if (!row?.receipt) throw Error();
      return row.receipt as T;
    } catch (error) {
      // Never leak the connection URL, credential or SQL parameters.
      const code = /QDEV_[A-Z_]+/.exec(error instanceof Error ? error.message : "")?.[0];
      throw Error(code ?? "QDEV_UNAVAILABLE");
    }
  }
  async status() { return qualificationStatusSchema.parse(await this.call<unknown>({ mode: "status" })); }
  /** Full ceiling is charged at reservation and is never refunded. The same
   * bindingId re-reads the same row; it can never allocate a second Work. */
  async reserveWork(input: { bindingId: string; requestSha256: string; ceilingMicrousd: number }) {
    if (!Number.isSafeInteger(input.ceilingMicrousd) || input.ceilingMicrousd < 1 || input.ceilingMicrousd > QDEV_LIMITS.perWorkMicrousd)
      throw Error("QDEV_WORK_CEILING_EXCEEDED");
    sha256.parse(input.requestSha256);
    const row = await this.call({ mode: "reserve_work", id: randomUUID(), bindingSha256: digest(input.bindingId),
      requestSha256: input.requestSha256, ceilingMicrousd: input.ceilingMicrousd });
    if (row.owner_id !== this.policy.ownerId || row.cohort_id !== this.policy.cohortId || row.binding_sha256 !== digest(input.bindingId)
      || row.request_sha256 !== input.requestSha256 || Number(row.ceiling_microusd) !== input.ceilingMicrousd)
      throw Error("QDEV_RECEIPT_MISMATCH");
    return row;
  }
  async bind(admission: Work, allowanceId: string) {
    const bound = await this.call({ mode: "bind", id: admission.id, allowanceId });
    if (bound.id !== admission.id || bound.local_allowance_id !== allowanceId || bound.state !== "BOUND") throw Error("QDEV_RECEIPT_MISMATCH");
    return bound;
  }
  async assertBound(admission: Work, allowanceId: string) { return this.call({ mode: "assert", id: admission.id, allowanceId }); }
  /** Each charged child (Sofie, coding, Factory, verifier) must pass through here
   * with its own reserve before any provider call. Operations are sequential. */
  async dispatch(admission: Work, allowanceId: string, operationKey: string, purpose: QualificationPurpose, reserveMicrousd: number) {
    if (!Number.isSafeInteger(reserveMicrousd) || reserveMicrousd < 1) throw Error("QDEV_WORK_CEILING_EXCEEDED");
    const operationSha256 = digest(operationKey);
    const receipt = await this.call<Work & { claim?: string; operationSha256?: string }>({
      mode: "dispatch", id: admission.id, allowanceId, operationSha256, purpose, reserveMicrousd });
    // Send authority is single-use: only a freshly consumed claim for exactly this
    // operation permits a provider call. Observations, repeats and fenced
    // ambiguity never return success.
    if (receipt.claim === "FENCED") throw Error("QDEV_FENCED");
    if (receipt.claim !== "NEW" || receipt.operationSha256 !== operationSha256 || receipt.id !== admission.id
      || receipt.local_allowance_id !== allowanceId || receipt.owner_id !== this.policy.ownerId) throw Error("QDEV_ALREADY_CLAIMED");
    return receipt;
  }
  running(admission: Work, allowanceId: string, operationKey: string) { return this.op("running", admission, allowanceId, operationKey); }
  hold(admission: Work, allowanceId: string, operationKey: string) { return this.op("hold", admission, allowanceId, operationKey); }
  settle(admission: Work, allowanceId: string, operationKey: string) { return this.op("settle", admission, allowanceId, operationKey); }
  cancelUnsent(admission: Work, allowanceId: string, operationKey: string) { return this.op("cancel_unsent", admission, allowanceId, operationKey); }
  private op(mode: string, admission: Work, allowanceId: string, operationKey: string) {
    return this.call({ mode, id: admission.id, allowanceId, operationSha256: digest(operationKey) });
  }
  /** Lost acknowledgment, crash or doubt: full exposure stays charged and the cohort is fenced. */
  fence(admission: Work) { return this.call({ mode: "fence", id: admission.id }); }
}
