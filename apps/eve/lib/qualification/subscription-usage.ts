import type { ExecutionDatabase } from "../execution-types.ts";
import type { SubscriptionUsage } from "./factory-live-port.ts";

/**
 * Owner-local private beta only: records unmetered OWNER_SUBSCRIPTION_LOCAL usage (operation units, never money) in the separately pinned
 * `subscription-usage.sql` table of the owner-local journal database. MyFactory remains the spend authority; this is MyEve's readback record, not a
 * second execution ledger. The schema is applied by the operator (never at startup); without it the recorder refuses, so the run is fenced.
 */
export const SUBSCRIPTION_USAGE_SQL_SHA256 = "1d6b3f43cd40732da0f0a8827668d99ffe86a08a54505cae0e28bfd6d3bcf7a0";
export class SubscriptionUsageRefused extends Error { constructor(readonly code: string) { super(code); } }

export async function subscriptionUsageRecorder(db: ExecutionDatabase, journeyId: string): Promise<(usage: SubscriptionUsage) => Promise<void>> {
  if (!/^[a-f0-9]{64}$/.test(journeyId)) throw new SubscriptionUsageRefused("QDEV_SUBSCRIPTION_USAGE_JOURNEY");
  const [table] = await db.query("SELECT to_regclass('qdev_subscription_usage') AS t", []) as Array<{ t: unknown }>;
  if (!table?.t) throw new SubscriptionUsageRefused("QDEV_SUBSCRIPTION_USAGE_SCHEMA");
  return async usage => {
    if (usage.metering !== "SUBSCRIPTION_UNMETERED" || !Number.isSafeInteger(usage.operationsUsed) || usage.operationsUsed < 0 || usage.operationsUsed > usage.maxOperations)
      throw new SubscriptionUsageRefused("QDEV_SUBSCRIPTION_USAGE_INVALID");
    await db.query(`INSERT INTO qdev_subscription_usage(journey_id,request_id,work_order_id,run_id,state,metering,operations_used,max_operations,completion_operations_used,evidence_ref)
      VALUES($1,$2,$3,$4,$5,'SUBSCRIPTION_UNMETERED',$6,$7,$8,$9) ON CONFLICT (journey_id,request_id) DO NOTHING`,
      [journeyId, usage.requestId, usage.workOrderId, usage.runId, usage.state, usage.operationsUsed, usage.maxOperations, usage.completionOperationsUsed, usage.evidenceRef]);
    // Idempotent only for the identical record: a different readback for the same run is a conflict, never an overwrite.
    const [row] = await db.query("SELECT work_order_id::text w, run_id::text r, state, operations_used n, max_operations m, evidence_ref e FROM qdev_subscription_usage WHERE journey_id=$1 AND request_id=$2",
      [journeyId, usage.requestId]) as Array<Record<string, unknown>>;
    if (!row || row.w !== usage.workOrderId || (row.r ?? null) !== usage.runId || row.state !== usage.state || Number(row.n) !== usage.operationsUsed
      || Number(row.m) !== usage.maxOperations || row.e !== usage.evidenceRef) throw new SubscriptionUsageRefused("QDEV_SUBSCRIPTION_USAGE_CONFLICT");
  };
}
