import { defineSchedule } from "eve/schedules";

import { runReviewDeliveryTick } from "../../lib/review-delivery.ts";

// One application-managed dispatcher. Vercel wakes it in UTC each minute;
// owner-local timing, DST, quiet hours, leases, retries, and deduplication are
// resolved by the canonical review delivery service.
export default defineSchedule({
  cron: "* * * * *",
  run({ waitUntil }) {
    waitUntil(
      runReviewDeliveryTick().catch((error) => {
        console.error("Scheduled review delivery tick failed", error);
      }),
    );
  },
});
