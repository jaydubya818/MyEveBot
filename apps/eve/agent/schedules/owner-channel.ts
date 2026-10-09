import { defineSchedule } from "eve/schedules";
import { ownerChannelConfiguration } from "../../lib/relay/owner/config.ts";
import { ownerChannelCycle } from "../../lib/relay/owner/worker.ts";

export default defineSchedule({
  cron: "* * * * *",
  run({ waitUntil }) {
    if (!ownerChannelConfiguration().enabled) return;
    waitUntil(ownerChannelCycle());
  },
});
