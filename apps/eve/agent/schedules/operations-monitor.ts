import { runExternalAlphaReconciliation } from "../../lib/external-alpha/reconciliation.ts";
import { runBetaScheduleSweep } from "../../lib/beta-integration/scheduler.ts";
import { defineSchedule } from "eve/schedules";

import { runOperationsMonitor } from "../../lib/operations.ts";

export default defineSchedule({
  cron: "*/5 * * * *",
  run({ waitUntil }) {
    waitUntil(runExternalAlphaReconciliation().catch(() => console.error("external_alpha_reconciliation_failed")));
    waitUntil(runBetaScheduleSweep().catch(error => console.error("beta_schedule_sweep_failed",error)));
    waitUntil(runOperationsMonitor().catch((error) => {
      console.error("operations_monitor_failed", error);
    }));
  },
});
