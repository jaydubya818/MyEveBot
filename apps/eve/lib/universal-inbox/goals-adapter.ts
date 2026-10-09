import { z } from "zod";
import { eventSchema, goalLinkSchema } from "./contracts.ts";
/** Structural match to Goals NeedsYouItem at b9b46c4, enriched with its existing generations. */
export const goalAttentionSchema = goalLinkSchema.extend({
  ownerId: z.string().min(1).max(255), id: z.string().min(1).max(255), source: z.literal("goal-task"),
  title: z.string().min(1).max(500), options: z.array(z.string().min(1).max(255)).max(20),
  revision: z.number().int().positive(), updatedAt: z.string().datetime({ offset: true }),
}).strict();
export function goalBlocker(ownerId: string, raw: unknown) {
  const input = goalAttentionSchema.parse(raw);
  if (ownerId !== input.ownerId) throw new Error("GOAL_OWNER_MISMATCH");
  const { goalId, taskId, goalGeneration, taskGeneration, dependencyId, reference } = input;
  return eventSchema.parse({ kind: "DECISION", title: input.title, summary: "A choice is needed to continue this Goal.",
    correlationId: input.id, episode: 1, sequence: input.revision,
    goal: { goalId, taskId, goalGeneration, taskGeneration, dependencyId, reference },
    source: { system: "notification", accountId: ownerId, eventId: `${input.id}:${input.revision}`, sender: "Sofie", occurredAt: input.updatedAt, reference: input.id },
    action: { id: input.id, kind: "decision", reason: "choice", involvement: "NECESSARY_JUDGMENT", prompt: input.title, options: input.options },
    priority: { dependencyCount: 1, ownerRequested: true } });
}
