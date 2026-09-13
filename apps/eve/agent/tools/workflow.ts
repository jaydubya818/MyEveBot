import { experimental_workflow } from "eve/tools";

// Enables the root-only `Workflow` tool: the model writes a small JS program
// (run in a QuickJS sandbox) that coordinates `agent` subagent calls —
// fan-out over a list, feed one result into the next, map-reduce — as one
// durable step. The cap keeps a runaway fan-out from spawning dozens of
// child sessions.
// Three distinct specialists, plus at most one product-level retry for each.
export default experimental_workflow({ maxSubagents: 6 });
