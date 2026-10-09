import { defineTool } from "eve/tools";
import { z } from "zod";

import { availableReviewDeliveryChannels } from "../../lib/review-delivery.ts";
import { getReviewDeliveryPreferences, listReviewDeliveries } from "../../lib/review-delivery-db.ts";
import { taskOwnerFromAuth } from "../../lib/task-runs.ts";

export default defineTool({
  description: "Inspect the owner's Daily Brief and Weekly Review schedule, delivery availability, and recent delivery results.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const ownerId = taskOwnerFromAuth(ctx.session.auth);
    const [preferences, channels, deliveries] = await Promise.all([
      getReviewDeliveryPreferences(ownerId),
      availableReviewDeliveryChannels(ownerId),
      listReviewDeliveries(ownerId, 10),
    ]);
    return { preferences, channels, deliveries };
  },
});
