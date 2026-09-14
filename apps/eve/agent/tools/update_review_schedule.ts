import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";

import { availableReviewDeliveryChannels } from "../../lib/review-delivery.ts";
import { getReviewDeliveryPreferences, updateReviewDeliveryPreferences } from "../../lib/review-delivery-db.ts";
import { taskOwnerFromAuth } from "../../lib/task-runs.ts";

export default defineTool({
  description: "Update owner-approved Daily Brief and Weekly Review delivery preferences. Never infer a schedule or enable delivery without explicit owner direction.",
  approval: always(),
  inputSchema: z.object({
    ownerTimezone: z.string().optional(),
    dailyBriefEnabled: z.boolean().optional(),
    dailyBriefTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    weeklyReviewEnabled: z.boolean().optional(),
    weeklyReviewDay: z.number().int().min(0).max(6).optional(),
    weeklyReviewTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    quietHoursEnabled: z.boolean().optional(),
    quietHoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    quietHoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    preferredDeliveryChannel: z.enum(["in_app", "push", "telegram"]).optional(),
    maxProactivePushesPerDay: z.number().int().min(0).max(20).optional(),
  }),
  async execute(input, ctx) {
    const ownerId = taskOwnerFromAuth(ctx.session.auth);
    if (input.preferredDeliveryChannel) {
      const [channels, current] = await Promise.all([
        availableReviewDeliveryChannels(ownerId),
        getReviewDeliveryPreferences(ownerId),
      ]);
      if (input.preferredDeliveryChannel !== current.preferredDeliveryChannel) {
        const selected = channels.find((channel) => channel.channel === input.preferredDeliveryChannel);
        if (!selected?.available) throw new Error(selected?.reason ?? "That delivery channel is unavailable.");
      }
    }
    return updateReviewDeliveryPreferences(ownerId, input);
  },
});
