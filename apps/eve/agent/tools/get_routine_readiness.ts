import { defineTool } from "eve/tools";
import { z } from "zod";
import { RoutineAdmission } from "../../lib/routine-admission.ts";
import { taskOwnerFromAuth } from "../../lib/task-runs.ts";
import { ownerOnly } from "../lib/owner-gate.ts";
export default defineTool({
  description:
    "Inspect readiness of one owner Routine. Read-only; cannot approve, connect providers, enable or run work.",
  approval: ownerOnly,
  inputSchema: z.object({ routineId: z.string().min(1).max(200) }),
  async execute({ routineId }, ctx) {
    if (
      !ctx.session.auth.current ||
      ctx.session.auth.current.attributes.role === "guest"
    )
      throw new Error("Owner authentication required.");
    try {
      return {
        readiness: await new RoutineAdmission().inspect(
          taskOwnerFromAuth(ctx.session.auth),
          routineId,
        ),
      };
    } catch {
      return { readiness: null, error: "Readiness is unavailable." };
    }
  },
});
