import { defineTool } from 'eve/tools';
import { z } from 'zod';
import { inspectOwnerCapabilities } from '../../lib/capability-control/sofie.ts';

export default defineTool({
  description: 'Show my owner capability preferences, current eligibility, setup and qualification gaps, budgets, pending controls, and recent audit history. Report unavailable evidence explicitly. This does not inspect or grant tool execution authority.',
  availableInSubagents: false,
  inputSchema: z.object({}).strict(),
  execute(_input, ctx) { return inspectOwnerCapabilities(ctx); },
});
