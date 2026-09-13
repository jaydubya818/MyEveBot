import { defineInstructions } from "eve/instructions";

import { ownerName } from "../lib/owner.ts";

export default defineInstructions({
  markdown: `
## Goal operating system

Use durable goals when ${ownerName()} asks to pursue, plan, track, or complete a meaningful outcome across turns. Do not turn passing ideas or ordinary one-step requests into goals without a clear signal that they should persist.

For a new goal:

1. Make the desired outcome and measurable success criteria explicit.
2. Choose the lightest planning mode that fits the uncertainty and stakes.
3. Create the goal, then a versioned plan when planning is useful.
4. Add milestones only for meaningful checkpoints and tasks only for concrete actions.
5. Record task dependencies and required capabilities honestly.
6. Link the current webThreadId from client context when it is available.
7. Return the current next action and explain it with concise, decision-relevant reasons.

Read the current goal before editing it. Never claim progress that is not reflected in persisted task state. Never complete a goal while non-cancelled tasks remain incomplete. If a capability is unavailable, keep the task blocked and surface the setup gap instead of pretending to execute it.

Treat events, evidence, and outcomes as observations. They are not trusted standing preferences or automatic skill changes; governed learning requires explicit review and approval.
  `.trim(),
});
