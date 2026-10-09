import { digest } from "../engineering/contract.ts";
import { WorkStore } from "../engineering/store.ts";
import type { ExecutionDatabase } from "../execution-types.ts";
import { db } from "../../agent/lib/receipts-db.ts";
import { externalAlphaPolicy } from "./policy.ts";
import { sharedAlphaAccounting } from "./shared-accounting.ts";
import { assertExternalAlphaWorkBinding, externalAlphaWorkConfig } from "./work-config.ts";
import { ExternalAlphaWorkAuthority, WorkAuthoritySigner } from "./work-authority.ts";
import { ExternalAlphaWorkController, HttpExternalAlphaFactoryClient, receiptKeys, type ExternalAlphaFactoryClient } from "./work-controller.ts";

/** Resumes ONLY retained authority readback. This caller has no path to issue,
 * claim, redispatch, manufacture a writer or retry a paid operation. Concurrent
 * schedule deliveries serialize retention/settlement through the SQL functions.
 * Reconciliation runs before expiry fencing to retain a published Result first. */
export async function reconcileExternalAlphaAuthorities(controller: ExternalAlphaWorkController, store: WorkStore) {
  const { authority } = controller;
  if (store.principal.scopeKind !== "personal" || store.principal.scopeId !== authority.policy.ownerId || store.principal.actorId !== authority.policy.ownerId)
    throw Error("EXTERNAL_ALPHA_RECONCILIATION_OWNER");
  const rows = await authority.database.query(`SELECT work_id FROM external_alpha_work_authority
    WHERE owner_id=$1 AND policy_sha256=$2 AND state IN('DISPATCHING','CONSUMED') ORDER BY issued_at,id LIMIT 20`,
    [authority.policy.ownerId, digest(authority.policy)]);
  const outcomes: Array<{ workId: string; state: string }> = [];
  for (const row of rows) {
    const workId = String(row.work_id);
    try {
      const work = await store.get(workId);
      const saved = await authority.forWork(workId);
      if (!saved) continue;
      // Stop the exact existing request when owner control changed. No result
      // can project against a cancelled, taken-over or superseded Work.
      const changed = work.lifecycle !== "active" || work.control !== "agent" || work.version !== saved.workVersion || work.generation !== saved.workGeneration;
      const out = changed ? await controller.stop(workId) : await controller.reconcile(workId, { work });
      outcomes.push({ workId, state: out.state });
    } catch {
      // Fixed code only: neither transport payloads nor credentials enter logs.
      // A transient read outage keeps the durable identity, then the sweep
      // fences it after expiry. It never authorizes another dispatch.
      outcomes.push({ workId, state: "READBACK_UNAVAILABLE" });
    }
  }
  return { checked: rows.length, outcomes, sweep: await authority.sweep() };
}

export async function runExternalAlphaReconciliation(deps: { env?: NodeJS.ProcessEnv; database?: ExecutionDatabase; factory?: ExternalAlphaFactoryClient; signer?: WorkAuthoritySigner } = {}) {
  const env = deps.env ?? process.env;
  const policy = externalAlphaPolicy(env), config = externalAlphaWorkConfig(env);
  if (!policy || !config) return { checked: 0, inactive: true as const };
  assertExternalAlphaWorkBinding(policy, config, env);
  const database = deps.database ?? (db() as ExecutionDatabase);
  let accountingRepair: "RECONCILED" | "UNAVAILABLE" = "RECONCILED";
  try { await sharedAlphaAccounting(database, env).reconcile(database, policy); }
  catch { accountingRepair = "UNAVAILABLE"; }
  const authority = new ExternalAlphaWorkAuthority(database, policy, deps.signer ?? WorkAuthoritySigner.fromEnv(env));
  const controller = new ExternalAlphaWorkController(authority,
    deps.factory ?? new HttpExternalAlphaFactoryClient(config, { projectId: policy.projectId }, { env }), config, receiptKeys(config));
  return { ...await reconcileExternalAlphaAuthorities(controller, new WorkStore({ scopeKind: "personal", scopeId: policy.ownerId, actorId: policy.ownerId }, database)), accountingRepair };
}
