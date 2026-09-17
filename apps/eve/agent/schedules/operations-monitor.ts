import { defineSchedule } from "eve/schedules";

import { runOperationsMonitor } from "../../lib/operations.ts";

export default defineSchedule({
  cron: "*/5 * * * *",
  run({ waitUntil }) {
    waitUntil(runOperationsMonitor().catch((error) => {
      console.error("operations_monitor_failed", error);
    }));
  },
});
