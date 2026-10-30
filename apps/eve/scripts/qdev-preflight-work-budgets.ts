/**
 * Unpaid, read-only configuration preflight for the installed QDEV bundle. Prints, for stages 1-3, the canonical engineering Work budget against the
 * approved operation reservation, and exits nonzero (3) when any Work would exceed it. It reads `engineering_work.max_cost_usd` only: no provider,
 * reservation, ledger, deployment or credential use. Run before the first paid request:
 *   MYEVE_QDEV_HOST_BUNDLE=... node --import tsx scripts/qdev-preflight-work-budgets.ts
 */
import { hostBundleSchema } from "../lib/qualification/host-source.ts";
import { validateJourneyPlan } from "../lib/qualification/plan.ts";
import { checkStageWorkBudgets } from "../lib/qualification/work-budget-preflight.ts";
import { WorkStore } from "../lib/engineering/store.ts";

const raw = process.env.MYEVE_QDEV_HOST_BUNDLE;
if (!raw || raw.length > 100_000) { console.error("QDEV_PREFLIGHT_BUNDLE"); process.exit(2); }
let bundle;
try { bundle = hostBundleSchema.parse(JSON.parse(raw)); } catch { console.error("QDEV_PREFLIGHT_BUNDLE"); process.exit(2); }
if (!bundle.assembly) { console.error("QDEV_PREFLIGHT_NO_ASSEMBLY"); process.exit(2); }
try {
  const plan = validateJourneyPlan(bundle.plan), ids = bundle.assembly.workIds;
  const store = new WorkStore({ scopeId: bundle.ownerId, scopeKind: "personal", actorId: bundle.ownerId });
  const budgets = await checkStageWorkBudgets(store.database, bundle.ownerId, plan, { 1: ids.stage1, 2: ids.stage2, 3: ids.stage3 });
  console.log(JSON.stringify({ ok: true, budgets }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "QDEV_PREFLIGHT_FAILED"); process.exit(3);
}
