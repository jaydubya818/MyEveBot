import { experimental_workflow } from "eve/tools";

import { DELEGATION_BUDGETS } from "../../lib/delegation-policy.ts";

// Enables the root-only `Workflow` tool: the model writes a small JS program
// (run in a QuickJS sandbox) that coordinates subagent calls —
// fan-out over a list, feed one result into the next, map-reduce — as one
// durable step. The cap keeps a runaway fan-out from spawning dozens of
// child sessions.
// Large enough for a complex bounded fan-out while remaining a firm guardrail.
// The product-QA skill retains its own fixed three-specialist contract.
export default experimental_workflow({ maxSubagents: DELEGATION_BUDGETS.hardCeiling });
