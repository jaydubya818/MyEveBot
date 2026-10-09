import { randomUUID } from "node:crypto";
import { digest } from "../engineering/contract.ts";
import type { ExternalAlphaPolicy } from "./policy.ts";
import { sharedAlphaAccounting, type AlphaAccountingDatabase } from "./shared-accounting.ts";
export interface AlphaAllowance {
  id: string;
  owner_id: string;
  kind: "CHAT" | "WORK";
  binding_id: string;
  state: string;
  deadline: string;
  ceiling_microusd: string;
  max_operations: number;
}
export interface AlphaOperation {
  id: string;
  allowance_id: string;
  state: "DISPATCHED" | "SETTLED" | "UNKNOWN";
  request_sha256: string;
  result: unknown;
  reserved_microusd: string;
  step_key: string;
}
/** Runtime cannot install/activate a policy. Admissions charge the full fixed
 * allowance, not estimated use. Unused allowance is never borrowed/recycled. */
export class ExternalAlphaAllowance {
  constructor(
    readonly database: AlphaAccountingDatabase,
    readonly policy: ExternalAlphaPolicy,
  ) {}
  private async call<T>(
    name: "admit" | "model_reserve" | "model_finish",
    payload: Record<string, unknown>,
  ): Promise<T> {
    const [row] = await this.database.query(
      `SELECT external_alpha_${name}($1::jsonb) AS receipt`,
      [
        JSON.stringify({
          ...payload,
          ownerId: this.policy.ownerId,
          policySha256: digest(this.policy),
        }),
      ],
    );
    if (!row?.receipt) throw Error("EXTERNAL_ALPHA_RECEIPT_REQUIRED");
    return row.receipt as T;
  }
  async assertActive(allowanceId: string) {
    await sharedAlphaAccounting(this.database).assertBound(this.database, this.policy, allowanceId);
    const [row] = await this.database.query(
      `SELECT a.id FROM external_alpha_allowance a JOIN external_alpha_policy p ON p.owner_id=a.owner_id
   WHERE a.id=$1 AND a.owner_id=$2 AND a.policy_sha256=$3 AND p.policy_sha256=$3 AND a.state='OPEN'
   AND p.activated_at IS NOT NULL AND p.revoked_at IS NULL AND clock_timestamp()<p.activated_at+interval '120 hours' AND clock_timestamp()<a.deadline
   AND NOT EXISTS(SELECT 1 FROM external_alpha_allowance WHERE state='UNKNOWN')`,
      [allowanceId, this.policy.ownerId, digest(this.policy)],
    );
    if (!row) throw Error("EXTERNAL_ALPHA_AUTHORITY_REVOKED");
  }
  async admit(input: {
    kind: "CHAT" | "WORK";
    bindingId: string;
    requestSha256: string;
    workId?: string;
    workVersion?: number;
    workGeneration?: number;
  }) {
    const shared = sharedAlphaAccounting(this.database);
    const admission = await shared.reserve(this.policy, input);
    const allowance = await this.call<AlphaAllowance>("admit", { ...input, id: randomUUID() });
    await shared.bind(this.database, this.policy, admission, allowance.id);
    return { ...allowance, deadline: new Date(Math.min(Date.parse(allowance.deadline), Date.parse(admission.deadline))).toISOString() };
  }
  async reserve(input: {
    allowanceId: string;
    stepKey: string;
    requestSha256: string;
    microusd: number;
  }) {
    if (
      !/^.+:\d+$/.test(input.stepKey) ||
      !Number.isSafeInteger(input.microusd) ||
      input.microusd <= 0 ||
      input.microusd > 150000
    )
      throw Error("EXTERNAL_ALPHA_OPERATION_BOUND");
    await sharedAlphaAccounting(this.database).assertBound(this.database, this.policy, input.allowanceId);
    const id = randomUUID(),
      row = await this.call<AlphaOperation>("model_reserve", { ...input, id });
    if (row.id !== id && row.state !== "SETTLED")
      throw Error("EXTERNAL_ALPHA_NO_REDISPATCH");
    if (row.state === "SETTLED") {
      await sharedAlphaAccounting(this.database).settle(this.database, this.policy, input.allowanceId, "sofie:" + input.stepKey);
    } else {
      // Local durable reservation precedes the shared dispatch lease. If this
      // acknowledgment fails, no provider call occurs and the local DISPATCHED
      // row conservatively fences this owner until reconciliation.
      await sharedAlphaAccounting(this.database).dispatch(this.database, this.policy, input.allowanceId, "sofie:" + input.stepKey);
    }
    return row;
  }
  async settle(op: AlphaOperation, microusd: number, result: unknown) {
    if (
      !Number.isSafeInteger(microusd) ||
      microusd < 0 ||
      microusd > Number(op.reserved_microusd)
    )
      throw Error("EXTERNAL_ALPHA_USAGE_BOUND");
    const settled = await this.call<AlphaOperation>("model_finish", {
      allowanceId: op.allowance_id,
      operationId: op.id,
      requestSha256: op.request_sha256,
      state: "SETTLED",
      microusd,
      result,
    });
    await sharedAlphaAccounting(this.database).settle(this.database, this.policy, op.allowance_id, "sofie:" + op.step_key);
    return settled;
  }
  async unknown(op: AlphaOperation) {
    // Preserve the local UNKNOWN even if the remote acknowledgment is lost.
    try {
      await sharedAlphaAccounting(this.database).fence(this.database, this.policy, op.allowance_id);
    } finally {
      await this.call<AlphaOperation>("model_finish", {
        allowanceId: op.allowance_id,
        operationId: op.id,
        requestSha256: op.request_sha256,
        state: "UNKNOWN",
      });
    }
  }
}
