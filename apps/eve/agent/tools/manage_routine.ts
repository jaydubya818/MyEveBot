import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { listRoutines, manageRoutine } from "../lib/reminders-db.ts";

export default defineTool({
  description: "Pause, resume, edit, or safely dry-run a named routine. Testing previews the exact prompt and approval boundary without executing external actions.",
  inputSchema: z.object({ id: z.number().int().positive(), action: z.enum(["pause", "resume", "update", "test"]), prompt: z.string().min(1).max(4000).optional(), cron: z.string().min(1).max(120).optional(), timezone: z.string().min(1).max(120).optional(), approvalBoundary: z.string().min(1).max(1000).optional() }),
  approval: always(),
  async execute({ id, action, ...changes }) {
    if (action !== "test") return manageRoutine({ id, action, ...changes });
    const routine = (await listRoutines()).find((item) => item.id === id);
    if (!routine) throw new Error("Routine not found.");
    return { dryRun: true, name: routine.routine_name, prompt: routine.prompt, approvalBoundary: routine.approval_boundary, nextFireAt: routine.next_fire_at };
  },
});
