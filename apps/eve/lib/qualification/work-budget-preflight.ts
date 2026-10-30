import { QDEV_LIMITS } from "../external-alpha/qualification-accounting.ts";
import type { JourneyPlan } from "./plan.ts";

/**
 * Unpaid configuration preflight. The Factory-backed operation of stages 1-3 (CODING in stages 1-2, FACTORY in stage 3) sends the canonical
 * engineering Work's `max_cost_usd` as the native `maxSpendUsd`; the stage-source builder takes it from the Work contract budget and the
 * charged-parent guard (`ready.ceilingMicrousd > reserveMicrousd`) refuses it only at dispatch. In stage 1 that is after Sofie has already
 * run. This reads the three Works (read-only SQL, no provider, no reservation) and refuses the installation up front unless every Work budget
 * fits the operation reservation of the approved plan.
 */
export class WorkBudgetRefused extends Error { constructor(readonly code: string) { super(code); } }
type Stage = 1 | 2 | 3;
const FACTORY_PURPOSE: Record<Stage, "CODING" | "FACTORY"> = { 1: "CODING", 2: "CODING", 3: "FACTORY" };
type Reader = { query(sql: string, params?: unknown[]): Promise<Array<Record<string, unknown>>> };

export type StageWorkBudget = { stage: Stage; workId: string; maxCostUsd: number; nativeCeilingMicrousd: number; challengeBudgetMicrousd: number;
  operationKey: string; operationReserveMicrousd: number; workCeilingMicrousd: number };

/** Pure core. `maxCostUsd` is the Work row value; both roundings used downstream are checked (floor = native ceiling, ceil = capability challenge). */
export function evaluateStageWorkBudgets(plan: JourneyPlan, workIds: Record<Stage, string>, maxCostUsd: Record<string, number>): StageWorkBudget[] {
  const seen = new Set<string>();
  return ([1, 2, 3] as const).map(stage => {
    const workId = workIds[stage], usd = maxCostUsd[workId];
    if (seen.has(workId)) throw new WorkBudgetRefused("QDEV_WORK_BUDGET_SHARED_WORK");
    seen.add(workId);
    if (typeof usd !== "number" || !Number.isFinite(usd) || !Number.isSafeInteger(usd * 1e6)) throw new WorkBudgetRefused(`QDEV_WORK_BUDGET_UNREADABLE:${stage}`);
    const planned = plan.stages.find(entry => entry.stage === stage);
    const operations = planned?.operations.filter(op => op.purpose === FACTORY_PURPOSE[stage]) ?? [];
    if (!planned || operations.length !== 1) throw new WorkBudgetRefused(`QDEV_WORK_BUDGET_PLAN_OPERATION:${stage}`);
    const [operation] = operations, nativeCeiling = Math.floor(usd * 1e6), challenge = Math.ceil(usd * 1e6);
    if (nativeCeiling < 1 || challenge > QDEV_LIMITS.perWorkMicrousd || challenge > planned.workCeilingMicrousd || challenge > operation.reserveMicrousd)
      throw new WorkBudgetRefused(`QDEV_WORK_BUDGET_EXCEEDS_OPERATION_RESERVATION:${stage}`);
    return { stage, workId, maxCostUsd: usd, nativeCeilingMicrousd: nativeCeiling, challengeBudgetMicrousd: challenge, operationKey: operation.key,
      operationReserveMicrousd: operation.reserveMicrousd, workCeilingMicrousd: planned.workCeilingMicrousd };
  });
}

/** Reads only `engineering_work.max_cost_usd` for the three profile Works of this owner. Mutates nothing. */
export async function checkStageWorkBudgets(db: Reader, ownerId: string, plan: JourneyPlan, workIds: Record<Stage, string>): Promise<StageWorkBudget[]> {
  const ids = [workIds[1], workIds[2], workIds[3]];
  const rows = await db.query("SELECT id, max_cost_usd FROM engineering_work WHERE scope_id=$1 AND scope_kind='personal' AND id = ANY($2::uuid[])", [ownerId, ids]);
  const costs: Record<string, number> = {};
  for (const row of rows) costs[String(row.id)] = Number(row.max_cost_usd);
  if (ids.some(id => !(id in costs))) throw new WorkBudgetRefused("QDEV_WORK_BUDGET_WORK_MISSING");
  return evaluateStageWorkBudgets(plan, workIds, costs);
}
