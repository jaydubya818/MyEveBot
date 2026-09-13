import { defineTool } from "eve/tools";
import { z } from "zod";

import { createOutcome } from "../../lib/outcomes.ts";
import { taskOwnerFromAuth } from "../../lib/task-runs.ts";

export default defineTool({
  description: "Record the observed effectiveness of completed or attempted work. Execution success is not proof of an effective outcome. Never infer owner feedback.",
  inputSchema: z.object({
    goalId: z.string().min(1).nullable().optional(),
    goalTaskId: z.string().min(1).nullable().optional(),
    runId: z.string().min(1).nullable().optional(),
    status: z.enum(["successful", "partially_successful", "blocked", "failed", "abandoned", "ineffective", "unknown"]),
    ownerFeedback: z.enum(["helpful", "neutral", "unhelpful", "unknown"]).default("unknown"),
    summary: z.string().min(1).max(1000),
    rationale: z.array(z.string().min(1).max(500)).max(20).default([]),
    evidence: z.array(z.object({
      type: z.enum(["event", "task_artifact"]),
      id: z.string().min(1),
    })).max(50).default([]),
    occurredAt: z.string().datetime().optional(),
    idempotencyKey: z.string().min(1).max(200).optional(),
  }),
  async execute(input, ctx) {
    return createOutcome({ ownerId: taskOwnerFromAuth(ctx.session.auth), ...input, source: "agent" });
  },
});
