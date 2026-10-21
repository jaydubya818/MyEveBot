import { defineSchedule } from "eve/schedules";

import { runReviewDeliveryTick } from "../../lib/review-delivery.ts";

// One application-managed dispatcher. Vercel wakes it in UTC every 15 minutes
// so the database can suspend between ticks. Delivery catches up on anything
// due (next_at <= now) and generates the checkpoint for its scheduled period,
// so a brief arrives at most ~15 minutes late and is never dropped. Owner-local
// timing, DST, quiet hours, leases, retries, and deduplication are resolved by
// the canonical review delivery service.
export default defineSchedule({
  cron: "*/15 * * * *",
  run({ waitUntil }) {
    waitUntil(
      runReviewDeliveryTick().catch((error) => {
        console.error("Scheduled review delivery tick failed", error);
      }),
    );
  },
});
